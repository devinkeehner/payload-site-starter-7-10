'use client'

import { MediaBlock } from '@/components/blocks/media-block'
import { FormBlock } from '@/components/blocks/form-block'
import { MediaGalleryBlock } from '@/components/blocks/media-gallery-block'
import {
  DefaultNodeTypes,
  SerializedBlockNode,
  SerializedLinkNode,
  type DefaultTypedEditorState,
} from '@payloadcms/richtext-lexical'
import { type SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'
import {
  JSXConvertersFunction,
  LinkJSXConverter,
  RichText as ConvertRichText,
} from '@payloadcms/richtext-lexical/react'
import { usePathname } from 'next/navigation'

import { CodeBlock, CodeBlockProps } from '@/components/blocks/code-block'

import type {
  BannerBlock as BannerBlockProps,
  CallToActionBlock as CTABlockProps,
  MediaBlock as MediaBlockProps,
} from '@/payload-types'
import { BannerBlock } from '@/components/blocks/banner-block'
import { CallToActionBlock } from '@/components/blocks/cta-block'
import { cn } from '@/lib/utils'

type NodeTypes =
  | DefaultNodeTypes
  | SerializedBlockNode<
      CTABlockProps | MediaBlockProps | BannerBlockProps | CodeBlockProps | Record<string, unknown>
    >

const makeInternalDocToHref = (tenantSlug?: string | null) =>
  ({ linkNode }: { linkNode: SerializedLinkNode }) => {
    const doc = linkNode.fields?.doc
    const relationTo = doc?.relationTo
    const value = doc?.value
    const slug =
      value && typeof value === 'object' && typeof (value as { slug?: unknown }).slug === 'string'
        ? ((value as { slug?: string }).slug ?? '')
        : ''

    // Never throw from rich text link resolution during prerender.
    if (!slug) return '#'

    if (relationTo === 'posts') {
      return tenantSlug ? `/${tenantSlug}/${slug}` : `/posts/${slug}`
    }
    return `/${slug}`
  }

const makeJsxConverters = (tenantSlug?: string | null): JSXConvertersFunction<NodeTypes> =>
  ({ defaultConverters }) => ({
    ...defaultConverters,
    ...LinkJSXConverter({ internalDocToHref: makeInternalDocToHref(tenantSlug) }),
    blocks: {
      banner: ({ node }) => <BannerBlock className="col-start-2 mb-4" {...node.fields} />,
      mediaBlock: ({ node }) => (
        <MediaBlock
          className="col-start-1 col-span-3"
          imgClassName="m-0"
          {...node.fields}
          captionClassName="mx-auto max-w-[48rem]"
          enableGutter={false}
          disableInnerContainer={true}
        />
      ),
      code: ({ node }) => <CodeBlock className="col-start-2" {...node.fields} />,
      cta: ({ node }) => <CallToActionBlock {...node.fields} />,
      formBlock: ({ node }: { node: SerializedBlockNode<Record<string, unknown>> }) => (
        <FormBlock {...(node.fields as Parameters<typeof FormBlock>[0])} />
      ),
      mediaGallery: ({ node }: { node: SerializedBlockNode<Record<string, unknown>> }) => (
        <MediaGalleryBlock {...(node.fields as Parameters<typeof MediaGalleryBlock>[0])} />
      ),
      videoBlock: ({ node }: { node: SerializedBlockNode<Record<string, unknown>> }) => {
        const fields = (node.fields ?? {}) as {
          source?: 'upload' | 'link'
          externalURL?: string
          media?: unknown
        }
        if (fields.source === 'link' && fields.externalURL) {
          return (
            <div className="col-start-1 col-span-3">
              <a href={fields.externalURL} target="_blank" rel="noopener noreferrer" className="underline">
                View video
              </a>
            </div>
          )
        }
        if (fields.media && typeof fields.media === 'object') {
          return (
            <MediaBlock
              className="col-start-1 col-span-3"
              blockType="mediaBlock"
              media={fields.media as MediaBlockProps['media']}
            />
          )
        }
        return null
      },
    },
  })

type Props = {
  data: DefaultTypedEditorState | SerializedEditorState<NodeTypes>
  enableGutter?: boolean
  enableProse?: boolean
  enableSpacing?: boolean
} & React.HTMLAttributes<HTMLDivElement>

export default function RichText(props: Props) {
  const {
    className,
    enableProse = true,
    enableGutter = false,
    enableSpacing = true,
    ...rest
  } = props
  const pathname = usePathname()
  // derive tenant from first non-empty path segment, ignoring known roots
  const firstSeg = (() => {
    try {
      const parts = (pathname || '').split('/').filter(Boolean)
      return parts[0] || ''
    } catch {
      return ''
    }
  })()
  const nonTenantRoots = new Set(['posts', 'search', 'admin', 'api'])
  const tenantSlug = firstSeg && !nonTenantRoots.has(firstSeg) ? firstSeg : undefined
  return (
    <ConvertRichText
      converters={makeJsxConverters(tenantSlug)}
      className={cn(
        'payload-richtext',
        {
          'max-w-prose': enableGutter,
          'space-y-4': enableSpacing,
          ds: enableProse,
        },
        className,
      )}
      {...rest}
    />
  )
}
