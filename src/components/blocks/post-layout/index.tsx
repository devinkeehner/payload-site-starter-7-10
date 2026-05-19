'use client'

import React from 'react'

import RichText from '@/components/site/rich-text'
import { CMSLink } from '@/components/site/link'
import { Media } from '@/components/site/media'
import { cn } from '@/lib/utils'
import type { Post } from '@/payload-types'

type PostLayoutBlock = Record<string, unknown> & {
  blockType?: string
  id?: string | null
}

type RenderPostBlocksProps = {
  blocks?: unknown[] | null
  content?: Post['content'] | null
}

function getAlignClass(value: unknown): string {
  switch (value) {
    case 'center':
      return 'justify-center text-center'
    case 'right':
      return 'justify-end text-right'
    case 'left':
    default:
      return 'justify-start text-left'
  }
}

function getButtonAppearance(value: unknown): 'default' | 'secondary' | 'outline' {
  return value === 'secondary' || value === 'outline' ? value : 'default'
}

function getCalloutClass(value: unknown): string {
  switch (value) {
    case 'accent':
      return 'border-primary/30 bg-primary/5'
    case 'strong':
      return 'border-foreground/20 bg-foreground text-background'
    case 'note':
    default:
      return 'border-border bg-card'
  }
}

function hasRichTextContent(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0)
}

function PostBody({ content }: { content?: Post['content'] | null }) {
  if (!hasRichTextContent(content)) {
    return (
      <div className="mx-auto max-w-[48rem] text-muted-foreground">
        <p>Content coming soon.</p>
      </div>
    )
  }

  return <RichText className="mx-auto max-w-[48rem]" data={content as NonNullable<Post['content']>} enableGutter={false} />
}

function PostRichText({ block }: { block: PostLayoutBlock }) {
  return hasRichTextContent(block.content) ? (
    <RichText className="mx-auto max-w-[48rem]" data={block.content as Post['content']} enableGutter={false} />
  ) : null
}

function PostCallout({ block }: { block: PostLayoutBlock }) {
  const heading = typeof block.heading === 'string' ? block.heading.trim() : ''

  return (
    <aside className={cn('mx-auto max-w-[48rem] rounded-md border p-5 shadow-sm', getCalloutClass(block.tone))}>
      {heading ? <h2 className="mb-3 text-xl font-semibold tracking-tight">{heading}</h2> : null}
      {hasRichTextContent(block.content) ? (
        <RichText data={block.content as Post['content']} enableGutter={false} enableProse={false} />
      ) : null}
    </aside>
  )
}

function PostButton({ block }: { block: PostLayoutBlock }) {
  const label = typeof block.label === 'string' ? block.label.trim() : ''
  const url = typeof block.url === 'string' ? block.url.trim() : ''
  if (!label || !url) return null

  return (
    <div className={cn('mx-auto flex max-w-[48rem]', getAlignClass(block.align))}>
      <CMSLink
        appearance={getButtonAppearance(block.variant)}
        label={label}
        type="custom"
        url={url}
      />
    </div>
  )
}

function PostImage({ block }: { block: PostLayoutBlock }) {
  const caption = typeof block.caption === 'string' ? block.caption.trim() : ''
  if (!block.media) return null

  return (
    <figure className="mx-auto max-w-[52rem]">
      <Media
        className="overflow-hidden rounded-md border bg-muted"
        imgClassName="h-auto w-full"
        resource={block.media}
      />
      {caption ? (
        <figcaption className="mt-3 text-center text-sm leading-6 text-muted-foreground">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  )
}

function getBlockItems(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
    : []
}

function PostGallery({ block }: { block: PostLayoutBlock }) {
  const items = getBlockItems(block.items)
  if (!items.length) return null
  const stacked = block.layout === 'stacked'

  return (
    <div
      className={cn(
        'mx-auto grid max-w-[52rem] gap-5',
        stacked ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2',
      )}
    >
      {items.map((item, index) => {
        const caption = typeof item.caption === 'string' ? item.caption.trim() : ''
        if (!item.media) return null

        return (
          <figure key={index}>
            <Media
              className="overflow-hidden rounded-md border bg-muted"
              imgClassName="h-auto w-full"
              resource={item.media}
            />
            {caption ? (
              <figcaption className="mt-2 text-sm leading-6 text-muted-foreground">
                {caption}
              </figcaption>
            ) : null}
          </figure>
        )
      })}
    </div>
  )
}

function PostList({ block }: { block: PostLayoutBlock }) {
  const items = getBlockItems(block.items)
  if (!items.length) return null
  const imageLeft = block.style === 'imageLeft'

  if (imageLeft) {
    return (
      <div className="mx-auto grid max-w-[48rem] gap-4">
        {items.map((item, index) => {
          const title = typeof item.title === 'string' ? item.title.trim() : ''
          const body = typeof item.body === 'string' ? item.body.trim() : ''

          return (
            <article key={index} className="grid gap-4 rounded-md border bg-card p-4 sm:grid-cols-[96px_1fr]">
              {item.media ? (
                <Media
                  className="overflow-hidden rounded-md border bg-muted"
                  imgClassName="aspect-square h-auto w-full object-cover"
                  resource={item.media}
                />
              ) : null}
              <div className="min-w-0">
                {title ? <h3 className="text-lg font-semibold tracking-tight">{title}</h3> : null}
                {body ? <p className="mt-2 leading-7 text-muted-foreground">{body}</p> : null}
              </div>
            </article>
          )
        })}
      </div>
    )
  }

  return (
    <ul className="mx-auto grid max-w-[48rem] list-disc gap-3 pl-6">
      {items.map((item, index) => {
        const title = typeof item.title === 'string' ? item.title.trim() : ''
        const body = typeof item.body === 'string' ? item.body.trim() : ''

        return (
          <li key={index} className="leading-7">
            {title ? <strong>{title}</strong> : null}
            {title && body ? <span>: </span> : null}
            {body ? <span className="text-muted-foreground">{body}</span> : null}
          </li>
        )
      })}
    </ul>
  )
}

function PostLinks({ block }: { block: PostLayoutBlock }) {
  const heading = typeof block.heading === 'string' ? block.heading.trim() : ''
  const body = typeof block.body === 'string' ? block.body.trim() : ''
  const links = getBlockItems(block.links)
  if (!heading && !body && !links.length) return null

  return (
    <aside className="mx-auto max-w-[48rem] rounded-md border bg-card p-5">
      {heading ? <h2 className="text-xl font-semibold tracking-tight">{heading}</h2> : null}
      {body ? <p className="mt-2 leading-7 text-muted-foreground">{body}</p> : null}
      {links.length ? (
        <div className="mt-4 flex flex-wrap gap-3">
          {links.map((link, index) => {
            const label = typeof link.label === 'string' ? link.label.trim() : ''
            const url = typeof link.url === 'string' ? link.url.trim() : ''
            if (!label || !url) return null

            return (
              <CMSLink
                appearance="outline"
                key={`${url}-${index}`}
                label={label}
                type="custom"
                url={url}
              />
            )
          })}
        </div>
      ) : null}
    </aside>
  )
}

function PostDivider() {
  return <hr className="mx-auto max-w-[48rem] border-border" />
}

function PostSpacer({ block }: { block: PostLayoutBlock }) {
  const value = typeof block.size === 'number' ? block.size : Number(block.size)
  const height = Number.isFinite(value) ? Math.max(4, Math.min(96, value)) : 24
  return <div aria-hidden="true" style={{ height }} />
}

export function RenderPostBlocks({ blocks, content }: RenderPostBlocksProps) {
  const safeBlocks = Array.isArray(blocks) ? blocks : []

  if (!safeBlocks.length) {
    return <PostBody content={content} />
  }

  return (
    <div className="flex flex-col gap-8">
      {safeBlocks.map((block, index) => {
        if (!block || typeof block !== 'object' || Array.isArray(block)) return null

        const postBlock = block as PostLayoutBlock
        const key = postBlock.id ? `${postBlock.id}-${index}` : `${postBlock.blockType || 'post-block'}-${index}`

        switch (postBlock.blockType) {
          case 'postBody':
            return <PostBody key={key} content={content} />
          case 'postRichText':
            return <PostRichText key={key} block={postBlock} />
          case 'postCallout':
            return <PostCallout key={key} block={postBlock} />
          case 'postButton':
            return <PostButton key={key} block={postBlock} />
          case 'postImage':
            return <PostImage key={key} block={postBlock} />
          case 'postGallery':
            return <PostGallery key={key} block={postBlock} />
          case 'postList':
            return <PostList key={key} block={postBlock} />
          case 'postLinks':
            return <PostLinks key={key} block={postBlock} />
          case 'postDivider':
            return <PostDivider key={key} />
          case 'postSpacer':
            return <PostSpacer key={key} block={postBlock} />
          default:
            return null
        }
      })}
    </div>
  )
}
