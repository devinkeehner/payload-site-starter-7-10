import type { Metadata } from 'next'
import { config } from '@/site.config'

const defaultOpenGraph: Metadata['openGraph'] = {
  type: 'website',
  description: config.description,
  siteName: config.name,
  title: config.name,
  images: ["https://payload-site-starter.vercel.app/api/media/file/og-300x239.png?2025-03-19T16%3A00%3A42.055Z"]
}

export const mergeOpenGraph = (og?: Metadata['openGraph']): Metadata['openGraph'] => {
  return {
    ...defaultOpenGraph,
    ...og,
    images: og?.images ? og.images : defaultOpenGraph.images,
  }
}
