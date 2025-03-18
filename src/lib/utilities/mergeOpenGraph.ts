import type { Metadata } from 'next'
import { getServerSideURL } from './getURL'
import { config } from '@/site.config'

const defaultOpenGraph: Metadata['openGraph'] = {
  type: 'website',
  description: config.description,
  images: [
    {
      url: `${getServerSideURL()}/website-template-OG.webp`,
    },
  ],
  siteName: config.name,
  title: config.name,
}

export const mergeOpenGraph = (og?: Metadata['openGraph']): Metadata['openGraph'] => {
  return {
    ...defaultOpenGraph,
    ...og,
    images: og?.images ? og.images : defaultOpenGraph.images,
  }
}
