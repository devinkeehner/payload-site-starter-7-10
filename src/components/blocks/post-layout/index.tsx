'use client'

import React from 'react'

import RichText from '@/components/site/rich-text'
import { CMSLink } from '@/components/site/link'
import { Media } from '@/components/site/media'
import { cn } from '@/lib/utils'
import type { Media as MediaType, Post } from '@/payload-types'

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
      return 'border-[#a71e22]/30 bg-[#a71e22]/5'
    case 'strong':
      return 'border-[#000042] bg-[#000042] text-white'
    case 'note':
    default:
      return 'border-slate-200 bg-slate-50'
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

  return <RichText className="post-layout-rich-text" data={content as NonNullable<Post['content']>} enableGutter={false} />
}

function PostRichText({ block }: { block: PostLayoutBlock }) {
  return hasRichTextContent(block.content) ? (
    <RichText className="post-layout-rich-text" data={block.content as Post['content']} enableGutter={false} />
  ) : null
}

function PostCallout({ block }: { block: PostLayoutBlock }) {
  const heading = typeof block.heading === 'string' ? block.heading.trim() : ''

  return (
    <aside className={cn('rounded-lg border p-6 shadow-sm', getCalloutClass(block.tone))}>
      {heading ? <h2 className="mb-3 text-2xl font-bold tracking-tight">{heading}</h2> : null}
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
    <div className={cn('flex', getAlignClass(block.align))}>
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
  const media = getMediaResource(block.media)
  if (!media) return null

  return (
    <figure>
      <Media
        className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
        imgClassName="aspect-[16/7] h-auto max-h-[360px] w-full object-cover"
        resource={media}
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

function getMediaResource(value: unknown): MediaType | null {
  if (value && typeof value === 'object' && !Array.isArray(value) && typeof (value as { url?: unknown }).url === 'string') {
    return value as MediaType
  }
  return null
}

function PostGallery({ block }: { block: PostLayoutBlock }) {
  const items = getBlockItems(block.items)
  if (!items.length) return null
  const stacked = block.layout === 'stacked'

  return (
    <div
      className={cn(
        'grid gap-5',
        stacked ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2',
      )}
    >
      {items.map((item, index) => {
        const caption = typeof item.caption === 'string' ? item.caption.trim() : ''
        const media = getMediaResource(item.media)
        if (!media) return null

        return (
          <figure key={index}>
            <Media
              className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
              imgClassName="aspect-[4/3] h-auto w-full object-cover"
              resource={media}
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
      <div className="grid gap-4">
        {items.map((item, index) => {
          const title = typeof item.title === 'string' ? item.title.trim() : ''
          const body = typeof item.body === 'string' ? item.body.trim() : ''
          const media = getMediaResource(item.media)

          return (
            <article key={index} className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm sm:grid-cols-[112px_1fr]">
              {media ? (
                <Media
                  className="overflow-hidden rounded-md border border-slate-200 bg-slate-100"
                  imgClassName="aspect-square h-auto w-full object-cover"
                  resource={media}
                />
              ) : null}
              <div className="min-w-0">
                {title ? <h3 className="text-lg font-bold tracking-tight text-[#000042]">{title}</h3> : null}
                {body ? <p className="mt-2 leading-7 text-slate-600">{body}</p> : null}
              </div>
            </article>
          )
        })}
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      {items.map((item, index) => {
        const title = typeof item.title === 'string' ? item.title.trim() : ''
        const body = typeof item.body === 'string' ? item.body.trim() : ''

        return (
          <article key={index} className="rounded-lg border border-slate-200 bg-slate-50 px-5 py-4 shadow-sm">
            <div className="flex gap-3">
              <span className="mt-2 h-2 w-2 flex-none rounded-full bg-[#a71e22]" />
              <div className="min-w-0">
                {title ? <h3 className="font-bold leading-6 text-[#000042]">{title}</h3> : null}
                {body ? <p className="mt-1 leading-7 text-slate-600">{body}</p> : null}
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}

function PostLinks({ block }: { block: PostLayoutBlock }) {
  const heading = typeof block.heading === 'string' ? block.heading.trim() : ''
  const body = typeof block.body === 'string' ? block.body.trim() : ''
  const links = getBlockItems(block.links)
  if (!heading && !body && !links.length) return null
  const footerVariant = block.variant === 'footer'

  if (footerVariant) {
    return (
      <aside className="rounded-xl bg-[#0b1e3a] p-8 text-center text-white shadow-sm">
        {heading ? <h2 className="text-2xl font-bold tracking-tight">{heading}</h2> : null}
        {body ? <p className="mx-auto mt-3 max-w-2xl whitespace-pre-line leading-7 text-white/85">{body}</p> : null}
        {links.length ? (
          <div className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-2">
            {links.map((link, index) => {
              const label = typeof link.label === 'string' ? link.label.trim() : ''
              const url = typeof link.url === 'string' ? link.url.trim() : ''
              if (!label || !url) return null

              return (
                <a className="text-sm font-bold text-white underline underline-offset-4" href={url} key={`${url}-${index}`}>
                  {label}
                </a>
              )
            })}
          </div>
        ) : null}
      </aside>
    )
  }

  return (
    <aside className="rounded-lg border border-slate-200 bg-slate-50 p-6 shadow-sm">
      {heading ? <h2 className="text-2xl font-bold tracking-tight text-[#000042]">{heading}</h2> : null}
      {body ? <p className="mt-2 whitespace-pre-line leading-7 text-slate-600">{body}</p> : null}
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

function PostBentoGrid({ block }: { block: PostLayoutBlock }) {
  const heading = typeof block.heading === 'string' ? block.heading.trim() : ''
  const items = getBlockItems(block.items)
  if (!heading && !items.length) return null

  return (
    <section>
      {heading ? <h2 className="mb-5 text-3xl font-black tracking-tight text-[#000042]">{heading}</h2> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((item, index) => {
          const media = getMediaResource(item.media)
          const wide = item.size === 'wide'
          const title = typeof item.title === 'string' ? item.title.trim() : ''
          const body = typeof item.body === 'string' ? item.body.trim() : ''

          return (
            <article
              className={cn(
                'rounded-lg border border-slate-200 bg-slate-50 p-5 shadow-sm',
                wide ? 'border-l-4 border-l-[#a71e22] sm:col-span-2 sm:p-6' : '',
              )}
              key={index}
            >
              {media ? (
                <Media
                  className="mb-4 overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
                  imgClassName={cn('h-auto w-full object-cover', wide ? 'aspect-[16/7]' : 'aspect-[4/3]')}
                  resource={media}
                />
              ) : null}
              {title ? <h3 className={cn('font-black tracking-tight text-[#000042]', wide ? 'text-2xl' : 'text-lg')}>{title}</h3> : null}
              {body ? <p className="mt-2 leading-7 text-slate-600">{body}</p> : null}
            </article>
          )
        })}
      </div>
    </section>
  )
}

function PostGrid({ block, content }: { block: PostLayoutBlock; content?: Post['content'] | null }) {
  const threeColumns = block.layout === 'threeColumns'
  const columns = threeColumns
    ? [block.leftBlocks, block.centerBlocks, block.rightBlocks]
    : [block.leftBlocks, block.rightBlocks]

  return (
    <div className={cn('grid gap-5', threeColumns ? 'md:grid-cols-3' : 'md:grid-cols-2')}>
      {columns.map((column, index) => (
        <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm" key={index}>
          <RenderPostBlocks blocks={Array.isArray(column) ? column : []} content={content} />
        </div>
      ))}
    </div>
  )
}

function PostDivider() {
  return <hr className="border-slate-200" />
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
    <div className="post-layout-renderer mx-auto flex max-w-[64rem] flex-col gap-8 text-[18px] leading-8 text-slate-950">
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
          case 'postBentoGrid':
            return <PostBentoGrid key={key} block={postBlock} />
          case 'postGrid':
            return <PostGrid key={key} block={postBlock} content={content} />
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
