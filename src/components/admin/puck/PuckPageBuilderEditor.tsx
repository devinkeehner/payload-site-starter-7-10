'use client'

import type { Field } from '@puckeditor/core'
import React, { useEffect, useState } from 'react'

import type { PuckBlockSchema, PuckFieldSchema } from '@/lib/puck/types'

import { PuckLexicalTextEditor } from './PuckLexicalTextEditor'
import { PuckMediaField } from './PuckMediaField'
import styles from './puck-page-builder.module.css'

function flattenFields(fields: PuckFieldSchema[]): PuckFieldSchema[] {
  return fields.flatMap((field) => (field.name === '__row' ? flattenFields(field.fields || []) : [field]))
}

function buildOptionList(options: PuckFieldSchema['options'] = []) {
  return options.map((option) => ({
    label: option.label || String(option.value),
    value: option.value as string,
  }))
}

function getDefaultValue(field: PuckFieldSchema): unknown {
  if (typeof field.defaultValue !== 'undefined') return field.defaultValue

  switch (field.type) {
    case 'array':
    case 'blocks':
      return []
    case 'checkbox':
      return false
    case 'group':
      return buildDefaults(field.fields || [])
    case 'number':
      return 0
    case 'richText':
      return {
        root: {
          type: 'root',
          children: [{ type: 'paragraph', children: [], direction: null, format: '', indent: 0, version: 1 }],
          direction: null,
          format: '',
          indent: 0,
          version: 1,
        },
      }
    default:
      return ''
  }
}

function createField(field: PuckFieldSchema, blockSchema: PuckBlockSchema[]): Field | null {
  if (['id', 'blockType', 'blockName'].includes(field.name)) return null

  switch (field.type) {
    case 'checkbox':
      return { type: 'radio', label: field.label || field.name, options: [{ label: 'Yes', value: true }, { label: 'No', value: false }] }
    case 'email':
    case 'text':
      return { type: 'text', label: field.label || field.name }
    case 'textarea':
      return { type: 'textarea', label: field.label || field.name }
    case 'number':
      return { type: 'number', label: field.label || field.name }
    case 'select':
    case 'radio':
      return { type: 'select', label: field.label || field.name, options: buildOptionList(field.options) }
    case 'upload':
      return {
        type: 'custom',
        label: field.label || field.name,
        render: ({ value, onChange, readOnly }) => <PuckMediaField value={value} onChange={onChange} readOnly={readOnly} />,
      }
    case 'relationship':
      return {
        type: 'custom',
        label: field.label || field.name,
        render: ({ value, onChange, readOnly }) => <JsonEditor value={value} onChange={onChange} readOnly={readOnly} />,
      }
    case 'array':
      return {
        type: 'array',
        label: field.label || field.name,
        min: field.minRows,
        max: field.maxRows,
        defaultItemProps: () => buildDefaults(flattenFields(field.fields || [])),
        getItemSummary: (item, index) => {
          const record = item as Record<string, unknown>
          const label = record.heading || record.title || record.label || record.name || record.text
          return label ? String(label) : `Item ${(index ?? 0) + 1}`
        },
        arrayFields: buildFields(field.fields || [], blockSchema),
      }
    case 'group':
      return { type: 'object', label: field.label || field.name, objectFields: buildFields(field.fields || [], blockSchema) }
    case 'blocks':
      if (field.name === 'leftBlocks' || field.name === 'centerBlocks' || field.name === 'rightBlocks') return null
      return {
        type: 'custom',
        label: field.label || field.name,
        render: ({ value, onChange, readOnly }) => <JsonEditor value={value} onChange={onChange} readOnly={readOnly} />,
      }
    case 'richText':
      return {
        type: 'custom',
        label: field.label || field.name,
        render: ({ value, onChange, readOnly }) => (
          <PuckLexicalTextEditor blockSchemas={blockSchema} value={value} onChange={onChange} readOnly={readOnly} />
        ),
      }
    default:
      return {
        type: 'custom',
        label: field.label || field.name,
        render: ({ value, onChange, readOnly }) => <JsonEditor value={value} onChange={onChange} readOnly={readOnly} />,
      }
  }
}

export function buildFields(fields: PuckFieldSchema[], blockSchema: PuckBlockSchema[]): Record<string, Field> {
  return flattenFields(fields).reduce<Record<string, Field>>((acc, field) => {
    const puckField = createField(field, blockSchema)
    if (puckField) acc[field.name] = puckField
    return acc
  }, {})
}

export function buildDefaults(fields: PuckFieldSchema[]): Record<string, unknown> {
  return flattenFields(fields).reduce<Record<string, unknown>>((acc, field) => {
    acc[field.name] = getDefaultValue(field)
    return acc
  }, {})
}

function JsonEditor({
  value,
  onChange,
  readOnly,
}: {
  value: unknown
  onChange: (value: unknown) => void
  readOnly?: boolean
}) {
  const [draft, setDraft] = useState(() => JSON.stringify(value ?? null, null, 2))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDraft(JSON.stringify(value ?? null, null, 2))
  }, [value])

  return (
    <div className={styles.jsonField}>
      <textarea
        value={draft}
        readOnly={readOnly}
        onChange={(event) => {
          const next = event.target.value
          setDraft(next)
          try {
            onChange(JSON.parse(next))
            setError(null)
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Invalid JSON')
          }
        }}
      />
      {error ? <div className={styles.fieldError}>{error}</div> : null}
    </div>
  )
}
