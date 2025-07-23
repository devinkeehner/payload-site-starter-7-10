import { CollectionSlug } from 'payload'
import { getServerSideURL } from './getURL'

const collectionPrefixMap: Partial<Record<CollectionSlug, string>> = {
  posts: '/posts',
  pages: '',
}

type Props = {
  collection: keyof typeof collectionPrefixMap
  slug: string
}

export const generatePreviewAPIUrl = ({ collection, slug }: Props) => {
  const encodedParams = new URLSearchParams({
    slug,
    collection,
    secret: process.env.PREVIEW_SECRET || '',
  })

  const baseURL = getServerSideURL()

  return `${baseURL}/api/preview?${encodedParams.toString()}`
}
