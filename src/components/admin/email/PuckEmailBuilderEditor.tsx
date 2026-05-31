'use client'

import '@puckeditor/core/puck.css'

import { createUsePuck, Drawer, DropZone, fieldsPlugin, Puck, type Config, type Data, type Plugin } from '@puckeditor/core'
import React, { useEffect, useMemo, useRef, useState } from 'react'

import { buildDefaults, buildFields } from '@/components/admin/puck/PuckPageBuilderEditor'
import { PuckRichTextToolbarProvider } from '@/components/admin/puck/PuckLexicalTextEditor'
import styles from '@/components/admin/puck/puck-page-builder.module.css'
import { hydratePuckMedia } from '@/lib/puck/mediaHydration'
import type { PuckBlockSchema, PuckEmailDoc, PuckPageData } from '@/lib/puck/types'

import { PuckEmailBlockPreview } from './PuckEmailBlockPreview'

const AUTOSAVE_INTERVAL_MS = 1000
const EMAIL_ROW_DROPZONE_MIN_HEIGHT = 176

const useEmailBuilderPuck = createUsePuck()

type LinkCheck = {
  checkedAt?: string
  confirmed?: boolean
  confirmedAt?: string
  href: string
  label: string
  reason?: string
  remoteStatus?: number
  status: 'invalid' | 'merge' | 'ok' | 'warning'
}

type EmailReadiness = {
  quality?: {
    links: LinkCheck[]
  }
}

type EmailPaletteIconName =
  | 'article'
  | 'bento'
  | 'button'
  | 'buttons'
  | 'callout'
  | 'cards'
  | 'code'
  | 'divider'
  | 'feature'
  | 'footer'
  | 'gallery'
  | 'header'
  | 'heading'
  | 'image'
  | 'link'
  | 'list'
  | 'rows'
  | 'spacer'
  | 'text'

type EmailPaletteItem = {
  icon?: EmailPaletteIconName
  label: string
  rowColumns?: number[]
  rowLayout?: string
  type: 'content' | 'row'
}

type EmailRowPreset = {
  label: string
  layout: string
  slug: string
}

const EMAIL_ROW_PRESETS: EmailRowPreset[] = [
  { label: '1 Column', layout: 'oneColumn', slug: 'emailRowOneColumn' },
  { label: '2 Columns', layout: 'twoColumns', slug: 'emailRowTwoColumns' },
  { label: 'Left Wide', layout: 'twoColumnsLeftWide', slug: 'emailRowLeftWide' },
  { label: 'Right Wide', layout: 'twoColumnsRightWide', slug: 'emailRowRightWide' },
  { label: '3 Columns', layout: 'threeColumns', slug: 'emailRowThreeColumns' },
  { label: '4 Columns', layout: 'fourColumns', slug: 'emailRowFourColumns' },
]

const EMAIL_ROW_LAYOUT_ZONES: Record<string, string[]> = {
  fourColumns: ['left', 'center', 'right', 'fourth'],
  oneColumn: ['left'],
  threeColumns: ['left', 'center', 'right'],
  twoColumns: ['left', 'right'],
  twoColumnsLeftWide: ['left', 'right'],
  twoColumnsRightWide: ['left', 'right'],
}
const DEFAULT_EMAIL_ROW_ZONES = ['left', 'right']

const EMAIL_ROW_LAYOUT_COLUMNS: Record<string, number[]> = {
  fourColumns: [1, 1, 1, 1],
  oneColumn: [1],
  threeColumns: [1, 1, 1],
  twoColumns: [1, 1],
  twoColumnsLeftWide: [2, 1],
  twoColumnsRightWide: [1, 2],
}

const EMAIL_CONTENT_ORDER = [
  'emailHeading',
  'emailText',
  'emailImage',
  'emailButton',
  'emailTwoButtons',
  'emailInlineLink',
  'emailDivider',
  'emailSpacer',
  'emailCallout',
  'emailList',
  'emailGallery',
  'emailArticleImageRight',
  'emailArticleTwoCards',
  'emailFeatureThreeCentered',
  'emailBentoGrid',
  'emailMarkdown',
  'emailHeaderSocial',
  'emailFooterOneColumn',
]

const EMAIL_PALETTE_ITEMS: Record<string, EmailPaletteItem> = {
  emailArticleImageRight: { icon: 'article', label: 'Article', type: 'content' },
  emailArticleTwoCards: { icon: 'cards', label: '2 Cards', type: 'content' },
  emailBentoGrid: { icon: 'bento', label: 'Highlights', type: 'content' },
  emailButton: { icon: 'button', label: 'Button', type: 'content' },
  emailCallout: { icon: 'callout', label: 'Callout', type: 'content' },
  emailDivider: { icon: 'divider', label: 'Divider', type: 'content' },
  emailFeatureThreeCentered: { icon: 'feature', label: 'Feature', type: 'content' },
  emailFooterOneColumn: { icon: 'footer', label: 'Footer', type: 'content' },
  emailGallery: { icon: 'gallery', label: 'Gallery', type: 'content' },
  emailHeaderSocial: { icon: 'header', label: 'Header', type: 'content' },
  emailHeading: { icon: 'heading', label: 'Heading', type: 'content' },
  emailImage: { icon: 'image', label: 'Image', type: 'content' },
  emailInlineLink: { icon: 'link', label: 'Link', type: 'content' },
  emailList: { icon: 'list', label: 'List', type: 'content' },
  emailMarkdown: { icon: 'code', label: 'HTML', type: 'content' },
  emailSpacer: { icon: 'spacer', label: 'Spacer', type: 'content' },
  emailText: { icon: 'text', label: 'Text', type: 'content' },
  emailTwoButtons: { icon: 'buttons', label: '2 Buttons', type: 'content' },
}

EMAIL_ROW_PRESETS.forEach((preset) => {
  EMAIL_PALETTE_ITEMS[preset.slug] = {
    label: preset.label,
    rowColumns: EMAIL_ROW_LAYOUT_COLUMNS[preset.layout] || [1, 1],
    rowLayout: preset.layout,
    type: 'row',
  }
})

export type PuckEmailBuilderProps = {
  blockSchema: PuckBlockSchema[]
  emailId: string
  initialData: PuckPageData
  title: string
}

function getEmailGridZones(layout: unknown): string[] {
  return EMAIL_ROW_LAYOUT_ZONES[String(layout)] || DEFAULT_EMAIL_ROW_ZONES
}

function getContentPaletteSlugs(blockSchema: PuckBlockSchema[]): string[] {
  const availableSlugs = new Set(blockSchema.map((block) => block.slug))
  return EMAIL_CONTENT_ORDER.filter((slug) => availableSlugs.has(slug))
}

function getRowPaletteSlugs(blockSchema: PuckBlockSchema[]): string[] {
  return blockSchema.some((block) => block.slug === 'emailGrid')
    ? EMAIL_ROW_PRESETS.map((preset) => preset.slug)
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

function EmailPaletteSvgIcon({ icon }: { icon: EmailPaletteIconName }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 2.6,
  }

  switch (icon) {
    case 'article':
      return (
        <svg aria-hidden="true" viewBox="0 0 48 48">
          <rect {...common} height="26" rx="3" width="34" x="7" y="11" />
          <path {...common} d="M13 18h14M13 24h10M13 30h12" />
          <rect fill="currentColor" height="11" rx="1.5" width="9" x="29" y="20" />
        </svg>
      )
    case 'bento':
      return (
        <svg aria-hidden="true" viewBox="0 0 48 48">
          <rect fill="currentColor" height="13" rx="2" width="19" x="8" y="9" />
          <rect {...common} height="13" rx="2" width="10" x="30" y="9" />
          <rect {...common} height="13" rx="2" width="12" x="8" y="26" />
          <rect fill="currentColor" height="13" rx="2" width="20" x="23" y="26" />
        </svg>
      )
    case 'button':
      return (
        <svg aria-hidden="true" viewBox="0 0 48 48">
          <rect {...common} height="16" rx="4" width="30" x="9" y="16" />
          <path {...common} d="M18 24h12" />
        </svg>
      )
    case 'buttons':
      return (
        <svg aria-hidden="true" viewBox="0 0 48 48">
          <rect fill="currentColor" height="13" rx="3" width="22" x="5" y="12" />
          <rect {...common} height="13" rx="3" width="22" x="21" y="24" />
        </svg>
      )
    case 'callout':
      return (
        <svg aria-hidden="true" viewBox="0 0 48 48">
          <path fill="currentColor" d="M24 6 43 39H5L24 6Z" />
          <path d="M24 17v10" stroke="#fff" strokeLinecap="round" strokeWidth="3" />
          <circle cx="24" cy="33" fill="#fff" r="2" />
        </svg>
      )
    case 'cards':
      return (
        <svg aria-hidden="true" viewBox="0 0 48 48">
          <rect {...common} height="27" rx="3" width="17" x="8" y="11" />
          <rect {...common} height="27" rx="3" width="17" x="25" y="11" />
          <path {...common} d="M12 27h9M29 27h9M12 32h6M29 32h6" />
          <path fill="currentColor" d="M12 15h9v7h-9zM29 15h9v7h-9z" />
        </svg>
      )
    case 'code':
      return (
        <svg aria-hidden="true" viewBox="0 0 48 48">
          <path {...common} d="m18 16-8 8 8 8M30 16l8 8-8 8M27 11l-6 26" />
        </svg>
      )
    case 'divider':
      return (
        <svg aria-hidden="true" viewBox="0 0 48 48">
          <path {...common} d="M8 19h32M8 29h32" />
        </svg>
      )
    case 'feature':
      return (
        <svg aria-hidden="true" viewBox="0 0 48 48">
          <path {...common} d="M11 15h26M11 23h26M16 31h16" />
          <circle cx="8" cy="15" fill="currentColor" r="2" />
          <circle cx="8" cy="23" fill="currentColor" r="2" />
          <circle cx="13" cy="31" fill="currentColor" r="2" />
        </svg>
      )
    case 'footer':
      return (
        <svg aria-hidden="true" viewBox="0 0 48 48">
          <rect {...common} height="30" rx="3" width="34" x="7" y="9" />
          <path fill="currentColor" d="M10 30h28v6H10z" />
          <path {...common} d="M14 16h20M14 22h13" />
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
    case 'header':
      return (
        <svg aria-hidden="true" viewBox="0 0 48 48">
          <rect {...common} height="30" rx="3" width="34" x="7" y="9" />
          <path fill="currentColor" d="M10 12h28v8H10z" />
          <circle cx="15" cy="16" fill="#fff" r="2" />
          <path d="M22 16h11" stroke="#fff" strokeLinecap="round" strokeWidth="2.4" />
        </svg>
      )
    case 'heading':
      return (
        <svg aria-hidden="true" viewBox="0 0 48 48">
          <path d="M9 13h22" stroke="currentColor" strokeLinecap="round" strokeWidth="6" />
          <path {...common} d="M11 25h25M11 33h17" />
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
    case 'link':
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
      return (
        <svg aria-hidden="true" viewBox="0 0 48 48">
          <path d="M8 12h24" stroke="currentColor" strokeLinecap="round" strokeWidth="5" />
          <path {...common} d="M20 12v24M12 36h16M33 22h7M36.5 22v14M32 36h9" />
        </svg>
      )
    default:
      return null
  }
}

function EmailSavedRowPlaceholder() {
  return (
    <div className={styles.emailSavedRowPlaceholder} aria-label="Saved rows placeholder">
      <RowSkeleton columns={[1]} />
      <span>
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M8 4h8a1 1 0 0 1 1 1v15l-5-3-5 3V5a1 1 0 0 1 1-1Z" fill="currentColor" />
        </svg>
        Saved Row
      </span>
    </div>
  )
}

function EmailPaletteTabIcon({ icon }: { icon: 'content' | 'properties' | 'rows' }) {
  if (icon === 'properties') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M5 7h14M5 12h14M5 17h14" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
        <circle cx="9" cy="7" fill="currentColor" r="2" />
        <circle cx="15" cy="12" fill="currentColor" r="2" />
        <circle cx="11" cy="17" fill="currentColor" r="2" />
      </svg>
    )
  }

  return <EmailPaletteSvgIcon icon={icon === 'rows' ? 'rows' : 'text'} />
}

function EmailDrawerItem({ name }: { children: React.ReactNode; name: string }) {
  const item = EMAIL_PALETTE_ITEMS[name] || { label: name, type: 'content' as const }

  return (
    <div className={styles.emailPaletteItem} data-kind={item.type} data-row-layout={item.rowLayout}>
      {item.type === 'row' ? (
        <RowSkeleton columns={item.rowColumns || [1, 1]} />
      ) : (
        <span className={styles.emailPaletteIcon}>
          <EmailPaletteSvgIcon icon={item.icon || 'rows'} />
        </span>
      )}
      <span className={styles.emailPaletteLabel}>{item.label}</span>
    </div>
  )
}

function EmailPaletteDrawer({
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
      {palette === 'rows' ? <EmailSavedRowPlaceholder /> : null}
      <Drawer>
        {items.map((slug) => (
          <Drawer.Item
            key={slug}
            label={EMAIL_PALETTE_ITEMS[slug]?.label || slug}
            name={slug}
          >
            {EmailDrawerItem}
          </Drawer.Item>
        ))}
      </Drawer>
    </div>
  )
}

function createEmailBuilderPlugins(contentSlugs: string[], rowSlugs: string[]): Plugin[] {
  const propertiesPlugin = fieldsPlugin({ desktopSideBar: 'left' }) as Plugin

  return [
    {
      icon: <EmailPaletteTabIcon icon="content" />,
      label: 'Content',
      name: 'blocks',
      render: () => (
        <EmailPaletteDrawer
          description="Drag content blocks into the email canvas."
          items={contentSlugs}
          palette="content"
          title="Content Blocks"
        />
      ),
    },
    {
      icon: <EmailPaletteTabIcon icon="rows" />,
      label: 'Rows',
      name: 'rows',
      render: () => (
        <EmailPaletteDrawer
          description="Drag row layouts into the email canvas."
          items={rowSlugs}
          palette="rows"
          title="Add Rows"
        />
      ),
    },
    {
      ...propertiesPlugin,
      icon: <EmailPaletteTabIcon icon="properties" />,
      label: 'Properties',
    },
  ]
}

function EmailBuilderAutoPropertiesTab() {
  const dispatch = useEmailBuilderPuck((state) => state.dispatch)
  const itemSelector = useEmailBuilderPuck((state) => state.appState.ui.itemSelector)
  const currentPlugin = useEmailBuilderPuck((state) => state.appState.ui.plugin.current)
  const leftSideBarVisible = useEmailBuilderPuck((state) => state.appState.ui.leftSideBarVisible)
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

function EmailBuilderPuckShell({ children }: { children?: React.ReactNode }) {
  return (
    <>
      <EmailBuilderAutoPropertiesTab />
      {children}
    </>
  )
}

function createConfig(blockSchema: PuckBlockSchema[]): Config {
  const nestedBlockSlugs = blockSchema
    .map((block) => block.slug)
    .filter((slug) => !['emailGrid', 'emailHeaderSocial', 'emailFooterOneColumn'].includes(slug))
  const gridBlock = blockSchema.find((block) => block.slug === 'emailGrid')
  const contentSlugs = getContentPaletteSlugs(blockSchema)
  const rowSlugs = getRowPaletteSlugs(blockSchema)
  const components = blockSchema.reduce<Config['components']>((acc, block) => {
    acc[block.slug] = {
      label: EMAIL_PALETTE_ITEMS[block.slug]?.label || (block.slug === 'emailGrid' ? 'Custom Row' : block.label),
      fields: buildFields(block.fields, []),
      defaultProps: buildDefaults(block.fields),
      render: (props) => {
        if (block.slug === 'emailGrid') {
          const gridProps = props as Record<string, unknown>
          const zones = getEmailGridZones(gridProps.layout)

          return (
            <PuckEmailBlockPreview blockType={block.slug} props={gridProps}>
              {zones.map((zone) => (
                <DropZone key={zone} zone={zone} allow={nestedBlockSlugs} minEmptyHeight={EMAIL_ROW_DROPZONE_MIN_HEIGHT} />
              ))}
            </PuckEmailBlockPreview>
          )
        }

        return (
          <PuckEmailBlockPreview
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

    EMAIL_ROW_PRESETS.forEach((preset) => {
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
          const zones = getEmailGridZones(gridProps.layout)

          return (
            <PuckEmailBlockPreview blockType="emailGrid" props={gridProps}>
              {zones.map((zone) => (
                <DropZone key={zone} zone={zone} allow={nestedBlockSlugs} minEmptyHeight={EMAIL_ROW_DROPZONE_MIN_HEIGHT} />
              ))}
            </PuckEmailBlockPreview>
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
            background: '#f6f7f9',
            minHeight: '100%',
            padding: 0,
          }}
        >
          <div
            style={{
              background: '#fff',
              border: '1px solid #d9dee7',
              borderRadius: 0,
              margin: '0 auto',
              maxWidth: 640,
              minHeight: 240,
              padding: 0,
            }}
          >
            {props.children}
          </div>
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
}: {
  children: React.ReactNode
}) {
  return (
    <div
      className={styles.previewFrameRoot}
      style={{
        background: '#f6f7f9',
        color: '#111827',
        fontFamily: 'Arial, Helvetica, sans-serif',
        minHeight: '100%',
      }}
    >
      {children}
    </div>
  )
}

function serializePuckData(value: PuckPageData | Data | null): string {
  try {
    return JSON.stringify(value ?? null)
  } catch {
    return ''
  }
}

function getBlockingLinks(links: LinkCheck[] | undefined): LinkCheck[] {
  if (!Array.isArray(links)) return []

  return links.filter((link) => {
    if (link.status === 'invalid') return true
    return false
  })
}

function getReviewLinks(links: LinkCheck[] | undefined): LinkCheck[] {
  if (!Array.isArray(links)) return []

  return links.filter((link) => link.status === 'invalid' || link.status === 'warning')
}

export function PuckEmailBuilderEditor({
  blockSchema,
  emailId,
  initialData,
  title,
}: PuckEmailBuilderProps) {
  const config = useMemo(() => createConfig(blockSchema), [blockSchema])
  const contentPaletteSlugs = useMemo(() => getContentPaletteSlugs(blockSchema), [blockSchema])
  const rowPaletteSlugs = useMemo(() => getRowPaletteSlugs(blockSchema), [blockSchema])
  const [richTextToolbarTarget, setRichTextToolbarTarget] = useState<HTMLDivElement | null>(null)
  const overrides = useMemo(
    () => ({
      drawerItem: EmailDrawerItem,
      header: (props: { actions: React.ReactNode; children: React.ReactNode }) => (
        <div className={styles.builderHeaderShell}>
          {props.children}
          <div
            className={styles.builderHeaderRichTextToolbar}
            ref={setRichTextToolbarTarget}
          />
        </div>
      ),
      iframe: PuckPreviewIframe,
      puck: EmailBuilderPuckShell,
    }),
    [],
  )
  const plugins = useMemo(
    () => createEmailBuilderPlugins(contentPaletteSlugs, rowPaletteSlugs),
    [contentPaletteSlugs, rowPaletteSlugs],
  )
  const [data, setData] = useState<PuckPageData | null>(null)
  const [linkCheck, setLinkCheck] = useState<EmailReadiness | null>(null)
  const [linkCheckMessage, setLinkCheckMessage] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [status, setStatus] = useState<'checkingLinks' | 'idle' | 'creatingPost' | 'loading' | 'saving' | 'saved' | 'sending' | 'sendingProduction' | 'sent' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const savedDataSnapshotRef = useRef('')
  const latestDataSnapshotRef = useRef('')
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSavingRef = useRef(false)
  const queuedSaveDataRef = useRef<Data | null>(null)
  const queuedSaveWaitersRef = useRef<Array<(saved: boolean) => void>>([])

  function clearAutosaveTimer() {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
  }

  useEffect(() => {
    let cancelled = false

    async function loadLatest() {
      setStatus('loading')
      setMessage(null)
      try {
        const res = await fetch(`/api/puck/emails/${emailId}`, { cache: 'no-store' })
        if (!res.ok) throw new Error(await res.text())
        const payload = (await res.json()) as { data: PuckPageData; email: PuckEmailDoc }
        const nextData = await hydratePuckMedia(payload.data, blockSchema, [])
        if (!cancelled) {
          const nextSnapshot = serializePuckData(nextData)
          savedDataSnapshotRef.current = nextSnapshot
          latestDataSnapshotRef.current = nextSnapshot
          setData(nextData)
          setIsDirty(false)
          setStatus('idle')
        }
      } catch (error) {
        const fallbackData = await hydratePuckMedia(initialData, blockSchema, [])
        if (!cancelled) {
          const fallbackSnapshot = serializePuckData(fallbackData)
          savedDataSnapshotRef.current = fallbackSnapshot
          latestDataSnapshotRef.current = fallbackSnapshot
          setData(fallbackData)
          setIsDirty(false)
          setStatus('error')
          setMessage(error instanceof Error ? error.message : 'Unable to load the latest email data')
        }
      }
    }

    void loadLatest()

    return () => {
      cancelled = true
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current)
        autosaveTimerRef.current = null
      }
    }
  }, [blockSchema, emailId, initialData])

  async function save(nextData: Data): Promise<boolean> {
    if (isSavingRef.current) {
      queuedSaveDataRef.current = nextData
      return new Promise((resolve) => {
        queuedSaveWaitersRef.current.push(resolve)
      })
    }

    isSavingRef.current = true
    setStatus('saving')
    setMessage(null)
    const submittedSnapshot = serializePuckData(nextData)

    try {
      const res = await fetch(`/api/puck/emails/${emailId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: nextData }),
      })

      if (!res.ok) throw new Error(await res.text())
      const payload = (await res.json()) as { data: PuckPageData; email: PuckEmailDoc }
      const savedData = await hydratePuckMedia(payload.data, blockSchema, [])
      const savedSnapshot = serializePuckData(savedData)
      savedDataSnapshotRef.current = savedSnapshot

      if (latestDataSnapshotRef.current === submittedSnapshot) {
        latestDataSnapshotRef.current = savedSnapshot
        setData(savedData)
        setIsDirty(false)
      } else {
        setIsDirty(true)
      }

      setStatus('saved')
      setMessage('Email draft autosaved.')
      return true
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Unable to save email')
      return false
    } finally {
      isSavingRef.current = false
      const queuedData = queuedSaveDataRef.current
      const queuedWaiters = queuedSaveWaitersRef.current
      queuedSaveDataRef.current = null
      queuedSaveWaitersRef.current = []

      if (queuedData) {
        const queuedSnapshot = serializePuckData(queuedData)
        if (queuedSnapshot !== savedDataSnapshotRef.current) {
          autosaveTimerRef.current = setTimeout(() => {
            autosaveTimerRef.current = null
            void save(queuedData).then((saved) => {
              queuedWaiters.forEach((resolve) => resolve(saved))
            })
          }, 0)
        } else {
          queuedWaiters.forEach((resolve) => resolve(true))
        }
      }
    }
  }

  function scheduleAutosave(nextData: Data) {
    clearAutosaveTimer()
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null
      void save(nextData)
    }, AUTOSAVE_INTERVAL_MS)
  }

  async function saveLatestData(): Promise<boolean> {
    if (!data) return false

    clearAutosaveTimer()
    const currentSnapshot = serializePuckData(data)
    if (currentSnapshot === savedDataSnapshotRef.current && !isDirty) {
      return true
    }

    return save(data)
  }

  async function continueToAudience() {
    const saved = await saveLatestData()
    if (!saved) return

    window.location.href = `/admin/collections/emails/${emailId}/audience`
  }

  async function checkLinks(): Promise<boolean> {
    const saved = await saveLatestData()
    if (!saved) return false

    setStatus('checkingLinks')
    setMessage(null)
    setLinkCheckMessage(null)

    try {
      const res = await fetch(`/api/emails/${emailId}/readiness`, { cache: 'no-store' })
      if (!res.ok) throw new Error(await res.text())

      const payload = (await res.json()) as EmailReadiness
      const links = payload.quality?.links || []
      const blockingLinks = getBlockingLinks(links)

      setLinkCheck(payload)
      setStatus('idle')
      setLinkCheckMessage(
        blockingLinks.length
          ? `${blockingLinks.length} malformed or missing link${blockingLinks.length === 1 ? '' : 's'} found. Fix before sending.`
          : links.length
            ? `${links.length} link${links.length === 1 ? '' : 's'} checked. Warnings do not block test sends.`
            : 'No links found in this email.',
      )

      return blockingLinks.length === 0
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Unable to check links')
      return false
    }
  }

  async function sendTestEmail() {
    const linksPassed = await checkLinks()
    if (!linksPassed) return

    setStatus('sending')
    setMessage(null)

    try {
      const res = await fetch(`/api/emails/${emailId}/send-test`, {
        method: 'POST',
      })

      if (!res.ok) throw new Error(await res.text())
      const payload = (await res.json()) as { message?: string }
      setStatus('sent')
      setMessage(payload.message || 'Test email sent successfully.')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Unable to send test email')
    }
  }

  async function confirmLink(link: LinkCheck) {
    setStatus('checkingLinks')
    setMessage(null)

    try {
      const res = await fetch(`/api/emails/${emailId}/link-review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          href: link.href,
          label: link.label,
          reason: link.reason || (link.remoteStatus ? `Remote check returned ${link.remoteStatus}` : undefined),
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      await checkLinks()
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Unable to confirm link')
    }
  }

  if (!data) {
    return <div className={styles.loading}>Loading email builder...</div>
  }

  const links = linkCheck?.quality?.links || []
  const blockingLinks = getBlockingLinks(links)
  const reviewLinks = getReviewLinks(links)

  return (
    <div className={styles.wrapper}>
      <PuckRichTextToolbarProvider target={richTextToolbarTarget}>
        <Puck
          config={config}
          data={data}
          headerTitle={`Email Builder: ${title}`}
          height="calc(100vh - 96px)"
          onChange={(nextData) => {
            const nextPuckData = nextData as PuckPageData
            const nextSnapshot = serializePuckData(nextPuckData)
            const hasUnsavedChanges = nextSnapshot !== savedDataSnapshotRef.current

            latestDataSnapshotRef.current = nextSnapshot
            setData(nextPuckData)
            setIsDirty(hasUnsavedChanges)
            if (hasUnsavedChanges) {
              scheduleAutosave(nextPuckData)
            } else {
              clearAutosaveTimer()
            }
            if (status === 'saved' || status === 'sent' || status === 'error') {
              setStatus('idle')
              setMessage(null)
            }
          }}
          onPublish={(nextData) => void save(nextData)}
          overrides={overrides}
          plugins={plugins}
          renderHeaderActions={() => (
            <>
              <button
                className={styles.saveButton}
                disabled={status === 'saving' || status === 'sending' || status === 'checkingLinks'}
                type="button"
                onClick={() => data && void save(data)}
              >
                {status === 'saving' ? 'Saving...' : 'Save'}
              </button>
              <button
                className={styles.saveButton}
                disabled={status === 'saving' || status === 'sending' || status === 'checkingLinks'}
                type="button"
                onClick={() => void checkLinks()}
              >
                {status === 'checkingLinks' ? 'Checking Links...' : 'Check Links'}
              </button>
              <button
                className={styles.saveButton}
                disabled={status === 'saving' || status === 'sending' || status === 'checkingLinks'}
                type="button"
                onClick={() => void sendTestEmail()}
              >
                {status === 'sending' ? 'Sending Test Email...' : 'Send Test Email'}
              </button>
              <button
                className={styles.saveButton}
                disabled={status === 'saving' || status === 'sending' || status === 'checkingLinks'}
                type="button"
                onClick={() => void continueToAudience()}
              >
                Next: Audience
              </button>
            </>
          )}
          viewports={[
            { width: 390, height: 'auto', label: 'Mobile' },
            { width: 640, height: 'auto', label: 'Email' },
          ]}
        />
      </PuckRichTextToolbarProvider>
      {linkCheck || status === 'checkingLinks' ? (
        <aside className={styles.emailBuilderLinkPanel} data-state={blockingLinks.length ? 'error' : 'ok'}>
          <div className={styles.emailBuilderLinkPanelHeader}>
            <strong>Link Check</strong>
            <span>
              {status === 'checkingLinks'
                ? 'Checking...'
                : blockingLinks.length
                  ? `${blockingLinks.length} blocking`
                  : reviewLinks.length
                    ? `${reviewLinks.length} warning${reviewLinks.length === 1 ? '' : 's'}`
                    : `${links.length} checked`}
            </span>
          </div>
          {linkCheckMessage ? <p>{linkCheckMessage}</p> : null}
          {reviewLinks.length ? (
            <div className={styles.emailBuilderLinkList}>
              {reviewLinks.slice(0, 6).map((link, index) => (
                <div key={`${link.href}-${index}`} data-state={link.status}>
                  <strong>{link.label || 'Link'}</strong>
                  <span>{link.href || 'Missing URL'}</span>
                  <em>{link.remoteStatus ? `HTTP ${link.remoteStatus}` : link.reason || link.status}</em>
                  {link.status === 'warning' ? (
                    <button type="button" onClick={() => void confirmLink(link)}>
                      Confirm link
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </aside>
      ) : null}
      <div className={styles.status} data-state={status}>
        {status === 'saving'
          ? 'Autosaving draft...'
          : status === 'sending'
            ? 'Sending test email...'
            : status === 'checkingLinks'
              ? 'Checking links...'
            : status === 'creatingPost'
              ? 'Creating post draft...'
              : status === 'sendingProduction'
                ? 'Sending campaign...'
            : isDirty
              ? 'Autosave pending...'
              : message}
      </div>
    </div>
  )
}
