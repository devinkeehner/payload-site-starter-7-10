import { PayloadRequest, CollectionSlug } from 'payload'
import { getServerSideURL } from './getURL'

const collectionPrefixMap: Partial<Record<CollectionSlug, string>> = {
  posts: '/posts',
  pages: '',
}

type Props = {
  collection: keyof typeof collectionPrefixMap
  slug: string
  req: PayloadRequest
  tenantId?: string
}

export const generatePreviewPath = ({ collection, slug, req, tenantId }: Props) => {
  const encodedParams = new URLSearchParams({
    slug,
    collection,
    path: `${collectionPrefixMap[collection]}/${slug}`,
    secret: process.env.PREVIEW_SECRET || '',
  })

  // If previewing a tenant-scoped doc (posts or pages), include the tenant ID so the
  // preview API can resolve the correct tenant slug and redirect to /[tenant]/[slug]
  try {
    const fromArg = typeof tenantId === 'string' ? tenantId : undefined
    const fromReq = (req as { tenant?: unknown })?.tenant
    const tenant = fromArg || (typeof fromReq === 'string' ? fromReq : undefined)
    if ((collection === 'posts' || collection === 'pages') && typeof tenant === 'string' && tenant) {
      encodedParams.set('tenant', tenant)
    }
  } catch {
    // no-op: fall back to non-tenant-aware preview URL
  }

  const baseURL = getServerSideURL()

  return `${baseURL}/api/preview?${encodedParams.toString()}`
}
