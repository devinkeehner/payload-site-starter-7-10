import type { Metadata } from 'next'
import { config } from '@/site.config'

const defaultOpenGraph: Metadata['openGraph'] = {
  type: 'website',
  description: config.description,
  siteName: config.name,
  title: config.name,
  images: [`${config.url}/opengraph-image.jpg`],
}

export const mergeOpenGraph = (og?: Metadata['openGraph']): Metadata['openGraph'] => {
  return {
    ...defaultOpenGraph,
    ...og,
    images: og?.images ? og.images : defaultOpenGraph.images,
  }
}
