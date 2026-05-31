'use client'

import '@puckeditor/core/puck.css'

import { Drawer, DropZone, fieldsPlugin, Puck, type Config, type Data, type Plugin } from '@puckeditor/core'
import {
  AlignJustify,
  Columns2,
  Columns4,
  Heading1,
  ImageIcon,
  Link2,
  List,
  Megaphone,
  Minus,
  MousePointerClick,
  PanelBottom,
  PanelTop,
  Rows3,
  Space,
  TableCellsSplit,
  Type,
} from 'lucide-react'
import React, { useEffect, useMemo, useRef, useState } from 'react'

import { buildDefaults, buildFields } from '@/components/admin/puck/PuckPageBuilderEditor'
import { PuckRichTextToolbarProvider } from '@/components/admin/puck/PuckLexicalTextEditor'
import styles from '@/components/admin/puck/puck-page-builder.module.css'
import { hydratePuckMedia } from '@/lib/puck/mediaHydration'
import type { PuckBlockSchema, PuckEmailDoc, PuckPageData } from '@/lib/puck/types'

import { PuckEmailBlockPreview } from './PuckEmailBlockPreview'

const AUTOSAVE_INTERVAL_MS = 1000

type LinkCheck = {
  checkedAt?: string
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

type EmailPaletteItem = {
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number }>
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
  emailArticleImageRight: { icon: TableCellsSplit, label: 'Article', type: 'content' },
  emailArticleTwoCards: { icon: Columns2, label: '2 Cards', type: 'content' },
  emailBentoGrid: { icon: TableCellsSplit, label: 'Highlights', type: 'content' },
  emailButton: { icon: MousePointerClick, label: 'Button', type: 'content' },
  emailCallout: { icon: Megaphone, label: 'Callout', type: 'content' },
  emailDivider: { icon: Minus, label: 'Divider', type: 'content' },
  emailFeatureThreeCentered: { icon: AlignJustify, label: 'Feature', type: 'content' },
  emailFooterOneColumn: { icon: PanelBottom, label: 'Footer', type: 'content' },
  emailGallery: { icon: Columns4, label: 'Gallery', type: 'content' },
  emailHeaderSocial: { icon: PanelTop, label: 'Header', type: 'content' },
  emailHeading: { icon: Heading1, label: 'Heading', type: 'content' },
  emailImage: { icon: ImageIcon, label: 'Image', type: 'content' },
  emailInlineLink: { icon: Link2, label: 'Link', type: 'content' },
  emailList: { icon: List, label: 'List', type: 'content' },
  emailMarkdown: { icon: AlignJustify, label: 'Markdown', type: 'content' },
  emailSpacer: { icon: Space, label: 'Spacer', type: 'content' },
  emailText: { icon: Type, label: 'Text', type: 'content' },
  emailTwoButtons: { icon: Columns2, label: '2 Buttons', type: 'content' },
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

function EmailDrawerItem({ name }: { children: React.ReactNode; name: string }) {
  const item = EMAIL_PALETTE_ITEMS[name] || { label: name, type: 'content' as const }
  const Icon = item.icon

  return (
    <div className={styles.emailPaletteItem} data-kind={item.type} data-row-layout={item.rowLayout}>
      {item.type === 'row' ? (
        <RowSkeleton columns={item.rowColumns || [1, 1]} />
      ) : (
        <span className={styles.emailPaletteIcon}>
          {Icon ? <Icon size={28} strokeWidth={2.25} /> : <Rows3 size={28} strokeWidth={2.25} />}
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
      <Drawer>
        {items.map((slug) => (
          <Drawer.Item
            key={slug}
            label={EMAIL_PALETTE_ITEMS[slug]?.label || slug}
            name={slug}
          />
        ))}
      </Drawer>
    </div>
  )
}

function createEmailBuilderPlugins(contentSlugs: string[], rowSlugs: string[]): Plugin[] {
  const propertiesPlugin = fieldsPlugin({ desktopSideBar: 'left' }) as Plugin

  return [
    {
      icon: <Type size={19} />,
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
      icon: <Rows3 size={19} />,
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
      label: 'Properties',
    },
  ]
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
                <DropZone key={zone} zone={zone} allow={nestedBlockSlugs} minEmptyHeight={120} />
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
                <DropZone key={zone} zone={zone} allow={nestedBlockSlugs} minEmptyHeight={120} />
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
            padding: '32px 16px',
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
              padding: '30px 30px',
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
    if (typeof link.remoteStatus === 'number' && (link.remoteStatus < 200 || link.remoteStatus >= 400)) return true
    return false
  })
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
          ? `${blockingLinks.length} broken or malformed link${blockingLinks.length === 1 ? '' : 's'} found. Fix before sending.`
          : links.length
            ? `${links.length} link${links.length === 1 ? '' : 's'} checked. No broken links found.`
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

  if (!data) {
    return <div className={styles.loading}>Loading email builder...</div>
  }

  const links = linkCheck?.quality?.links || []
  const blockingLinks = getBlockingLinks(links)

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
                  : `${links.length} checked`}
            </span>
          </div>
          {linkCheckMessage ? <p>{linkCheckMessage}</p> : null}
          {blockingLinks.length ? (
            <div className={styles.emailBuilderLinkList}>
              {blockingLinks.slice(0, 4).map((link, index) => (
                <div key={`${link.href}-${index}`}>
                  <strong>{link.label || 'Link'}</strong>
                  <span>{link.href || 'Missing URL'}</span>
                  <em>{link.remoteStatus ? `HTTP ${link.remoteStatus}` : link.reason || link.status}</em>
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
