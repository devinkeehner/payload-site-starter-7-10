import type { Metadata } from 'next'

import { PayloadRedirects } from '@/components/site/redirects'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { draftMode } from 'next/headers'
import React, { cache } from 'react'

import { RenderBlocks } from '@/components/blocks/render-blocks'
import { RenderHero } from '@/components/heros/render-hero'
import { generateMeta } from '@/lib/utilities/generateMeta'
import { LivePreviewListener } from '@/components/site/live-preview-listener'
import { SiteSEOInfo } from '@/components/site/site-seo-info'
import { getSiteSEO } from '@/lib/utilities/getSiteSEO'
import { mergeOpenGraph } from '@/lib/utilities/mergeOpenGraph'

export async function generateStaticParams() {
  const payload = await getPayload({ config: configPromise })
  const pages = await payload.find({
    collection: 'pages',
    draft: false,
    limit: 1000,
    overrideAccess: false,
    pagination: false,
    select: {
      slug: true,
    },
  })

  const params = pages.docs
    ?.filter((doc) => {
      return doc.slug !== 'home'
    })
    .map(({ slug }) => {
      return { slug }
    })

  return params
}

type Args = {
  params: Promise<{
    slug?: string
  }>
}

export default async function Page({ params: paramsPromise }: Args) {
  const { isEnabled: draft } = await draftMode()
  const { slug = 'home' } = await paramsPromise
  const url = '/' + slug

  const page = await queryPageBySlug({
    slug,
  })

  let siteSEO = null
  if (slug === 'home') {
    const tenantSlug = process.env.NEXT_PUBLIC_TENANT_SLUG || 'candelora'
    siteSEO = await getSiteSEO(tenantSlug)
  }

  if (!page) {
    return <PayloadRedirects url={url} />
  }

  const { hero, layout } = page

  return (
    <>
      <PayloadRedirects disableNotFound url={url} />

      {draft && <LivePreviewListener />}

      <RenderHero {...hero} />
      {slug === 'home' && siteSEO && <SiteSEOInfo seo={siteSEO} />}
      <RenderBlocks blocks={layout} />
    </>
  )
}

export async function generateMetadata({ params: paramsPromise }: Args): Promise<Metadata> {
  const { slug = 'home' } = await paramsPromise
  const page = await queryPageBySlug({
    slug,
  })

  if (slug === 'home') {
    const tenantSlug = process.env.NEXT_PUBLIC_TENANT_SLUG || 'candelora'
    const seo = await getSiteSEO(tenantSlug)
    if (seo) {
      return {
        title: seo.title,
        description: seo.description,
        openGraph: mergeOpenGraph({
          title: seo.title,
          description: seo.description,
          images:
            typeof seo.metaImage === 'object' && seo.metaImage?.url
              ? [seo.metaImage.url]
              : undefined,
          url: '/',
        }),
      }
    }
  }

  return generateMeta({ doc: page })
}

const queryPageBySlug = cache(async ({ slug }: { slug: string }) => {
  const { isEnabled: draft } = await draftMode()

  const payload = await getPayload({ config: configPromise })

  const result = await payload.find({
    collection: 'pages',
    draft,
    limit: 1,
    pagination: false,
    overrideAccess: draft,
    where: {
      slug: {
        equals: slug,
      },
    },
  })

  return result.docs?.[0] || null
})
