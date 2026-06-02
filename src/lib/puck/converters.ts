import type { ComponentData } from '@puckeditor/core'

import type { PuckEmailDoc, PuckFormDoc, PuckPageBlock, PuckPageData, PuckPageDoc, PuckPostDoc } from './types'

const FALLBACK_HERO = {
  type: 'none',
  callToAction: {
    type: 'custom',
    label: '',
    url: '',
  },
}

const MEDIA_DOCUMENT_MARKER_KEYS = new Set([
  'filename',
  'filesize',
  'mimeType',
  'sizes',
  'thumbnailURL',
])

const LINK_APPEARANCES = new Set([
  'default',
  'outline',
  'primary',
  'primaryOutline',
  'accent',
  'accentOutline',
  'background',
  'backgroundOutline',
  'foreground',
  'foregroundOutline',
  'white',
  'whiteOutline',
])

const COLUMNS_BLOCK_TYPE = 'columnsBlock'
const EMAIL_GRID_BLOCK_TYPE = 'emailGrid'
const EMAIL_ROW_COMPONENT_TO_LAYOUT: Record<string, string> = {
  emailRowFourColumns: 'fourColumns',
  emailRowLeftWide: 'twoColumnsLeftWide',
  emailRowOneColumn: 'oneColumn',
  emailRowRightWide: 'twoColumnsRightWide',
  emailRowThreeColumns: 'threeColumns',
  emailRowTwoColumns: 'twoColumns',
}
const POST_ROW_COMPONENT_TO_LAYOUT: Record<string, string> = {
  postRowFourColumns: 'fourColumns',
  postRowLeftWide: 'twoColumnsLeftWide',
  postRowOneColumn: 'oneColumn',
  postRowRightWide: 'twoColumnsRightWide',
  postRowThreeColumns: 'threeColumns',
  postRowTwoColumns: 'twoColumns',
}
const EMAIL_ROW_LAYOUT_TO_COMPONENT = Object.entries(EMAIL_ROW_COMPONENT_TO_LAYOUT)
  .reduce<Record<string, string>>((acc, [componentType, layout]) => {
    acc[layout] = componentType
    return acc
  }, {})
const POST_ROW_LAYOUT_TO_COMPONENT = Object.entries(POST_ROW_COMPONENT_TO_LAYOUT)
  .reduce<Record<string, string>>((acc, [componentType, layout]) => {
    acc[layout] = componentType
    return acc
  }, {})
const EMAIL_GRID_COMPONENT_TYPES = new Set([EMAIL_GRID_BLOCK_TYPE, ...Object.keys(EMAIL_ROW_COMPONENT_TO_LAYOUT)])
const POST_GRID_COMPONENT_TYPES = new Set(['postGrid', ...Object.keys(POST_ROW_COMPONENT_TO_LAYOUT)])
const GRID_BLOCK_TYPES = new Set([
  EMAIL_GRID_BLOCK_TYPE,
  'postGrid',
  ...Object.keys(EMAIL_ROW_COMPONENT_TO_LAYOUT),
  ...Object.keys(POST_ROW_COMPONENT_TO_LAYOUT),
])
const FORM_ROW_COMPONENT_TO_COLUMNS: Record<string, number[]> = {
  formRowFourColumns: [1, 1, 1, 1],
  formRowLeftWide: [2, 1],
  formRowOneColumn: [1],
  formRowRightWide: [1, 2],
  formRowThreeColumns: [1, 1, 1],
  formRowTwoColumns: [1, 1],
}
const FORM_ROW_COMPONENT_TYPES = new Set(Object.keys(FORM_ROW_COMPONENT_TO_COLUMNS))

function getColumnsZoneId(blockId: string, columnIndex: number): string {
  return `${blockId}:columns.${columnIndex}.blocks`
}

function withoutBlockType(block: PuckPageBlock): Record<string, unknown> {
  const { blockType: _blockType, ...props } = block
  return props
}

function getBlockId(block: PuckPageBlock, index: number): string {
  if (block.id != null && String(block.id).length > 0) {
    return String(block.id)
  }
  return `${block.blockType || 'block'}-${index}`
}

function isMediaDocument(value: Record<string, unknown>): boolean {
  return value.id != null && Object.keys(value).some((key) => MEDIA_DOCUMENT_MARKER_KEYS.has(key))
}

function isLexicalEditorState(value: Record<string, unknown>): boolean {
  const root = value.root

  return Boolean(root && typeof root === 'object')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function getEmailGridPuckType(layout: unknown): string {
  return EMAIL_ROW_LAYOUT_TO_COMPONENT[String(layout)] || EMAIL_GRID_BLOCK_TYPE
}

function getPostGridPuckType(layout: unknown): string {
  return POST_ROW_LAYOUT_TO_COMPONENT[String(layout)] || 'postGrid'
}

function normalizePuckBlockType(type: string): string {
  if (EMAIL_GRID_COMPONENT_TYPES.has(type)) return EMAIL_GRID_BLOCK_TYPE
  if (POST_GRID_COMPONENT_TYPES.has(type)) return 'postGrid'
  return type
}

function getRelationshipId(value: unknown): string | number | null {
  if (typeof value === 'string' || typeof value === 'number') {
    return value
  }

  if (!isRecord(value)) return null

  const id = value.id ?? value._id ?? value.value
  return typeof id === 'string' || typeof id === 'number' ? id : null
}

function normalizeReferenceRelationship(value: unknown, fallbackRelationTo = 'pages') {
  if (!value) return null

  if (isRecord(value)) {
    const relationTo = typeof value.relationTo === 'string' && value.relationTo
      ? value.relationTo
      : fallbackRelationTo
    const id = getRelationshipId(value.value)

    if (id != null) {
      return { relationTo, value: id }
    }
  }

  const id = getRelationshipId(value)
  return id != null ? { relationTo: fallbackRelationTo, value: id } : null
}

function normalizeLinkGroup(value: unknown, enabled: boolean): Record<string, unknown> | null {
  if (!enabled || !isRecord(value)) return null

  const type = value.type === 'custom' || value.type === 'reference' ? value.type : null
  const label = typeof value.label === 'string' && value.label.trim() ? value.label.trim() : null

  if (!type || !label) return null

  const appearance = typeof value.appearance === 'string' && LINK_APPEARANCES.has(value.appearance)
    ? value.appearance
    : 'outline'
  const next: Record<string, unknown> = {
    appearance,
    label,
    type,
  }
  if (typeof value.textColor === 'string' && value.textColor) {
    next.textColor = value.textColor
  }

  if (typeof value.newTab === 'boolean') {
    next.newTab = value.newTab
  }

  if (type === 'custom') {
    const url = typeof value.url === 'string' && value.url.trim() ? value.url.trim() : null
    if (!url) return null

    next.url = url
    return next
  }

  const reference = normalizeReferenceRelationship(value.reference)
  if (!reference) return null

  next.reference = reference
  return next
}

function sanitizeCardsGridProps(props: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(props.cards)) return props

  return {
    ...props,
    cards: props.cards.map((card) => {
      if (!isRecord(card)) return card

      const nextCard: Record<string, unknown> = { ...card }
      const link = normalizeLinkGroup(nextCard.link, nextCard.enableLink === true)

      if (link) {
        nextCard.link = link
      } else {
        delete nextCard.link
        nextCard.enableLink = false
      }

      return nextCard
    }),
  }
}

function sanitizePageBlockProps(blockType: string, props: Record<string, unknown>): Record<string, unknown> {
  if (blockType === 'cardsGrid') {
    return sanitizeCardsGridProps(props)
  }

  return props
}

function nestedLayoutToPuckContent(value: unknown): ComponentData<Record<string, unknown>>[] {
  const safeLayout = Array.isArray(value) ? value : []

  return safeLayout
    .filter((block): block is PuckPageBlock => isRecord(block) && typeof block.blockType === 'string')
    .map((block, index) => {
      const id = getBlockId(block, index)
      return {
        type: block.blockType as string,
        id,
        props: {
          ...withoutBlockType(block),
          id,
        },
      }
    })
}

function toPayloadValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(toPayloadValue)
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  const record = value as Record<string, unknown>

  if (isLexicalEditorState(record)) {
    return record
  }

  if (isMediaDocument(record)) {
    return record.id
  }

  return Object.entries(record).reduce<Record<string, unknown>>((acc, [key, entryValue]) => {
    acc[key] = toPayloadValue(entryValue)
    return acc
  }, {})
}

export function pageToPuckData(page: PuckPageDoc): PuckPageData {
  const layout = Array.isArray(page.layout) ? page.layout : []
  const zones: Record<string, ComponentData<Record<string, unknown>>[]> = {}

  return {
    root: {
      props: {
        hero: page.hero || FALLBACK_HERO,
      },
    },
    content: layout
      .filter((block) => block && typeof block.blockType === 'string')
      .map((block, index) => {
        const id = getBlockId(block, index)
        const props = withoutBlockType(block)

        if (block.blockType === COLUMNS_BLOCK_TYPE && Array.isArray(props.columns)) {
          props.columns = props.columns.map((column, columnIndex) => {
            if (!isRecord(column)) return column
            zones[getColumnsZoneId(id, columnIndex)] = nestedLayoutToPuckContent(column.blocks)
            const { blocks: _blocks, ...columnProps } = column
            return columnProps
          })
        }

        return {
          type: block.blockType as string,
          id,
          props: {
            ...props,
            id,
          },
        }
      }),
    zones,
  } as PuckPageData
}

function puckContentToNestedLayout(content: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(content)) return []

  return content
    .filter((item): item is ComponentData<Record<string, unknown>> => Boolean(item?.type))
    .map((item) => {
      const itemRecord = item as ComponentData<Record<string, unknown>> & { id?: string }
      const props: Record<string, unknown> =
        itemRecord.props && typeof itemRecord.props === 'object'
          ? (itemRecord.props as Record<string, unknown>)
          : {}

      return {
        ...(toPayloadValue(props) as Record<string, unknown>),
        id: props.id ?? itemRecord.id ?? undefined,
        blockType: itemRecord.type,
      }
    })
}

export function puckDataToPagePatch(data: PuckPageData): {
  hero: Record<string, unknown>
  layout: Array<Record<string, unknown>>
} {
  const rootProps = data.root && typeof data.root === 'object' && 'props' in data.root
    ? (data.root.props as Record<string, unknown> | undefined)
    : undefined
  const hero = rootProps?.hero && typeof rootProps.hero === 'object'
    ? (toPayloadValue(rootProps.hero) as Record<string, unknown>)
    : FALLBACK_HERO

  const content = Array.isArray(data.content) ? data.content : []
  const zones = data.zones && typeof data.zones === 'object'
    ? (data.zones as Record<string, unknown>)
    : undefined
  const layout = content
    .filter((item): item is ComponentData<Record<string, unknown>> => Boolean(item?.type))
    .map((item) => {
      const itemRecord = item as ComponentData<Record<string, unknown>> & { id?: string }
      const props: Record<string, unknown> =
        itemRecord.props && typeof itemRecord.props === 'object'
          ? (itemRecord.props as Record<string, unknown>)
          : {}
      const payloadProps = sanitizePageBlockProps(
        itemRecord.type,
        toPayloadValue(props) as Record<string, unknown>,
      )
      const id = props.id ?? itemRecord.id ?? undefined

      if (itemRecord.type === COLUMNS_BLOCK_TYPE && Array.isArray(payloadProps.columns) && id != null) {
        payloadProps.columns = payloadProps.columns.map((column, columnIndex) => {
          if (!isRecord(column)) return column
          return {
            ...column,
            blocks: puckContentToNestedLayout(zones?.[getColumnsZoneId(String(id), columnIndex)]),
          }
        })
      }

      return {
        ...payloadProps,
        id,
        blockType: itemRecord.type,
      }
    })

  return { hero, layout }
}

function layoutToPuckData(layout: unknown[] | null | undefined): PuckPageData {
  const safeLayout = Array.isArray(layout) ? layout : []
  const zones: Record<string, ComponentData<Record<string, unknown>>[]> = {}

  return {
    root: {
      props: {},
    },
    content: safeLayout
      .filter((block): block is PuckPageBlock => isRecord(block) && typeof block.blockType === 'string')
      .map((block, index) => {
        const id = getBlockId(block, index)
        const props = withoutBlockType(block)
        const blockType = String(block.blockType)

        if (GRID_BLOCK_TYPES.has(blockType)) {
          zones[`${id}:left`] = emailLayoutToPuckContent(block.leftBlocks)
          zones[`${id}:center`] = emailLayoutToPuckContent(block.centerBlocks)
          zones[`${id}:right`] = emailLayoutToPuckContent(block.rightBlocks)
          if (blockType === EMAIL_GRID_BLOCK_TYPE || blockType === 'postGrid') {
            zones[`${id}:fourth`] = emailLayoutToPuckContent(block.fourthBlocks)
          }
          delete props.leftBlocks
          delete props.centerBlocks
          delete props.rightBlocks
          delete props.fourthBlocks
        }

        return {
          type: blockType === EMAIL_GRID_BLOCK_TYPE
            ? getEmailGridPuckType(props.layout)
            : blockType === 'postGrid'
              ? getPostGridPuckType(props.layout)
              : blockType,
          props: {
            ...props,
            id,
          },
        }
      }),
    zones,
  } as PuckPageData
}

export function emailToPuckData(email: PuckEmailDoc): PuckPageData {
  const layout = Array.isArray(email.layout)
    ? email.layout.map((block, index) => {
        if (index === 0 && isRecord(block) && block.blockType === 'emailImage') {
          return { ...block, width: 640 }
        }

        return block
      })
    : email.layout

  return layoutToPuckData(layout)
}

export function formToPuckData(form: PuckFormDoc): PuckPageData {
  return formFieldsToPuckData(form.fields)
}

function injectPostContentIntoLayout(layout: unknown, content: PuckPostDoc['content']): unknown {
  if (Array.isArray(layout)) {
    return layout.map((block) => injectPostContentIntoLayout(block, content))
  }

  if (!isRecord(layout)) return layout

  const next: Record<string, unknown> = { ...layout }
  if (next.blockType === 'postBody') {
    next.content = content || null
  }

  for (const key of ['leftBlocks', 'centerBlocks', 'rightBlocks', 'fourthBlocks'] as const) {
    if (Array.isArray(next[key])) {
      next[key] = injectPostContentIntoLayout(next[key], content)
    }
  }

  return next
}

export function postToPuckData(post: PuckPostDoc): PuckPageData {
  const layout = Array.isArray(post.layout) && post.layout.length
    ? injectPostContentIntoLayout(post.layout, post.content) as PuckPageBlock[]
    : [{ blockType: 'postBody', content: post.content || null }]

  return layoutToPuckData(layout)
}

function emailLayoutToPuckContent(value: unknown): ComponentData<Record<string, unknown>>[] {
  const safeLayout = Array.isArray(value) ? value : []

  return safeLayout
    .filter((block): block is PuckPageBlock => isRecord(block) && typeof block.blockType === 'string')
    .map((block, index) => {
      const id = getBlockId(block, index)
      return {
        type: block.blockType as string,
        props: {
          ...withoutBlockType(block),
          id,
        },
      }
    })
}

function puckContentToEmailLayout(
  content: unknown,
  zones: Record<string, unknown> | undefined,
): Array<Record<string, unknown>> {
  if (!Array.isArray(content)) return []

  return content
    .filter((item): item is ComponentData<Record<string, unknown>> => Boolean(item?.type))
    .map((item) => {
      const itemRecord = item as ComponentData<Record<string, unknown>>
      const props: Record<string, unknown> =
        itemRecord.props && typeof itemRecord.props === 'object'
          ? (itemRecord.props as Record<string, unknown>)
          : {}
      const id = typeof props.id === 'string' || typeof props.id === 'number'
        ? String(props.id)
        : undefined
      const componentType = String(itemRecord.type)
      const blockType = normalizePuckBlockType(componentType)
      const payloadBlock: Record<string, unknown> = {
        ...(toPayloadValue(props) as Record<string, unknown>),
        blockType,
      }

      if (EMAIL_ROW_COMPONENT_TO_LAYOUT[componentType] && !payloadBlock.layout) {
        payloadBlock.layout = EMAIL_ROW_COMPONENT_TO_LAYOUT[componentType]
      }
      if (POST_ROW_COMPONENT_TO_LAYOUT[componentType] && !payloadBlock.layout) {
        payloadBlock.layout = POST_ROW_COMPONENT_TO_LAYOUT[componentType]
      }

      if (GRID_BLOCK_TYPES.has(componentType) && id) {
        payloadBlock.leftBlocks = puckContentToEmailLayout(zones?.[`${id}:left`], zones)
        payloadBlock.centerBlocks = puckContentToEmailLayout(zones?.[`${id}:center`], zones)
        payloadBlock.rightBlocks = puckContentToEmailLayout(zones?.[`${id}:right`], zones)
        if (EMAIL_GRID_COMPONENT_TYPES.has(componentType) || POST_GRID_COMPONENT_TYPES.has(componentType)) {
          payloadBlock.fourthBlocks = puckContentToEmailLayout(zones?.[`${id}:fourth`], zones)
        }
      }

      return payloadBlock
    })
}

export function puckDataToLayoutPatch(data: PuckPageData): {
  layout: Array<Record<string, unknown>>
} {
  const zones = data.zones && typeof data.zones === 'object'
    ? (data.zones as Record<string, unknown>)
    : undefined
  const layout = puckContentToEmailLayout(data.content, zones)

  return { layout }
}

export function puckDataToPostPatch(data: PuckPageData): {
  layout: Array<Record<string, unknown>>
} {
  const { layout } = puckDataToLayoutPatch(data)

  return {
    layout: stripPostBodyContentFromLayout(layout),
  }
}

function stripPostBodyContentFromLayout(layout: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return layout.map((block) => {
    const nextBlock: Record<string, unknown> = { ...block }

    if (nextBlock.blockType === 'postBody') {
      delete nextBlock.content
    }

    for (const key of ['leftBlocks', 'centerBlocks', 'rightBlocks', 'fourthBlocks'] as const) {
      if (Array.isArray(nextBlock[key])) {
        nextBlock[key] = stripPostBodyContentFromLayout(
          nextBlock[key].filter((item): item is Record<string, unknown> => isRecord(item)),
        )
      }
    }

    return nextBlock
  })
}

function slugifyFieldName(value: unknown, fallback: string): string {
  const source = typeof value === 'string' && value.trim() ? value : fallback
  const slug = source
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const camel = slug.replace(/-([a-z0-9])/g, (_, char: string) => char.toUpperCase())
  return camel || fallback
}

function normalizeFormFieldName(
  field: Record<string, unknown>,
  blockType: string,
  index: number,
  usedNames: Set<string>,
) {
  if (blockType === 'message') return field

  const baseName = slugifyFieldName(field.name || field.label, `${blockType}${index + 1}`)
  let nextName = baseName
  let suffix = 2

  while (usedNames.has(nextName)) {
    nextName = `${baseName}${suffix}`
    suffix += 1
  }

  usedNames.add(nextName)
  return {
    ...field,
    name: nextName,
  }
}

function normalizeFormOptions(value: unknown, fallbackBase = 'option') {
  if (!Array.isArray(value)) return value

  return value.map((option, index) => {
    if (!isRecord(option)) return option
    const label = typeof option.label === 'string' && option.label.trim() ? option.label : `Option ${index + 1}`
    const value = typeof option.value === 'string' && option.value.trim()
      ? option.value
      : slugifyFieldName(label, `${fallbackBase}${index + 1}`)
    return {
      ...option,
      label,
      value,
    }
  })
}

function getFormRowZoneId(rowId: string, columnIndex: number) {
  return `${rowId}:column${columnIndex}`
}

function getFormFieldWidth(value: unknown) {
  const width = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value)
      : 100

  return Number.isFinite(width) ? Math.max(1, Math.min(100, width)) : 100
}

function getFormRowComponentType(widths: number[]) {
  const rounded = widths.map((width) => Math.round(width))

  if (rounded.length === 2 && rounded.every((width) => width >= 49 && width <= 51)) return 'formRowTwoColumns'
  if (
    rounded.length === 2 &&
    rounded[0] != null &&
    rounded[1] != null &&
    rounded[0] >= 65 &&
    rounded[0] <= 68 &&
    rounded[1] >= 32 &&
    rounded[1] <= 35
  ) return 'formRowLeftWide'
  if (
    rounded.length === 2 &&
    rounded[0] != null &&
    rounded[1] != null &&
    rounded[0] >= 32 &&
    rounded[0] <= 35 &&
    rounded[1] >= 65 &&
    rounded[1] <= 68
  ) return 'formRowRightWide'
  if (rounded.length === 3 && rounded.every((width) => width >= 32 && width <= 34)) return 'formRowThreeColumns'
  if (rounded.length === 4 && rounded.every((width) => width >= 24 && width <= 26)) return 'formRowFourColumns'

  return 'formRowCustom'
}

function formFieldToPuckContent(block: PuckPageBlock, index: number): ComponentData<Record<string, unknown>> {
  const id = getBlockId(block, index)

  return {
    type: String(block.blockType),
    props: {
      ...withoutBlockType(block),
      id,
    },
  }
}

function formFieldsToPuckData(fields: unknown[] | null | undefined): PuckPageData {
  const safeFields = Array.isArray(fields) ? fields : []
  const content: ComponentData<Record<string, unknown>>[] = []
  const zones: Record<string, ComponentData<Record<string, unknown>>[]> = {}
  let index = 0
  let rowIndex = 0

  while (index < safeFields.length) {
    const block = safeFields[index]

    if (!isRecord(block) || typeof block.blockType !== 'string') {
      index += 1
      continue
    }

    const width = getFormFieldWidth(block.width)

    if (width >= 99) {
      content.push(formFieldToPuckContent(block, index))
      index += 1
      continue
    }

    const rowFields: Array<{ block: PuckPageBlock; index: number }> = []
    const rowWidths: number[] = []
    let widthTotal = 0

    while (index < safeFields.length) {
      const rowBlock = safeFields[index]

      if (!isRecord(rowBlock) || typeof rowBlock.blockType !== 'string') break

      const rowWidth = getFormFieldWidth(rowBlock.width)
      if (rowWidth >= 99) break
      if (rowFields.length > 0 && widthTotal + rowWidth > 101) break

      rowFields.push({ block: rowBlock, index })
      rowWidths.push(rowWidth)
      widthTotal += rowWidth
      index += 1

      if (widthTotal >= 99) break
    }

    if (!rowFields.length) {
      content.push(formFieldToPuckContent(block, index))
      index += 1
      continue
    }

    const rowId = `formRow-${rowIndex}`
    const rowType = getFormRowComponentType(rowWidths)

    content.push({
      type: rowType,
      props: {
        columns: rowWidths,
        id: rowId,
      },
    })

    rowFields.forEach((rowField, columnIndex) => {
      zones[getFormRowZoneId(rowId, columnIndex)] = [formFieldToPuckContent(rowField.block, rowField.index)]
    })
    rowIndex += 1
  }

  return {
    root: {
      props: {},
    },
    content,
    zones,
  } as PuckPageData
}

function getFormRowColumns(componentType: string, props: Record<string, unknown>) {
  if (componentType === 'formRowCustom' && Array.isArray(props.columns)) {
    const columns = props.columns
      .map((column) => Number(column))
      .filter((column) => Number.isFinite(column) && column > 0)

    if (columns.length) return columns
  }

  return FORM_ROW_COMPONENT_TO_COLUMNS[componentType] || [1]
}

function normalizeFormFieldWidth(field: Record<string, unknown>) {
  if (!('width' in field)) return field

  const width = typeof field.width === 'number'
    ? field.width
    : typeof field.width === 'string'
      ? Number(field.width)
      : null

  if (typeof width === 'number' && Number.isFinite(width)) {
    return {
      ...field,
      width: Math.max(1, Math.min(100, width)),
    }
  }

  return field
}

function componentToFormField(
  item: ComponentData<Record<string, unknown>> & { id?: string },
  index: number,
  usedNames: Set<string>,
  forcedWidth?: number,
) {
  const props: Record<string, unknown> =
    item.props && typeof item.props === 'object'
      ? (item.props as Record<string, unknown>)
      : {}
  const blockType = String(item.type)
  const payloadProps = toPayloadValue(props) as Record<string, unknown>
  const id = props.id ?? item.id ?? undefined
  let nextField: Record<string, unknown> = {
    ...payloadProps,
    id,
    blockType,
  }

  if (typeof forcedWidth === 'number' && Number.isFinite(forcedWidth)) {
    nextField.width = Math.max(1, Math.min(100, Math.round(forcedWidth)))
  }

  nextField = normalizeFormFieldWidth(nextField)

  if ('options' in nextField) {
    nextField.options = normalizeFormOptions(nextField.options, blockType)
  }

  return normalizeFormFieldName(nextField, blockType, index, usedNames)
}

export function puckDataToFormPatch(data: PuckPageData): {
  fields: Array<Record<string, unknown>>
} {
  const content = Array.isArray(data.content) ? data.content : []
  const zones = data.zones && typeof data.zones === 'object'
    ? (data.zones as Record<string, unknown>)
    : undefined
  const usedNames = new Set<string>()
  const fields: Array<Record<string, unknown>> = []

  content
    .filter((item): item is ComponentData<Record<string, unknown>> => Boolean(item?.type))
    .forEach((item) => {
      const itemRecord = item as ComponentData<Record<string, unknown>> & { id?: string }
      const blockType = String(itemRecord.type)

      if (FORM_ROW_COMPONENT_TYPES.has(blockType) || blockType === 'formRowCustom') {
        const props = itemRecord.props && typeof itemRecord.props === 'object'
          ? (itemRecord.props as Record<string, unknown>)
          : {}
        const rowId = props.id ?? itemRecord.id
        const columns = getFormRowColumns(blockType, props)
        const total = columns.reduce((sum, column) => sum + column, 0)

        if (typeof rowId === 'string' || typeof rowId === 'number') {
          columns.forEach((column, columnIndex) => {
            const zoneContent = zones?.[getFormRowZoneId(String(rowId), columnIndex)]
            const columnWidth = blockType === 'formRowCustom'
              ? getFormFieldWidth(column)
              : total > 0 ? (column / total) * 100 : 100

            if (!Array.isArray(zoneContent)) return

            zoneContent
              .filter((zoneItem): zoneItem is ComponentData<Record<string, unknown>> => Boolean(zoneItem?.type))
              .forEach((zoneItem) => {
                fields.push(componentToFormField(
                  zoneItem as ComponentData<Record<string, unknown>> & { id?: string },
                  fields.length,
                  usedNames,
                  columnWidth,
                ))
              })
          })
        }

        return
      }

      fields.push(componentToFormField(itemRecord, fields.length, usedNames))
    })

  return { fields }
}
