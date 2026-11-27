import type { PayloadRequest, Where } from 'payload'
import { getDashboardPublicSiteBase } from '@/components/admin/dashboard/dashboardNavbarLinks'
import { relationshipID } from '@/lib/live-editor/emailAccess'
import { canonicalURL } from '@/lib/tinyurl/policy'
import { assertDashboardSite, local } from './access'

export function postPublicBase() {
  return getDashboardPublicSiteBase({ ...process.env, NEXT_PUBLIC_SERVER_URL: undefined })
}

export async function listPublishedPosts(req: PayloadRequest, siteId: string | null, query: string, limit: number) {
  const site = await assertDashboardSite(req, siteId)
  const filters: Where[] = [{ tenant: { equals: site.id } }, { _status: { equals: 'published' } }]
  if (query.trim()) filters.push({ or: [{ title: { like: query.trim() } }, { slug: { like: query.trim() } }] })
  const { docs, hasNextPage } = await req.payload.find({
    ...local(req), collection: 'posts', draft: false, where: { and: filters },
    sort: ['-publishedAt', '-createdAt', 'id'], limit,
    select: { title: true, slug: true, publishedAt: true, tenant: true, _status: true },
  })
  return {
    site: { id: site.id, name: site.name || site.slug },
    hasNextPage,
    posts: docs.filter(post => post._status === 'published' && relationshipID(post.tenant) === site.id).map(post => {
      let url: string | null
      try { url = canonicalURL('posts', post.slug, site.slug, postPublicBase()) }
      catch { url = null }
      return { id: post.id, title: post.title, publishedAt: post.publishedAt ?? null, url }
    }),
  }
}
