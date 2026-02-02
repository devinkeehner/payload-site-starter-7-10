import { getServerSideURL } from './getURL'

type Props = {
  collection: 'posts' | 'pages'
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
