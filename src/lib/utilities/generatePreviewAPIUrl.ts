import { CollectionSlug } from 'payload'
import { getServerSideURL } from './getURL'

const collectionPrefixMap: Partial<Record<CollectionSlug, string>> = {
  posts: '/posts',
  pages: '',
}

type Props = {
  collection: keyof typeof collectionPrefixMap
  slug: string
  tenantId?: string
}

export const generatePreviewAPIUrl = ({ collection, slug, tenantId }: Props) => {
  const encodedParams = new URLSearchParams({
    slug,
    collection,
    secret: process.env.PREVIEW_SECRET || '',
  })
  if (tenantId && typeof tenantId === 'string') {
    encodedParams.set('tenant', tenantId)
  }

  const baseURL = getServerSideURL()

  return `${baseURL}/api/preview?${encodedParams.toString()}`
}
