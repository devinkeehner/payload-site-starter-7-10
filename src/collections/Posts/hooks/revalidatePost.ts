import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

import { revalidatePath, revalidateTag } from 'next/cache'

import type { Post } from '../../../payload-types'

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

      for (const p of paths) {
        payload.logger.info(`Revalidating post at path: ${p}`)
        revalidatePath(p)
      }
      revalidateTag('posts-sitemap')
    }

    // If the post was previously published, revalidate the old paths
    if (previousDoc._status === 'published' && doc._status !== 'published') {
      const oldPaths: string[] = []
      const prevTenantSlug = await resolveTenantSlug((previousDoc as any)?.tenant)
      if (prevTenantSlug) oldPaths.push(`/${prevTenantSlug}/${previousDoc.slug}`)
      // Legacy old path
      oldPaths.push(`/posts/${previousDoc.slug}`)

      for (const p of oldPaths) {
        payload.logger.info(`Revalidating old post at path: ${p}`)
        revalidatePath(p)
      }
      revalidateTag('posts-sitemap')
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
        } catch {}
      }
    } catch {}
    // Legacy path
    paths.push(`/posts/${doc?.slug}`)

    for (const p of paths) revalidatePath(p)
    revalidateTag('posts-sitemap')
  }

  return doc
}
