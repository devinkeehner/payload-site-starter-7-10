import type { Metadata } from 'next'
import React, { cache } from 'react'

import { LivePreviewListener } from '@/components/site/live-preview-listener'
import { PayloadRedirects } from '@/components/site/redirects'

import RichText from '@/components/site/rich-text'

import { PostHero } from '@/components/heros/post-hero'
import { generateMeta } from '@/lib/utilities/generateMeta'
import { getPayload } from 'payload'
import { draftMode } from 'next/headers'

import configPromise from '@payload-config'

import type { Post } from '@/payload-types'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const isTransientMongoError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes('MongoNetworkError') ||
    message.includes('tlsv1 alert internal error') ||
    message.includes('ECONNRESET') ||
    message.includes('ETIMEDOUT')
  )
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (!isTransientMongoError(error) || i === attempts - 1) throw error
      await wait(400 * (i + 1))
    }
  }
  throw lastError
}

export async function generateStaticParams() {
  const posts = await withRetry(async () => {
    const payload = await getPayload({ config: configPromise })
    return payload.find({
      collection: 'posts',
      draft: false,
      limit: 1000,
      overrideAccess: false,
      pagination: false,
      select: {
        slug: true,
      },
    })
  })

  const params = posts.docs.map(({ slug }) => {
    return { slug }
  })

  return params
}

type Args = {
  params: Promise<{
    slug?: string
  }>
}

export async function generateMetadata({ params: paramsPromise }: Args): Promise<Metadata> {
  const { slug = '' } = await paramsPromise
  const post = await queryPostBySlug({ slug })

  return generateMeta({ doc: post })
}

const queryPostBySlug = cache(async ({ slug }: { slug: string }) => {
  const { isEnabled: draft } = await draftMode()

  const result = await withRetry(async () => {
    const payload = await getPayload({ config: configPromise })
    return payload.find({
      collection: 'posts',
      draft,
      limit: 1,
      overrideAccess: draft,
      pagination: false,
      where: {
        slug: {
          equals: slug,
        },
      },
    })
  })

  return result.docs?.[0] || null
})

export default async function Post({ params: paramsPromise }: Args) {
  const { isEnabled: draft } = await draftMode()
  const { slug = '' } = await paramsPromise
  const url = '/posts/' + slug
  const post = await queryPostBySlug({ slug })

  if (!post) return <PayloadRedirects url={url} />

  return (
    <article className="pt-16 pb-16">
      {/* Allows redirects for valid pages too */}
      <PayloadRedirects disableNotFound url={url} />

      {draft && <LivePreviewListener />}

      <PostHero post={post} />

      <div className="flex flex-col items-center gap-4 pt-8">
        <div className="container">
          <RichText className="max-w-[48rem] mx-auto" data={post.content} enableGutter={false} />
        </div>
      </div>
    </article>
  )
}
