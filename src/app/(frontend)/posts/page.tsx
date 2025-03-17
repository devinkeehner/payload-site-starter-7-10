import { Section, Container } from '@/components/layout'
import { CollectionArchive } from '@/components/site/collection-archive'
import { PageRange } from '@/components/site/page-range'
import { Pagination } from '@/components/site/pagination'
import { getPayload } from 'payload'

import configPromise from '@payload-config'

import type { Metadata } from 'next/types'

export const dynamic = 'force-static'
export const revalidate = 600

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
    <Section>
      <Container>
        <div className="ds">
          <h1>Posts</h1>
        </div>
        <PageRange
          collection="posts"
          currentPage={posts.page}
          limit={12}
          totalDocs={posts.totalDocs}
        />
      </Container>

      <Container>
        <CollectionArchive posts={posts.docs} />
      </Container>

      <Container>
        {posts.totalPages > 1 && posts.page && (
          <Pagination page={posts.page} totalPages={posts.totalPages} />
        )}
      </Container>
    </Section>
  )
}

export function generateMetadata(): Metadata {
  return {
    title: `Payload Website Template Posts`,
  }
}
