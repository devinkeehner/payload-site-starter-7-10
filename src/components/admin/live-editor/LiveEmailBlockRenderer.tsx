'use client'

import React, { type CSSProperties, type ReactNode } from 'react'
import type { PuckBlockSchema, PuckFieldSchema } from '@/lib/puck/types'
import { flattenUnsteadyFields } from '@/lib/live-editor/catalog'
import { getEmailGridColumnFields } from '@/lib/live-editor/document'
import { getFormRowWidths } from '@/lib/live-editor/formRowWidths'
import { FormBlockPreview } from '../form/FormBlockPreview'
import { LiveEmailBlockPreview } from './LiveEmailBlockPreview'
import { SectionElement } from '@/components/blocks/composable-section/SectionElement'
import { DesignedSection } from '@/components/blocks/composable-section/DesignedSection'
import sectionStyles from '@/components/blocks/composable-section/section.module.css'
import { PAGE_SECTION } from '@/lib/live-editor/pageSections'
import { findBlockSchema } from '@/lib/live-editor/document'
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

export function LiveEmailBlockRenderer({ block, schemas, kind, insideRow, renderSlot, renderText, resolveMedia, postContent, renderDesignField }: {
  block: BlockRecord
  schemas: PuckBlockSchema[]
  kind: LiveEditorKind
  insideRow: boolean
  renderSlot: (ownerId: string, path: string) => ReactNode
  renderText: LiveEmailTextRenderer
  resolveMedia: (value: unknown) => unknown
  postContent?: unknown
  renderDesignField: (block: BlockRecord) => ReactNode
}) {
  const blockType = String(block.blockType || '')
  const schema = findBlockSchema(blockType, schemas)
  if (!schema) return <p role="status">{blockType || 'Unknown block'} is preserved. Its block schema is unavailable.</p>
  if (kind === 'page') {
    if (blockType === PAGE_SECTION || blockType.startsWith('section')) {
      return <SectionElement block={block} editing resolveMedia={resolveMedia}
        text={name => renderText(block, name, [name], 'plain', name === 'text' ? schema.label : name)}
        richText={schema.fields.some(field => field.name === 'body') ? renderText(block, 'body', ['body'], 'native', 'Body') : undefined}
        form={blockType === 'sectionForm' && block.form ? <span>{typeof block.form === 'object' && 'title' in block.form ? String(block.form.title) : 'Linked form'}</span> : undefined}>
        {block.blockType === PAGE_SECTION && block.design != null && Array.isArray(block.children)
          ? <DesignedSection layout={block.design} blocks={block.children} renderField={renderDesignField}
              className={sectionStyles.designNode} gridClassName={sectionStyles.designGrid} />
          : schema.fields.some(field => field.name === 'children') ? renderSlot(String(block.id), 'children') : undefined}
      </SectionElement>
    }
    const headline = [block.heading, block.title, block.blockName].find(value => typeof value === 'string')
    return <div data-live-editor-legacy-page-block={blockType}><strong>{schema.label}</strong>{typeof headline === 'string' && <p>{headline}</p>}<p>See this block in the site preview.</p></div>
  }
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
