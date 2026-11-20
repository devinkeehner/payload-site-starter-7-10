import { normalizeFormOptions, slugifyFieldName } from '@/lib/puck/converters'
import { getEmailPuckBlockSchema, getFormPuckBlockSchema } from '@/lib/puck/schema'
import type { PuckBlockSchema } from '@/lib/puck/types'

import { EMAIL_GRID_FIELDS, getEmailGridColumnFields, type BlockRecord } from './document'
import { getFormRowWidths } from './formRowWidths'

const FULL_WIDTH_BLOCK = 'message'
const ROW_BLOCK = 'emailGrid'
const unavailablePlaceholders = new Set(['email', 'text', 'textarea', 'number'])

export function getFormEditorSchema(): PuckBlockSchema[] {
  const fields = getFormPuckBlockSchema().map((block) => ({
    ...block,
    fields: block.fields
      .filter(
        (field) =>
          (field.name !== 'placeholder' || !unavailablePlaceholders.has(block.slug)) &&
          (field.name !== 'defaultValue' || block.slug !== 'email'),
      )
      .map((field) =>
        field.name === 'width'
          ? { name: 'width', type: 'number', label: 'Field width (%)', defaultValue: 100 }
          : field,
      ),
  }))
  const grid = getEmailPuckBlockSchema().find((block) => block.slug === ROW_BLOCK)
  const layoutField = grid?.fields.find((field) => field.name === 'layout')
  if (!layoutField) throw new Error('The shared editor row schema is unavailable.')
  const columnFields = fields.filter((field) => field.slug !== FULL_WIDTH_BLOCK)

  return [
    ...fields,
    {
      slug: ROW_BLOCK,
      label: 'Form row',
      fields: [
        layoutField,
        ...EMAIL_GRID_FIELDS.map((name) => ({
          name,
          type: 'blocks',
          blocks: columnFields,
          maxRows: 1,
        })),
      ],
    },
  ]
}

const isBlock = (value: unknown): value is BlockRecord =>
  Boolean(
    value &&
      typeof value === 'object' &&
      'blockType' in value &&
      typeof value.blockType === 'string' &&
      value.blockType,
  )

function nativeWidth(value: unknown) {
  const width = typeof value === 'string' && value.trim() ? Number(value) : value
  return typeof width === 'number' && Number.isFinite(width)
    ? Math.max(1, Math.min(width, 100))
    : undefined
}

function matchingLayout(widths: number[]) {
  switch (widths.length) {
    case 1:
      return 'oneColumn'
    case 3:
      return 'threeColumns'
    case 4:
      return 'fourColumns'
    default: {
      const [left = 50, right = 50] = widths
      if (left >= 65 && right <= 35) return 'twoColumnsLeftWide'
      if (right >= 65 && left <= 35) return 'twoColumnsRightWide'
      return 'twoColumns'
    }
  }
}

/** Build transient editor rows from the form's existing flat width-based layout. */
export function formFieldsToEditorLayout(fields: unknown): BlockRecord[] {
  const layout: BlockRecord[] = []
  if (!Array.isArray(fields)) return layout
  let row: BlockRecord[] = []
  let widths: number[] = []
  let total = 0
  const flush = () => {
    if (row.length > EMAIL_GRID_FIELDS.length) {
      // The shared editor has at most four columns. Keep unusual native widths intact.
      layout.push(...row)
    } else if (row.length) {
      const layoutType = matchingLayout(widths)
      const grid: BlockRecord = {
        blockType: ROW_BLOCK,
        layout: layoutType,
        formColumnWidths: widths,
        formWidthLayout: layoutType,
      }
      getEmailGridColumnFields(layoutType).forEach((column, index) => {
        grid[column] = [row[index]]
      })
      layout.push(grid)
    }
    row = []
    widths = []
    total = 0
  }
  for (const field of fields) {
    if (!isBlock(field)) {
      flush()
      continue
    }
    const width = nativeWidth(field.width) ?? 100
    if (width >= 99 || field.blockType === FULL_WIDTH_BLOCK) {
      flush()
      layout.push(field)
      continue
    }
    if (total + width > 101) flush()
    row.push(field)
    widths.push(width)
    total += width
    if (total >= 99) flush()
  }
  flush()
  return layout
}

function flattenFormRows(layout: unknown): BlockRecord[] {
  if (!Array.isArray(layout) || layout.some((block) => !isBlock(block))) {
    throw new Error('Invalid form layout. Expected an array of fields and rows.')
  }
  return layout.flatMap<BlockRecord>((block: BlockRecord) => {
    if (block.blockType !== ROW_BLOCK) {
      const width = nativeWidth(block.width)
      return width === undefined ? { ...block } : { ...block, width }
    }
    const widths = getFormRowWidths(block)
    const columns = getEmailGridColumnFields(block.layout)
    for (const name of EMAIL_GRID_FIELDS) {
      const items = block[name]
      if (items == null) continue
      if (!Array.isArray(items)) throw new Error('Invalid form row column.')
      if (items.length && !columns.includes(name)) {
        throw new Error(
          'A form row has a field in a hidden column. Restore the columns and move the field before saving.',
        )
      }
      if (items.length > 1) throw new Error('Each form row column can hold one field.')
    }
    return columns.flatMap((name, index) => {
      const items = block[name] as unknown[] | null | undefined
      if (!items?.length) return []
      const field = items[0]
      if (
        !isBlock(field) ||
        field.blockType === ROW_BLOCK ||
        field.blockType === FULL_WIDTH_BLOCK
      ) {
        throw new Error('Form row columns only support individual input fields.')
      }
      return { ...field, width: widths[index] }
    })
  })
}

const submissionName = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value : undefined

/** Preserve submission names on existing fields even when reordered or duplicated. */
export function editorLayoutToFormFields(layout: unknown, previousFields?: unknown): BlockRecord[] {
  const flat = flattenFormRows(layout)
  const previous = new Map<string, string>()
  if (Array.isArray(previousFields)) {
    for (const field of previousFields) {
      if (!isBlock(field) || field.id == null) continue
      const name = submissionName(field.name)
      if (name) previous.set(String(field.id), name)
    }
  }

  const used = new Set<string>()
  for (const field of flat) {
    const name = submissionName(field.name)
    if (name && previous.get(String(field.id)) === name) used.add(name)
  }
  return flat.map((field, index) => {
    if (field.blockType === FULL_WIDTH_BLOCK) return field
    const type = field.blockType || 'field'
    if ('options' in field) field.options = normalizeFormOptions(field.options, type)
    const currentName = submissionName(field.name)
    if (currentName && previous.get(String(field.id)) === currentName) return field
    const baseName = slugifyFieldName(currentName || field.label, `${type}${index + 1}`)
    let name = baseName
    for (let suffix = 2; used.has(name); suffix++) name = `${baseName}${suffix}`
    used.add(name)
    return { ...field, name }
  })
}
