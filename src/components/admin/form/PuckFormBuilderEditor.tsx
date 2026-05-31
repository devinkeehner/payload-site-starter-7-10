'use client'

import '@puckeditor/core/puck.css'

import { createUsePuck, Drawer, DropZone, fieldsPlugin, Puck, type Config, type Data, type Plugin } from '@puckeditor/core'
import React, { useEffect, useMemo, useState } from 'react'

import { buildDefaults, buildFields } from '@/components/admin/puck/PuckPageBuilderEditor'
import styles from '@/components/admin/puck/puck-page-builder.module.css'
import { hydratePuckMedia } from '@/lib/puck/mediaHydration'
import type { PuckBlockSchema, PuckFormDoc, PuckPageData } from '@/lib/puck/types'

import { PuckFormBlockPreview } from './PuckFormBlockPreview'

const useFormBuilderPuck = createUsePuck()

const FIELD_ORDER = [
  'text',
  'textarea',
  'email',
  'number',
  'select',
  'radio',
  'checkbox',
  'checkbox-group',
  'message',
  'image-select',
  'video-capture',
  'state',
  'country',
]

const FIELD_LABELS: Record<string, string> = {
  'checkbox-group': 'Checkboxes',
  'image-select': 'Image Choice',
  'video-capture': 'Video',
  checkbox: 'Checkbox',
  country: 'Country',
  email: 'Email',
  message: 'Message',
  number: 'Number',
  radio: 'Radio',
  select: 'Select',
  state: 'State',
  text: 'Text',
  textarea: 'Textarea',
}

const FIELD_DESCRIPTIONS: Record<string, string> = {
  'checkbox-group': 'Multi choice',
  'image-select': 'Image cards',
  'video-capture': 'Camera upload',
  checkbox: 'Single yes/no',
  country: 'Country menu',
  email: 'Email input',
  message: 'Display text',
  number: 'Number input',
  radio: 'One choice',
  select: 'Dropdown',
  state: 'State menu',
  text: 'Short answer',
  textarea: 'Long answer',
}

const FORM_ROW_DROPZONE_MIN_HEIGHT = 94

const FORM_ROW_PRESETS = [
  { columns: [1], label: '1 Column', slug: 'formRowOneColumn' },
  { columns: [1, 1], label: '2 Columns', slug: 'formRowTwoColumns' },
  { columns: [2, 1], label: 'Left Wide', slug: 'formRowLeftWide' },
  { columns: [1, 2], label: 'Right Wide', slug: 'formRowRightWide' },
  { columns: [1, 1, 1], label: '3 Columns', slug: 'formRowThreeColumns' },
  { columns: [1, 1, 1, 1], label: '4 Columns', slug: 'formRowFourColumns' },
]

const FORM_ROW_PRESET_MAP = FORM_ROW_PRESETS.reduce<Record<string, typeof FORM_ROW_PRESETS[number]>>((acc, preset) => {
  acc[preset.slug] = preset
  return acc
}, {})

export type PuckFormBuilderProps = {
  blockSchema: PuckBlockSchema[]
  formId: string
  initialData: PuckPageData
  submitButtonLabel?: string | null
  title: string
}

type PuckFormPayload = {
  data: PuckPageData
  form: PuckFormDoc
}

function getPaletteSlugs(blockSchema: PuckBlockSchema[]) {
  const available = new Set(blockSchema.map((block) => block.slug))
  return FIELD_ORDER.filter((slug) => available.has(slug))
}

function getRowZoneName(index: number) {
  return `column${index}`
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

function FormBuilderStartClosed() {
  const dispatch = useFormBuilderPuck((state) => state.dispatch)

  useEffect(() => {
    dispatch({
      recordHistory: false,
      type: 'setUi',
      ui: {
        leftSideBarVisible: false,
      },
    })
  }, [dispatch])

  return null
}

function FormBuilderPuckShell({ children }: { children?: React.ReactNode }) {
  return (
    <>
      <FormBuilderStartClosed />
      {children}
    </>
  )
}

function FieldIcon({ name }: { name: string }) {
  const common = {
    className: styles.formPaletteSvg,
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 2,
    viewBox: '0 0 24 24',
  }

  switch (name) {
    case 'textarea':
      return <svg {...common}><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M7 9h10M7 12h8M7 15h6" /></svg>
    case 'email':
      return <svg {...common}><rect x="3.5" y="6" width="17" height="12" rx="2" /><path d="m4.5 8 7.5 5 7.5-5" /></svg>
    case 'number':
      return <svg {...common}><path d="M9 4 7 20M17 4l-2 16M5 9h14M4 15h14" /></svg>
    case 'select':
      return <svg {...common}><rect x="4" y="6" width="16" height="12" rx="2" /><path d="m8 10 4 4 4-4" /></svg>
    case 'radio':
      return <svg {...common}><circle cx="8" cy="8" r="3" /><circle cx="8" cy="16" r="3" /><path d="M13 8h7M13 16h7" /></svg>
    case 'checkbox':
      return <svg {...common}><rect x="4" y="5" width="14" height="14" rx="2" /><path d="m8 12 3 3 7-8" /></svg>
    case 'checkbox-group':
      return <svg {...common}><rect x="3" y="5" width="5" height="5" rx="1" /><rect x="3" y="14" width="5" height="5" rx="1" /><path d="M11 7.5h10M11 16.5h10" /></svg>
    case 'message':
      return <svg {...common}><path d="M5 5h14v10H8l-3 4V5Z" /><path d="M8 9h8M8 12h5" /></svg>
    case 'image-select':
      return <svg {...common}><rect x="4" y="5" width="16" height="14" rx="2" /><path d="m7 16 4-4 3 3 2-2 3 3" /><circle cx="9" cy="9" r="1" /></svg>
    case 'video-capture':
      return <svg {...common}><rect x="4" y="7" width="12" height="10" rx="2" /><path d="m16 11 4-3v8l-4-3" /></svg>
    case 'state':
      return <svg {...common}><path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11Z" /><circle cx="12" cy="10" r="2" /></svg>
    case 'country':
      return <svg {...common}><circle cx="12" cy="12" r="8" /><path d="M4 12h16M12 4a13 13 0 0 1 0 16M12 4a13 13 0 0 0 0 16" /></svg>
    default:
      return <svg {...common}><path d="M5 7h14M12 7v10M8 17h8" /></svg>
  }
}

function FormDrawerItem({ name }: { children: React.ReactNode; name: string }) {
  const rowPreset = FORM_ROW_PRESET_MAP[name]

  if (rowPreset) {
    return (
      <div className={styles.formPaletteRowItem}>
        <RowSkeleton columns={rowPreset.columns} />
        <strong>{rowPreset.label}</strong>
      </div>
    )
  }

  return (
    <div className={styles.formPaletteItem}>
      <span aria-hidden="true"><FieldIcon name={name} /></span>
      <strong>{FIELD_LABELS[name] || name}</strong>
      <em>{FIELD_DESCRIPTIONS[name] || 'Field'}</em>
    </div>
  )
}

function FormPaletteDrawer({ items }: { items: string[] }) {
  return (
    <div className={styles.emailPalettePanel} data-palette="content">
      <div className={styles.emailPaletteHeader}>
        <strong>Fields</strong>
        <span>Drag fields into the form.</span>
      </div>
      <Drawer>
        {items.map((slug) => (
          <Drawer.Item key={slug} label={FIELD_LABELS[slug] || slug} name={slug}>
            {FormDrawerItem}
          </Drawer.Item>
        ))}
      </Drawer>
    </div>
  )
}

function FormRowsDrawer() {
  return (
    <div className={styles.emailPalettePanel} data-palette="rows">
      <div className={styles.emailPaletteHeader}>
        <strong>Rows</strong>
        <span>Drag a row in, then drop fields into its columns.</span>
      </div>
      <Drawer>
        {FORM_ROW_PRESETS.map((preset) => (
          <Drawer.Item key={preset.slug} label={preset.label} name={preset.slug}>
            {FormDrawerItem}
          </Drawer.Item>
        ))}
      </Drawer>
    </div>
  )
}

function createPlugins(items: string[]): Plugin[] {
  const propertiesPlugin = fieldsPlugin({ desktopSideBar: 'left' }) as Plugin

  return [
    {
      label: 'Fields',
      name: 'fields-palette',
      render: () => <FormPaletteDrawer items={items} />,
    },
    {
      label: 'Rows',
      name: 'rows',
      render: () => <FormRowsDrawer />,
    },
    {
      ...propertiesPlugin,
      label: 'Properties',
    },
  ]
}

function createConfig(
  blockSchema: PuckBlockSchema[],
  submitButtonLabel: string,
  title: string,
): Config {
  const fieldSlugs = getPaletteSlugs(blockSchema)
  const components = blockSchema.reduce<Config['components']>((acc, block) => {
    acc[block.slug] = {
      label: FIELD_LABELS[block.slug] || block.label,
      fields: buildFields(block.fields, []),
      defaultProps: buildDefaults(block.fields),
      render: (props) => (
        <PuckFormBlockPreview
          blockType={block.slug}
          props={props as Record<string, unknown>}
        />
      ),
    }
    return acc
  }, {})

  FORM_ROW_PRESETS.forEach((preset) => {
    components[preset.slug] = {
      label: preset.label,
      defaultProps: {
        columns: preset.columns,
      },
      render: () => {
        const total = preset.columns.reduce((sum, column) => sum + column, 0)

        return (
          <section className={styles.formRowPreview}>
            <div className={styles.formRowPreviewHeader}>
              <span>{preset.label}</span>
              <small>
                {preset.columns.map((column) => `${Math.round((column / total) * 100)}%`).join(' / ')}
              </small>
            </div>
            <div className={styles.formRowPreviewColumns}>
              {preset.columns.map((column, index) => (
                <div key={index} className={styles.formRowPreviewColumn} style={{ flex: column }}>
                  <DropZone
                    allow={fieldSlugs}
                    minEmptyHeight={FORM_ROW_DROPZONE_MIN_HEIGHT}
                    zone={getRowZoneName(index)}
                  />
                </div>
              ))}
            </div>
          </section>
        )
      },
    }
  })

  return {
    root: {
      render: (props: { children?: React.ReactNode }) => (
        <main className={styles.formPreviewRoot}>
          <section className={styles.formPreviewCard}>
            <div className={styles.formPreviewHeading}>
              <span>Form Preview</span>
              <h2>{title}</h2>
            </div>
            <div className={styles.formPreviewFields}>
              {props.children}
            </div>
            <button type="button">{submitButtonLabel || 'Submit'}</button>
          </section>
        </main>
      ),
    },
    categories: {
      Fields: {
        components: fieldSlugs,
        defaultExpanded: true,
      },
      Rows: {
        components: FORM_ROW_PRESETS.map((preset) => preset.slug),
        defaultExpanded: true,
      },
    },
    components,
  }
}

function PuckPreviewIframe({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.previewFrameRoot}>
      {children}
    </div>
  )
}

export function PuckFormBuilderEditor({
  blockSchema,
  formId,
  initialData,
  submitButtonLabel,
  title,
}: PuckFormBuilderProps) {
  const paletteSlugs = useMemo(() => getPaletteSlugs(blockSchema), [blockSchema])
  const config = useMemo(
    () => createConfig(blockSchema, submitButtonLabel || 'Submit', title || 'Untitled form'),
    [blockSchema, submitButtonLabel, title],
  )
  const overrides = useMemo(
    () => ({
      drawerItem: FormDrawerItem,
      iframe: PuckPreviewIframe,
      puck: FormBuilderPuckShell,
    }),
    [],
  )
  const plugins = useMemo(() => createPlugins(paletteSlugs), [paletteSlugs])
  const [data, setData] = useState<PuckPageData | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadLatest() {
      setStatus('loading')
      setMessage(null)
      try {
        const res = await fetch(`/api/puck/forms/${formId}`, { cache: 'no-store' })
        if (!res.ok) throw new Error(await res.text())
        const payload = (await res.json()) as PuckFormPayload
        const nextData = await hydratePuckMedia(payload.data, blockSchema, [])
        if (!cancelled) {
          setData(nextData)
          setStatus('idle')
        }
      } catch (error) {
        const fallbackData = await hydratePuckMedia(initialData, blockSchema, [])
        if (!cancelled) {
          setData(fallbackData)
          setStatus('error')
          setMessage(error instanceof Error ? error.message : 'Unable to load the latest form data')
        }
      }
    }

    void loadLatest()

    return () => {
      cancelled = true
    }
  }, [blockSchema, formId, initialData])

  async function save(nextData: Data) {
    setStatus('saving')
    setMessage(null)
    try {
      const res = await fetch(`/api/puck/forms/${formId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: nextData }),
      })

      if (!res.ok) throw new Error(await res.text())
      await res.json() as PuckFormPayload
      setData(await hydratePuckMedia(nextData as PuckPageData, blockSchema, []))
      setStatus('saved')
      setMessage('Form draft saved.')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Unable to save form')
    }
  }

  if (!data) {
    return <div className={styles.loading}>Loading form builder...</div>
  }

  return (
    <div className={styles.wrapper}>
      <Puck
        config={config}
        data={data}
        headerTitle={`Form Builder: ${title}`}
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
            {status === 'saving' ? 'Saving...' : 'Save Form'}
          </button>
        )}
        viewports={[
          { width: 390, height: 'auto', label: 'Mobile' },
          { width: 760, height: 'auto', label: 'Tablet' },
          { width: 980, height: 'auto', label: 'Desktop' },
        ]}
      />
      <div className={styles.status} data-state={status}>
        {status === 'saving' ? 'Saving form...' : message}
      </div>
    </div>
  )
}
