import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

import type { Post } from '../../../payload-types'
import { triggerFrontendRevalidate } from '../../../lib/utilities/revalidateFrontend'

export const revalidatePost: CollectionAfterChangeHook<Post> = async ({
  doc,
  previousDoc,
  req: { payload, context },
}) => {
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

  if (!context?.disableRevalidate) {
    // Revalidate new/current paths when published
    if (doc._status === 'published') {
      const paths: string[] = []
      const tenantSlug = await resolveTenantSlug((doc as any)?.tenant)
      if (tenantSlug) paths.push(`/${tenantSlug}/${doc.slug}`)
      // Legacy path for backward compatibility
      paths.push(`/posts/${doc.slug}`)

      payload.logger.info(`Triggering frontend revalidation for post: ${doc.slug}`)
      await triggerFrontendRevalidate({
        paths,
        tags: ['payload:posts', ...(tenantSlug ? [`tenant:${tenantSlug}`] : [])],
      })
    }

    // If the post was previously published, revalidate the old paths
    if (previousDoc._status === 'published' && doc._status !== 'published') {
      const oldPaths: string[] = []
      const prevTenantSlug = await resolveTenantSlug((previousDoc as any)?.tenant)
      if (prevTenantSlug) oldPaths.push(`/${prevTenantSlug}/${previousDoc.slug}`)
      // Legacy old path
      oldPaths.push(`/posts/${previousDoc.slug}`)

      payload.logger.info(`Triggering frontend revalidation for old post paths: ${previousDoc.slug}`)
      await triggerFrontendRevalidate({
        paths: oldPaths,
        tags: ['payload:posts', ...(prevTenantSlug ? [`tenant:${prevTenantSlug}`] : [])],
      })
    }
  }
  return doc
}

export const revalidateDelete: CollectionAfterDeleteHook<Post> = async ({ doc, req: { payload, context } }) => {
  if (!context?.disableRevalidate) {
    const paths: string[] = []
    try {
      const id = typeof (doc as any)?.tenant === 'string' ? (doc as any).tenant : (doc as any)?.tenant?.id
      if (id) {
        try {
          const t = await payload.findByID({ collection: 'tenants', id, depth: 0, select: { slug: true } as any })
          const tenantSlug = (t as any)?.slug
          if (tenantSlug) paths.push(`/${tenantSlug}/${doc?.slug}`)
          await triggerFrontendRevalidate({
            paths: [...paths, `/posts/${doc?.slug}`],
            tags: ['payload:posts', ...(tenantSlug ? [`tenant:${tenantSlug}`] : [])],
          })
          return doc
        } catch {}
      }
    } catch {}
    // Legacy path
    await triggerFrontendRevalidate({ paths: [`/posts/${doc?.slug}`], tags: ['payload:posts'] })
  }

  return doc
}
