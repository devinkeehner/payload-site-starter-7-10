import { readFile } from 'node:fs/promises'
import { inflateRawSync } from 'node:zlib'

const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50
const ZIP_CENTRAL_DIRECTORY_HEADER = 0x02014b50
const ZIP_LOCAL_FILE_HEADER = 0x04034b50

const textDecoder = new TextDecoder('utf-8')

export type IDMLFieldKind = 'text' | 'image' | 'shape'

export type IDMLBounds = {
  top: number
  left: number
  bottom: number
  right: number
  width: number
  height: number
}

export type IDMLTag = {
  raw: string
  kind: IDMLFieldKind
  name: string
}

export type IDMLPage = {
  id: string
  name?: string
  bounds: IDMLBounds | null
}

export type IDMLTextStyle = {
  fontFamily?: string
  fontStyle?: string
  fontSize?: number
  fillColor?: string
}

export type IDMLTemplateElement = {
  id: string
  sourceType: 'TextFrame' | 'Rectangle' | 'Oval' | 'Polygon'
  kind: 'text' | 'image' | 'shape'
  pageID: string | null
  pageIndex: number | null
  bounds: IDMLBounds | null
  name?: string
  label?: string
  scriptLabel?: string
  tag: IDMLTag | null
  text?: string
  imageLink?: string
  fillColor?: string
  strokeColor?: string
  strokeWeight?: number
  rotation?: number
  storyID?: string
  style?: IDMLTextStyle
  rawAttributes: Record<string, string>
}

export type IDMLSpread = {
  id: string
  name: string
  pages: IDMLPage[]
  elements: IDMLTemplateElement[]
}

export type IDMLTemplateField = {
  kind: IDMLFieldKind
  name: string
  spreadIndex: number
  pageIndex: number | null
  spreadID: string
  elementID: string
}

export type IDMLTemplateImportResult = {
  source: 'idml'
  spreads: IDMLSpread[]
  fields: IDMLTemplateField[]
  warnings: string[]
}

type ZipEntry = {
  name: string
  compressionMethod: number
  compressedSize: number
  uncompressedSize: number
  localHeaderOffset: number
}

type ParsedStory = {
  id: string
  text: string
  style: IDMLTextStyle
}

export type ImportIDMLTemplateOptions = {
  tagPrefixes?: Partial<Record<IDMLFieldKind, string>>
}

const defaultOptions: Required<ImportIDMLTemplateOptions> = {
  tagPrefixes: {
    text: 'field:',
    image: 'image:',
    shape: 'shape:',
  },
}

const asNumber = (value: string | undefined) => {
  if (!value) return undefined
  const next = Number(value)
  return Number.isFinite(next) ? next : undefined
}

const decodeXmlEntities = (value: string) =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')

const stripXml = (value: string) => value.replace(/<[^>]+>/g, '')

const parseAttributes = (input: string) => {
  const attributes: Record<string, string> = {}
  const attributePattern = /([A-Za-z_:][-A-Za-z0-9_:.]*)="([^"]*)"/g

  Array.from(input.matchAll(attributePattern)).forEach((match) => {
    const key = match[1]
    const value = match[2]
    if (!key || value == null) return
    attributes[key] = decodeXmlEntities(value)
  })

  return attributes
}

const parseBounds = (value: string | undefined): IDMLBounds | null => {
  if (!value) return null
  const rawParts = value
    .trim()
    .split(/\s+/)
    .map((part) => Number(part))

  if (rawParts.length !== 4 || rawParts.some((part) => !Number.isFinite(part))) return null

  const [top, left, bottom, right] = rawParts as [number, number, number, number]
  return {
    top,
    left,
    bottom,
    right,
    width: right - left,
    height: bottom - top,
  }
}

const getBoundsCenter = (bounds: IDMLBounds | null) => {
  if (!bounds) return null
  return {
    x: bounds.left + bounds.width / 2,
    y: bounds.top + bounds.height / 2,
  }
}

const pointInsideBounds = (point: { x: number; y: number }, bounds: IDMLBounds) =>
  point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom

const distanceToBoundsCenter = (point: { x: number; y: number }, bounds: IDMLBounds) => {
  const center = getBoundsCenter(bounds)
  if (!center) return Number.POSITIVE_INFINITY
  return Math.hypot(center.x - point.x, center.y - point.y)
}

const parseTag = (values: Array<string | undefined>, options: Required<ImportIDMLTemplateOptions>): IDMLTag | null => {
  const candidates = values.filter((value): value is string => Boolean(value)).flatMap((value) => value.split(/\s+/))

  for (const candidate of candidates) {
    const normalized = candidate.trim()
    if (!normalized) continue

    for (const [kind, prefix] of Object.entries(options.tagPrefixes) as Array<[IDMLFieldKind, string]>) {
      if (!normalized.toLowerCase().startsWith(prefix.toLowerCase())) continue
      const name = normalized.slice(prefix.length).trim()
      if (!name) continue
      return {
        raw: normalized,
        kind,
        name,
      }
    }
  }

  return null
}

const parseRotation = (value: string | undefined) => {
  if (!value) return undefined
  const parts = value
    .trim()
    .split(/\s+/)
    .map((part) => Number(part))

  if (parts.length !== 6 || parts.some((part) => !Number.isFinite(part))) return undefined

  const [a, b] = parts
  const radians = Math.atan2(b || 0, a || 1)
  const degrees = (radians * 180) / Math.PI
  return Number.isFinite(degrees) ? degrees : undefined
}

const parseStories = (entries: Map<string, Uint8Array>) => {
  const stories = new Map<string, ParsedStory>()
  const storyPaths = Array.from(entries.keys()).filter((name) => name.startsWith('Stories/') && name.endsWith('.xml')).sort()

  storyPaths.forEach((path) => {
    const buffer = entries.get(path)
    if (!buffer) return

    const xml = textDecoder.decode(buffer)
    const storyRootMatch = xml.match(/<Story\b([^>]*)>/)
    const rootAttributes = parseAttributes(storyRootMatch?.[1] || '')
    const storyID = rootAttributes.Self || path

    const contentParts: string[] = []
    const normalizedXml = xml.replace(/<Br\s*\/?>/g, '\n')
    const contentPattern = /<Content>([\s\S]*?)<\/Content>/g
    Array.from(normalizedXml.matchAll(contentPattern)).forEach((match) => {
      const value = match[1]
      if (!value) return
      contentParts.push(decodeXmlEntities(stripXml(value)))
    })

    const text = contentParts.join('').replace(/\r\n/g, '\n').trim()
    const firstStyleMatch = xml.match(/<CharacterStyleRange\b([^>]*)>/)
    const firstStyleAttributes = parseAttributes(firstStyleMatch?.[1] || '')

    stories.set(storyID, {
      id: storyID,
      text,
      style: {
        fontFamily: firstStyleAttributes.AppliedFont,
        fontStyle: firstStyleAttributes.FontStyle,
        fontSize: asNumber(firstStyleAttributes.PointSize),
        fillColor: firstStyleAttributes.FillColor,
      },
    })
  })

  return stories
}

const assignPage = (pages: IDMLPage[], bounds: IDMLBounds | null) => {
  const point = getBoundsCenter(bounds)
  if (!point) return { pageID: null, pageIndex: null }

  const containingIndex = pages.findIndex((page) => page.bounds && pointInsideBounds(point, page.bounds))
  if (containingIndex >= 0) {
    return {
      pageID: pages[containingIndex]?.id || null,
      pageIndex: containingIndex,
    }
  }

  let nearestIndex: number | null = null
  let nearestDistance = Number.POSITIVE_INFINITY

  pages.forEach((page, index) => {
    if (!page.bounds) return
    const nextDistance = distanceToBoundsCenter(point, page.bounds)
    if (nextDistance >= nearestDistance) return
    nearestDistance = nextDistance
    nearestIndex = index
  })

  return {
    pageID: nearestIndex == null ? null : (pages[nearestIndex]?.id || null),
    pageIndex: nearestIndex,
  }
}

const extractInnerLabel = (body: string) => {
  const labelMatch = body.match(/<(?:Properties:)?Label>([\s\S]*?)<\/(?:Properties:)?Label>/)
  return labelMatch?.[1] ? decodeXmlEntities(stripXml(labelMatch[1])).trim() : undefined
}

const extractImageLink = (body: string) => {
  const imageMatch = body.match(/<(?:Image|PDF|EPS)\b([^>]*)>/)
  if (!imageMatch) return undefined
  const attributes = parseAttributes(imageMatch[1] || '')
  return attributes.LinkResourceURI || attributes.Link || attributes.ItemLink || undefined
}

const parseSpread = (
  path: string,
  xml: string,
  stories: Map<string, ParsedStory>,
  options: Required<ImportIDMLTemplateOptions>,
) => {
  const spreadRootMatch = xml.match(/<Spread\b([^>]*)>/)
  const spreadAttributes = parseAttributes(spreadRootMatch?.[1] || '')
  const spreadID = spreadAttributes.Self || path

  const pages: IDMLPage[] = []
  const pagePattern = /<Page\b([^>]*?)(?:\/>|>(?:[\s\S]*?)<\/Page>)/g
  Array.from(xml.matchAll(pagePattern)).forEach((match) => {
    const attributes = parseAttributes(match[1] || '')
    pages.push({
      id: attributes.Self || `${spreadID}-page-${pages.length + 1}`,
      name: attributes.Name,
      bounds: parseBounds(attributes.GeometricBounds || attributes.Bounds),
    })
  })

  const elements: IDMLTemplateElement[] = []
  const itemPattern = /<(TextFrame|Rectangle|Oval|Polygon)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g
  Array.from(xml.matchAll(itemPattern)).forEach((match) => {
    const sourceType = match[1] as IDMLTemplateElement['sourceType']
    const rawAttributes = parseAttributes(match[2] || '')
    const body = match[3] || ''
    const bounds = parseBounds(rawAttributes.GeometricBounds || rawAttributes.Bounds)
    const page = assignPage(pages, bounds)
    const label = rawAttributes.Label || extractInnerLabel(body)
    const tag = parseTag([rawAttributes.Name, label, rawAttributes.ScriptLabel], options)
    const storyID = sourceType === 'TextFrame' ? rawAttributes.ParentStory : undefined
    const story = storyID ? stories.get(storyID) : undefined
    const imageLink = sourceType === 'TextFrame' ? undefined : extractImageLink(body)

    let kind: IDMLTemplateElement['kind'] = 'shape'
    if (sourceType === 'TextFrame') kind = 'text'
    else if (imageLink) kind = 'image'
    else if (tag?.kind) kind = tag.kind

    elements.push({
      id: rawAttributes.Self || `${spreadID}-${sourceType}-${elements.length + 1}`,
      sourceType,
      kind,
      pageID: page.pageID,
      pageIndex: page.pageIndex,
      bounds,
      name: rawAttributes.Name,
      label,
      scriptLabel: rawAttributes.ScriptLabel,
      tag,
      text: story?.text,
      imageLink,
      fillColor: rawAttributes.FillColor,
      strokeColor: rawAttributes.StrokeColor,
      strokeWeight: asNumber(rawAttributes.StrokeWeight),
      rotation: parseRotation(rawAttributes.ItemTransform),
      storyID,
      style: story?.style,
      rawAttributes,
    })
  })

  return {
    id: spreadID,
    name: path,
    pages,
    elements,
  } satisfies IDMLSpread
}

const findEndOfCentralDirectoryOffset = (buffer: Uint8Array) => {
  const minimumOffset = Math.max(0, buffer.length - 0xffff - 22)

  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (readUInt32LE(buffer, offset) === ZIP_END_OF_CENTRAL_DIRECTORY) return offset
  }

  throw new Error('Could not find ZIP end of central directory record in IDML file')
}

const readUInt16LE = (buffer: Uint8Array, offset: number) =>
  buffer[offset]! | (buffer[offset + 1]! << 8)

const readUInt32LE = (buffer: Uint8Array, offset: number) =>
  (buffer[offset]!) |
  (buffer[offset + 1]! << 8) |
  (buffer[offset + 2]! << 16) |
  (buffer[offset + 3]! << 24)

const parseZipEntries = (buffer: Uint8Array) => {
  const eocdOffset = findEndOfCentralDirectoryOffset(buffer)
  const centralDirectorySize = readUInt32LE(buffer, eocdOffset + 12)
  const centralDirectoryOffset = readUInt32LE(buffer, eocdOffset + 16)
  const endOffset = centralDirectoryOffset + centralDirectorySize

  const entries: ZipEntry[] = []
  let offset = centralDirectoryOffset

  while (offset < endOffset) {
    const signature = readUInt32LE(buffer, offset)
    if (signature !== ZIP_CENTRAL_DIRECTORY_HEADER) {
      throw new Error(`Invalid ZIP central directory header at offset ${offset}`)
    }

    const compressionMethod = readUInt16LE(buffer, offset + 10)
    const compressedSize = readUInt32LE(buffer, offset + 20)
    const uncompressedSize = readUInt32LE(buffer, offset + 24)
    const fileNameLength = readUInt16LE(buffer, offset + 28)
    const extraLength = readUInt16LE(buffer, offset + 30)
    const commentLength = readUInt16LE(buffer, offset + 32)
    const localHeaderOffset = readUInt32LE(buffer, offset + 42)
    const fileNameStart = offset + 46
    const fileNameEnd = fileNameStart + fileNameLength
    const name = textDecoder.decode(buffer.slice(fileNameStart, fileNameEnd))

    entries.push({
      name,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    })

    offset = fileNameEnd + extraLength + commentLength
  }

  return entries
}

const extractZipEntry = (archive: Uint8Array, entry: ZipEntry) => {
  const headerOffset = entry.localHeaderOffset
  if (readUInt32LE(archive, headerOffset) !== ZIP_LOCAL_FILE_HEADER) {
    throw new Error(`Invalid ZIP local file header for ${entry.name}`)
  }

  const fileNameLength = readUInt16LE(archive, headerOffset + 26)
  const extraLength = readUInt16LE(archive, headerOffset + 28)
  const dataOffset = headerOffset + 30 + fileNameLength + extraLength
  const compressedData = archive.slice(dataOffset, dataOffset + entry.compressedSize)

  if (entry.compressionMethod === 0) return compressedData
  if (entry.compressionMethod === 8) return inflateRawSync(compressedData)

  throw new Error(`Unsupported ZIP compression method ${entry.compressionMethod} for ${entry.name}`)
}

const unzipIDML = (input: Uint8Array) => {
  const entries = parseZipEntries(input)
  const files = new Map<string, Uint8Array>()

  entries.forEach((entry) => {
    if (entry.name.endsWith('/')) return
    files.set(entry.name, extractZipEntry(input, entry))
  })

  return files
}

export const importIDMLTemplate = (
  input: Uint8Array | Buffer,
  options: ImportIDMLTemplateOptions = {},
): IDMLTemplateImportResult => {
  const mergedOptions: Required<ImportIDMLTemplateOptions> = {
    tagPrefixes: {
      ...defaultOptions.tagPrefixes,
      ...options.tagPrefixes,
    },
  }

  const archive = input instanceof Uint8Array ? input : new Uint8Array(input)
  const entries = unzipIDML(archive)
  const warnings: string[] = []

  if (!entries.has('designmap.xml')) {
    warnings.push('IDML archive does not contain designmap.xml. Spread discovery fell back to file paths only.')
  }

  const stories = parseStories(entries)
  const spreadPaths = Array.from(entries.keys()).filter((name) => name.startsWith('Spreads/') && name.endsWith('.xml')).sort()
  const spreads = spreadPaths.map((path) =>
    parseSpread(path, textDecoder.decode(entries.get(path)!), stories, mergedOptions),
  )

  const fields: IDMLTemplateField[] = []
  spreads.forEach((spread, spreadIndex) => {
    spread.elements.forEach((element) => {
      if (!element.tag) return
      fields.push({
        kind: element.tag.kind,
        name: element.tag.name,
        spreadIndex,
        pageIndex: element.pageIndex,
        spreadID: spread.id,
        elementID: element.id,
      })
    })
  })

  if (fields.length === 0) {
    warnings.push('No tagged template fields were found. Use labels like field:headline, image:headshot, or shape:sidebar.')
  }

  return {
    source: 'idml',
    spreads,
    fields,
    warnings,
  }
}

export const importIDMLTemplateFromFile = async (
  filePath: string,
  options: ImportIDMLTemplateOptions = {},
) => {
  const file = await readFile(filePath)
  return importIDMLTemplate(file, options)
}
