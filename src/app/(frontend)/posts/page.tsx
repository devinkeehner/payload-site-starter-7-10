import { Section, Container } from '@/components/layout'
import { CollectionArchive } from '@/components/site/collection-archive'
import { PageRange } from '@/components/site/page-range'
import { Pagination } from '@/components/site/pagination'
import { getPayload } from 'payload'
import { config } from '@/site.config'

import configPromise from '@payload-config'

import type { Metadata } from 'next/types'

export const dynamic = 'force-static'
export const revalidate = 600

export function generateMetadata(): Metadata {
  return {
    title: `${config.name} Posts`,
  }
}

export default async function Page() {
  const payload = await getPayload({ config: configPromise })

  const posts = await payload.find({
    collection: 'posts',
    depth: 1,
    limit: 12,
    overrideAccess: false,
    select: {
      title: true,
      slug: true,
      categories: true,
      meta: true,
    },
  })

  return (
    <>
      <Section>
        <Container>
          <h1 className="text-3xl mb-4">Posts</h1>
          <PageRange
            collection="posts"
            currentPage={posts.page}
            limit={12}
            totalDocs={posts.totalDocs}
          />
        </Container>
      </Section>

      <CollectionArchive posts={posts.docs} />

      <Section>
        <Container>
          {posts.totalPages > 1 && posts.page && (
            <Pagination page={posts.page} totalPages={posts.totalPages} />
          )}
        </Container>
      </Section>
    </>
  )
}
