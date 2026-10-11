import type {
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
  CollectionBeforeOperationHook,
  CollectionSlug,
  PayloadHandler,
  PayloadRequest,
} from 'payload'
import { TinyURLClient, TinyURLError, aliasValue, destinationValue, domainValue } from './client'
import { assertRemoteUnchanged, assertSiteEditor, canonicalURL, relationshipID } from './policy'

type LinkDoc = {
  id: string
  tenant: unknown
  domain: string
  alias: string
  destinationURL: string
  archived?: boolean
  source?: { relationTo: 'pages' | 'posts'; value: unknown }
  syncError?: string
}
const trusted = Symbol('tinyURLInternal')
const savingDraft = Symbol('tinyURLSavingDraft')
const isInternal = (req: PayloadRequest) =>
  (req.context as Record<symbol, unknown>)[trusted] === true
const internalContext = (req: PayloadRequest) => ({ ...req.context, [trusted]: true })
const links = 'short-links' as never
const safeMessage = (error: unknown) =>
  error instanceof TinyURLError
    ? error.message
    : 'The short link could not be saved. Retry or import links to reconcile the provider state.'

export async function siteConfig(
  req: PayloadRequest,
  tenant: string,
  internal = false,
): Promise<{ domain: string; slug: string }> {
  if (!internal) assertSiteEditor(req.user, tenant)
  // Explicit tenant predicate plus membership check; never rely on the selected-tenant cookie.
  const profiles = await req.payload.find({
    collection: 'rep-info',
    where: { tenant: { equals: tenant } },
    limit: 2,
    depth: 0,
    req,
    overrideAccess: true,
  })
  if (profiles.docs.length !== 1)
    throw new TinyURLError('Configure exactly one Site Profile for this site.')
  const profile = profiles.docs[0] as unknown as { tinyURLDomain?: unknown }
  const domain = domainValue(profile.tinyURLDomain)
  const other = await req.payload.find({
    collection: 'rep-info',
    where: { and: [{ tinyURLDomain: { equals: domain } }, { tenant: { not_equals: tenant } }] },
    limit: 1,
    depth: 0,
    req,
    overrideAccess: true,
  })
  if (other.docs.length)
    throw new TinyURLError(
      'This TinyURL domain is assigned to another site. Contact the site maintainer.',
      409,
    )
  const ownedLinks = await req.payload.find({
    collection: links,
    where: { and: [{ domain: { equals: domain } }, { tenant: { not_equals: tenant } }] },
    limit: 1,
    req,
    overrideAccess: true,
  })
  if (ownedLinks.docs.length)
    throw new TinyURLError(
      'This TinyURL domain has links owned by another site. Contact the site maintainer.',
      409,
    )
  const site = await req.payload.findByID({
    collection: 'tenants',
    id: tenant,
    depth: 0,
    req,
    overrideAccess: true,
  })
  return { domain, slug: site.slug }
}

export const validateDomainAssignment: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  req,
}) => {
  if (!('tinyURLDomain' in data) && !('tenant' in data)) return data
  const tenant = relationshipID(data.tenant ?? originalDoc?.tenant)
  if (!tenant) throw new TinyURLError('Select a site before configuring TinyURL.')
  assertSiteEditor(req.user, tenant)
  if (originalDoc?.tenant && relationshipID(originalDoc.tenant) !== tenant)
    throw new TinyURLError('A Site Profile’s site cannot be changed.', 409)
  const next = data.tinyURLDomain ?? originalDoc?.tinyURLDomain
  if (!next) {
    if (originalDoc?.tinyURLDomain)
      throw new TinyURLError(
        'A configured TinyURL domain cannot be cleared. Contact the site maintainer.',
        409,
      )
    delete data.tinyURLDomain
    return data
  }
  const domain = domainValue(next)
  if (originalDoc?.tinyURLDomain && originalDoc.tinyURLDomain !== domain) {
    const existing = await req.payload.find({
      collection: links,
      where: { tenant: { equals: tenant } },
      limit: 1,
      req,
      overrideAccess: true,
    })
    if (existing.docs.length)
      throw new TinyURLError(
        'Import/reassign existing short links before changing this site’s domain.',
        409,
      )
  }
  const conflicts = await req.payload.find({
    collection: 'rep-info',
    where: {
      and: [
        { tinyURLDomain: { equals: domain } },
        ...(originalDoc?.id ? [{ id: { not_equals: originalDoc.id } }] : []),
      ],
    },
    limit: 1,
    req,
    overrideAccess: true,
  })
  if (conflicts.docs.length)
    throw new TinyURLError('This TinyURL domain already belongs to a Site Profile.', 409)
  const ownedLinks = await req.payload.find({
    collection: links,
    where: { and: [{ domain: { equals: domain } }, { tenant: { not_equals: tenant } }] },
    limit: 1,
    req,
    overrideAccess: true,
  })
  if (ownedLinks.docs.length)
    throw new TinyURLError('This TinyURL domain has links owned by another site.', 409)
  data.tinyURLDomain = domain
  return data
}

export const syncShortLink: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  req,
  operation,
}) => {
  const original = originalDoc as LinkDoc | undefined
  const tenant = relationshipID(data.tenant ?? original?.tenant)
  if (!tenant) throw new TinyURLError('Select a site.')
  if (!isInternal(req)) assertSiteEditor(req.user, tenant)
  if (original && relationshipID(original.tenant) !== tenant)
    throw new TinyURLError('A short link’s site cannot be changed.', 403)
  if (isInternal(req)) return data
  const { domain } = await siteConfig(req, tenant)
  if (original && original.domain !== domain)
    throw new TinyURLError(
      'The site domain changed. Review the Site Profile before editing this link.',
      409,
    )
  const alias = aliasValue(data.alias ?? original?.alias, domain)
  const destinationURL = destinationValue(data.destinationURL ?? original?.destinationURL)
  if (original?.source) {
    const source = await publishedSource(
      req,
      original.source.relationTo,
      relationshipID(original.source.value) || '',
    )
    if (source.tenant !== tenant || destinationURL !== source.url)
      throw new TinyURLError(
        'This link follows a page or post. Edit its published content instead.',
        409,
      )
  }
  data.alias = alias
  data.destinationURL = destinationURL
  data.domain = domain
  data.shortURL = `https://${domain}/${alias}`
  data.remoteKey = `${domain}/${alias}`
  data.archived = original?.archived ?? false
  const client = new TinyURLClient()
  if (operation === 'create') {
    if (await client.get(domain, alias))
      throw new TinyURLError(
        'That alias already exists. Import it to review and edit it; choose another alias for a new link.',
        409,
      )
    await client.create(domain, alias, destinationURL)
  } else if (original && (original.alias !== alias || original.destinationURL !== destinationURL)) {
    if (original.alias !== alias && original.destinationURL !== destinationURL)
      throw new TinyURLError('Change the alias and destination in separate saves.')
    assertRemoteUnchanged(await client.get(domain, original.alias), original.destinationURL)
    if (original.alias !== alias) {
      if (await client.get(domain, alias))
        throw new TinyURLError('That alias already exists. Choose another alias.', 409)
      await client.rename(domain, original.alias, alias)
    } else await client.change(domain, alias, destinationURL)
  }
  data.syncError = ''
  return data
}

export const captureContentOperation =
  <T extends CollectionSlug>(): CollectionBeforeOperationHook<T> =>
  ({ args, operation, req }) => {
    if (operation === 'update' || operation === 'create') {
      const options = args as unknown as { draft?: boolean; data?: { _status?: string } }
      ;(req.context as Record<symbol, unknown>)[savingDraft] = Boolean(
        options.draft && options.data?._status !== 'published',
      )
    }
    return args
  }
export const protectLinkedContent: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  collection,
  req,
}) => {
  if (!originalDoc?.id) return data
  const existing = await sourceLinks(req, collection.slug as 'pages' | 'posts', originalDoc.id)
  if (!existing.length) return data
  const tenant = relationshipID(data.tenant ?? originalDoc.tenant)
  if (existing.some((link) => relationshipID(link.tenant) !== tenant))
    throw new TinyURLError('Content with short links cannot move to another site.', 409)
  if (
    existing.some((link) => !link.archived) &&
    data._status === 'draft' &&
    !(req.context as Record<symbol, unknown>)[savingDraft]
  )
    throw new TinyURLError(
      'This content has TinyURL links. Archive those links in TinyURL and import them before unpublishing. Saving a draft is still allowed.',
      409,
    )
  return data
}

export const protectLinkedContentDelete: CollectionBeforeDeleteHook = async ({
  id,
  req,
  collection,
}) => {
  const existing = await req.payload.find({
    collection: links,
    where: {
      and: [
        { 'source.relationTo': { equals: collection.slug } },
        { 'source.value': { equals: id } },
        { archived: { not_equals: true } },
      ],
    },
    limit: 1,
    req,
    overrideAccess: true,
  })
  if (existing.docs.length)
    throw new TinyURLError(
      'This content has a TinyURL link. Archive that link in TinyURL and import it before deleting the content.',
      409,
    )
}

async function publishedSource(req: PayloadRequest, collection: 'pages' | 'posts', id: string) {
  // First check real update access through Payload; a readable public document is not edit permission.
  await req.payload.findByID({ collection, id, req, overrideAccess: false, depth: 0, draft: true })
  const doc = await req.payload.findByID({
    collection,
    id,
    req,
    overrideAccess: false,
    depth: 0,
    draft: false,
  })
  const tenant = relationshipID(doc.tenant)
  if (!tenant) throw new TinyURLError('Select a site for this content.')
  assertSiteEditor(req.user, tenant)
  const config = req.payload.config.collections.find((item) => item.slug === collection)
  const access = await config?.access.update?.({ req, id, data: {} })
  if (!access) throw new TinyURLError('You cannot edit this content.', 403)
  if (typeof access === 'object') {
    const permitted = await req.payload.find({
      collection,
      where: { and: [{ id: { equals: id } }, access] },
      req,
      overrideAccess: true,
      limit: 1,
    })
    if (!permitted.docs.length) throw new TinyURLError('You cannot edit this content.', 403)
  }
  if (doc._status !== 'published')
    throw new TinyURLError(
      'Publish the content before creating or updating its short link. Draft/preview URLs are never shortened.',
      409,
    )
  const site = await siteConfig(req, tenant)
  return { doc, tenant, domain: site.domain, url: canonicalURL(collection, doc.slug, site.slug) }
}
async function sourceLinks(
  req: PayloadRequest,
  collection: 'pages' | 'posts',
  id: string,
): Promise<LinkDoc[]> {
  const result = await req.payload.find({
    collection: links,
    where: {
      and: [{ 'source.relationTo': { equals: collection } }, { 'source.value': { equals: id } }],
    },
    depth: 0,
    pagination: false,
    req,
    overrideAccess: true,
  })
  return result.docs as unknown as LinkDoc[]
}
async function saveInternal(req: PayloadRequest, data: Record<string, unknown>, id?: string) {
  const args = { collection: links, data, req, context: internalContext(req), overrideAccess: true }
  const previous = req.context
  try {
    return await (id
      ? req.payload.update({ ...args, id } as never)
      : req.payload.create(args as never))
  } finally {
    req.context = previous
  }
}
const respond =
  (handler: PayloadHandler): PayloadHandler =>
  async (req) => {
    try {
      return await handler(req)
    } catch (error) {
      return Response.json(
        { error: safeMessage(error) },
        {
          status: error instanceof TinyURLError ? Math.min(599, Math.max(400, error.status)) : 500,
        },
      )
    }
  }

export function contentLinkEndpoint(collection: 'pages' | 'posts'): PayloadHandler {
  return respond(async (req) => {
    const id = String(req.routeParams?.id ?? '')
    const source = await publishedSource(req, collection, id)
    const existing = await sourceLinks(req, collection, id)
    // Return only this site’s linked records, even for malformed legacy relationships.
    if (
      existing.some(
        (link) => relationshipID(link.tenant) !== source.tenant || link.domain !== source.domain,
      )
    )
      throw new TinyURLError(
        'This content has a link belonging to another site/domain. Contact the site maintainer.',
        409,
      )
    if (req.method === 'GET') return Response.json({ links: existing, canonicalURL: source.url })
    const body = (await req.json?.()) as { alias?: unknown } | undefined
    const alias = aliasValue(body?.alias, source.domain)
    const match = existing.find((link) => link.alias === alias)
    const client = new TinyURLClient()
    if (match) {
      const remote = await client.get(source.domain, alias)
      if (!remote || remote.archived || destinationValue(remote.url) !== source.url) {
        assertRemoteUnchanged(remote, match.destinationURL)
        if (match.destinationURL !== source.url)
          await client.change(source.domain, alias, source.url)
      }
      await saveInternal(req, { destinationURL: source.url, syncError: '' }, match.id)
    } else {
      if (await client.get(source.domain, alias))
        throw new TinyURLError(
          'That alias already exists. It will not be overwritten or attached to this content.',
          409,
        )
      await client.create(source.domain, alias, source.url)
      await saveInternal(req, {
        tenant: source.tenant,
        domain: source.domain,
        alias,
        destinationURL: source.url,
        shortURL: `https://${source.domain}/${alias}`,
        remoteKey: `${source.domain}/${alias}`,
        source: { relationTo: collection, value: id },
        archived: false,
      })
    }
    // New aliases preserve the previous aliases, which continue following this content.
    return Response.json({ shortURL: `https://${source.domain}/${alias}`, alias })
  })
}

export const syncPublishedContent: CollectionAfterChangeHook = async ({ doc, collection, req }) => {
  if (isInternal(req) || doc._status !== 'published') return doc
  const existing = await sourceLinks(req, collection.slug as 'posts' | 'pages', doc.id)
  if (!existing.length) return doc
  for (const link of existing) {
    if (link.archived) continue
    try {
      const tenant = relationshipID(doc.tenant)
      if (!tenant || relationshipID(link.tenant) !== tenant)
        throw new TinyURLError(
          'Content site changed. Short link update stopped to preserve site isolation.',
          409,
        )
      const site = await siteConfig(req, tenant, true)
      if (site.domain !== link.domain)
        throw new TinyURLError('Site domain changed. Review the linked short URL.', 409)
      const url = canonicalURL(collection.slug as 'posts' | 'pages', doc.slug, site.slug)
      if (url !== link.destinationURL) {
        const client = new TinyURLClient()
        const remote = await client.get(link.domain, link.alias)
        if (!remote || remote.archived || destinationValue(remote.url) !== url) {
          assertRemoteUnchanged(remote, link.destinationURL)
          await client.change(link.domain, link.alias, url)
        }
        await saveInternal(req, { destinationURL: url, syncError: '' }, link.id)
      }
    } catch (error) {
      // Publishing remains successful; errors remain visible on the linked collection record.
      await saveInternal(req, { syncError: safeMessage(error) }, link.id)
    }
  }
  return doc
}

export const importSiteLinks: PayloadHandler = respond(async (req) => {
  const id = String(req.routeParams?.id ?? '')
  const profile = await req.payload.findByID({
    collection: 'rep-info',
    id,
    req,
    overrideAccess: false,
    depth: 0,
  })
  const tenant = relationshipID(profile.tenant)
  if (!tenant) throw new TinyURLError('Save the Site Profile with a site first.')
  const { domain } = await siteConfig(req, tenant)
  let imported = 0
  const client = new TinyURLClient()
  for await (const remote of client.list(domain)) {
    const result = await req.payload.find({
      collection: links,
      where: { remoteKey: { equals: `${domain}/${remote.alias}` } },
      limit: 1,
      depth: 0,
      req,
      overrideAccess: true,
    })
    const old = result.docs[0] as unknown as LinkDoc | undefined
    if (old && relationshipID(old.tenant) !== tenant)
      throw new TinyURLError('A link already belongs to another site. Import stopped.', 409)
    await saveInternal(
      req,
      {
        tenant,
        domain,
        alias: remote.alias,
        destinationURL: old?.source ? old.destinationURL : remote.url,
        shortURL: `https://${domain}/${remote.alias}`,
        remoteKey: `${domain}/${remote.alias}`,
        archived: Boolean(remote.archived),
        syncError:
          old?.source && old.destinationURL !== remote.url
            ? 'Destination changed in TinyURL. Review before syncing the linked content.'
            : '',
      },
      old?.id,
    )
    imported++
  }
  return Response.json({ imported, domain })
})
