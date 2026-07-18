'use client'

import React, { useMemo } from 'react'

import {
  createPuckBuilderConfig,
  PuckBuilderShell,
  type VisualPaletteItem,
  type VisualRowPreset,
} from '@/components/admin/puck/PuckBuilderShell'
import styles from '@/components/admin/puck/puck-page-builder.module.css'
import type { PuckBlockSchema, PuckFormDoc, PuckPageData } from '@/lib/puck/types'

import { PuckFormBlockPreview } from './PuckFormBlockPreview'

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

const FIELD_ITEMS: VisualPaletteItem[] = [
  { description: 'Short answer', icon: 'text', kind: 'content', label: 'Text', slug: 'text' },
  { description: 'Long answer', icon: 'textarea', kind: 'content', label: 'Textarea', slug: 'textarea' },
  { description: 'Email input', icon: 'email', kind: 'content', label: 'Email', slug: 'email' },
  { description: 'Number input', icon: 'number', kind: 'content', label: 'Number', slug: 'number' },
  { description: 'Dropdown', icon: 'select', kind: 'content', label: 'Select', slug: 'select' },
  { description: 'One choice', icon: 'radio', kind: 'content', label: 'Radio', slug: 'radio' },
  { description: 'Single yes/no', icon: 'checkbox', kind: 'content', label: 'Checkbox', slug: 'checkbox' },
  { description: 'Multi choice', icon: 'checkbox-group', kind: 'content', label: 'Checkboxes', slug: 'checkbox-group' },
  { description: 'Display text', icon: 'message', kind: 'content', label: 'Message', slug: 'message' },
  { description: 'Image cards', icon: 'image-select', kind: 'content', label: 'Image Choice', slug: 'image-select' },
  { description: 'Camera upload', icon: 'video-capture', kind: 'content', label: 'Video', slug: 'video-capture' },
  { description: 'State menu', icon: 'state', kind: 'content', label: 'State', slug: 'state' },
  { description: 'Country menu', icon: 'country', kind: 'content', label: 'Country', slug: 'country' },
]

const FORM_ROWS: VisualRowPreset[] = [
  { columns: [1], label: '1 Column', mode: 'fieldRows', slug: 'formRowOneColumn' },
  { columns: [1, 1], label: '2 Columns', mode: 'fieldRows', slug: 'formRowTwoColumns' },
  { columns: [2, 1], label: 'Left Wide', mode: 'fieldRows', slug: 'formRowLeftWide' },
  { columns: [1, 2], label: 'Right Wide', mode: 'fieldRows', slug: 'formRowRightWide' },
  { columns: [1, 1, 1], label: '3 Columns', mode: 'fieldRows', slug: 'formRowThreeColumns' },
  { columns: [1, 1, 1, 1], label: '4 Columns', mode: 'fieldRows', slug: 'formRowFourColumns' },
]

const FORM_CONFIG_ROWS: VisualRowPreset[] = [
  ...FORM_ROWS,
  {
    allowCustomColumns: true,
    columns: [1],
    hiddenFromPalette: true,
    label: 'Custom Row',
    mode: 'fieldRows',
    slug: 'formRowCustom',
  },
]

const FORM_PALETTE_ITEMS: VisualPaletteItem[] = [
  ...FIELD_ITEMS,
  ...FORM_ROWS.map((row) => ({ kind: 'row' as const, label: row.label, slug: row.slug })),
]

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

export function PuckFormBuilderEditor({
  blockSchema,
  formId,
  initialData,
  submitButtonLabel,
  title,
}: PuckFormBuilderProps) {
  const paletteSlugs = useMemo(() => getPaletteSlugs(blockSchema), [blockSchema])
  const config = useMemo(
    () => createPuckBuilderConfig({
      blockSchema,
      contentSlugs: paletteSlugs,
      dropzoneMinHeight: 94,
      fieldRowDropzoneMinHeight: 94,
      getFieldRowZoneName: getRowZoneName,
      paletteItems: FORM_PALETTE_ITEMS,
      previewRenderer: ({ blockType, props }) => (
        <PuckFormBlockPreview
          blockType={blockType}
          props={props}
        />
      ),
      rootRenderer: (props) => (
        <main className={styles.formPreviewRoot}>
          <section className={styles.formPreviewCard}>
            <div className={styles.formPreviewHeading}>
              <span>Form Preview</span>
              <h2>{title || 'Untitled form'}</h2>
            </div>
            <div className={styles.formPreviewFields}>
              {props.children}
            </div>
            <button type="button">{submitButtonLabel || 'Submit'}</button>
          </section>
        </main>
      ),
      rows: FORM_CONFIG_ROWS,
    }),
    [blockSchema, paletteSlugs, submitButtonLabel, title],
  )

  return (
    <PuckBuilderShell<PuckFormPayload>
      apiPath={`/api/puck/forms/${formId}`}
      blockSchema={blockSchema}
      config={config}
      documentId={formId}
      documentTitle={title}
      documentType="form"
      headerTitle={`Form Builder: ${title}`}
      initialData={initialData}
      loadingLabel="Loading form builder..."
      palette={{
        contentDescription: 'Drag fields into the form.',
        contentSlugs: paletteSlugs,
        contentTitle: 'Fields',
        items: FORM_PALETTE_ITEMS,
        rowDescription: 'Drag a row in, then drop fields into its columns.',
        rowSlugs: FORM_ROWS.map((row) => row.slug),
        rowTitle: 'Rows',
      }}
      previewFrameStyle={{ minHeight: '100%' }}
      rows={FORM_CONFIG_ROWS}
      saveButtonLabel="Save Form"
      saveErrorMessage="Unable to save form"
      savedMessage="Form draft saved."
      savingMessage="Saving form..."
      startSidebarClosed
      viewports={[
        { width: 390, height: 'auto', label: 'Mobile' },
        { width: 760, height: 'auto', label: 'Tablet' },
        { width: 980, height: 'auto', label: 'Desktop' },
      ]}
    />
  )
}
