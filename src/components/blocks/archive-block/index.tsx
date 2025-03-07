import type { Post, ArchiveBlock as ArchiveBlockProps } from '@/payload-types'

import { Section, Container } from '@/components/layout'
import { CollectionArchive } from '@/components/site/collection-archive'
import { getPayload } from 'payload'
import React from 'react'
import RichText from '@/components/site/rich-text'
import configPromise from '@payload-config'

export const ArchiveBlock: React.FC<
  ArchiveBlockProps & {
    id?: string
  }
> = async (props) => {
  const { id, categories, introContent, limit: limitFromProps, populateBy, selectedDocs } = props

  const limit = limitFromProps || 3

  let posts: Post[] = []

  if (populateBy === 'collection') {
    const payload = await getPayload({ config: configPromise })

    const flattenedCategories = categories?.map((category) => {
      if (typeof category === 'object') return category.id
      else return category
    })

    const fetchedPosts = await payload.find({
      collection: 'posts',
      depth: 1,
      limit,
      ...(flattenedCategories && flattenedCategories.length > 0
        ? {
            where: {
              categories: {
                in: flattenedCategories,
              },
            },
          }
        : {}),
    })

    posts = fetchedPosts.docs
  } else {
    if (selectedDocs?.length) {
      const filteredSelectedPosts = selectedDocs.map((post) => {
        if (typeof post.value === 'object') return post.value
      }) as Post[]

      posts = filteredSelectedPosts
    }
  }

  return (
    <Section id={`block-${id}`}>
      <Container>
        {introContent && (
          <div className="max-w-prose">
            <RichText data={introContent} enableGutter={false} />
          </div>
        )}
        {posts.length > 0 ? (
          <CollectionArchive posts={posts} />
        ) : (
          <div className="p-6 mt-4 bg-accent border">There are no posts to show.</div>
        )}
      </Container>
    </Section>
  )
}
