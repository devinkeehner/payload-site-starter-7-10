import type { ComponentData } from '@puckeditor/core'

import type { PuckBlockSchema, PuckFieldSchema, PuckPageData } from './types'

type MediaResource = Record<string, unknown> & {
  id?: string | number
  url?: string | null
}

type MediaOption = {
  resource?: MediaResource | null
  value?: unknown
}

type UploadPath = Array<string | '*'>

const HERO_MEDIA_PATHS: UploadPath[] = [['root', 'props', 'hero', 'media']]
const HERO_RICH_TEXT_PATHS: UploadPath[] = [['root', 'props', 'hero', 'richText']]

function isMediaField(field: PuckFieldSchema): boolean {
  const relationTo = Array.isArray(field.relationTo) ? field.relationTo[0] : field.relationTo

  return field.type === 'upload' && (!relationTo || relationTo === 'media')
}

function getUploadPaths(fields: PuckFieldSchema[], basePath: UploadPath = []): UploadPath[] {
  return fields.flatMap((field) => {
    if (field.name === '__row') {
      return getUploadPaths(field.fields || [], basePath)
    }

    if ((field.type === 'row' || field.type === 'collapsible') && field.fields) {
      return getUploadPaths(field.fields, basePath)
    }

    if (isMediaField(field)) {
      return [[...basePath, field.name]]
    }

    if (field.type === 'group' && field.fields) {
      return getUploadPaths(field.fields, [...basePath, field.name])
    }

    if (field.type === 'array' && field.fields) {
      return getUploadPaths(field.fields, [...basePath, field.name, '*'])
    }

    if (field.type === 'blocks' && field.blocks) {
      return field.blocks.flatMap((block) => getUploadPaths(block.fields, [...basePath, field.name, '*']))
    }

    return []
  })
}

function getRichTextPaths(fields: PuckFieldSchema[], basePath: UploadPath = []): UploadPath[] {
  return fields.flatMap((field) => {
    if (field.name === '__row') {
      return getRichTextPaths(field.fields || [], basePath)
    }

    if ((field.type === 'row' || field.type === 'collapsible') && field.fields) {
      return getRichTextPaths(field.fields, basePath)
    }

    if (field.type === 'richText') {
      return [[...basePath, field.name]]
    }

    if (field.type === 'group' && field.fields) {
      return getRichTextPaths(field.fields, [...basePath, field.name])
    }

    if (field.type === 'array' && field.fields) {
      return getRichTextPaths(field.fields, [...basePath, field.name, '*'])
    }

    if (field.type === 'blocks' && field.blocks) {
      return field.blocks.flatMap((block) => getRichTextPaths(block.fields, [...basePath, field.name, '*']))
    }

    return []
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function getMediaId(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number') {
    const id = String(value)
    return id.trim() ? id : null
  }

  if (isRecord(value) && (typeof value.id === 'string' || typeof value.id === 'number')) {
    const id = String(value.id)
    return id.trim() ? id : null
  }

  if (isRecord(value) && (typeof value._id === 'string' || typeof value._id === 'number')) {
    const id = String(value._id)
    return id.trim() ? id : null
  }

  if (isRecord(value) && (typeof value.value === 'string' || typeof value.value === 'number')) {
    const id = String(value.value)
    return id.trim() ? id : null
  }

  return null
}

function visitPath(value: unknown, path: UploadPath, visitor: (value: unknown) => void) {
  if (path.length === 0) {
    visitor(value)
    return
  }

  const [segment, ...rest] = path

  if (segment === '*') {
    if (Array.isArray(value)) {
      value.forEach((item) => visitPath(item, rest, visitor))
    }
    return
  }

  if (typeof segment !== 'string') return

  if (isRecord(value)) {
    visitPath(value[segment], rest, visitor)
  }
}

function replacePath(value: unknown, path: UploadPath, resources: Map<string, MediaResource>) {
  if (path.length === 0) return

  const [segment, ...rest] = path

  if (segment === '*') {
    if (Array.isArray(value)) {
      value.forEach((item) => replacePath(item, rest, resources))
    }
    return
  }

  if (typeof segment !== 'string') return

  if (!isRecord(value)) return

  if (rest.length === 0) {
    const id = getMediaId(value[segment])
    if (id) {
      const resource = resources.get(id)
      if (resource) {
        value[segment] = resource
      }
    }
    return
  }

  replacePath(value[segment], rest, resources)
}

function visitLexicalNodes(value: unknown, visitor: (node: Record<string, unknown>) => void) {
  if (Array.isArray(value)) {
    value.forEach((item) => visitLexicalNodes(item, visitor))
    return
  }

  if (!isRecord(value)) return

  if (typeof value.type === 'string') {
    visitor(value)
  }

  if (Array.isArray(value.children)) {
    value.children.forEach((child) => visitLexicalNodes(child, visitor))
  }

  if (isRecord(value.root)) {
    visitLexicalNodes(value.root, visitor)
  }
}

function cloneData(data: PuckPageData): PuckPageData {
  return JSON.parse(JSON.stringify(data)) as PuckPageData
}

async function fetchMediaResources(ids: string[]): Promise<Map<string, MediaResource>> {
  if (ids.length === 0) return new Map()

  const params = new URLSearchParams({
    collection: 'media',
    ids: ids.join(','),
  })
  const res = await fetch(`/api/puck/options?${params.toString()}`, {
    credentials: 'same-origin',
  })
  if (!res.ok) return new Map()

  const payload = (await res.json()) as { options?: MediaOption[] }
  const resources = new Map<string, MediaResource>()

  for (const option of payload.options || []) {
    const resource = option.resource
    if (!resource || resource.id == null) continue

    resources.set(String(resource.id), resource)
  }

  return resources
}

function getBlockUploadPathMap(blockSchema: PuckBlockSchema[]): Map<string, UploadPath[]> {
  return new Map(blockSchema.map((block) => [block.slug, getUploadPaths(block.fields)]))
}

function getBlockRichTextPathMap(blockSchema: PuckBlockSchema[]): Map<string, UploadPath[]> {
  return new Map(blockSchema.map((block) => [block.slug, getRichTextPaths(block.fields)]))
}

function collectLexicalMediaIds(
  value: unknown,
  lexicalBlockUploadPaths: Map<string, UploadPath[]>,
  ids: Set<string>,
) {
  visitLexicalNodes(value, (node) => {
    if (node.type === 'upload' && (!node.relationTo || node.relationTo === 'media')) {
      const id = getMediaId(node.value)
      if (id) ids.add(id)
    }

    if (node.type !== 'block' && node.type !== 'inlineBlock') return
    const fields = isRecord(node.fields) ? node.fields : null
    const blockType = typeof fields?.blockType === 'string' ? fields.blockType : null
    if (!fields || !blockType) return

    const uploadPaths = lexicalBlockUploadPaths.get(blockType) || []
    uploadPaths.forEach((path) => {
      visitPath(fields, path, (fieldValue) => {
        const id = getMediaId(fieldValue)
        if (id) ids.add(id)
      })
    })
  })
}

function replaceLexicalMedia(
  value: unknown,
  lexicalBlockUploadPaths: Map<string, UploadPath[]>,
  resources: Map<string, MediaResource>,
) {
  visitLexicalNodes(value, (node) => {
    if (node.type === 'upload' && (!node.relationTo || node.relationTo === 'media')) {
      const id = getMediaId(node.value)
      if (id) {
        const resource = resources.get(id)
        if (resource) node.value = resource
      }
    }

    if (node.type !== 'block' && node.type !== 'inlineBlock') return
    const fields = isRecord(node.fields) ? node.fields : null
    const blockType = typeof fields?.blockType === 'string' ? fields.blockType : null
    if (!fields || !blockType) return

    const uploadPaths = lexicalBlockUploadPaths.get(blockType) || []
    uploadPaths.forEach((path) => replacePath(fields, path, resources))
  })
}

function collectMediaIds(
  data: PuckPageData,
  blockSchema: PuckBlockSchema[],
  lexicalBlockSchema: PuckBlockSchema[],
): Set<string> {
  const ids = new Set<string>()
  const blockUploadPaths = getBlockUploadPathMap(blockSchema)
  const blockRichTextPaths = getBlockRichTextPathMap(blockSchema)
  const lexicalBlockUploadPaths = getBlockUploadPathMap(lexicalBlockSchema)

  HERO_MEDIA_PATHS.forEach((path) => {
    visitPath(data, path, (value) => {
      const id = getMediaId(value)
      if (id) ids.add(id)
    })
  })

  HERO_RICH_TEXT_PATHS.forEach((path) => {
    visitPath(data, path, (value) => {
      collectLexicalMediaIds(value, lexicalBlockUploadPaths, ids)
    })
  })

  const collectFromContent = (content: unknown) => {
    if (!Array.isArray(content)) return

    content.forEach((item) => {
    const component = item as ComponentData<Record<string, unknown>>
    const uploadPaths = blockUploadPaths.get(String(component.type)) || []
    const richTextPaths = blockRichTextPaths.get(String(component.type)) || []
    const props = isRecord(component.props) ? component.props : {}

    uploadPaths.forEach((path) => {
      visitPath(props, path, (value) => {
        const id = getMediaId(value)
        if (id) ids.add(id)
      })
    })

    richTextPaths.forEach((path) => {
      visitPath(props, path, (value) => {
        collectLexicalMediaIds(value, lexicalBlockUploadPaths, ids)
      })
    })
  })
  }

  collectFromContent(data.content)
  if (isRecord(data.zones)) {
    Object.values(data.zones).forEach(collectFromContent)
  }

  return ids
}

export async function hydratePuckMedia(
  data: PuckPageData,
  blockSchema: PuckBlockSchema[],
  lexicalBlockSchema: PuckBlockSchema[] = [],
): Promise<PuckPageData> {
  const ids = [...collectMediaIds(data, blockSchema, lexicalBlockSchema)]
  if (ids.length === 0) return data

  const resources = await fetchMediaResources(ids)
  if (resources.size === 0) return data

  const hydratedData = cloneData(data)
  const blockUploadPaths = getBlockUploadPathMap(blockSchema)
  const blockRichTextPaths = getBlockRichTextPathMap(blockSchema)
  const lexicalBlockUploadPaths = getBlockUploadPathMap(lexicalBlockSchema)

  HERO_MEDIA_PATHS.forEach((path) => replacePath(hydratedData, path, resources))
  HERO_RICH_TEXT_PATHS.forEach((path) => {
    visitPath(hydratedData, path, (value) => replaceLexicalMedia(value, lexicalBlockUploadPaths, resources))
  })

  const replaceInContent = (content: unknown) => {
    if (!Array.isArray(content)) return

    content.forEach((item) => {
    const component = item as ComponentData<Record<string, unknown>>
    const uploadPaths = blockUploadPaths.get(String(component.type)) || []
    const richTextPaths = blockRichTextPaths.get(String(component.type)) || []
    const props = isRecord(component.props) ? component.props : {}

    uploadPaths.forEach((path) => replacePath(props, path, resources))
    richTextPaths.forEach((path) => {
      visitPath(props, path, (value) => replaceLexicalMedia(value, lexicalBlockUploadPaths, resources))
    })
  })
  }

  replaceInContent(hydratedData.content)
  if (isRecord(hydratedData.zones)) {
    Object.values(hydratedData.zones).forEach(replaceInContent)
  }

  return hydratedData
}
