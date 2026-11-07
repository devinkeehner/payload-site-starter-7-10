'use client'

import React, { type ReactNode } from 'react'
import type { PuckBlockSchema, PuckFieldSchema } from '@/lib/puck/types'
import { getEmailGridColumnFields } from '@/lib/live-editor/document'
import { LiveEmailBlockPreview } from './LiveEmailBlockPreview'

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

/** Display-only projection: editor elements never enter the saved email document. */
export function projectLiveEmailText(block: BlockRecord, schema: PuckBlockSchema | undefined, renderText: LiveEmailTextRenderer): BlockRecord {
  function visit(owner: BlockRecord, fields: PuckFieldSchema[], path: Array<string | number>): BlockRecord {
    const projected = { ...owner }
    const flattened = (definitions: PuckFieldSchema[]): PuckFieldSchema[] => definitions.flatMap(field => ['row', 'collapsible', 'tabs'].includes(field.type) ? flattened(field.fields || []) : [field])
    for (const field of flattened(fields)) {
      const value = owner[field.name]
      const at = [...path, field.name]
      if (field.type === 'richText') projected[field.name] = renderText(owner, field.name, at, 'native', field.label || field.name)
      else if (['text', 'textarea'].includes(field.type) && visibleTextFields.has(field.name) && !(block.blockType === 'emailVideo' && field.name === 'title' && typeof value === 'string' && value.trim().toLowerCase() === 'watch this video')) projected[field.name] = renderText(owner, field.name, at, 'plain', field.label || field.name)
      else if (field.type === 'array' && Array.isArray(value)) projected[field.name] = value.map((item, index) => record(item) ? visit(item, field.fields || [], [...at, index]) : item)
      else if (field.type === 'group' && record(value)) projected[field.name] = visit(value, field.fields || [], at)
    }
    return projected
  }
  return visit(block, schema?.fields || [], [])
}

export function LiveEmailBlockRenderer({ block, schemas, renderSlot, renderText }: {
  block: BlockRecord
  schemas: PuckBlockSchema[]
  renderSlot: (ownerId: string, path: string) => ReactNode
  renderText: LiveEmailTextRenderer
}) {
  const blockType = String(block.blockType || '')
  const schema = schemas.find(candidate => candidate.slug === blockType)
  if (!schema) return <p role="status">{blockType || 'Unknown email block'} is preserved. Its block schema is unavailable.</p>
  const projected = projectLiveEmailText(block, schema, renderText)
  const columns = blockType === 'emailGrid' ? getEmailGridColumnFields(block.layout).map(path => renderSlot(String(block.id), path)) : undefined
  return <div data-live-editor-block-preview={blockType} onSubmitCapture={event => { event.preventDefault(); event.stopPropagation() }}>
    <LiveEmailBlockPreview blockType={blockType} props={projected}>{columns}</LiveEmailBlockPreview>
  </div>
}
