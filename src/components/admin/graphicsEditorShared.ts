import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type AutosaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

export type AutosaveState = {
  error: string | null
  lastSavedAt: number | null
  status: AutosaveStatus
}

type AutosaveOptions = {
  debounceMs?: number
  enabled: boolean
  onError?: (message: string) => void
  onSave: () => Promise<void>
  revision: number
}

export type EditorCustomRect = {
  dashStyle?: 'solid' | 'dashed' | 'dotted'
  fill: string
  fillEnabled?: boolean
  height: number
  id: string
  opacity?: number
  rotation?: number
  shapeType?: 'rect' | 'circle' | 'line'
  shadowBlur?: number
  shadowColor?: string
  shadowOffsetX?: number
  shadowOffsetY?: number
  shadowOpacity?: number
  strokeColor?: string
  strokeWidth?: number
  width: number
  x: number
  y: number
}

export type EditorCustomImage = {
  blurRadius?: number
  brightness?: number
  grayscale?: boolean
  height: number
  id: string
  opacity?: number
  rotation?: number
  shadowBlur?: number
  shadowColor?: string
  shadowOffsetX?: number
  shadowOffsetY?: number
  shadowOpacity?: number
  width: number
  x: number
  y: number
}

export type EditorCustomText = {
  color: string
  fontFamily?: string
  fontSize: number
  fontStyle?: string
  height?: number
  id: string
  letterSpacing?: number
  lineHeight?: number
  opacity?: number
  rotation?: number
  shadowBlur?: number
  shadowColor?: string
  shadowOffsetX?: number
  shadowOffsetY?: number
  shadowOpacity?: number
  strokeColor?: string
  strokeWidth?: number
  text: string
  textAlign?: 'left' | 'center' | 'right'
  textDecoration?: string
  width: number
  x: number
  y: number
}

export type EditorLayerKind =
  | 'eyebrow'
  | 'headline'
  | 'subhead'
  | 'footer'
  | 'headshot'
  | 'town'
  | 'custom-image'
  | 'custom-rect'
  | 'custom-text'

export type EditorLayerGroup = 'built-in' | 'custom'

export type EditorLayerItem = {
  group: EditorLayerGroup
  hidden?: boolean
  id: string
  kind: EditorLayerKind
  locked?: boolean
  order: number
}

export type EditorLayerTarget = Pick<EditorLayerItem, 'id' | 'kind'>

type EditorLayerSceneSnapshot = {
  customImages: Pick<EditorCustomImage, 'id'>[]
  customRects: Pick<EditorCustomRect, 'id'>[]
  customTexts: Pick<EditorCustomText, 'id'>[]
  eyebrow: { id: string }
  footer: { id: string }
  headline: { id: string }
  headshot: { id: string }
  subhead: { id: string }
  townRows: { id: string }[]
}

type EditorClipboardItem =
  | { kind: 'custom-image'; payload: EditorCustomImage }
  | { kind: 'custom-rect'; payload: EditorCustomRect }
  | { kind: 'custom-text'; payload: EditorCustomText }

type EditorLayerReorderDirection = 'backward' | 'forward' | 'front' | 'back'

export type EditorComponentDefinition = {
  build: (context: {
    brandBlue: string
    brandRed: string
    stageHeight: number
    stageWidth: number
    websiteText: string
  }) => {
    rects: EditorCustomRect[]
    texts: EditorCustomText[]
  }
  description: string
  id: string
  label: string
}

const COMPONENT_INSERT_OFFSET = 28
let sessionClipboard: EditorClipboardItem | null = null

export const TEXT_FONT_OPTIONS = [
  { label: 'Work Sans', value: '"Work Sans", Arial, sans-serif' },
  { label: 'Source Sans', value: '"Source Sans 3", "Source Sans Pro", Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Trebuchet', value: '"Trebuchet MS", Arial, sans-serif' },
  { label: 'Arial Narrow', value: '"Arial Narrow", Arial, sans-serif' },
  { label: 'Handwritten', value: '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive' },
] as const

export const EDITOR_ZOOM_PRESETS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const

export const TEXT_ALIGNMENT_OPTIONS = [
  { label: 'Left', value: 'left' },
  { label: 'Center', value: 'center' },
  { label: 'Right', value: 'right' },
] as const

export const isEditableTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    Boolean(element?.isContentEditable)
  )
}

export const createEditorNodeID = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export const getShortcutNudgeDistance = (event: KeyboardEvent) => (event.shiftKey ? 10 : 1)

export const getDashPattern = (dashStyle?: 'solid' | 'dashed' | 'dotted') => {
  if (dashStyle === 'dashed') return [16, 10]
  if (dashStyle === 'dotted') return [3, 8]
  return undefined
}

export const formatAutosaveLabel = (state: AutosaveState) => {
  if (state.status === 'saving') return 'Saving…'
  if (state.status === 'saved') return 'Saved'
  if (state.status === 'error') return state.error || 'Autosave failed'
  if (state.status === 'dirty') return 'Unsaved changes'
  return 'Draft not saved yet'
}

export const duplicateRect = (rect: EditorCustomRect): EditorCustomRect => ({
  ...rect,
  id: createEditorNodeID('custom-rect'),
  x: rect.x + COMPONENT_INSERT_OFFSET,
  y: rect.y + COMPONENT_INSERT_OFFSET,
})

export const duplicateImage = <T extends EditorCustomImage>(image: T): T => ({
  ...image,
  id: createEditorNodeID('custom-image'),
  x: image.x + COMPONENT_INSERT_OFFSET,
  y: image.y + COMPONENT_INSERT_OFFSET,
}) as T

export const duplicateText = (text: EditorCustomText): EditorCustomText => ({
  ...text,
  id: createEditorNodeID('custom-text'),
  x: text.x + COMPONENT_INSERT_OFFSET,
  y: text.y + COMPONENT_INSERT_OFFSET,
})

const CUSTOM_LAYER_KINDS = new Set<EditorLayerKind>(['custom-image', 'custom-rect', 'custom-text'])
const layerKey = (target: EditorLayerTarget) => `${target.kind}:${target.id}`
const cloneClipboardPayload = <T,>(payload: T): T => JSON.parse(JSON.stringify(payload)) as T

export const isCustomLayerKind = (kind: string) => CUSTOM_LAYER_KINDS.has(kind as EditorLayerKind)

export const buildEditorLayers = (scene: EditorLayerSceneSnapshot): EditorLayerItem[] => {
  const builtins: EditorLayerItem[] = [
    { id: scene.eyebrow.id, kind: 'eyebrow', group: 'built-in', order: 0 },
    { id: scene.headline.id, kind: 'headline', group: 'built-in', order: 1 },
    { id: scene.subhead.id, kind: 'subhead', group: 'built-in', order: 2 },
    { id: scene.footer.id, kind: 'footer', group: 'built-in', order: 3 },
    { id: scene.headshot.id, kind: 'headshot', group: 'built-in', order: 4 },
    ...scene.townRows.map((row, index) => ({
      id: row.id,
      kind: 'town' as const,
      group: 'built-in' as const,
      order: 5 + index,
    })),
  ]

  const customStartOrder = builtins.length
  const customItems: EditorLayerItem[] = [
    ...scene.customImages.map((item, index) => ({
      id: item.id,
      kind: 'custom-image' as const,
      group: 'custom' as const,
      order: customStartOrder + index,
    })),
    ...scene.customRects.map((item, index) => ({
      id: item.id,
      kind: 'custom-rect' as const,
      group: 'custom' as const,
      order: customStartOrder + scene.customImages.length + index,
    })),
    ...scene.customTexts.map((item, index) => ({
      id: item.id,
      kind: 'custom-text' as const,
      group: 'custom' as const,
      order: customStartOrder + scene.customImages.length + scene.customRects.length + index,
    })),
  ]

  return [...builtins, ...customItems]
}

export const hydrateEditorLayers = ({
  baseLayers,
  savedLayers,
}: {
  baseLayers: EditorLayerItem[]
  savedLayers?: EditorLayerItem[] | null
}) => {
  if (!Array.isArray(savedLayers) || savedLayers.length === 0) return baseLayers

  const baseByKey = new Map(baseLayers.map((item) => [layerKey(item), item] as const))
  const resolvedLayers: EditorLayerItem[] = []
  const used = new Set<string>()

  savedLayers
    .sort((left, right) => left.order - right.order)
    .forEach((saved) => {
      const key = layerKey(saved)
      const base = baseByKey.get(key)
      if (!base || used.has(key)) return
      used.add(key)
      resolvedLayers.push({
        ...base,
        hidden: saved.hidden ?? base.hidden ?? false,
        locked: saved.locked ?? base.locked ?? false,
        order: 0,
      })
    })

  baseLayers
    .sort((left, right) => left.order - right.order)
    .forEach((item) => {
    const key = layerKey(item)
    if (used.has(key)) return
      resolvedLayers.push(item)
    })

  return resolvedLayers.map((item, index) => ({
      ...item,
      hidden: item.hidden ?? false,
      locked: item.locked ?? false,
      order: index,
    }))
}

export const getEditorLayerItem = (layers: EditorLayerItem[] | undefined | null, target: EditorLayerTarget | null) => {
  if (!target || !Array.isArray(layers)) return null
  return layers.find((item) => item.id === target.id && item.kind === target.kind) || null
}

export const patchEditorLayer = (
  layers: EditorLayerItem[] | undefined | null,
  target: EditorLayerTarget,
  patch: Partial<Pick<EditorLayerItem, 'hidden' | 'locked'>>,
) =>
  (layers || []).map((item) =>
    item.id === target.id && item.kind === target.kind
      ? {
          ...item,
          ...patch,
        }
      : item,
  )

export const appendEditorLayers = (
  layers: EditorLayerItem[] | undefined | null,
  items: Omit<EditorLayerItem, 'order'>[],
) => {
  const currentLayers = [...(layers || [])]
  const nextOrder = currentLayers.length
  return [
    ...currentLayers,
    ...items.map((item, index) => ({
      ...item,
      hidden: item.hidden ?? false,
      locked: item.locked ?? false,
      order: nextOrder + index,
    })),
  ]
}

export const removeEditorLayers = (layers: EditorLayerItem[] | undefined | null, targets: EditorLayerTarget[]) => {
  const targetKeys = new Set(targets.map((target) => layerKey(target)))
  const remaining = (layers || []).filter((item) => !targetKeys.has(layerKey(item)))
  return remaining.map((item, index) => ({ ...item, order: index }))
}

export const reorderCustomEditorLayer = (
  layers: EditorLayerItem[] | undefined | null,
  target: EditorLayerTarget,
  direction: EditorLayerReorderDirection,
) => {
  const currentLayers = [...(layers || [])].sort((left, right) => left.order - right.order)
  const movingKeys =
    target.kind === 'town'
      ? new Set(currentLayers.filter((item) => item.kind === 'town').map((item) => layerKey(item)))
      : new Set([layerKey(target)])
  const movingItems = currentLayers.filter((item) => movingKeys.has(layerKey(item)))
  const stationaryItems = currentLayers.filter((item) => !movingKeys.has(layerKey(item)))
  if (movingItems.length === 0) return currentLayers

  const currentIndex = currentLayers.findIndex((item) => movingKeys.has(layerKey(item)))
  if (currentIndex < 0) return currentLayers

  const nextIndex =
    direction === 'front'
      ? stationaryItems.length
      : direction === 'back'
        ? 0
        : direction === 'forward'
          ? Math.min(currentIndex + 1, stationaryItems.length)
          : Math.max(currentIndex - 1, 0)

  const reordered = [...stationaryItems]
  reordered.splice(nextIndex, 0, ...movingItems)

  return reordered.map((item, index) => ({
    ...item,
    order: index,
  }))
}

export const reorderCustomEditorLayerToIndex = (
  layers: EditorLayerItem[] | undefined | null,
  target: EditorLayerTarget,
  nextIndex: number,
) => {
  const currentLayers = [...(layers || [])].sort((left, right) => left.order - right.order)
  const movingKeys =
    target.kind === 'town'
      ? new Set(currentLayers.filter((item) => item.kind === 'town').map((item) => layerKey(item)))
      : new Set([layerKey(target)])
  const movingItems = currentLayers.filter((item) => movingKeys.has(layerKey(item)))
  const stationaryItems = currentLayers.filter((item) => !movingKeys.has(layerKey(item)))
  if (movingItems.length === 0) return currentLayers

  const reordered = [...stationaryItems]
  reordered.splice(Math.max(0, Math.min(nextIndex, reordered.length)), 0, ...movingItems)

  return reordered.map((item, index) => ({
    ...item,
    order: index,
  }))
}

export const setEditorClipboard = (item: EditorClipboardItem | null) => {
  if (!item) {
    sessionClipboard = null
    return
  }

  if (item.kind === 'custom-image') {
    sessionClipboard = { kind: 'custom-image', payload: cloneClipboardPayload(item.payload) }
    return
  }

  if (item.kind === 'custom-rect') {
    sessionClipboard = { kind: 'custom-rect', payload: cloneClipboardPayload(item.payload) }
    return
  }

  sessionClipboard = { kind: 'custom-text', payload: cloneClipboardPayload(item.payload) }
}

export const hasEditorClipboard = () => Boolean(sessionClipboard)

export const readEditorClipboard = () => {
  if (!sessionClipboard) return null
  if (sessionClipboard.kind === 'custom-image') {
    return { kind: 'custom-image' as const, payload: cloneClipboardPayload(sessionClipboard.payload) }
  }
  if (sessionClipboard.kind === 'custom-rect') {
    return { kind: 'custom-rect' as const, payload: cloneClipboardPayload(sessionClipboard.payload) }
  }
  return { kind: 'custom-text' as const, payload: cloneClipboardPayload(sessionClipboard.payload) }
}

export const getFontStyleFlags = (fontStyle?: string) => {
  const normalized = (fontStyle || '').toLowerCase()
  return {
    bold: /\bbold\b/.test(normalized) || /\b700\b/.test(normalized) || /\b800\b/.test(normalized) || /\b900\b/.test(normalized),
    italic: normalized.includes('italic'),
  }
}

export const buildFontStyle = ({ bold, italic }: { bold: boolean; italic: boolean }) => {
  if (bold && italic) return 'italic bold'
  if (italic) return 'italic'
  if (bold) return 'bold'
  return 'normal'
}

export const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const getResizedTextTransform = ({
  fontSize,
  maxFontSize = 240,
  minFontSize = 12,
  minWidth = 80,
  scaleX,
  scaleY,
  width,
}: {
  fontSize: number
  maxFontSize?: number
  minFontSize?: number
  minWidth?: number
  scaleX: number
  scaleY: number
  width: number
}) => {
  const safeScaleX = Math.max(Math.abs(scaleX), 0.1)
  const safeScaleY = Math.max(Math.abs(scaleY), 0.1)
  const nextWidth = Math.max(minWidth, Math.round(width * safeScaleX))
  const fontScale = Math.max(safeScaleX, safeScaleY)
  const nextFontSize = clampNumber(Math.round(fontSize * fontScale), minFontSize, maxFontSize)

  return { nextFontSize, nextWidth }
}

export const getCssFontWeight = (fontStyle?: string) => {
  const normalized = (fontStyle || '').toLowerCase()
  return normalized.includes('800') || normalized.includes('900') || normalized.includes('700') || normalized.includes('bold') ? 700 : 400
}

export type EditorRichTextBox = {
  align?: 'left' | 'center' | 'right' | string
  color?: string
  fontFamily?: string
  fontSize?: number
  fontStyle?: string
  height?: number
  html?: string
  letterSpacing?: number
  lineHeight?: number
  strokeColor?: string
  strokeWidth?: number
  text?: string
  textAlign?: 'left' | 'center' | 'right' | string
  width: number
}

export const EDITOR_RICH_TEXT_LAYOUT_CSS = `
  * { box-sizing:border-box; }
  p, div { margin: 0 0 0.45em; }
  p:last-child, div:last-child { margin-bottom: 0; }
  b, strong { font-weight: 700; }
  i, em { font-style: italic; }
  u { text-decoration: underline; }
  h1, h2, h3 { margin: 0 0 0.35em; line-height: 1.05; font-weight: 700; }
  h1 { font-size: 1.45em; }
  h2 { font-size: 1.25em; }
  h3 { font-size: 1.1em; }
  ul, ol { margin: 0 0 0.45em 1.2em; padding: 0; }
  li { margin: 0 0 0.15em; }
`

export const EDITOR_RICH_TEXT_EDITOR_SCOPE_CSS = `
  [data-rich-text-editor="true"] * { box-sizing:border-box; }
  [data-rich-text-editor="true"] p,
  [data-rich-text-editor="true"] div { margin: 0 0 0.45em; }
  [data-rich-text-editor="true"] p:last-child,
  [data-rich-text-editor="true"] div:last-child { margin-bottom: 0; }
  [data-rich-text-editor="true"] b,
  [data-rich-text-editor="true"] strong { font-weight: 700; }
  [data-rich-text-editor="true"] i,
  [data-rich-text-editor="true"] em { font-style: italic; }
  [data-rich-text-editor="true"] u { text-decoration: underline; }
  [data-rich-text-editor="true"] h1,
  [data-rich-text-editor="true"] h2,
  [data-rich-text-editor="true"] h3 { margin: 0 0 0.35em; line-height: 1.05; font-weight: 700; }
  [data-rich-text-editor="true"] h1 { font-size: 1.45em; }
  [data-rich-text-editor="true"] h2 { font-size: 1.25em; }
  [data-rich-text-editor="true"] h3 { font-size: 1.1em; }
  [data-rich-text-editor="true"] ul,
  [data-rich-text-editor="true"] ol { margin: 0 0 0.45em 1.2em; padding: 0; }
  [data-rich-text-editor="true"] li { margin: 0 0 0.15em; }
`

export const escapeEditorHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

export const getEditorRichTextPlainText = (value: string) => {
  if (typeof document === 'undefined') {
    return value
      .replace(/<br\b[^>]*>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '- ')
      .replace(/<\/(p|div|h1|h2|h3|li)>/gi, '\n')
      .replace(/<\/?(ul|ol)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  const temp = document.createElement('div')
  temp.innerHTML = value

  const lines: string[] = []
  const pushText = (text: string, prefix = '') => {
    const normalized = text
      .replace(/\u00a0/g, ' ')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .trim()
    if (!normalized) return
    normalized.split('\n').forEach((line, index) => {
      const trimmed = line.trim()
      if (trimmed) lines.push(index === 0 ? `${prefix}${trimmed}` : trimmed)
    })
  }

  const visit = (node: ChildNode) => {
    if (node.nodeType === Node.TEXT_NODE) {
      pushText(node.textContent || '')
      return
    }
    if (!(node instanceof HTMLElement)) return

    const tagName = node.tagName.toUpperCase()
    if (tagName === 'BR') {
      lines.push('')
      return
    }
    if (tagName === 'UL' || tagName === 'OL') {
      Array.from(node.children).forEach((child, index) => {
        if (!(child instanceof HTMLElement) || child.tagName.toUpperCase() !== 'LI') return
        pushText(child.innerText || child.textContent || '', tagName === 'OL' ? `${index + 1}. ` : '- ')
      })
      return
    }
    if (tagName === 'LI') {
      pushText(node.innerText || node.textContent || '', '- ')
      return
    }
    if (/^(P|DIV|H1|H2|H3)$/.test(tagName)) {
      pushText(node.innerText || node.textContent || '')
      return
    }

    Array.from(node.childNodes).forEach(visit)
  }

  Array.from(temp.childNodes).forEach(visit)
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export const stripEditorRichTextHtml = getEditorRichTextPlainText

export const convertPlainTextToEditorHtml = (value: string) =>
  value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => `<p>${escapeEditorHtml(line || ' ')}</p>`)
    .join('')

export const normalizeEditorRichTextHtml = (value: string) => {
  const fallback = convertPlainTextToEditorHtml(stripEditorRichTextHtml(value || '').replace(/\u00a0/g, ' ') || 'Text')
  if (typeof window === 'undefined') return fallback

  const temp = document.createElement('div')
  temp.innerHTML = value?.trim() || fallback

  temp.querySelectorAll('div').forEach((node) => {
    const paragraph = document.createElement('p')
    Array.from(node.attributes).forEach((attribute) => paragraph.setAttribute(attribute.name, attribute.value))
    while (node.firstChild) paragraph.appendChild(node.firstChild)
    node.replaceWith(paragraph)
  })

  const hasSupportedBlocks = temp.querySelector('p, h1, h2, h3, ul, ol')
  if (!hasSupportedBlocks) {
    const wrapped = document.createElement('p')
    wrapped.innerHTML = temp.innerHTML.trim() || escapeEditorHtml('Text')
    temp.innerHTML = ''
    temp.appendChild(wrapped)
  }

  return temp.innerHTML.trim() || fallback
}

export const getEditorRichTextHtml = (box: Pick<EditorRichTextBox, 'html' | 'text'>, fallbackText = '') =>
  box.html?.trim() ? box.html : convertPlainTextToEditorHtml(box.text || fallbackText)

export const getSvgSafeEditorRichTextHtml = (value: string) => {
  const normalized = value
    .replace(/&nbsp;/gi, '&#160;')
    .replace(/\u00a0/g, '&#160;')
    .replace(/<br\b([^>]*)>/gi, (_, attrs: string) => (attrs.trim().endsWith('/') ? `<br${attrs}>` : `<br${attrs} />`))
  if (typeof document === 'undefined' || typeof XMLSerializer === 'undefined') return normalized

  const temp = document.createElement('div')
  temp.innerHTML = normalized
  return Array.from(temp.childNodes)
    .map((node) => new XMLSerializer().serializeToString(node))
    .join('')
    .replace(/&nbsp;/gi, '&#160;')
    .replace(/\u00a0/g, '&#160;')
}

const approximateRichTextHeight = (box: EditorRichTextBox, fallbackText = '') => {
  const fontSize = box.fontSize || 28
  const lineHeight = box.lineHeight || 1.1
  const width = Math.max(1, box.width)
  const plain = stripEditorRichTextHtml(getEditorRichTextHtml(box, fallbackText)).replace(/\u00a0/g, ' ') || 'Text'
  const approxCharsPerLine = Math.max(1, Math.floor(width / Math.max(1, fontSize * 0.52)))
  const lines = plain
    .replace(/\r\n/g, '\n')
    .split('\n')
    .reduce((count, line) => count + Math.max(1, Math.ceil((line.trim().length || 1) / approxCharsPerLine)), 0)
  return Math.max(fontSize + 8, Math.ceil(lines * fontSize * lineHeight))
}

export const measureEditorRichTextContentHeight = (
  box: EditorRichTextBox,
  fallbackText = '',
  options: {
    defaultFontFamily?: string
    defaultFontSize?: number
    defaultLineHeight?: number
  } = {},
) => {
  if (typeof document === 'undefined') return approximateRichTextHeight(box, fallbackText)

  const width = Math.max(1, Math.round(box.width))
  const element = document.createElement('div')
  element.setAttribute('data-rich-text-editor', 'true')
  element.style.cssText = `
    position:fixed;
    left:-10000px;
    top:0;
    width:${width}px;
    box-sizing:border-box;
    visibility:hidden;
    pointer-events:none;
    color:${box.color || '#111111'};
    font-family:${box.fontFamily || options.defaultFontFamily || 'Arial'};
    font-size:${box.fontSize || options.defaultFontSize || 28}px;
    font-style:${box.fontStyle?.includes('italic') ? 'italic' : 'normal'};
    font-weight:${getCssFontWeight(box.fontStyle)};
    line-height:${box.lineHeight || options.defaultLineHeight || 1.1};
    letter-spacing:${box.letterSpacing || 0}px;
    text-align:${box.textAlign || box.align || 'left'};
    overflow-wrap:anywhere;
    word-break:break-word;
    white-space:normal;
  `
  const style = document.createElement('style')
  style.textContent = EDITOR_RICH_TEXT_EDITOR_SCOPE_CSS
  element.appendChild(style)
  const content = document.createElement('div')
  content.innerHTML = normalizeEditorRichTextHtml(getEditorRichTextHtml(box, fallbackText))
  element.appendChild(content)
  document.body.appendChild(element)
  const measured = Math.ceil(content.scrollHeight || element.scrollHeight || approximateRichTextHeight(box, fallbackText))
  element.remove()
  return Math.max(1, measured)
}

export const buildEditorRichTextSvgDataUrl = (
  box: EditorRichTextBox,
  fallbackText = '',
  options: {
    defaultFontFamily?: string
    defaultFontSize?: number
    defaultLineHeight?: number
  } = {},
) => {
  const width = Math.max(1, Math.round(box.width))
  const height = Math.max(
    1,
    Math.round(box.height ?? measureEditorRichTextContentHeight(box, fallbackText, options)),
  )
  const html = getSvgSafeEditorRichTextHtml(normalizeEditorRichTextHtml(getEditorRichTextHtml(box, fallbackText)))
  const fontStyle = box.fontStyle || ''
  const cssFontStyle = fontStyle.includes('italic') ? 'italic' : 'normal'
  const cssFontWeight = getCssFontWeight(fontStyle)
  const textStroke =
    box.strokeWidth && box.strokeColor
      ? `-webkit-text-stroke:${box.strokeWidth}px ${box.strokeColor};paint-order:stroke fill;`
      : ''
  const wrapper = `
    <div xmlns="http://www.w3.org/1999/xhtml" style="
      width:${width}px;
      height:${height}px;
      box-sizing:border-box;
      overflow:hidden;
      color:${box.color || '#111111'};
      font-family:${box.fontFamily || options.defaultFontFamily || 'Arial'};
      font-size:${box.fontSize || options.defaultFontSize || 28}px;
      font-style:${cssFontStyle};
      font-weight:${cssFontWeight};
      line-height:${box.lineHeight || options.defaultLineHeight || 1.1};
      letter-spacing:${box.letterSpacing || 0}px;
      text-align:${box.textAlign || box.align || 'left'};
      overflow-wrap:anywhere;
      word-break:break-word;
      white-space:normal;
      ${textStroke}
    ">
      <style>${EDITOR_RICH_TEXT_LAYOUT_CSS}</style>
      ${html}
    </div>
  `
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${wrapper}</foreignObject></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function useEditorAutosave({ debounceMs = 1200, enabled, onError, onSave, revision }: AutosaveOptions) {
  const [state, setState] = useState<AutosaveState>({
    error: null,
    lastSavedAt: null,
    status: 'idle',
  })
  const saveRef = useRef(onSave)
  const errorRef = useRef(onError)
  const latestRevisionRef = useRef(revision)
  const savedRevisionRef = useRef(0)
  const isSavingRef = useRef(false)

  useEffect(() => {
    saveRef.current = onSave
  }, [onSave])

  useEffect(() => {
    errorRef.current = onError
  }, [onError])

  useEffect(() => {
    latestRevisionRef.current = revision
  }, [revision])

  useEffect(() => {
    if (!enabled || revision <= 0) return
    if (revision <= savedRevisionRef.current) return

    setState((current) => ({
      ...current,
      error: null,
      status: current.status === 'saving' ? current.status : 'dirty',
    }))

    const timer = window.setTimeout(async () => {
      if (isSavingRef.current || latestRevisionRef.current <= savedRevisionRef.current) return

      isSavingRef.current = true
      setState((current) => ({ ...current, error: null, status: 'saving' }))

      try {
        await saveRef.current()
        savedRevisionRef.current = latestRevisionRef.current
        setState({
          error: null,
          lastSavedAt: Date.now(),
          status: 'saved',
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setState((current) => ({
          ...current,
          error: message,
          status: 'error',
        }))
        errorRef.current?.(message)
      } finally {
        isSavingRef.current = false
      }
    }, debounceMs)

    return () => window.clearTimeout(timer)
  }, [debounceMs, enabled, revision])

  const markSaved = useCallback(() => {
    savedRevisionRef.current = latestRevisionRef.current
    setState({
      error: null,
      lastSavedAt: Date.now(),
      status: 'saved',
    })
  }, [])

  const resetAutosave = useCallback(() => {
    savedRevisionRef.current = latestRevisionRef.current
    setState({
      error: null,
      lastSavedAt: null,
      status: 'idle',
    })
  }, [])

  const setDirty = useCallback(() => {
    setState((current) => ({
      ...current,
      error: null,
      status: current.status === 'saving' ? current.status : 'dirty',
    }))
  }, [])

  return useMemo(
    () => ({
      autosaveState: state,
      markSaved,
      resetAutosave,
      setDirty,
    }),
    [markSaved, resetAutosave, setDirty, state],
  )
}

export const EDITOR_COMPONENTS: EditorComponentDefinition[] = [
  {
    id: 'cta-ribbon',
    label: 'CTA Ribbon',
    description: 'Full-width action ribbon with a strong CTA.',
    build: ({ brandBlue, stageWidth, websiteText }) => {
      const width = Math.min(760, stageWidth - 120)
      const x = Math.round((stageWidth - width) / 2)
      return {
        rects: [
          {
            id: createEditorNodeID('custom-rect'),
            x,
            y: 120,
            width,
            height: 124,
            fill: brandBlue,
          },
        ],
        texts: [
          {
            id: createEditorNodeID('custom-text'),
            x: x + 36,
            y: 148,
            width: width - 72,
            text: `Read the plan at ${websiteText}`,
            fontSize: 36,
            color: '#ffffff',
            fontFamily: 'Arial',
            fontStyle: '700',
            lineHeight: 1.05,
          },
        ],
      }
    },
  },
  {
    id: 'stat-callout',
    label: 'Stat Callout',
    description: 'Large-number callout with supporting explanation.',
    build: ({ brandBlue, brandRed, stageWidth }) => {
      const width = 420
      const x = Math.round(stageWidth - width - 90)
      return {
        rects: [
          {
            id: createEditorNodeID('custom-rect'),
            x,
            y: 160,
            width,
            height: 260,
            fill: '#ffffff',
          },
          {
            id: createEditorNodeID('custom-rect'),
            x,
            y: 160,
            width: 14,
            height: 260,
            fill: brandRed,
          },
        ],
        texts: [
          {
            id: createEditorNodeID('custom-text'),
            x: x + 40,
            y: 194,
            width: width - 60,
            text: '$400M',
            fontSize: 70,
            color: brandBlue,
            fontFamily: 'Georgia, Times New Roman, serif',
            fontStyle: '700',
            lineHeight: 1,
          },
          {
            id: createEditorNodeID('custom-text'),
            x: x + 40,
            y: 278,
            width: width - 70,
            text: 'Tax and fee relief for Connecticut residents.',
            fontSize: 28,
            color: '#111827',
            fontFamily: 'Arial',
            fontStyle: '700',
            lineHeight: 1.15,
          },
        ],
      }
    },
  },
  {
    id: 'quote-card',
    label: 'Quote Card',
    description: 'Framed quote block with attribution.',
    build: ({ brandBlue, stageWidth }) => {
      const width = Math.min(560, stageWidth - 160)
      const x = 80
      return {
        rects: [
          {
            id: createEditorNodeID('custom-rect'),
            x,
            y: 240,
            width,
            height: 254,
            fill: '#f8fafc',
          },
          {
            id: createEditorNodeID('custom-rect'),
            x: x + 24,
            y: 264,
            width: 52,
            height: 6,
            fill: brandBlue,
          },
        ],
        texts: [
          {
            id: createEditorNodeID('custom-text'),
            x: x + 24,
            y: 294,
            width: width - 48,
            text: '"Real relief should show up in everyday family budgets."',
            fontSize: 34,
            color: '#0f172a',
            fontFamily: 'Georgia, Times New Roman, serif',
            fontStyle: '700',
            lineHeight: 1.12,
          },
          {
            id: createEditorNodeID('custom-text'),
            x: x + 24,
            y: 420,
            width: width - 48,
            text: 'State Representative',
            fontSize: 22,
            color: '#475569',
            fontFamily: 'Arial',
            fontStyle: '700',
            lineHeight: 1.05,
          },
        ],
      }
    },
  },
  {
    id: 'badge-pill',
    label: 'Badge Pill',
    description: 'Small category badge for highlighting one idea.',
    build: ({ brandRed }) => ({
      rects: [
        {
          id: createEditorNodeID('custom-rect'),
          x: 90,
          y: 90,
          width: 250,
          height: 60,
          fill: brandRed,
        },
      ],
      texts: [
        {
          id: createEditorNodeID('custom-text'),
          x: 120,
          y: 104,
          width: 190,
          text: 'AFFORDABILITY',
          fontSize: 24,
          color: '#ffffff',
          fontFamily: 'Arial',
          fontStyle: '700',
          lineHeight: 1,
        },
      ],
    }),
  },
  {
    id: 'info-card',
    label: 'Info Card',
    description: 'Compact info block for web or QR follow-up.',
    build: ({ brandBlue, stageHeight, stageWidth, websiteText }) => {
      const width = 360
      const x = Math.round(stageWidth - width - 72)
      const y = Math.round(stageHeight - 232)
      return {
        rects: [
          {
            id: createEditorNodeID('custom-rect'),
            x,
            y,
            width,
            height: 176,
            fill: '#ffffff',
          },
          {
            id: createEditorNodeID('custom-rect'),
            x: x + 24,
            y: y + 28,
            width: 88,
            height: 88,
            fill: '#e2e8f0',
          },
          {
            id: createEditorNodeID('custom-rect'),
            x: x + 132,
            y: y + 28,
            width: 180,
            height: 8,
            fill: brandBlue,
          },
        ],
        texts: [
          {
            id: createEditorNodeID('custom-text'),
            x: x + 132,
            y: y + 48,
            width: 180,
            text: 'Scan for details',
            fontSize: 28,
            color: '#0f172a',
            fontFamily: 'Arial',
            fontStyle: '700',
            lineHeight: 1.05,
          },
          {
            id: createEditorNodeID('custom-text'),
            x: x + 132,
            y: y + 94,
            width: 188,
            text: websiteText,
            fontSize: 18,
            color: '#475569',
            fontFamily: 'Arial',
            fontStyle: '700',
            lineHeight: 1.05,
          },
        ],
      }
    },
  },
]
