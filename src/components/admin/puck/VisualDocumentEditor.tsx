'use client'

import '@puckeditor/core/puck.css'

import {
  createUsePuck,
  Drawer,
  DropZone,
  fieldsPlugin,
  Puck,
  type Config,
  type Data,
  type Plugin,
} from '@puckeditor/core'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { hydratePuckMedia } from '@/lib/puck/mediaHydration'
import type { PuckBlockSchema, PuckPageData } from '@/lib/puck/types'

import { buildDefaults, buildFields } from './PuckPageBuilderEditor'
import { PuckRichTextToolbarProvider } from './PuckLexicalTextEditor'
import styles from './puck-page-builder.module.css'

const DEFAULT_AUTOSAVE_INTERVAL_MS = 1000
const EMPTY_BLOCK_SCHEMA: PuckBlockSchema[] = []
const useVisualDocumentPuck = createUsePuck()

export type VisualDocumentType = 'email' | 'form' | 'post'

export type VisualPaletteIcon =
  | 'article'
  | 'bento'
  | 'body'
  | 'button'
  | 'buttons'
  | 'callout'
  | 'cards'
  | 'checkbox'
  | 'checkbox-group'
  | 'code'
  | 'country'
  | 'divider'
  | 'email'
  | 'feature'
  | 'footer'
  | 'gallery'
  | 'header'
  | 'heading'
  | 'highlights'
  | 'image'
  | 'image-select'
  | 'link'
  | 'links'
  | 'list'
  | 'message'
  | 'number'
  | 'properties'
  | 'radio'
  | 'rows'
  | 'select'
  | 'spacer'
  | 'state'
  | 'text'
  | 'textarea'
  | 'video-capture'

export type VisualPaletteItem = {
  description?: string
  icon?: VisualPaletteIcon
  kind: 'content' | 'row'
  label: string
  slug: string
}

export type VisualRowPreset =
  | {
      columns: number[]
      hiddenFromPalette?: boolean
      label: string
      layout: string
      mode: 'layoutRows'
      slug: string
      zones: string[]
    }
  | {
      allowCustomColumns?: boolean
      columns: number[]
      hiddenFromPalette?: boolean
      label: string
      mode: 'fieldRows'
      slug: string
    }

type VisualPayload = {
  data?: PuckPageData
  themeStyle?: Record<string, string> | null
  [key: string]: unknown
}

export type VisualDocumentEditorContext<TPayload extends VisualPayload = VisualPayload> = {
  data: PuckPageData
  isDirty: boolean
  lastPayload: TPayload | null
  save: (nextData: Data) => Promise<boolean>
  saveLatestData: () => Promise<boolean>
  setMessage: (message: string | null) => void
  setStatus: (status: VisualDocumentStatus) => void
  status: VisualDocumentStatus
}

export type VisualDocumentStatus = 'error' | 'idle' | 'loading' | 'saved' | 'saving'

export type VisualDocumentConfigInput = {
  blockSchema: PuckBlockSchema[]
  contentSlugs: string[]
  defaultPropsBySlug?: Record<string, Record<string, unknown>>
  dropzoneMinHeight: number
  fieldRowDropzoneMinHeight?: number
  getFieldRowZoneName?: (index: number) => string
  layoutRowBlockSlug?: string
  nestedContentSlugs?: string[]
  paletteItems: VisualPaletteItem[]
  previewRenderer: (input: {
    blockType: string
    children?: React.ReactNode
    props: Record<string, unknown>
  }) => React.ReactElement
  rootRenderer: (props: { children?: React.ReactNode }) => React.ReactElement
  rows: VisualRowPreset[]
}

export type VisualDocumentEditorProps<TPayload extends VisualPayload = VisualPayload> = {
  apiPath: string
  autosave?: boolean
  autosaveIntervalMs?: number
  blockSchema: PuckBlockSchema[]
  config: Config
  documentType: VisualDocumentType
  externalBusy?: boolean
  externalMessage?: string | null
  externalStatus?: string | null
  getDataFromPayload?: (payload: TPayload, submittedData?: Data) => PuckPageData
  headerTitle: string
  height?: string
  initialData: PuckPageData
  initialMessage?: string | null
  lexicalBlockSchema?: PuckBlockSchema[]
  loadingLabel: string
  onDataChange?: (nextData: PuckPageData) => void
  onLoadPayload?: (payload: TPayload, data: PuckPageData) => void
  onSavePayload?: (payload: TPayload, data: PuckPageData) => void
  palette: {
    contentDescription: string
    contentSlugs: string[]
    contentTitle: string
    items: VisualPaletteItem[]
    rowDescription: string
    rowSlugs: string[]
    rowTitle: string
    rowsPlaceholder?: React.ReactNode
  }
  previewFrameStyle?: React.CSSProperties
  renderHeaderActions?: (context: VisualDocumentEditorContext<TPayload>) => React.ReactNode
  rows: VisualRowPreset[]
  saveButtonLabel?: string
  saveErrorMessage: string
  savedMessage: string
  savingMessage: string
  sidePanel?: (context: VisualDocumentEditorContext<TPayload>) => React.ReactNode
  startSidebarClosed?: boolean
  statusMessage?: (context: VisualDocumentEditorContext<TPayload>) => React.ReactNode
  toolbar?: boolean
  viewports: Array<{ height: number | 'auto'; label: string; width: number }>
  wrapperStyle?: React.CSSProperties
}

function serializePuckData(value: PuckPageData | Data | null): string {
  try {
    return JSON.stringify(value ?? null)
  } catch {
    return ''
  }
}

function defaultGetDataFromPayload(payload: VisualPayload): PuckPageData {
  return payload.data || ({ root: { props: {} }, content: [] } as PuckPageData)
}

function getPaletteItemMap(items: VisualPaletteItem[]): Record<string, VisualPaletteItem> {
  return items.reduce<Record<string, VisualPaletteItem>>((acc, item) => {
    acc[item.slug] = item
    return acc
  }, {})
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

function getValidRowColumns(value: unknown, fallback: number[]) {
  if (!Array.isArray(value)) return fallback

  const columns = value
    .map((column) => Number(column))
    .filter((column) => Number.isFinite(column) && column > 0)

  return columns.length ? columns : fallback
}

function VisualPaletteSvgIcon({ icon }: { icon: VisualPaletteIcon }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 2.6,
  }

  switch (icon) {
    case 'article':
      return <svg aria-hidden="true" viewBox="0 0 48 48"><rect {...common} height="26" rx="3" width="34" x="7" y="11" /><path {...common} d="M13 18h14M13 24h10M13 30h12" /><rect fill="currentColor" height="11" rx="1.5" width="9" x="29" y="20" /></svg>
    case 'bento':
    case 'highlights':
      return <svg aria-hidden="true" viewBox="0 0 48 48"><rect fill="currentColor" height="13" rx="2" width="19" x="8" y="9" /><rect {...common} height="13" rx="2" width="10" x="30" y="9" /><rect {...common} height="13" rx="2" width="12" x="8" y="26" /><rect fill="currentColor" height="13" rx="2" width="20" x="23" y="26" /></svg>
    case 'body':
    case 'heading':
      return <svg aria-hidden="true" viewBox="0 0 48 48"><path d="M9 12h23" stroke="currentColor" strokeLinecap="round" strokeWidth="5" /><path {...common} d="M11 22h26M11 30h22M11 38h15" /></svg>
    case 'button':
      return <svg aria-hidden="true" viewBox="0 0 48 48"><rect {...common} height="16" rx="4" width="30" x="9" y="16" /><path {...common} d="M18 24h12" /></svg>
    case 'buttons':
      return <svg aria-hidden="true" viewBox="0 0 48 48"><rect fill="currentColor" height="13" rx="3" width="22" x="5" y="12" /><rect {...common} height="13" rx="3" width="22" x="21" y="24" /></svg>
    case 'callout':
      return <svg aria-hidden="true" viewBox="0 0 48 48"><path fill="currentColor" d="M24 6 43 39H5L24 6Z" /><path d="M24 17v10" stroke="#fff" strokeLinecap="round" strokeWidth="3" /><circle cx="24" cy="33" fill="#fff" r="2" /></svg>
    case 'cards':
      return <svg aria-hidden="true" viewBox="0 0 48 48"><rect {...common} height="27" rx="3" width="17" x="8" y="11" /><rect {...common} height="27" rx="3" width="17" x="25" y="11" /><path {...common} d="M12 27h9M29 27h9M12 32h6M29 32h6" /><path fill="currentColor" d="M12 15h9v7h-9zM29 15h9v7h-9z" /></svg>
    case 'checkbox':
      return <svg aria-hidden="true" viewBox="0 0 48 48"><rect {...common} height="28" rx="4" width="28" x="10" y="10" /><path {...common} d="m17 24 5 5 10-12" /></svg>
    case 'checkbox-group':
      return <svg aria-hidden="true" viewBox="0 0 48 48"><rect {...common} height="8" rx="1.5" width="8" x="8" y="11" /><rect {...common} height="8" rx="1.5" width="8" x="8" y="28" /><path {...common} d="M22 15h18M22 32h18" /></svg>
    case 'code':
      return <svg aria-hidden="true" viewBox="0 0 48 48"><path {...common} d="m18 16-8 8 8 8M30 16l8 8-8 8M27 11l-6 26" /></svg>
    case 'country':
      return <svg aria-hidden="true" viewBox="0 0 48 48"><circle {...common} cx="24" cy="24" r="16" /><path {...common} d="M8 24h32M24 8a26 26 0 0 1 0 32M24 8a26 26 0 0 0 0 32" /></svg>
    case 'divider':
      return <svg aria-hidden="true" viewBox="0 0 48 48"><path {...common} d="M8 19h32M8 29h32" /></svg>
    case 'email':
      return <svg aria-hidden="true" viewBox="0 0 48 48"><rect {...common} height="24" rx="4" width="34" x="7" y="12" /><path {...common} d="m9 15 15 12 15-12" /></svg>
    case 'feature':
      return <svg aria-hidden="true" viewBox="0 0 48 48"><path {...common} d="M11 15h26M11 23h26M16 31h16" /><circle cx="8" cy="15" fill="currentColor" r="2" /><circle cx="8" cy="23" fill="currentColor" r="2" /><circle cx="13" cy="31" fill="currentColor" r="2" /></svg>
    case 'footer':
      return <svg aria-hidden="true" viewBox="0 0 48 48"><rect {...common} height="30" rx="3" width="34" x="7" y="9" /><path fill="currentColor" d="M10 30h28v6H10z" /><path {...common} d="M14 16h20M14 22h13" /></svg>
    case 'gallery':
      return <svg aria-hidden="true" viewBox="0 0 48 48"><rect fill="currentColor" height="12" rx="2" width="12" x="10" y="10" /><rect {...common} height="12" rx="2" width="12" x="26" y="10" /><rect {...common} height="12" rx="2" width="12" x="10" y="26" /><rect fill="currentColor" height="12" rx="2" width="12" x="26" y="26" /></svg>
    case 'header':
      return <svg aria-hidden="true" viewBox="0 0 48 48"><rect {...common} height="30" rx="3" width="34" x="7" y="9" /><path fill="currentColor" d="M10 12h28v8H10z" /><circle cx="15" cy="16" fill="#fff" r="2" /><path d="M22 16h11" stroke="#fff" strokeLinecap="round" strokeWidth="2.4" /></svg>
    case 'image':
    case 'image-select':
      return <svg aria-hidden="true" viewBox="0 0 48 48"><rect {...common} height="28" rx="4" width="32" x="8" y="10" /><circle cx="18" cy="19" fill="currentColor" r="3" /><path fill="currentColor" d="m11 34 9-9 6 6 4-5 8 8H11Z" /></svg>
    case 'link':
    case 'links':
      return <svg aria-hidden="true" viewBox="0 0 48 48"><path {...common} d="M19 17h-3a8 8 0 0 0 0 16h6M29 17h3a8 8 0 0 1 0 16h-6M18 24h12" /></svg>
    case 'list':
      return <svg aria-hidden="true" viewBox="0 0 48 48"><rect fill="currentColor" height="8" rx="1.5" width="8" x="8" y="11" /><rect fill="currentColor" height="8" rx="1.5" width="8" x="8" y="27" /><path {...common} d="M22 15h18M22 31h18M22 23h12M22 39h12" /></svg>
    case 'message':
      return <svg aria-hidden="true" viewBox="0 0 48 48"><path {...common} d="M9 10h30v22H17l-8 7V10Z" /><path {...common} d="M16 18h17M16 25h11" /></svg>
    case 'number':
      return <svg aria-hidden="true" viewBox="0 0 48 48"><path {...common} d="M19 9 15 39M33 9l-4 30M10 18h30M8 30h30" /></svg>
    case 'properties':
      return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 7h14M5 12h14M5 17h14" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" /><circle cx="9" cy="7" fill="currentColor" r="2" /><circle cx="15" cy="12" fill="currentColor" r="2" /><circle cx="11" cy="17" fill="currentColor" r="2" /></svg>
    case 'radio':
      return <svg aria-hidden="true" viewBox="0 0 48 48"><circle {...common} cx="16" cy="16" r="6" /><circle {...common} cx="16" cy="32" r="6" /><path {...common} d="M27 16h13M27 32h13" /></svg>
    case 'rows':
      return <svg aria-hidden="true" viewBox="0 0 48 48"><rect {...common} height="8" rx="2" width="32" x="8" y="9" /><rect fill="currentColor" height="8" rx="2" width="32" x="8" y="20" /><rect {...common} height="8" rx="2" width="32" x="8" y="31" /></svg>
    case 'select':
      return <svg aria-hidden="true" viewBox="0 0 48 48"><rect {...common} height="26" rx="4" width="32" x="8" y="11" /><path {...common} d="m17 20 7 7 7-7" /></svg>
    case 'spacer':
      return <svg aria-hidden="true" viewBox="0 0 48 48"><path {...common} d="M24 8v32M18 14l6-6 6 6M18 34l6 6 6-6" /><path {...common} d="M12 24h24" /></svg>
    case 'state':
      return <svg aria-hidden="true" viewBox="0 0 48 48"><path {...common} d="M24 42s14-11 14-23a14 14 0 1 0-28 0c0 12 14 23 14 23Z" /><circle {...common} cx="24" cy="19" r="4" /></svg>
    case 'textarea':
      return <svg aria-hidden="true" viewBox="0 0 48 48"><rect {...common} height="28" rx="4" width="32" x="8" y="10" /><path {...common} d="M15 18h18M15 25h15M15 32h10" /></svg>
    case 'video-capture':
      return <svg aria-hidden="true" viewBox="0 0 48 48"><rect {...common} height="22" rx="4" width="26" x="7" y="13" /><path {...common} d="m33 21 8-5v16l-8-5" /></svg>
    case 'text':
    default:
      return <svg aria-hidden="true" viewBox="0 0 48 48"><path d="M8 12h24" stroke="currentColor" strokeLinecap="round" strokeWidth="5" /><path {...common} d="M20 12v24M12 36h16M33 22h7M36.5 22v14M32 36h9" /></svg>
  }
}

function VisualPaletteTabIcon({ icon }: { icon: 'content' | 'properties' | 'rows' }) {
  return (
    <span className={styles.emailPaletteTabIcon}>
      <VisualPaletteSvgIcon icon={icon === 'content' ? 'text' : icon} />
    </span>
  )
}

function createVisualDrawerItem(paletteItems: Record<string, VisualPaletteItem>, rowPresets: Record<string, VisualRowPreset>) {
  function VisualDrawerItem({ name }: { children?: React.ReactNode; name: string }): React.ReactElement {
    const item = paletteItems[name] || { kind: 'content' as const, label: name, slug: name }
    const rowPreset = rowPresets[name]

    if (rowPreset?.mode === 'fieldRows') {
      return (
        <div className={styles.formPaletteRowItem}>
          <RowSkeleton columns={rowPreset.columns} />
          <strong>{item.label}</strong>
        </div>
      )
    }

    return (
      <div className={styles.emailPaletteItem} data-kind={item.kind} data-row-layout={rowPreset?.mode === 'layoutRows' ? rowPreset.layout : undefined}>
        {item.kind === 'row' ? (
          <RowSkeleton columns={rowPreset?.columns || [1, 1]} />
        ) : (
          <span className={styles.emailPaletteIcon}>
            <VisualPaletteSvgIcon icon={item.icon || 'text'} />
        </span>
      )}
      <span className={styles.emailPaletteLabel}>{item.label}</span>
      {item.description ? <span className={styles.emailPaletteDescription}>{item.description}</span> : null}
    </div>
  )
  }

  return VisualDrawerItem
}

function VisualPaletteDrawer({
  description,
  drawerItem,
  items,
  palette,
  paletteItems,
  rowsPlaceholder,
  title,
}: {
  description: string
  drawerItem: (props: { children?: React.ReactNode; name: string }) => React.ReactElement
  items: string[]
  palette: 'content' | 'rows'
  paletteItems: Record<string, VisualPaletteItem>
  rowsPlaceholder?: React.ReactNode
  title: string
}) {
  return (
    <div className={styles.emailPalettePanel} data-palette={palette}>
      <div className={styles.emailPaletteHeader}>
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      {palette === 'rows' ? rowsPlaceholder : null}
      <Drawer>
        {items.map((slug) => (
          <Drawer.Item key={slug} label={paletteItems[slug]?.label || slug} name={slug}>
            {drawerItem}
          </Drawer.Item>
        ))}
      </Drawer>
    </div>
  )
}

function createVisualPlugins({
  contentDescription,
  contentSlugs,
  contentTitle,
  drawerItem,
  paletteItems,
  rowDescription,
  rowSlugs,
  rowTitle,
  rowsPlaceholder,
}: VisualDocumentEditorProps['palette'] & {
  drawerItem: (props: { children?: React.ReactNode; name: string }) => React.ReactElement
  paletteItems: Record<string, VisualPaletteItem>
}): Plugin[] {
  const propertiesPlugin = fieldsPlugin({ desktopSideBar: 'left' }) as Plugin

  return [
    {
      icon: <VisualPaletteTabIcon icon="content" />,
      label: 'Content',
      name: 'blocks',
      render: () => (
        <VisualPaletteDrawer
          description={contentDescription}
          drawerItem={drawerItem}
          items={contentSlugs}
          palette="content"
          paletteItems={paletteItems}
          title={contentTitle}
        />
      ),
    },
    {
      icon: <VisualPaletteTabIcon icon="rows" />,
      label: 'Rows',
      name: 'rows',
      render: () => (
        <VisualPaletteDrawer
          description={rowDescription}
          drawerItem={drawerItem}
          items={rowSlugs}
          palette="rows"
          paletteItems={paletteItems}
          rowsPlaceholder={rowsPlaceholder}
          title={rowTitle}
        />
      ),
    },
    {
      ...propertiesPlugin,
      icon: <VisualPaletteTabIcon icon="properties" />,
      label: 'Properties',
    },
  ]
}

function VisualEditorStartClosed({ enabled }: { enabled?: boolean }) {
  const dispatch = useVisualDocumentPuck((state) => state.dispatch)

  useEffect(() => {
    if (!enabled) return

    dispatch({
      recordHistory: false,
      type: 'setUi',
      ui: {
        leftSideBarVisible: false,
      },
    })
  }, [dispatch, enabled])

  return null
}

function VisualEditorAutoPropertiesTab() {
  const dispatch = useVisualDocumentPuck((state) => state.dispatch)
  const itemSelector = useVisualDocumentPuck((state) => state.appState.ui.itemSelector)
  const currentPlugin = useVisualDocumentPuck((state) => state.appState.ui.plugin.current)
  const leftSideBarVisible = useVisualDocumentPuck((state) => state.appState.ui.leftSideBarVisible)
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

function VisualEditorPuckShell({ children, startSidebarClosed }: { children?: React.ReactNode; startSidebarClosed?: boolean }) {
  return (
    <>
      <VisualEditorStartClosed enabled={startSidebarClosed} />
      <VisualEditorAutoPropertiesTab />
      {children}
    </>
  )
}

function VisualPreviewIframe({
  children,
  previewFrameStyle,
}: {
  children: React.ReactNode
  previewFrameStyle?: React.CSSProperties
}) {
  return (
    <div className={styles.previewFrameRoot} style={previewFrameStyle}>
      {children}
    </div>
  )
}

function DefaultHeaderActions<TPayload extends VisualPayload>({
  context,
  label,
}: {
  context: VisualDocumentEditorContext<TPayload>
  label?: string
}) {
  return (
    <button
      className={styles.saveButton}
      disabled={context.status === 'saving'}
      type="button"
      onClick={() => void context.save(context.data)}
    >
      {context.status === 'saving' ? 'Saving...' : label || 'Save'}
    </button>
  )
}

export function createVisualDocumentConfig({
  blockSchema,
  contentSlugs,
  defaultPropsBySlug,
  dropzoneMinHeight,
  fieldRowDropzoneMinHeight,
  getFieldRowZoneName = (index) => `column${index}`,
  layoutRowBlockSlug,
  nestedContentSlugs,
  paletteItems,
  previewRenderer,
  rootRenderer,
  rows,
}: VisualDocumentConfigInput): Config {
  const rowSlugs = rows.filter((row) => !row.hiddenFromPalette).map((row) => row.slug)
  const paletteItemMap = getPaletteItemMap(paletteItems)
  const allowedNestedSlugs = nestedContentSlugs || contentSlugs
  const components = blockSchema.reduce<Config['components']>((acc, block) => {
    const defaults = {
      ...buildDefaults(block.fields),
      ...(defaultPropsBySlug?.[block.slug] || {}),
    }

    acc[block.slug] = {
      defaultProps: defaults,
      fields: buildFields(block.fields, []),
      label: paletteItemMap[block.slug]?.label || (block.slug === layoutRowBlockSlug ? 'Custom Row' : block.label),
      render: (props) => {
        if (layoutRowBlockSlug && block.slug === layoutRowBlockSlug) {
          const rowProps = props as Record<string, unknown>
          const layout = String(rowProps.layout || '')
          const matchingRow = rows.find((row): row is Extract<VisualRowPreset, { mode: 'layoutRows' }> => (
            row.mode === 'layoutRows' && row.layout === layout
          ))
          const zones = matchingRow?.zones || ['left', 'right']

          return previewRenderer({
            blockType: block.slug,
            props: rowProps,
            children: zones.map((zone) => (
              <DropZone key={zone} zone={zone} allow={allowedNestedSlugs} minEmptyHeight={dropzoneMinHeight} />
            )),
          })
        }

        return previewRenderer({
          blockType: block.slug,
          props: props as Record<string, unknown>,
        })
      },
    }
    return acc
  }, {})

  if (layoutRowBlockSlug) {
    const layoutBlock = blockSchema.find((block) => block.slug === layoutRowBlockSlug)
    if (layoutBlock) {
      const gridFields = buildFields(layoutBlock.fields, [])
      const gridDefaults = buildDefaults(layoutBlock.fields)

      rows
        .filter((row): row is Extract<VisualRowPreset, { mode: 'layoutRows' }> => row.mode === 'layoutRows')
        .forEach((row) => {
          components[row.slug] = {
            defaultProps: {
              ...gridDefaults,
              layout: row.layout,
            },
            fields: gridFields,
            label: row.label,
            render: (props) => {
              const rowProps = {
                ...(props as Record<string, unknown>),
                layout: (props as Record<string, unknown>).layout || row.layout,
              }

              return previewRenderer({
                blockType: layoutRowBlockSlug,
                props: rowProps,
                children: row.zones.map((zone) => (
                  <DropZone key={zone} zone={zone} allow={allowedNestedSlugs} minEmptyHeight={dropzoneMinHeight} />
                )),
              })
            },
          }
        })
    }
  }

  rows
    .filter((row): row is Extract<VisualRowPreset, { mode: 'fieldRows' }> => row.mode === 'fieldRows')
    .forEach((row) => {
      components[row.slug] = {
        defaultProps: {
          columns: row.columns,
        },
        label: row.label,
        render: (props) => {
          const rowProps = props as Record<string, unknown>
          const columns = row.allowCustomColumns
            ? getValidRowColumns(rowProps.columns, row.columns)
            : row.columns
          const total = columns.reduce((sum, column) => sum + column, 0)

          return (
            <section className={styles.formRowPreview}>
              <div className={styles.formRowPreviewHeader}>
                <span>{row.label}</span>
                <small>
                  {columns.map((column) => {
                    const width = row.allowCustomColumns ? column : total > 0 ? (column / total) * 100 : 100
                    return `${Math.round(width)}%`
                  }).join(' / ')}
                </small>
              </div>
              <div className={styles.formRowPreviewColumns}>
                {columns.map((column, index) => {
                  const width = Math.max(1, Math.min(100, column))
                  const customColumnStyle = row.allowCustomColumns
                    ? {
                        flex: `0 1 calc(${width}% - ${((columns.length - 1) * 12) / columns.length}px)`,
                      }
                    : { flex: column }

                  return (
                    <div key={index} className={styles.formRowPreviewColumn} style={customColumnStyle}>
                      <DropZone
                        allow={contentSlugs}
                        minEmptyHeight={fieldRowDropzoneMinHeight || dropzoneMinHeight}
                        zone={getFieldRowZoneName(index)}
                      />
                    </div>
                  )
                })}
              </div>
            </section>
          )
        },
      }
    })

  return {
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
    root: {
      render: (props: { children?: React.ReactNode }) => rootRenderer(props),
    },
  }
}

export function SavedRowPlaceholder() {
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

export function VisualDocumentEditor<TPayload extends VisualPayload = VisualPayload>({
  apiPath,
  autosave = false,
  autosaveIntervalMs = DEFAULT_AUTOSAVE_INTERVAL_MS,
  blockSchema,
  config,
  documentType,
  externalBusy = false,
  externalMessage,
  externalStatus,
  getDataFromPayload,
  headerTitle,
  height = 'calc(100vh - 96px)',
  initialData,
  initialMessage = null,
  lexicalBlockSchema = EMPTY_BLOCK_SCHEMA,
  loadingLabel,
  onDataChange,
  onLoadPayload,
  onSavePayload,
  palette,
  previewFrameStyle,
  renderHeaderActions,
  rows,
  saveButtonLabel,
  saveErrorMessage,
  savedMessage,
  savingMessage,
  sidePanel,
  startSidebarClosed,
  statusMessage,
  toolbar = false,
  viewports,
  wrapperStyle,
}: VisualDocumentEditorProps<TPayload>) {
  const resolveDataFromPayload = useMemo(
    () => getDataFromPayload || ((payload: TPayload) => defaultGetDataFromPayload(payload)),
    [getDataFromPayload],
  )
  const paletteItemMap = useMemo(() => getPaletteItemMap(palette.items), [palette.items])
  const rowPresetsBySlug = useMemo<Record<string, VisualRowPreset>>(
    () => rows.reduce<Record<string, VisualRowPreset>>((acc, row) => {
      acc[row.slug] = row
      return acc
    }, {}),
    [rows],
  )
  const drawerItem = useMemo(
    () => createVisualDrawerItem(paletteItemMap, rowPresetsBySlug),
    [paletteItemMap, rowPresetsBySlug],
  )
  const plugins = useMemo(
    () => createVisualPlugins({
      ...palette,
      drawerItem,
      paletteItems: paletteItemMap,
    }),
    [drawerItem, palette, paletteItemMap],
  )
  const [richTextToolbarTarget, setRichTextToolbarTarget] = useState<HTMLDivElement | null>(null)
  const overrides = useMemo(
    () => ({
      drawerItem,
      header: (props: { actions: React.ReactNode; children: React.ReactNode }) => (
        <div className={styles.builderHeaderShell}>
          {props.children}
          {toolbar ? (
            <div
              className={styles.builderHeaderRichTextToolbar}
              ref={setRichTextToolbarTarget}
            />
          ) : null}
        </div>
      ),
      iframe: (props: { children: React.ReactNode }) => (
        <VisualPreviewIframe {...props} previewFrameStyle={previewFrameStyle} />
      ),
      puck: (props: { children?: React.ReactNode }) => (
        <VisualEditorPuckShell {...props} startSidebarClosed={startSidebarClosed} />
      ),
    }),
    [drawerItem, previewFrameStyle, startSidebarClosed, toolbar],
  )
  const [data, setData] = useState<PuckPageData | null>(null)
  const [status, setStatus] = useState<VisualDocumentStatus>('idle')
  const [message, setMessage] = useState<string | null>(initialMessage)
  const [isDirty, setIsDirty] = useState(false)
  const [lastPayload, setLastPayload] = useState<TPayload | null>(null)
  const savedDataSnapshotRef = useRef('')
  const latestDataSnapshotRef = useRef('')
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSavingRef = useRef(false)
  const queuedSaveDataRef = useRef<Data | null>(null)
  const queuedSaveWaitersRef = useRef<Array<(saved: boolean) => void>>([])
  const getDataFromPayloadRef = useRef(resolveDataFromPayload)
  const onDataChangeRef = useRef(onDataChange)
  const onLoadPayloadRef = useRef(onLoadPayload)
  const onSavePayloadRef = useRef(onSavePayload)

  useEffect(() => {
    getDataFromPayloadRef.current = resolveDataFromPayload
    onDataChangeRef.current = onDataChange
    onLoadPayloadRef.current = onLoadPayload
    onSavePayloadRef.current = onSavePayload
  }, [resolveDataFromPayload, onDataChange, onLoadPayload, onSavePayload])

  function clearAutosaveTimer() {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
  }

  const hydrateData = useCallback(
    (nextData: PuckPageData) => hydratePuckMedia(nextData, blockSchema, lexicalBlockSchema),
    [blockSchema, lexicalBlockSchema],
  )

  useEffect(() => {
    let cancelled = false

    async function loadLatest() {
      setStatus('loading')
      setMessage(null)
      try {
        const res = await fetch(apiPath, { cache: 'no-store' })
        if (!res.ok) throw new Error(await res.text())
        const payload = (await res.json()) as TPayload
        const nextData = await hydrateData(getDataFromPayloadRef.current(payload))
        if (!cancelled) {
          const nextSnapshot = serializePuckData(nextData)
          savedDataSnapshotRef.current = nextSnapshot
          latestDataSnapshotRef.current = nextSnapshot
          setData(nextData)
          setIsDirty(false)
          setLastPayload(payload)
          onLoadPayloadRef.current?.(payload, nextData)
          onDataChangeRef.current?.(nextData)
          setStatus('idle')
        }
      } catch (error) {
        const fallbackData = await hydrateData(initialData)
        if (!cancelled) {
          const fallbackSnapshot = serializePuckData(fallbackData)
          savedDataSnapshotRef.current = fallbackSnapshot
          latestDataSnapshotRef.current = fallbackSnapshot
          setData(fallbackData)
          setIsDirty(false)
          onDataChangeRef.current?.(fallbackData)
          setStatus('error')
          setMessage(error instanceof Error ? error.message : loadingLabel)
        }
      }
    }

    void loadLatest()

    return () => {
      cancelled = true
      clearAutosaveTimer()
    }
  }, [apiPath, blockSchema, hydrateData, initialData, lexicalBlockSchema, loadingLabel])

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
      const res = await fetch(apiPath, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: nextData }),
      })

      if (!res.ok) throw new Error(await res.text())
      const payload = (await res.json()) as TPayload
      const savedData = await hydrateData(getDataFromPayloadRef.current(payload, nextData))
      const savedSnapshot = serializePuckData(savedData)
      savedDataSnapshotRef.current = savedSnapshot
      setLastPayload(payload)
      onSavePayloadRef.current?.(payload, savedData)

      if (latestDataSnapshotRef.current === submittedSnapshot) {
        latestDataSnapshotRef.current = savedSnapshot
        setData(savedData)
        setIsDirty(false)
        onDataChangeRef.current?.(savedData)
      } else {
        setIsDirty(true)
      }

      setStatus('saved')
      setMessage(savedMessage)
      return true
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : saveErrorMessage)
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
    }, autosaveIntervalMs)
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

  if (!data) {
    return <div className={styles.loading}>{loadingLabel}</div>
  }

  const context: VisualDocumentEditorContext<TPayload> = {
    data,
    isDirty,
    lastPayload,
    save,
    saveLatestData,
    setMessage,
    setStatus,
    status,
  }
  const statusState = externalStatus || status
  const statusContent = statusMessage?.(context)
    ?? externalMessage
    ?? (status === 'saving'
      ? savingMessage
      : isDirty
        ? autosave ? 'Autosave pending...' : null
        : message)
  const puck = (
    <Puck
      config={config}
      data={data}
      headerTitle={headerTitle}
      height={height}
      onChange={(nextData) => {
        const nextPuckData = nextData as PuckPageData
        const nextSnapshot = serializePuckData(nextPuckData)
        const hasUnsavedChanges = nextSnapshot !== savedDataSnapshotRef.current

        latestDataSnapshotRef.current = nextSnapshot
        setData(nextPuckData)
        setIsDirty(hasUnsavedChanges)
        onDataChangeRef.current?.(nextPuckData)
        if (autosave && hasUnsavedChanges) {
          scheduleAutosave(nextPuckData)
        } else if (!hasUnsavedChanges) {
          clearAutosaveTimer()
        }
        if (status === 'saved' || status === 'error') {
          setStatus('idle')
          setMessage(null)
        }
      }}
      onPublish={(nextData) => void save(nextData)}
      overrides={overrides}
      plugins={plugins}
      renderHeaderActions={() => (
        <>
          {renderHeaderActions
            ? renderHeaderActions(context)
            : <DefaultHeaderActions context={context} label={saveButtonLabel} />}
        </>
      )}
      viewports={viewports}
    />
  )

  return (
    <div className={styles.wrapper} data-document-type={documentType} style={wrapperStyle}>
      {toolbar ? (
        <PuckRichTextToolbarProvider target={richTextToolbarTarget}>
          {puck}
        </PuckRichTextToolbarProvider>
      ) : puck}
      {sidePanel?.(context)}
      <div className={styles.status} data-state={statusState}>
        {externalBusy ? externalMessage : statusContent}
      </div>
    </div>
  )
}
