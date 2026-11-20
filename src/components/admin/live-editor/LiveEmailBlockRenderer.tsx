'use client'

import React, { type CSSProperties, type ReactNode } from 'react'
import type { PuckBlockSchema, PuckFieldSchema } from '@/lib/puck/types'
import { flattenUnsteadyFields } from '@/lib/live-editor/catalog'
import { getEmailGridColumnFields } from '@/lib/live-editor/document'
import { getFormRowWidths } from '@/lib/live-editor/formRowWidths'
import { FormBlockPreview } from '../form/FormBlockPreview'
import { LiveEmailBlockPreview } from './LiveEmailBlockPreview'
import type { LiveEditorKind } from './editorVariants'
import styles from './live-editor.module.css'
import dynamic from 'next/dynamic'

const LegacyPostBlock = dynamic(() => import('../post/PuckPostBlockPreview').then(module => module.PuckPostBlockPreview))

type BlockRecord = Record<string, unknown>
export type LiveEmailTextRenderer = (
  owner: BlockRecord,
  field: string,
  path: Array<string | number>,
  storage: 'plain' | 'native',
  label?: string,
) => ReactNode

function record(value: unknown): value is BlockRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && !React.isValidElement(value))
}

// These fields are rendered as text by the existing native email previews.
// URLs, alternate text, markdown, uploads and relationships keep their native values.
const visibleTextFields = new Set(['logoText', 'subtitle', 'text', 'beforeText', 'afterText', 'markdown', 'label', 'primaryLabel', 'secondaryLabel', 'title', 'body', 'heading', 'linkLabel', 'caption', 'address', 'copyright', 'town'])

export function mapLiveEmailFields(block: BlockRecord, schema: PuckBlockSchema | undefined, mapField: (
  owner: BlockRecord, field: PuckFieldSchema, path: Array<string | number>,
) => unknown): BlockRecord {
  function visit(owner: BlockRecord, fields: PuckFieldSchema[], path: Array<string | number>): BlockRecord {
    const projected = { ...owner }
    for (const field of flattenUnsteadyFields(fields)) {
      const value = owner[field.name]
      const at = [...path, field.name]
      if (field.type === 'array' && Array.isArray(value)) projected[field.name] = value.map((item, index) => record(item) ? visit(item, field.fields || [], [...at, index]) : item)
      else if (field.type === 'group' && record(value)) projected[field.name] = visit(value, field.fields || [], at)
      else {
        const next = mapField(owner, field, at)
        if (next !== value) projected[field.name] = next
      }
    }
    return projected
  }
  return visit(block, schema?.fields || [], [])
}

/** Display-only projection: editor elements and resolved media stay out of history and saves. */
export function projectLiveEmailText(block: BlockRecord, schema: PuckBlockSchema | undefined, renderText: LiveEmailTextRenderer, resolveMedia: (value: unknown) => unknown = value => value): BlockRecord {
  return mapLiveEmailFields(block, schema, (owner, field, path) => {
    const value = owner[field.name]
    const label = field.label || field.name
    if (field.type === 'richText') return renderText(owner, field.name, path, 'native', label)
    if (['text', 'textarea'].includes(field.type) && visibleTextFields.has(field.name) && !(block.blockType === 'emailVideo' && field.name === 'title' && typeof value === 'string' && value.trim().toLowerCase() === 'watch this video')) return renderText(owner, field.name, path, 'plain', label)
    if (field.type === 'upload' && field.relationTo === 'media') return resolveMedia(value)
    return value
  })
}

export function LiveEmailBlockRenderer({ block, schemas, kind, insideRow, renderSlot, renderText, resolveMedia, postContent }: {
  block: BlockRecord
  schemas: PuckBlockSchema[]
  kind: LiveEditorKind
  insideRow: boolean
  renderSlot: (ownerId: string, path: string) => ReactNode
  renderText: LiveEmailTextRenderer
  resolveMedia: (value: unknown) => unknown
  postContent?: unknown
}) {
  const blockType = String(block.blockType || '')
  const schema = schemas.find(candidate => candidate.slug === blockType)
  if (!schema) return <p role="status">{blockType || 'Unknown block'} is preserved. Its block schema is unavailable.</p>
  if (kind === 'form') {
    if (blockType === 'emailGrid') {
      const widths = getFormRowWidths(block)
      const remainder = 100 - widths.reduce((total, width) => total + width, 0)
      const columns = [...widths, ...(remainder > 1 ? [remainder] : [])]
        .map(width => `minmax(0, ${width}fr)`).join(' ')
      return <div className={styles.formRow} style={{ '--form-columns': columns } as CSSProperties}>
        {getEmailGridColumnFields(block.layout).map(path => renderSlot(String(block.id), path))}
      </div>
    }
    const projected = mapLiveEmailFields(block, schema, (owner, field, path) => {
      if (field.type === 'richText') return renderText(owner, field.name, path, 'native', field.label || field.name)
      if (field.type === 'upload' && field.relationTo === 'media') return resolveMedia(owner[field.name])
      return owner[field.name]
    })
    return <FormBlockPreview blockType={blockType} props={insideRow ? { ...projected, width: 100 } : projected} />
  }
  if (blockType.startsWith('post')) {
    const projected = mapLiveEmailFields(block, schema, (owner, field) =>
      field.type === 'upload' && field.relationTo === 'media' ? resolveMedia(owner[field.name]) : owner[field.name])
    if (blockType === 'postBody') projected.content = postContent
    const columns = blockType === 'postGrid' ? getEmailGridColumnFields(block.layout).map(path => renderSlot(String(block.id), path)) : undefined
    return <LegacyPostBlock blockType={blockType} props={projected}>{columns}</LegacyPostBlock>
  }
  const projected = projectLiveEmailText(block, schema, renderText, resolveMedia)
  const columns = blockType === 'emailGrid' ? getEmailGridColumnFields(block.layout).map(path => renderSlot(String(block.id), path)) : undefined
  return <div data-live-editor-block-preview={blockType} onSubmitCapture={event => { event.preventDefault(); event.stopPropagation() }}>
    <LiveEmailBlockPreview blockType={blockType} props={projected}>{columns}</LiveEmailBlockPreview>
  </div>
}
