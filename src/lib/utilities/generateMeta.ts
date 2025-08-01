import type { Metadata } from 'next'

import type { Page, Post } from '@/payload-types'

import { mergeOpenGraph } from './mergeOpenGraph'
import { config } from '@/site.config'

export const generateMeta = async (args: {
  doc: Partial<Page> | Partial<Post> | null
}): Promise<Metadata> => {
  const { doc } = args

  const title = doc?.meta?.title ? doc?.meta?.title + ' | ' + config.name : config.name

  return {
    description: doc?.meta?.description,
    openGraph: mergeOpenGraph({
      description: doc?.meta?.description || '',
      title,
      url: Array.isArray(doc?.slug) ? doc?.slug.join('/') : '/',
    }),
    title,
  }
}
