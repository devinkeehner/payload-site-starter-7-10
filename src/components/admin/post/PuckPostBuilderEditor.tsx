'use client'

import React, { useMemo, useState } from 'react'

import {
  createVisualDocumentConfig,
  VisualDocumentEditor,
  type VisualPaletteItem,
  type VisualRowPreset,
} from '@/components/admin/puck/VisualDocumentEditor'
import type { PuckBlockSchema, PuckPageData, PuckPostDoc } from '@/lib/puck/types'

import { PuckPostBlockPreview } from './PuckPostBlockPreview'

const POST_ROW_DROPZONE_MIN_HEIGHT = 148

export type PuckPostBuilderProps = {
  blockSchema: PuckBlockSchema[]
  initialData: PuckPageData
  initialPostContent?: Record<string, unknown> | null
  initialThemeStyle?: Record<string, string> | null
  postId: string
  title: string
}

type PuckPostPayload = {
  data: PuckPageData
  post: PuckPostDoc
  themeStyle?: Record<string, string> | null
}

const POST_ROWS: VisualRowPreset[] = [
  { columns: [1], label: '1 Column', layout: 'oneColumn', mode: 'layoutRows', slug: 'postRowOneColumn', zones: ['left'] },
  { columns: [1, 1], label: '2 Columns', layout: 'twoColumns', mode: 'layoutRows', slug: 'postRowTwoColumns', zones: ['left', 'right'] },
  { columns: [2, 1], label: 'Left Wide', layout: 'twoColumnsLeftWide', mode: 'layoutRows', slug: 'postRowLeftWide', zones: ['left', 'right'] },
  { columns: [1, 2], label: 'Right Wide', layout: 'twoColumnsRightWide', mode: 'layoutRows', slug: 'postRowRightWide', zones: ['left', 'right'] },
  { columns: [1, 1, 1], label: '3 Columns', layout: 'threeColumns', mode: 'layoutRows', slug: 'postRowThreeColumns', zones: ['left', 'center', 'right'] },
  { columns: [1, 1, 1, 1], label: '4 Columns', layout: 'fourColumns', mode: 'layoutRows', slug: 'postRowFourColumns', zones: ['left', 'center', 'right', 'fourth'] },
]

const POST_CONTENT_ORDER = [
  'postBody',
  'postRichText',
  'postImage',
  'postButton',
  'postCallout',
  'postList',
  'postGallery',
  'postLinks',
  'postBentoGrid',
  'postDivider',
  'postSpacer',
]

const POST_CONTENT_ITEMS: VisualPaletteItem[] = [
  { icon: 'body', kind: 'content', label: 'Body', slug: 'postBody' },
  { icon: 'text', kind: 'content', label: 'Text', slug: 'postRichText' },
  { icon: 'image', kind: 'content', label: 'Image', slug: 'postImage' },
  { icon: 'button', kind: 'content', label: 'Button', slug: 'postButton' },
  { icon: 'callout', kind: 'content', label: 'Callout', slug: 'postCallout' },
  { icon: 'list', kind: 'content', label: 'List', slug: 'postList' },
  { icon: 'gallery', kind: 'content', label: 'Gallery', slug: 'postGallery' },
  { icon: 'links', kind: 'content', label: 'Links', slug: 'postLinks' },
  { icon: 'highlights', kind: 'content', label: 'Highlights', slug: 'postBentoGrid' },
  { icon: 'divider', kind: 'content', label: 'Divider', slug: 'postDivider' },
  { icon: 'spacer', kind: 'content', label: 'Spacer', slug: 'postSpacer' },
]

const POST_PALETTE_ITEMS: VisualPaletteItem[] = [
  ...POST_CONTENT_ITEMS,
  ...POST_ROWS.map((row) => ({ kind: 'row' as const, label: row.label, slug: row.slug })),
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function getPostBodyContentFromData(data: PuckPageData | null): Record<string, unknown> | null {
  const seen = new Set<unknown>()

  function visitContent(content: unknown): Record<string, unknown> | null {
    if (!Array.isArray(content) || seen.has(content)) return null
    seen.add(content)

    for (const item of content) {
      if (!isRecord(item)) continue
      const props = isRecord(item.props) ? item.props : {}
      if (item.type === 'postBody' && isRecord(props.content)) return props.content
    }

    return null
  }

  const rootContent = visitContent(isRecord(data) ? data.content : null)
  if (rootContent) return rootContent

  const zones = isRecord(data?.zones) ? data.zones : {}
  for (const content of Object.values(zones)) {
    const zoneContent = visitContent(content)
    if (zoneContent) return zoneContent
  }

  return null
}

function getThemeStyleFromPayload(payload: PuckPostPayload): React.CSSProperties | undefined {
  if (!payload.themeStyle || typeof payload.themeStyle !== 'object') return undefined
  return payload.themeStyle as React.CSSProperties
}

function getContentPaletteSlugs(blockSchema: PuckBlockSchema[]): string[] {
  const availableSlugs = new Set(blockSchema.map((block) => block.slug))
  const ordered = POST_CONTENT_ORDER.filter((slug) => availableSlugs.has(slug))
  const extra = blockSchema
    .map((block) => block.slug)
    .filter((slug) => slug !== 'postGrid' && !ordered.includes(slug))

  return [...ordered, ...extra]
}

function getRowPaletteSlugs(blockSchema: PuckBlockSchema[]): string[] {
  return blockSchema.some((block) => block.slug === 'postGrid')
    ? POST_ROWS.map((row) => row.slug)
    : []
}

export function PuckPostBuilderEditor({
  blockSchema,
  initialData,
  initialPostContent,
  initialThemeStyle,
  postId,
  title,
}: PuckPostBuilderProps) {
  const contentPaletteSlugs = useMemo(() => getContentPaletteSlugs(blockSchema), [blockSchema])
  const rowPaletteSlugs = useMemo(() => getRowPaletteSlugs(blockSchema), [blockSchema])
  const postBodyDefaultContent = useMemo(
    () => getPostBodyContentFromData(initialData) || initialPostContent || null,
    [initialData, initialPostContent],
  )
  const [previewThemeStyle, setPreviewThemeStyle] = useState<React.CSSProperties | undefined>(
    initialThemeStyle ? (initialThemeStyle as React.CSSProperties) : undefined,
  )
  const config = useMemo(
    () => createVisualDocumentConfig({
      blockSchema,
      contentSlugs: contentPaletteSlugs,
      defaultPropsBySlug: {
        postBody: {
          content: postBodyDefaultContent || null,
        },
      },
      dropzoneMinHeight: POST_ROW_DROPZONE_MIN_HEIGHT,
      layoutRowBlockSlug: 'postGrid',
      nestedContentSlugs: blockSchema.map((block) => block.slug).filter((slug) => slug !== 'postGrid'),
      paletteItems: POST_PALETTE_ITEMS,
      previewRenderer: ({ blockType, children, props }) => (
        <PuckPostBlockPreview blockType={blockType} props={props}>
          {children}
        </PuckPostBlockPreview>
      ),
      rootRenderer: (props) => (
        <main
          style={{
            ...previewThemeStyle,
            background: '#f3f4f6',
            color: '#030712',
            fontFamily: 'var(--tenant-body-font, var(--font-sans, Arial, Helvetica, sans-serif))',
            minHeight: '100%',
            padding: '36px 20px 64px',
          }}
        >
          <article
            style={{
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 12,
              boxShadow: '0 18px 45px rgba(15, 23, 42, 0.08)',
              margin: '0 auto',
              maxWidth: 1080,
              padding: '48px min(6vw, 64px)',
            }}
          >
            {props.children}
          </article>
        </main>
      ),
      rows: POST_ROWS,
    }),
    [blockSchema, contentPaletteSlugs, postBodyDefaultContent, previewThemeStyle],
  )

  function capturePayload(payload: PuckPostPayload) {
    setPreviewThemeStyle((current) => getThemeStyleFromPayload(payload) ?? current)
  }

  return (
    <VisualDocumentEditor<PuckPostPayload>
      apiPath={`/api/puck/posts/${postId}`}
      blockSchema={blockSchema}
      config={config}
      documentType="post"
      headerTitle={`Post Builder: ${title}`}
      initialData={initialData}
      loadingLabel="Loading post builder..."
      onLoadPayload={capturePayload}
      onSavePayload={capturePayload}
      palette={{
        contentDescription: 'Drag post content blocks into the layout.',
        contentSlugs: contentPaletteSlugs,
        contentTitle: 'Content Blocks',
        items: POST_PALETTE_ITEMS,
        rowDescription: 'Drag a row in, then drop content into its columns.',
        rowSlugs: rowPaletteSlugs,
        rowTitle: 'Add Rows',
      }}
      previewFrameStyle={{
        ...previewThemeStyle,
        background: '#f3f4f6',
        color: '#030712',
        fontFamily: 'var(--tenant-body-font, var(--font-sans, Arial, Helvetica, sans-serif))',
        minHeight: '100%',
      }}
      rows={POST_ROWS}
      saveButtonLabel="Save Draft"
      saveErrorMessage="Unable to save post layout"
      savedMessage="Post layout draft saved."
      savingMessage="Saving draft..."
      toolbar
      viewports={[
        { width: 390, height: 'auto', label: 'Mobile' },
        { width: 768, height: 'auto', label: 'Tablet' },
        { width: 1100, height: 'auto', label: 'Desktop' },
      ]}
      wrapperStyle={previewThemeStyle}
    />
  )
}
