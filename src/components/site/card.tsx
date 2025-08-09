'use client'

import { cn } from '@/lib/utils'
import useClickableCard from '@/lib/utilities/useClickableCard'
import Link from 'next/link'
import React, { Fragment } from 'react'
// Use a lightweight data shape for cards so various sources (posts, search index)
// can supply minimal fields without strict Payload types

import { Media } from '@/components/site/media'
import { Badge } from '../ui/badge'

export type CardPostData = {
  slug?: string | null
  title?: string | null
  categories?: Array<{ title?: string | null } | string> | null
  meta?: {
    title?: string | null
    description?: string | null
    image?: unknown | null
  } | null
}

type CardProps = {
  alignItems?: 'center'
  className?: string
  doc?: CardPostData
  relationTo?: 'posts'
  showCategories?: boolean
  title?: string
}

export function Card({
  className,
  doc,
  relationTo = 'posts',
  showCategories,
  title: titleFromProps,
}: CardProps) {
  const { card, link } = useClickableCard({})

  if (!doc) return null

  const { slug, categories, meta, title } = doc
  const { description, image: metaImage } = meta || {}

  const hasCategories = categories && Array.isArray(categories) && categories.length > 0
  const titleToUse = titleFromProps || title
  const sanitizedDescription = description?.replace(/\s/g, ' ')
  const href = `/${relationTo}/${slug}`

  return (
    <article
      className={cn(
        'group border rounded-sm overflow-hidden bg-accent/30 hover:bg-accent/60 hover:cursor-pointer transition-all',
        className,
      )}
      ref={card.ref}
    >
      <div className="relative w-full">
        {metaImage && typeof metaImage !== 'string' ? (
          <Media
            className="h-48 overflow-hidden"
            imgClassName="w-full h-full object-cover"
            resource={metaImage as any}
          />
        ) : (
          <div className="h-48 flex items-center justify-center bg-muted border-b">No image</div>
        )}
      </div>

      <div className="p-4 space-y-2">
        {titleToUse && (
          <div className="prose">
            <h3 className="text-lg group-hover:underline decoration-dotted underline-offset-4">
              <Link className="not-prose" href={href} ref={link.ref}>
                {titleToUse}
              </Link>
            </h3>
          </div>
        )}

        {showCategories && hasCategories && (
          <div className="flex flex-wrap gap-1.5">
            {categories.map((category, index) => {
              if (typeof category !== 'object') return null

              const categoryTitle = category.title || 'No category'
              const isLast = index === categories.length - 1

              return (
                <Badge key={index} variant="outline">
                  {categoryTitle}
                  {!isLast && <Fragment>, &nbsp;</Fragment>}
                </Badge>
              )
            })}
          </div>
        )}

        {sanitizedDescription && (
          <div className="text-muted-foreground">
            <p>{sanitizedDescription}</p>
          </div>
        )}
      </div>
    </article>
  )
}
