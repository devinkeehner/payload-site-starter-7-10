import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

import type { Page } from '../../../payload-types'
import { triggerFrontendRevalidate } from '../../../lib/utilities/revalidateFrontend'

export const revalidatePage: CollectionAfterChangeHook<Page> = async ({
  doc,
  previousDoc,
  req: { payload, context },
}) => {
  // Helper to resolve tenant slug from relation
  const resolveTenantSlug = async (tenantVal: any): Promise<string | undefined> => {
    try {
      const id = typeof tenantVal === 'string' ? tenantVal : tenantVal?.id || tenantVal?._id
      if (!id) return undefined
      const tenant = await payload.findByID({
        collection: 'tenants',
        id,
        depth: 0,
        select: { slug: true } as any,
      })
      return (tenant as any)?.slug || undefined
    } catch {
      return undefined
    }
  }

  if (!context.disableRevalidate) {
    if (doc._status === 'published') {
      const paths: string[] = []
      const tenantSlug = await resolveTenantSlug((doc as any)?.tenant)
      // Tenant-aware path
      if (tenantSlug) {
        paths.push(doc.slug === 'home' ? `/${tenantSlug}` : `/${tenantSlug}/${doc.slug}`)
      }
      // Legacy single-tenant path
      paths.push(doc.slug === 'home' ? '/' : `/${doc.slug}`)

      payload.logger.info(`Triggering frontend revalidation for page: ${doc.slug}`)
      await triggerFrontendRevalidate({
        paths,
        tags: ['payload:pages', ...(tenantSlug ? [`tenant:${tenantSlug}`] : [])],
      })
    }

    // If the page was previously published, also revalidate the old paths
    if (previousDoc?._status === 'published' && doc._status !== 'published') {
      const oldPaths: string[] = []
      const prevTenantSlug = await resolveTenantSlug((previousDoc as any)?.tenant)
      if (prevTenantSlug) {
        oldPaths.push(previousDoc.slug === 'home' ? `/${prevTenantSlug}` : `/${prevTenantSlug}/${previousDoc.slug}`)
      }
      oldPaths.push(previousDoc.slug === 'home' ? '/' : `/${previousDoc.slug}`)

      payload.logger.info(`Triggering frontend revalidation for old page paths: ${previousDoc.slug}`)
      await triggerFrontendRevalidate({
        paths: oldPaths,
        tags: ['payload:pages', ...(prevTenantSlug ? [`tenant:${prevTenantSlug}`] : [])],
      })
    }
  }
  return doc
}

export const revalidateDelete: CollectionAfterDeleteHook<Page> = async ({ doc, req: { payload, context } }) => {
  if (!context.disableRevalidate) {
    const paths: string[] = []
    // Tenant-aware delete path
    try {
      const id = typeof (doc as any)?.tenant === 'string' ? (doc as any).tenant : (doc as any)?.tenant?.id
      if (id) {
        try {
          const t = await payload.findByID({ collection: 'tenants', id, depth: 0, select: { slug: true } as any })
          const tenantSlug = (t as any)?.slug
          if (tenantSlug) paths.push(doc?.slug === 'home' ? `/${tenantSlug}` : `/${tenantSlug}/${doc?.slug}`)
          await triggerFrontendRevalidate({
            paths: [...paths, doc?.slug === 'home' ? '/' : `/${doc?.slug}`],
            tags: ['payload:pages', ...(tenantSlug ? [`tenant:${tenantSlug}`] : [])],
          })
          return doc
        } catch {}
      }
    } catch {}
    // Legacy path fallback
    await triggerFrontendRevalidate({ paths: [doc?.slug === 'home' ? '/' : `/${doc?.slug}`], tags: ['payload:pages'] })
  }

  return doc
}
