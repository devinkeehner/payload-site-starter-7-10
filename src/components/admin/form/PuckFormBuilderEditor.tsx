'use client'

import '@puckeditor/core/puck.css'

import { createUsePuck, Drawer, fieldsPlugin, Puck, type Config, type Data, type Plugin } from '@puckeditor/core'
import React, { useEffect, useMemo, useState } from 'react'

import { buildDefaults, buildFields } from '@/components/admin/puck/PuckPageBuilderEditor'
import styles from '@/components/admin/puck/puck-page-builder.module.css'
import { formToPuckData } from '@/lib/puck/converters'
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

function FormDrawerItem({ name }: { children: React.ReactNode; name: string }) {
  return (
    <div className={styles.formPaletteItem}>
      <span aria-hidden="true">{FIELD_LABELS[name]?.slice(0, 1) || 'F'}</span>
      <strong>{FIELD_LABELS[name] || name}</strong>
    </div>
  )
}

function FormPaletteDrawer({ items }: { items: string[] }) {
  return (
    <div className={styles.emailPalettePanel} data-palette="content">
      <div className={styles.emailPaletteHeader}>
        <strong>Form Fields</strong>
        <span>Drag fields into the form canvas.</span>
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

function createPlugins(items: string[]): Plugin[] {
  const propertiesPlugin = fieldsPlugin({ desktopSideBar: 'left' }) as Plugin

  return [
    {
      label: 'Fields',
      name: 'fields-palette',
      render: () => <FormPaletteDrawer items={items} />,
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
        components: getPaletteSlugs(blockSchema),
        defaultExpanded: true,
      },
    },
    components: blockSchema.reduce<Config['components']>((acc, block) => {
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
    }, {}),
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
      const payload = (await res.json()) as PuckFormPayload
      setData(await hydratePuckMedia(formToPuckData(payload.form), blockSchema, []))
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
