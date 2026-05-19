import type { ComponentData } from '@puckeditor/core'

import type { PuckEmailDoc, PuckPageBlock, PuckPageData, PuckPageDoc, PuckPostDoc } from './types'

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
const GRID_BLOCK_TYPES = new Set(['emailGrid', 'postGrid'])

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
          delete props.leftBlocks
          delete props.centerBlocks
          delete props.rightBlocks
        }

        return {
          type: blockType,
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
  return layoutToPuckData(email.layout)
}

export function postToPuckData(post: PuckPostDoc): PuckPageData {
  const layout = Array.isArray(post.layout) && post.layout.length
    ? post.layout.map((block) => block.blockType === 'postBody' ? { ...block, content: post.content || null } : block)
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
      const payloadBlock: Record<string, unknown> = {
        ...(toPayloadValue(props) as Record<string, unknown>),
        blockType: itemRecord.type,
      }

      if (GRID_BLOCK_TYPES.has(itemRecord.type) && id) {
        payloadBlock.leftBlocks = puckContentToEmailLayout(zones?.[`${id}:left`], zones)
        payloadBlock.centerBlocks = puckContentToEmailLayout(zones?.[`${id}:center`], zones)
        payloadBlock.rightBlocks = puckContentToEmailLayout(zones?.[`${id}:right`], zones)
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
    layout: layout.map((block) => {
      if (block.blockType !== 'postBody') return block
      const { content: _content, ...postBodyBlock } = block
      return postBodyBlock
    }),
  }
}
