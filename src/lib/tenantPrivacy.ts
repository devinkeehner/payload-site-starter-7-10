import type { Access, Config, PayloadRequest, Where } from 'payload'
import { verifyTenantPreview, TENANT_PREVIEW_HEADER } from './tenant-preview'

// Apply after the multi-tenant and form plugins, preserving their existing rules.
const previewCollections = new Set([
  'pages', 'posts', 'wordpress-posts', 'rep-info', 'navbars', 'standard-media',
  'site-seo', 'forms', 'media', 'search', 'bad-bills',
])

export async function privateTenantIDs(req: PayloadRequest): Promise<string[]> {
  const context = req.context as Record<string, unknown>
  if (!context.privateTenantIDs) {
    context.privateTenantIDs = req.payload.find({
      collection: 'tenants', depth: 0, pagination: false, overrideAccess: true,
      req, select: { slug: true }, where: { isPrivate: { equals: true } },
    }).then(({ docs }) => docs.map(({ id }) => String(id)))
  }
  return context.privateTenantIDs as Promise<string[]>
}

export function tenantPrivacyPlugin(config: Config): Config {
  for (const collection of config.collections || []) {
    const isTenant = collection.slug === 'tenants'
    const isSearch = collection.slug === 'search'
    const tenantScoped = collection.fields.some((field) => 'name' in field && field.name === 'tenant')
    if (!isTenant && !tenantScoped && !isSearch) continue
    const originalRead = collection.access?.read
    collection.access = {
      ...collection.access,
      read: (async (args) => {
        const baseline = originalRead ? await originalRead(args) : Boolean(args.req.user)
        if (args.req.user) return baseline
        const ids = await privateTenantIDs(args.req)
        if (isSearch) {
          // Existing search snapshots have no tenant field. Filter their source
          // post IDs as well, without requiring a search-index backfill.
          const sources = ids.length ? await args.req.payload.find({
            collection: 'posts', depth: 0, pagination: false, overrideAccess: true,
            req: args.req, select: { slug: true }, where: { tenant: { in: ids } },
          }) : { docs: [] }
          const publicSearch: Where = { 'doc.value': { not_in: sources.docs.map(({ id }) => String(id)) } }
          return baseline === false ? false : baseline === true ? publicSearch : { and: [baseline, publicSearch] }
        }
        const publicOnly: Where = isTenant
          ? { isPrivate: { not_equals: true } }
          : { tenant: { not_in: ids } }
        const publicAccess: Where | false = baseline === false ? false : baseline === true
          ? publicOnly : { and: [baseline, publicOnly] }
        const grant = await verifyTenantPreview(
          args.req.headers.get(TENANT_PREVIEW_HEADER), process.env.PREVIEW_SECRET,
        )
        if (grant && (isTenant || previewCollections.has(collection.slug))) {
          const ownTenant: Where = isTenant
            ? { id: { equals: grant.tenantId } }
            : { tenant: { equals: grant.tenantId } }
          return publicAccess ? { or: [publicAccess, ownTenant] } : ownTenant
        }
        return publicAccess
      }) as Access,
    }
  }
  return config
}
