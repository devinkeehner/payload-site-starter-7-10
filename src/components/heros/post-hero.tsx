import { formatDateTime } from '@/lib/utilities/formatDateTime'
import React from 'react'

import type { Post } from '@/payload-types'

import { Media } from '@/components/site/media'
import { formatAuthors } from '@/lib/utilities/formatAuthors'
import { Container, Section } from '../layout'

export const PostHero: React.FC<{
  post: Post
}> = ({ post }) => {
  const { categories, heroImage, populatedAuthors, publishedAt, title } = post

  // Handle potentially undefined populatedAuthors by providing a default empty array
  const formattedAuthors = formatAuthors(populatedAuthors || [])
  const hasAuthors = populatedAuthors && populatedAuthors.length > 0 && formattedAuthors !== ''

  // Ensure categories is an array before using it
  const categoriesArray = Array.isArray(categories) ? categories : []

  return (
    <Section className="relative -mt-[10.4rem] flex items-end border-b">
      <Container className="container z-10 relative lg:grid lg:grid-cols-[1fr_48rem_1fr] text-white pb-8">
        <div className="col-start-1 col-span-1 md:col-start-2 md:col-span-2">
          {/* Categories */}
          {categoriesArray.length > 0 && (
            <div className="uppercase text-sm mb-6">
              {categoriesArray.map((category, index) => {
                if (typeof category !== 'object' || category === null) return null

                const titleToUse = category.title || 'Untitled category'
                const isLast = index === categoriesArray.length - 1

                return (
                  <React.Fragment key={index}>
                    {titleToUse}
                    {!isLast && <React.Fragment>, &nbsp;</React.Fragment>}
                  </React.Fragment>
                )
              })}
            </div>
          )}

          {/* Title */}
          <h1 className="mb-6 text-3xl md:text-5xl lg:text-6xl">{title}</h1>

          {/* Author and Date */}
          <div className="flex flex-col md:flex-row gap-4 md:gap-16">
            {hasAuthors && (
              <div className="flex flex-col gap-1">
                <p className="text-sm">Author</p>
                <p>{formattedAuthors}</p>
              </div>
            )}

            {publishedAt && (
              <div className="flex flex-col gap-1">
                <p className="text-sm">Date Published</p>
                <time dateTime={publishedAt}>{formatDateTime(publishedAt)}</time>
              </div>
            )}
          </div>
        </div>
      </Container>

      {/* Hero Image with Gradient Overlay */}
      <div className="min-h-[40vh] select-none">
        {heroImage && typeof heroImage !== 'string' && (
          <Media fill priority imgClassName="-z-10 object-cover" resource={heroImage} />
        )}
        <div className="absolute pointer-events-none left-0 bottom-0 w-full h-1/2 bg-linear-to-t from-black to-transparent" />
      </div>
    </Section>
  )
}
