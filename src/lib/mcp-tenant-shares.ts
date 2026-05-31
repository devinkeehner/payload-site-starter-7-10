import type { PayloadRequest } from 'payload'

import { buildDefaultEmailLayout } from '@/lib/email/defaultEmailLayout'

type UnknownRecord = Record<string, unknown>

type ShareResultRow = {
  tenantID: string
  skipped?: boolean
  reason?: string
  id?: string | null
  slug?: string | null
  _status?: string | null
  error?: string
}

type ShareCollection = 'posts' | 'forms' | 'emails'

type ShareArgs = {
  collection: ShareCollection
  docId: string
  tenantIDs: string[]
  sourceTenantID?: string
  req: PayloadRequest
}

const asRecord = (value: unknown): UnknownRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as UnknownRecord
}

const getString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const extractMediaId = (value: unknown): string | undefined => {
  if (!value) return undefined
  if (typeof value === 'string') return getString(value)
  if (typeof value !== 'object') return undefined

  const record = asRecord(value)
  return (
    getString(record.id) ||
    getString(record._id) ||
    getString(record.value) ||
    (typeof record.value === 'object' ? extractMediaId(record.value) : undefined)
  )
}

const extractFormId = (value: unknown): string | undefined => {
  if (!value) return undefined
  if (typeof value === 'string') return getString(value)
  if (typeof value !== 'object') return undefined

  const record = asRecord(value)
  return (
    getString(record.id) ||
    getString(record._id) ||
    getString(record.value) ||
    (typeof record.value === 'object' ? extractFormId(record.value) : undefined)
  )
}

const getTenantInfo = async (
  req: PayloadRequest,
  tenantId: string,
  cache: Map<string, { id: string; slug?: string | null }>,
) => {
  if (cache.has(tenantId)) return cache.get(tenantId)!
  const tenantDoc = await req.payload.findByID({
    collection: 'tenants',
    id: tenantId,
    depth: 0,
    overrideAccess: true,
    req,
  })

  const info = {
    id: tenantId,
    slug: getString(asRecord(tenantDoc).slug) ?? undefined,
  }
  cache.set(tenantId, info)
  return info
}

const buildMediaUrl = (doc: unknown): string | undefined => {
  const record = asRecord(doc)
  if (typeof record.url === 'string' && record.url) return record.url

  const base = process.env.R2_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_MEDIA_BASE_URL
  if (!base) return undefined

  const prefix = typeof record.prefix === 'string' ? record.prefix.replace(/\/+$/u, '') : ''
  const filename = typeof record.filename === 'string' ? record.filename.replace(/^\/+/, '') : ''
  if (!filename) return undefined

  const key = prefix ? `${prefix}/${filename}` : filename
  return `${base.replace(/\/+$/u, '')}/${key.replace(/^\/+/, '')}`
}

const ensureMediaCloneFactory = (
  req: PayloadRequest,
  sourceTenantID: string | undefined,
  tenantCache: Map<string, { id: string; slug?: string | null }>,
  mediaDocCache: Map<string, unknown>,
  mediaCloneCache: Map<string, string>,
) => {
  const fetchMediaDoc = async (mediaId: string) => {
    if (mediaDocCache.has(mediaId)) return mediaDocCache.get(mediaId)!
    const scopedSourceReq = sourceTenantID
      ? ({ ...req, tenant: sourceTenantID } as PayloadRequest & { tenant: string })
      : req
    const doc = await req.payload.findByID({
      collection: 'media',
      id: mediaId,
      depth: 0,
      overrideAccess: true,
      req: scopedSourceReq,
    })
    mediaDocCache.set(mediaId, doc)
    return doc
  }

  return async (mediaId: string | undefined, tenantId: string, scopedReq: PayloadRequest | (PayloadRequest & { tenant: string })) => {
    if (!mediaId) return undefined
    const cacheKey = `${mediaId}:${tenantId}`
    if (mediaCloneCache.has(cacheKey)) return mediaCloneCache.get(cacheKey)!

    const mediaDoc = await fetchMediaDoc(mediaId).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to load media ${mediaId}: ${message}`)
    })

    if (!mediaDoc) throw new Error(`Media ${mediaId} not found`)

    const mediaUrl = buildMediaUrl(mediaDoc)
    if (!mediaUrl) throw new Error(`Media ${mediaId} is missing a resolvable URL`)

    const response = await fetch(mediaUrl)
    if (!response.ok) {
      throw new Error(`Unable to download media ${mediaId} (status ${response.status})`)
    }

    const arrayBuffer = await response.arrayBuffer()
    const fileBuffer = Buffer.from(arrayBuffer)

    const tenantInfo = await getTenantInfo(req, tenantId, tenantCache)
    const mediaRecord = asRecord(mediaDoc)
    const filename =
      typeof mediaRecord.filename === 'string' && mediaRecord.filename
        ? mediaRecord.filename.replace(/\\/gu, '/').split('/').pop() || mediaRecord.filename
        : `${mediaId}`
    const mimeType = typeof mediaRecord.mimeType === 'string' ? mediaRecord.mimeType : 'application/octet-stream'
    const captionClone = mediaRecord.caption ? JSON.parse(JSON.stringify(mediaRecord.caption)) : undefined

    const dot = filename.lastIndexOf('.')
    const base = dot > 0 ? filename.slice(0, dot) : filename
    const ext = dot > 0 ? filename.slice(dot) : ''
    const tenantSlug = typeof tenantInfo.slug === 'string' ? tenantInfo.slug : ''
    const safeTenant = (tenantSlug || tenantId).replace(/[^a-z0-9_-]+/giu, '-')
    const preferredFilename = `${safeTenant}-${base}-${mediaId}${ext}`

    const context = { disableRevalidate: true } as NonNullable<Parameters<typeof req.payload.create>[0]['context']>

    const createWithName = async (name: string) =>
      await req.payload.create({
        collection: 'media',
        data: {
          alt: getString(mediaRecord.alt) || name,
          caption: captionClone,
          tenant: tenantId,
        },
        file: {
          data: fileBuffer,
          size: fileBuffer.length,
          name,
          mimetype: mimeType,
        },
        req: scopedReq,
        overrideAccess: true,
        context,
      })

    let createdMedia: unknown
    try {
      createdMedia = await createWithName(preferredFilename)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('filename')) {
        const nonce = Date.now().toString(36)
        const uniqueFilename = `${safeTenant}-${base}-${mediaId}-${nonce}${ext}`
        createdMedia = await createWithName(uniqueFilename)
      } else {
        throw error
      }
    }

    const newId = getString(asRecord(createdMedia).id)
    if (!newId) throw new Error(`Cloned media for ${mediaId} did not return an ID`)

    mediaCloneCache.set(cacheKey, newId)
    return newId
  }
}

const cloneRichTextUploadsFactory = (
  ensureMediaClone: ReturnType<typeof ensureMediaCloneFactory>,
  ensureFormClone?: (formId: string | undefined, tenantId: string, scopedReq: PayloadRequest | (PayloadRequest & { tenant: string })) => Promise<string | undefined>,
) => {
  const walk = async (
    node: unknown,
    tenantId: string,
    scopedReq: PayloadRequest | (PayloadRequest & { tenant: string }),
  ): Promise<unknown> => {
    if (Array.isArray(node)) {
      const next: unknown[] = []
      for (const item of node) {
        next.push(await walk(item, tenantId, scopedReq))
      }
      return next
    }

    if (!node || typeof node !== 'object') return node

    const record = asRecord(node)

    if (record.type === 'upload' && record.relationTo === 'media') {
      const uploadId = extractMediaId(record.value)
      const clonedId = await ensureMediaClone(uploadId, tenantId, scopedReq)
      return { ...record, value: clonedId }
    }

    const entries = Object.entries(record)
    const updated: Record<string, unknown> = { ...record }
    for (const [key, val] of entries) {
      if (!val) {
        updated[key] = val
        continue
      }

      if (key === 'media' || key === 'image') {
        const relationId = extractMediaId(val)
        if (relationId) {
          updated[key] = await ensureMediaClone(relationId, tenantId, scopedReq)
          continue
        }
      }

      if (key === 'form') {
        const relationId = extractFormId(val)
        if (relationId && ensureFormClone) {
          updated[key] = await ensureFormClone(relationId, tenantId, scopedReq)
          continue
        }
      }

      if (!Array.isArray(val) && typeof val === 'object') {
        const nested = asRecord(val)
        if (nested.relationTo === 'media') {
          const relationId = extractMediaId(val)
          if (relationId) {
            updated[key] = await ensureMediaClone(relationId, tenantId, scopedReq)
            continue
          }
        }
        if (nested.relationTo === 'forms' && ensureFormClone) {
          const relationId = extractFormId(val)
          if (relationId) {
            updated[key] = await ensureFormClone(relationId, tenantId, scopedReq)
            continue
          }
        }
      }

      updated[key] = await walk(val, tenantId, scopedReq)
    }

    return updated
  }

  return walk
}

const cloneFormOptions = async (
  options: unknown[] | null | undefined,
  tenantId: string,
  scopedReq: PayloadRequest | (PayloadRequest & { tenant: string }),
  ensureMediaClone: ReturnType<typeof ensureMediaCloneFactory>,
) => {
  if (!Array.isArray(options)) return options
  const clonedOptions: UnknownRecord[] = []
  for (const option of options) {
    if (!option) continue
    const nextOption: Record<string, unknown> = { ...asRecord(option) }
    delete nextOption.id
    delete nextOption._id
    if (nextOption.image) {
      const optionImageId = extractMediaId(nextOption.image)
      nextOption.image = await ensureMediaClone(optionImageId, tenantId, scopedReq)
    }
    clonedOptions.push(nextOption)
  }
  return clonedOptions
}

const cloneFormFields = async (
  fields: unknown[] | null | undefined,
  tenantId: string,
  scopedReq: PayloadRequest | (PayloadRequest & { tenant: string }),
  ensureMediaClone: ReturnType<typeof ensureMediaCloneFactory>,
) => {
  if (!Array.isArray(fields)) return fields
  const clonedFields: UnknownRecord[] = []
  for (const field of fields) {
    if (!field) continue
    const nextField: Record<string, unknown> = JSON.parse(JSON.stringify(field))
    delete nextField.id
    delete nextField._id
    if (Array.isArray(nextField.options)) {
      nextField.options = await cloneFormOptions(nextField.options as unknown[], tenantId, scopedReq, ensureMediaClone)
    }
    if (nextField.blockType === 'message' && nextField.message) {
      nextField.message = await cloneRichTextUploadsFactory(ensureMediaClone)(nextField.message, tenantId, scopedReq)
    }
    clonedFields.push(nextField)
  }
  return clonedFields
}

const cloneEmails = async (
  emails: unknown[] | null | undefined,
  tenantId: string,
  scopedReq: PayloadRequest | (PayloadRequest & { tenant: string }),
  ensureMediaClone: ReturnType<typeof ensureMediaCloneFactory>,
) => {
  if (!Array.isArray(emails)) return emails
  const clonedEmails: UnknownRecord[] = []
  const cloneRichText = cloneRichTextUploadsFactory(ensureMediaClone)
  for (const email of emails) {
    if (!email) continue
    const nextEmail: Record<string, unknown> = { ...asRecord(email) }
    delete nextEmail.id
    delete nextEmail._id
    if (nextEmail.message) {
      nextEmail.message = await cloneRichText(nextEmail.message, tenantId, scopedReq)
    }
    clonedEmails.push(nextEmail)
  }
  return clonedEmails
}

const cloneFormToTenant = async (
  req: PayloadRequest,
  formId: string,
  tenantId: string,
  scopedReq: PayloadRequest | (PayloadRequest & { tenant: string }),
  sourceTenantID: string | undefined,
  formDocCache: Map<string, unknown>,
  tenantCache: Map<string, { id: string; slug?: string | null }>,
  mediaDocCache: Map<string, unknown>,
  mediaCloneCache: Map<string, string>,
): Promise<string> => {
  const cacheKey = `${formId}:${tenantId}`
  const formCloneCacheKey = `${cacheKey}:form`
  if (formDocCache.has(formCloneCacheKey)) {
    return getString(asRecord(formDocCache.get(formCloneCacheKey)).id) || ''
  }

  const fetchFormDoc = async () => {
    if (formDocCache.has(formId)) return formDocCache.get(formId)!
    const sourceReq = sourceTenantID
      ? ({ ...req, tenant: sourceTenantID } as PayloadRequest & { tenant: string })
      : req
    const doc = await req.payload.findByID({
      collection: 'forms',
      id: formId,
      depth: 2,
      overrideAccess: true,
      req: sourceReq,
    })
    formDocCache.set(formId, doc)
    return doc
  }

  const formDoc = await fetchFormDoc().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to load form ${formId}: ${message}`)
  })

  if (!formDoc) throw new Error(`Form ${formId} not found`)

  const formDocRecord = asRecord(formDoc)
  const ensureMediaClone = ensureMediaCloneFactory(req, sourceTenantID, tenantCache, mediaDocCache, mediaCloneCache)

  const cloneRichText = cloneRichTextUploadsFactory(ensureMediaClone)

  const cloneKeys = [
    'title',
    'fields',
    'submitButtonLabel',
    'confirmationType',
    'confirmationMessage',
    'redirect',
    'emails',
    'enableIntro',
    'introContent',
  ]

  const data: Record<string, unknown> = {}
  for (const key of cloneKeys) {
    if (typeof formDocRecord[key] !== 'undefined') {
      data[key] = JSON.parse(JSON.stringify(formDocRecord[key]))
    }
  }

  data.fields = await cloneFormFields((data.fields as unknown[]) || [], tenantId, scopedReq, ensureMediaClone)
  if (Array.isArray(data.emails as unknown[])) {
    data.emails = await cloneEmails(data.emails as unknown[], tenantId, scopedReq, ensureMediaClone)
  }

  if (data.confirmationMessage) {
    data.confirmationMessage = await cloneRichText(data.confirmationMessage, tenantId, scopedReq)
  }
  if (data.introContent) {
    data.introContent = await cloneRichText(data.introContent, tenantId, scopedReq)
  }

  data.tenant = tenantId

  const createdForm = await req.payload.create({
    collection: 'forms',
    data,
    draft: true,
    depth: 0,
    req: scopedReq,
    overrideAccess: true,
    context: { disableRevalidate: true },
  })

  const newId = getString(asRecord(createdForm).id)
  if (!newId) throw new Error(`Cloned form for ${formId} did not return an ID`)

  formDocCache.set(formCloneCacheKey, { id: newId })
  return newId
}

const clonePostToTenant = async (
  req: PayloadRequest,
  postId: string,
  tenantId: string,
  scopedReq: PayloadRequest | (PayloadRequest & { tenant: string }),
  sourceTenantID: string | undefined,
  formDocCache: Map<string, unknown>,
  tenantCache: Map<string, { id: string; slug?: string | null }>,
  mediaDocCache: Map<string, unknown>,
  mediaCloneCache: Map<string, string>,
  formCloneCache: Map<string, string>,
): Promise<{ id: string; slug?: string | null; _status?: string | null }> => {
  const sourceReq = sourceTenantID
    ? ({ ...req, tenant: sourceTenantID } as PayloadRequest & { tenant: string })
    : req

  const postDoc = await req.payload.findByID({
    collection: 'posts',
    id: postId,
    depth: 0,
    overrideAccess: true,
    req: sourceReq,
  })

  const postRecord = asRecord(postDoc)
  const ensureMediaClone = ensureMediaCloneFactory(req, sourceTenantID, tenantCache, mediaDocCache, mediaCloneCache)
  const ensureFormClone = async (formId: string | undefined, nextTenantId: string, nextReq: PayloadRequest | (PayloadRequest & { tenant: string })) => {
    if (!formId) return undefined
    const cacheKey = `${formId}:${nextTenantId}`
    if (formCloneCache.has(cacheKey)) return formCloneCache.get(cacheKey)
    const cloned = await cloneFormToTenant(
      req,
      formId,
      nextTenantId,
      nextReq,
      sourceTenantID,
      formDocCache,
      tenantCache,
      mediaDocCache,
      mediaCloneCache,
    )
    formCloneCache.set(cacheKey, cloned)
    return cloned
  }
  const cloneRichText = cloneRichTextUploadsFactory(ensureMediaClone, ensureFormClone)

  const categories = Array.isArray(postRecord.categories)
    ? postRecord.categories
        .map((entry) => (typeof entry === 'string' ? entry : getString(asRecord(entry).id)))
        .filter((entry): entry is string => Boolean(entry))
    : []
  const tags = Array.isArray(postRecord.tags)
    ? postRecord.tags
        .map((entry) => (typeof entry === 'string' ? entry : getString(asRecord(entry).id)))
        .filter((entry): entry is string => Boolean(entry))
    : []

  const heroImageId = extractMediaId(postRecord.heroImage)
  const metaImageId = extractMediaId(asRecord(postRecord.meta).image)
  const keyTakeaways = Array.isArray(postRecord.keyTakeaways)
    ? postRecord.keyTakeaways
        .map((entry) => ({ point: String(asRecord(entry).point || '') }))
        .filter((entry) => entry.point)
    : []
  const articleType =
    typeof postRecord.articleType === 'string'
      ? postRecord.articleType
      : getString(asRecord(postRecord.articleType).id)

  const [clonedHeroImage, clonedMetaImage, clonedContent] = await Promise.all([
    ensureMediaClone(heroImageId, tenantId, scopedReq),
    ensureMediaClone(metaImageId, tenantId, scopedReq),
    cloneRichText(postRecord.content, tenantId, scopedReq),
  ])

  const data: Record<string, unknown> = {
    title: postRecord.title,
    heroSource: postRecord.heroSource,
    heroImage: clonedHeroImage,
    heroExternalURL: postRecord.heroExternalURL,
    content: clonedContent,
    meta: {
      title: asRecord(postRecord.meta).title,
      description: asRecord(postRecord.meta).description,
      image: clonedMetaImage,
    },
    categories,
    keyTakeaways,
    articleType,
    tags,
    relatedPosts: undefined,
    publishedAt: null,
    slug: postRecord.slug,
    slugLock: postRecord.slugLock,
    tenant: tenantId,
    _status: 'draft',
  }

  const created = await req.payload.create({
    collection: 'posts',
    data,
    draft: true,
    depth: 0,
    req: scopedReq,
  })

  const createdRecord = asRecord(created)
  const id = getString(createdRecord.id)
  if (!id) throw new Error(`Cloned post for ${postId} did not return an ID`)

  return {
    id,
    slug: getString(createdRecord.slug) ?? undefined,
    _status: getString(createdRecord._status) ?? 'draft',
  }
}

const getTenantDefaultEmailPieces = async (
  req: PayloadRequest,
  tenantId: string | undefined,
  seed: UnknownRecord,
  scopedReq?: PayloadRequest | (PayloadRequest & { tenant: string }),
): Promise<{ defaultFeaturedImageId?: string; footer?: UnknownRecord }> => {
  if (!tenantId) return {}

  const defaultLayout = await buildDefaultEmailLayout(
    {
      ...seed,
      tenant: tenantId,
    },
    scopedReq || ({ ...req, tenant: tenantId } as PayloadRequest & { tenant: string }),
  )

  const defaultImage = defaultLayout.find(
    (block) => asRecord(block).blockType === 'emailImage' && extractMediaId(asRecord(block).media),
  )
  const footer = defaultLayout.find((block) => asRecord(block).blockType === 'emailFooterOneColumn')

  return {
    defaultFeaturedImageId: extractMediaId(asRecord(defaultImage).media),
    footer: footer ? asRecord(footer) : undefined,
  }
}

const isGeneratedEmailHeaderImage = (
  block: UnknownRecord,
  isFirstTopLevelBlock: boolean,
  sourceDefaultFeaturedImageId?: string,
) => {
  if (block.blockType !== 'emailImage') return false

  const source = getString(block.imageSource) || getString(block.generatedSource) || getString(block.source)
  if (source === 'tenantDefaultFeaturedImage' || source === 'tenant-default-featured-image') return true

  const mediaId = extractMediaId(block.media)
  return Boolean(isFirstTopLevelBlock && sourceDefaultFeaturedImageId && mediaId === sourceDefaultFeaturedImageId)
}

const cloneEmailLayout = async (
  layout: unknown,
  tenantId: string,
  scopedReq: PayloadRequest | (PayloadRequest & { tenant: string }),
  ensureMediaClone: ReturnType<typeof ensureMediaCloneFactory>,
  targetDefaults: { defaultFeaturedImageId?: string; footer?: UnknownRecord },
  sourceDefaults: { defaultFeaturedImageId?: string },
) => {
  const cloneValue = async (
    value: unknown,
    isFirstTopLevelBlock = false,
    isTopLevelLayout = false,
  ): Promise<unknown> => {
    if (Array.isArray(value)) {
      const next: unknown[] = []
      for (let index = 0; index < value.length; index += 1) {
        const cloned = await cloneValue(value[index], isTopLevelLayout && index === 0, false)
        if (typeof cloned !== 'undefined') next.push(cloned)
      }
      return next
    }

    if (!value || typeof value !== 'object') return value

    const record = asRecord(value)
    const blockType = getString(record.blockType)

    if (blockType === 'emailImage') {
      if (isGeneratedEmailHeaderImage(record, isFirstTopLevelBlock, sourceDefaults.defaultFeaturedImageId)) {
        if (!targetDefaults.defaultFeaturedImageId) return undefined

        return {
          ...record,
          imageSource: 'tenantDefaultFeaturedImage',
          media: targetDefaults.defaultFeaturedImageId,
        }
      }

      return {
        ...record,
        media: await ensureMediaClone(extractMediaId(record.media), tenantId, scopedReq),
      }
    }

    if (blockType === 'emailFooterOneColumn' && targetDefaults.footer) {
      return {
        ...record,
        ...JSON.parse(JSON.stringify(targetDefaults.footer)),
        blockType: 'emailFooterOneColumn',
        id: record.id,
      }
    }

    const next: UnknownRecord = { ...record }
    for (const [key, childValue] of Object.entries(record)) {
      if (!childValue) {
        next[key] = childValue
        continue
      }

      if (key === 'media' || key === 'image') {
        const mediaId = extractMediaId(childValue)
        if (mediaId) {
          next[key] = await ensureMediaClone(mediaId, tenantId, scopedReq)
          continue
        }
      }

      next[key] = await cloneValue(childValue, false, false)
    }

    return next
  }

  return cloneValue(layout, false, true)
}

const cloneEmailToTenant = async (
  req: PayloadRequest,
  emailId: string,
  tenantId: string,
  scopedReq: PayloadRequest | (PayloadRequest & { tenant: string }),
  sourceTenantID: string | undefined,
  tenantCache: Map<string, { id: string; slug?: string | null }>,
  mediaDocCache: Map<string, unknown>,
  mediaCloneCache: Map<string, string>,
): Promise<{ id: string; _status?: string | null }> => {
  const sourceReq = sourceTenantID
    ? ({ ...req, tenant: sourceTenantID } as PayloadRequest & { tenant: string })
    : req

  const emailDoc = await req.payload.findByID({
    collection: 'emails',
    id: emailId,
    depth: 0,
    overrideAccess: true,
    req: sourceReq,
  })

  const emailRecord = asRecord(emailDoc)
  const sourceTenantId =
    sourceTenantID ||
    (typeof emailRecord.tenant === 'string' ? emailRecord.tenant : getString(asRecord(emailRecord.tenant).id))
  const ensureMediaClone = ensureMediaCloneFactory(req, sourceTenantId, tenantCache, mediaDocCache, mediaCloneCache)
  const defaultSeed = {
    subject: emailRecord.subject,
    title: emailRecord.title,
  }
  const [targetDefaults, sourceDefaults] = await Promise.all([
    getTenantDefaultEmailPieces(req, tenantId, defaultSeed, scopedReq),
    getTenantDefaultEmailPieces(req, sourceTenantId, defaultSeed, sourceReq),
  ])

  const clonedLayout = await cloneEmailLayout(
    emailRecord.layout,
    tenantId,
    scopedReq,
    ensureMediaClone,
    targetDefaults,
    sourceDefaults,
  )

  const data: Record<string, unknown> = {
    title: emailRecord.title,
    subject: emailRecord.subject,
    preheader: emailRecord.preheader,
    recipientEmail: emailRecord.recipientEmail,
    replyTo: emailRecord.replyTo,
    status: 'draft',
    scheduledAt: null,
    emailList: null,
    layout: Array.isArray(clonedLayout) ? clonedLayout : [],
    tenant: tenantId,
  }

  const created = await req.payload.create({
    collection: 'emails',
    data,
    draft: true,
    depth: 0,
    req: scopedReq,
    overrideAccess: true,
    context: { disableRevalidate: true },
  })

  const createdRecord = asRecord(created)
  const id = getString(createdRecord.id)
  if (!id) throw new Error(`Cloned email for ${emailId} did not return an ID`)

  return {
    id,
    _status: getString(createdRecord._status) ?? 'draft',
  }
}

export async function shareDocumentToTenants({
  collection,
  docId,
  tenantIDs,
  sourceTenantID,
  req,
}: ShareArgs): Promise<{ count: number; results: ShareResultRow[] }> {
  const tenantCache = new Map<string, { id: string; slug?: string | null }>()
  const mediaDocCache = new Map<string, unknown>()
  const mediaCloneCache = new Map<string, string>()
  const formDocCache = new Map<string, unknown>()
  const formCloneCache = new Map<string, string>()

  const results: ShareResultRow[] = []
  let count = 0

  for (const tenantId of tenantIDs) {
    if (tenantId && sourceTenantID && tenantId === sourceTenantID) {
      results.push({ tenantID: tenantId, skipped: true, reason: 'same-tenant' })
      continue
    }

    const scopedReq = { ...req, tenant: tenantId } as PayloadRequest & { tenant: string }

    try {
      if (collection === 'emails') {
        const cloned = await cloneEmailToTenant(
          req,
          docId,
          tenantId,
          scopedReq,
          sourceTenantID,
          tenantCache,
          mediaDocCache,
          mediaCloneCache,
        )
        results.push({ tenantID: tenantId, id: cloned.id, _status: cloned._status ?? 'draft' })
        count += 1
        continue
      }

      if (collection === 'forms') {
        const newId = await cloneFormToTenant(
          req,
          docId,
          tenantId,
          scopedReq,
          sourceTenantID,
          formDocCache,
          tenantCache,
          mediaDocCache,
          mediaCloneCache,
        )
        results.push({ tenantID: tenantId, id: newId, _status: 'draft' })
        count += 1
        continue
      }

      const cloned = await clonePostToTenant(
        req,
        docId,
        tenantId,
        scopedReq,
        sourceTenantID,
        formDocCache,
        tenantCache,
        mediaDocCache,
        mediaCloneCache,
        formCloneCache,
      )

      results.push({ tenantID: tenantId, id: cloned.id, slug: cloned.slug ?? null, _status: cloned._status ?? 'draft' })
      count += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      results.push({ tenantID: tenantId, error: message })
    }
  }

  return { count, results }
}
