'use client'

import '@puckeditor/core/puck.css'

import { createUsePuck, Drawer, DropZone, fieldsPlugin, Puck, type Config, type Data, type Plugin } from '@puckeditor/core'
import React, { useEffect, useMemo, useRef, useState } from 'react'

import { buildDefaults, buildFields } from '@/components/admin/puck/PuckPageBuilderEditor'
import { PuckRichTextToolbarProvider } from '@/components/admin/puck/PuckLexicalTextEditor'
import styles from '@/components/admin/puck/puck-page-builder.module.css'
import { hydratePuckMedia } from '@/lib/puck/mediaHydration'
import type { PuckBlockSchema, PuckPageData, PuckPostDoc } from '@/lib/puck/types'
import { postToPuckData } from '@/lib/puck/converters'

import { PuckPostBlockPreview } from './PuckPostBlockPreview'

const POST_ROW_DROPZONE_MIN_HEIGHT = 148
const usePostBuilderPuck = createUsePuck()

export type PuckPostBuilderProps = {
  blockSchema: PuckBlockSchema[]
  initialData: PuckPageData
  initialThemeStyle?: Record<string, string> | null
  postId: string
  title: string
}

type PuckPostPayload = {
  data: PuckPageData
  post: PuckPostDoc
  themeStyle?: Record<string, string> | null
}

type PostPaletteIconName =
  | 'body'
  | 'button'
  | 'callout'
  | 'divider'
  | 'gallery'
  | 'highlights'
  | 'image'
  | 'links'
  | 'list'
  | 'properties'
  | 'rows'
  | 'spacer'
  | 'text'

type PostPaletteItem = {
  icon?: PostPaletteIconName
  label: string
  rowColumns?: number[]
  rowLayout?: string
  type: 'content' | 'row'
}

type PostRowPreset = {
  label: string
  layout: string
  slug: string
}

const POST_ROW_PRESETS: PostRowPreset[] = [
  { label: '1 Column', layout: 'oneColumn', slug: 'postRowOneColumn' },
  { label: '2 Columns', layout: 'twoColumns', slug: 'postRowTwoColumns' },
  { label: 'Left Wide', layout: 'twoColumnsLeftWide', slug: 'postRowLeftWide' },
  { label: 'Right Wide', layout: 'twoColumnsRightWide', slug: 'postRowRightWide' },
  { label: '3 Columns', layout: 'threeColumns', slug: 'postRowThreeColumns' },
  { label: '4 Columns', layout: 'fourColumns', slug: 'postRowFourColumns' },
]

const POST_ROW_LAYOUT_ZONES: Record<string, string[]> = {
  fourColumns: ['left', 'center', 'right', 'fourth'],
  oneColumn: ['left'],
  threeColumns: ['left', 'center', 'right'],
  twoColumns: ['left', 'right'],
  twoColumnsLeftWide: ['left', 'right'],
  twoColumnsRightWide: ['left', 'right'],
}
const DEFAULT_POST_ROW_ZONES = ['left', 'right']

const POST_ROW_LAYOUT_COLUMNS: Record<string, number[]> = {
  fourColumns: [1, 1, 1, 1],
  oneColumn: [1],
  threeColumns: [1, 1, 1],
  twoColumns: [1, 1],
  twoColumnsLeftWide: [2, 1],
  twoColumnsRightWide: [1, 2],
}

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

const POST_PALETTE_ITEMS: Record<string, PostPaletteItem> = {
  postBentoGrid: { icon: 'highlights', label: 'Highlights', type: 'content' },
  postBody: { icon: 'body', label: 'Body', type: 'content' },
  postButton: { icon: 'button', label: 'Button', type: 'content' },
  postCallout: { icon: 'callout', label: 'Callout', type: 'content' },
  postDivider: { icon: 'divider', label: 'Divider', type: 'content' },
  postGallery: { icon: 'gallery', label: 'Gallery', type: 'content' },
  postImage: { icon: 'image', label: 'Image', type: 'content' },
  postLinks: { icon: 'links', label: 'Links', type: 'content' },
  postList: { icon: 'list', label: 'List', type: 'content' },
  postRichText: { icon: 'text', label: 'Text', type: 'content' },
  postSpacer: { icon: 'spacer', label: 'Spacer', type: 'content' },
}

POST_ROW_PRESETS.forEach((preset) => {
  POST_PALETTE_ITEMS[preset.slug] = {
    label: preset.label,
    rowColumns: POST_ROW_LAYOUT_COLUMNS[preset.layout] || [1, 1],
    rowLayout: preset.layout,
    type: 'row',
  }
})

function getThemeStyleFromPayload(payload: PuckPostPayload): React.CSSProperties | undefined {
  if (!payload.themeStyle || typeof payload.themeStyle !== 'object') return undefined
  return payload.themeStyle as React.CSSProperties
}

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

function getPostGridZones(layout: unknown): string[] {
  return POST_ROW_LAYOUT_ZONES[String(layout)] || DEFAULT_POST_ROW_ZONES
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
    ? POST_ROW_PRESETS.map((preset) => preset.slug)
    : []
}

function RowSkeleton({ columns }: { columns: number[] }) {
  return (
    <span className={styles.emailPaletteRowSkeleton}>
      {columns.map((column, index) => (
        <span key={index} style={{ flex: column }} />
      ))}
    </span>
  )
}

function PostPaletteSvgIcon({ icon }: { icon: PostPaletteIconName }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 3,
  }

  switch (icon) {
    case 'body':
      return (
        <svg aria-hidden="true" viewBox="0 0 48 48">
          <path d="M9 12h23" stroke="currentColor" strokeLinecap="round" strokeWidth="5" />
          <path {...common} d="M11 22h26M11 30h22M11 38h15" />
        </svg>
      )
    case 'button':
      return (
        <svg aria-hidden="true" viewBox="0 0 48 48">
          <rect {...common} height="16" rx="4" width="30" x="9" y="16" />
          <path {...common} d="M18 24h12" />
        </svg>
      )
    case 'callout':
      return (
        <svg aria-hidden="true" viewBox="0 0 48 48">
          <path {...common} d="M9 10h30v28H9zM16 18h16M16 26h10" />
          <path d="M9 10h5v28H9z" fill="currentColor" />
        </svg>
      )
    case 'divider':
      return (
        <svg aria-hidden="true" viewBox="0 0 48 48">
          <path {...common} d="M9 24h30" />
          <path {...common} d="M14 17h20M14 31h20" opacity="0.35" />
        </svg>
      )
    case 'gallery':
      return (
        <svg aria-hidden="true" viewBox="0 0 48 48">
          <rect fill="currentColor" height="12" rx="2" width="12" x="10" y="10" />
          <rect {...common} height="12" rx="2" width="12" x="26" y="10" />
          <rect {...common} height="12" rx="2" width="12" x="10" y="26" />
          <rect fill="currentColor" height="12" rx="2" width="12" x="26" y="26" />
        </svg>
      )
    case 'highlights':
      return (
        <svg aria-hidden="true" viewBox="0 0 48 48">
          <rect {...common} height="12" rx="3" width="14" x="8" y="9" />
          <rect fill="currentColor" height="12" rx="3" width="14" x="26" y="9" />
          <rect fill="currentColor" height="14" rx="3" width="14" x="8" y="25" />
          <rect {...common} height="14" rx="3" width="14" x="26" y="25" />
        </svg>
      )
    case 'image':
      return (
        <svg aria-hidden="true" viewBox="0 0 48 48">
          <rect {...common} height="28" rx="4" width="32" x="8" y="10" />
          <circle cx="18" cy="19" fill="currentColor" r="3" />
          <path fill="currentColor" d="m11 34 9-9 6 6 4-5 8 8H11Z" />
        </svg>
      )
    case 'links':
      return (
        <svg aria-hidden="true" viewBox="0 0 48 48">
          <path {...common} d="M19 17h-3a8 8 0 0 0 0 16h6M29 17h3a8 8 0 0 1 0 16h-6M18 24h12" />
        </svg>
      )
    case 'list':
      return (
        <svg aria-hidden="true" viewBox="0 0 48 48">
          <rect fill="currentColor" height="8" rx="1.5" width="8" x="8" y="11" />
          <rect fill="currentColor" height="8" rx="1.5" width="8" x="8" y="27" />
          <path {...common} d="M22 15h18M22 31h18M22 23h12M22 39h12" />
        </svg>
      )
    case 'properties':
      return (
        <svg aria-hidden="true" viewBox="0 0 48 48">
          <path {...common} d="M10 15h28M10 24h28M10 33h28" />
          <circle cx="18" cy="15" fill="currentColor" r="4" />
          <circle cx="29" cy="24" fill="currentColor" r="4" />
          <circle cx="22" cy="33" fill="currentColor" r="4" />
        </svg>
      )
    case 'rows':
      return (
        <svg aria-hidden="true" viewBox="0 0 48 48">
          <rect {...common} height="8" rx="2" width="32" x="8" y="9" />
          <rect fill="currentColor" height="8" rx="2" width="32" x="8" y="20" />
          <rect {...common} height="8" rx="2" width="32" x="8" y="31" />
        </svg>
      )
    case 'spacer':
      return (
        <svg aria-hidden="true" viewBox="0 0 48 48">
          <path {...common} d="M24 8v32M18 14l6-6 6 6M18 34l6 6 6-6" />
          <path {...common} d="M12 24h24" />
        </svg>
      )
    case 'text':
    default:
      return (
        <svg aria-hidden="true" viewBox="0 0 48 48">
          <path d="M8 12h24" stroke="currentColor" strokeLinecap="round" strokeWidth="5" />
          <path {...common} d="M20 12v24M12 36h16M33 22h7M36.5 22v14M32 36h9" />
        </svg>
      )
  }
}

function PostPaletteTabIcon({ icon }: { icon: 'content' | 'properties' | 'rows' }) {
  return (
    <span className={styles.emailPaletteTabIcon}>
      <PostPaletteSvgIcon icon={icon === 'content' ? 'text' : icon} />
    </span>
  )
}

function PostDrawerItem({ name }: { children?: React.ReactNode; name: string }) {
  const item = POST_PALETTE_ITEMS[name] || { label: name, type: 'content' as const }

  return (
    <div className={styles.emailPaletteItem} data-kind={item.type} data-row-layout={item.rowLayout}>
      {item.type === 'row' ? (
        <RowSkeleton columns={item.rowColumns || [1, 1]} />
      ) : (
        <span className={styles.emailPaletteIcon}>
          <PostPaletteSvgIcon icon={item.icon || 'text'} />
        </span>
      )}
      <span className={styles.emailPaletteLabel}>{item.label}</span>
    </div>
  )
}

function PostPaletteDrawer({
  description,
  items,
  palette,
  title,
}: {
  description: string
  items: string[]
  palette: 'content' | 'rows'
  title: string
}) {
  return (
    <div className={styles.emailPalettePanel} data-palette={palette}>
      <div className={styles.emailPaletteHeader}>
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <Drawer>
        {items.map((slug) => (
          <Drawer.Item
            key={slug}
            label={POST_PALETTE_ITEMS[slug]?.label || slug}
            name={slug}
          >
            {PostDrawerItem}
          </Drawer.Item>
        ))}
      </Drawer>
    </div>
  )
}

function createPostBuilderPlugins(contentSlugs: string[], rowSlugs: string[]): Plugin[] {
  const propertiesPlugin = fieldsPlugin({ desktopSideBar: 'left' }) as Plugin

  return [
    {
      icon: <PostPaletteTabIcon icon="content" />,
      label: 'Content',
      name: 'blocks',
      render: () => (
        <PostPaletteDrawer
          description="Drag post content blocks into the layout."
          items={contentSlugs}
          palette="content"
          title="Content Blocks"
        />
      ),
    },
    {
      icon: <PostPaletteTabIcon icon="rows" />,
      label: 'Rows',
      name: 'rows',
      render: () => (
        <PostPaletteDrawer
          description="Drag a row in, then drop content into its columns."
          items={rowSlugs}
          palette="rows"
          title="Add Rows"
        />
      ),
    },
    {
      ...propertiesPlugin,
      icon: <PostPaletteTabIcon icon="properties" />,
      label: 'Properties',
    },
  ]
}

function PostBuilderAutoPropertiesTab() {
  const dispatch = usePostBuilderPuck((state) => state.dispatch)
  const itemSelector = usePostBuilderPuck((state) => state.appState.ui.itemSelector)
  const currentPlugin = usePostBuilderPuck((state) => state.appState.ui.plugin.current)
  const leftSideBarVisible = usePostBuilderPuck((state) => state.appState.ui.leftSideBarVisible)
  const lastAutoOpenedSelectorRef = useRef('')
  const selectorKey = itemSelector ? `${itemSelector.zone}:${itemSelector.index}` : ''

  useEffect(() => {
    if (!selectorKey) {
      lastAutoOpenedSelectorRef.current = ''
      return
    }

    if (lastAutoOpenedSelectorRef.current === selectorKey) return
    lastAutoOpenedSelectorRef.current = selectorKey

    if (currentPlugin === 'fields' && leftSideBarVisible) return

    dispatch({
      recordHistory: false,
      type: 'setUi',
      ui: {
        leftSideBarVisible: true,
        plugin: { current: 'fields' },
      },
    })
  }, [currentPlugin, dispatch, leftSideBarVisible, selectorKey])

  return null
}

function PostBuilderPuckShell({ children }: { children?: React.ReactNode }) {
  return (
    <>
      <PostBuilderAutoPropertiesTab />
      {children}
    </>
  )
}

function createConfig(
  blockSchema: PuckBlockSchema[],
  previewThemeStyle?: React.CSSProperties,
  postContent?: Record<string, unknown> | null,
): Config {
  const nestedBlockSlugs = blockSchema
    .map((block) => block.slug)
    .filter((slug) => slug !== 'postGrid')
  const gridBlock = blockSchema.find((block) => block.slug === 'postGrid')
  const contentSlugs = getContentPaletteSlugs(blockSchema)
  const rowSlugs = getRowPaletteSlugs(blockSchema)
  const components = blockSchema.reduce<Config['components']>((acc, block) => {
    const defaults = buildDefaults(block.fields)

    acc[block.slug] = {
      label: POST_PALETTE_ITEMS[block.slug]?.label || (block.slug === 'postGrid' ? 'Custom Row' : block.label),
      fields: buildFields(block.fields, []),
      defaultProps: block.slug === 'postBody'
        ? {
            ...defaults,
            content: postContent || null,
          }
        : defaults,
      render: (props) => {
        if (block.slug === 'postGrid') {
          const gridProps = props as Record<string, unknown>
          const zones = getPostGridZones(gridProps.layout)

          return (
            <PuckPostBlockPreview blockType={block.slug} props={gridProps}>
              {zones.map((zone) => (
                <DropZone key={zone} zone={zone} allow={nestedBlockSlugs} minEmptyHeight={POST_ROW_DROPZONE_MIN_HEIGHT} />
              ))}
            </PuckPostBlockPreview>
          )
        }

        return (
          <PuckPostBlockPreview
            blockType={block.slug}
            props={props as Record<string, unknown>}
          />
        )
      },
    }
    return acc
  }, {})

  if (gridBlock) {
    const gridFields = buildFields(gridBlock.fields, [])
    const gridDefaults = buildDefaults(gridBlock.fields)

    POST_ROW_PRESETS.forEach((preset) => {
      components[preset.slug] = {
        label: preset.label,
        fields: gridFields,
        defaultProps: {
          ...gridDefaults,
          layout: preset.layout,
        },
        render: (props) => {
          const gridProps = {
            ...(props as Record<string, unknown>),
            layout: (props as Record<string, unknown>).layout || preset.layout,
          }
          const zones = getPostGridZones(gridProps.layout)

          return (
            <PuckPostBlockPreview blockType="postGrid" props={gridProps}>
              {zones.map((zone) => (
                <DropZone key={zone} zone={zone} allow={nestedBlockSlugs} minEmptyHeight={POST_ROW_DROPZONE_MIN_HEIGHT} />
              ))}
            </PuckPostBlockPreview>
          )
        },
      }
    })
  }

  return {
    root: {
      render: (props: { children?: React.ReactNode }) => (
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
    },
    categories: {
      Content: {
        components: contentSlugs,
        defaultExpanded: true,
        title: 'Content Blocks',
      },
      Rows: {
        components: rowSlugs,
        defaultExpanded: true,
        title: 'Rows',
      },
    },
    components,
  }
}

function PuckPreviewIframe({
  children,
  previewThemeStyle,
}: {
  children: React.ReactNode
  previewThemeStyle?: React.CSSProperties
}) {
  return (
    <div
      className={styles.previewFrameRoot}
      style={{
        ...previewThemeStyle,
        background: '#f3f4f6',
        color: '#030712',
        fontFamily: 'var(--tenant-body-font, var(--font-sans, Arial, Helvetica, sans-serif))',
        minHeight: '100%',
      }}
    >
      {children}
    </div>
  )
}

export function PuckPostBuilderEditor({
  blockSchema,
  initialData,
  initialThemeStyle,
  postId,
  title,
}: PuckPostBuilderProps) {
  const [previewThemeStyle, setPreviewThemeStyle] = useState<React.CSSProperties | undefined>(
    initialThemeStyle ? (initialThemeStyle as React.CSSProperties) : undefined,
  )
  const [postContent, setPostContent] = useState<Record<string, unknown> | null>(() => getPostBodyContentFromData(initialData))
  const config = useMemo(
    () => createConfig(blockSchema, previewThemeStyle, postContent),
    [blockSchema, postContent, previewThemeStyle],
  )
  const contentPaletteSlugs = useMemo(() => getContentPaletteSlugs(blockSchema), [blockSchema])
  const rowPaletteSlugs = useMemo(() => getRowPaletteSlugs(blockSchema), [blockSchema])
  const [richTextToolbarTarget, setRichTextToolbarTarget] = useState<HTMLDivElement | null>(null)
  const overrides = useMemo(
    () => ({
      drawerItem: PostDrawerItem,
      header: (props: { actions: React.ReactNode; children: React.ReactNode }) => (
        <div className={styles.builderHeaderShell}>
          {props.children}
          <div
            className={styles.builderHeaderRichTextToolbar}
            ref={setRichTextToolbarTarget}
          />
        </div>
      ),
      iframe: (props: { children: React.ReactNode }) => (
        <PuckPreviewIframe {...props} previewThemeStyle={previewThemeStyle} />
      ),
      puck: PostBuilderPuckShell,
    }),
    [previewThemeStyle],
  )
  const plugins = useMemo(
    () => createPostBuilderPlugins(contentPaletteSlugs, rowPaletteSlugs),
    [contentPaletteSlugs, rowPaletteSlugs],
  )
  const [data, setData] = useState<PuckPageData | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadLatest() {
      setStatus('loading')
      setMessage(null)
      try {
        const res = await fetch(`/api/puck/posts/${postId}`, { cache: 'no-store' })
        if (!res.ok) throw new Error(await res.text())
        const payload = (await res.json()) as PuckPostPayload
        const nextData = await hydratePuckMedia(payload.data, blockSchema, [])
        if (!cancelled) {
          setData(nextData)
          setPostContent(payload.post.content || getPostBodyContentFromData(nextData))
          setPreviewThemeStyle((current) => getThemeStyleFromPayload(payload) ?? current)
          setStatus('idle')
        }
      } catch (error) {
        const fallbackData = await hydratePuckMedia(initialData, blockSchema, [])
        if (!cancelled) {
          setData(fallbackData)
          setPostContent(getPostBodyContentFromData(fallbackData))
          setStatus('error')
          setMessage(error instanceof Error ? error.message : 'Unable to load the latest post data')
        }
      }
    }

    void loadLatest()

    return () => {
      cancelled = true
    }
  }, [blockSchema, initialData, postId])

  async function save(nextData: Data) {
    setStatus('saving')
    setMessage(null)
    try {
      const res = await fetch(`/api/puck/posts/${postId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: nextData }),
      })

      if (!res.ok) throw new Error(await res.text())
      const payload = (await res.json()) as PuckPostPayload
      const savedData = await hydratePuckMedia(postToPuckData(payload.post), blockSchema, [])
      setData(savedData)
      setPostContent(payload.post.content || getPostBodyContentFromData(savedData))
      setPreviewThemeStyle((current) => getThemeStyleFromPayload(payload) ?? current)
      setStatus('saved')
      setMessage('Post layout draft saved.')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Unable to save post layout')
    }
  }

  if (!data) {
    return <div className={styles.loading}>Loading post builder...</div>
  }

  return (
    <div className={styles.wrapper} style={previewThemeStyle}>
      <PuckRichTextToolbarProvider target={richTextToolbarTarget}>
        <Puck
          config={config}
          data={data}
          headerTitle={`Post Builder: ${title}`}
          height="calc(100vh - 96px)"
          onChange={(nextData) => setData(nextData as PuckPageData)}
          onPublish={(nextData) => void save(nextData)}
          overrides={overrides}
          plugins={plugins}
          renderHeaderActions={({ state }) => (
            <button
              className={styles.saveButton}
              disabled={status === 'saving'}
              type="button"
              onClick={() => void save(state.data)}
            >
              {status === 'saving' ? 'Saving...' : 'Save Draft'}
            </button>
          )}
          viewports={[
            { width: 390, height: 'auto', label: 'Mobile' },
            { width: 768, height: 'auto', label: 'Tablet' },
            { width: 1100, height: 'auto', label: 'Desktop' },
          ]}
        />
      </PuckRichTextToolbarProvider>
      <div className={styles.status} data-state={status}>
        {status === 'saving' ? 'Saving draft...' : message}
      </div>
    </div>
  )
}
