'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type Konva from 'konva'
import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, Underline } from 'lucide-react'
import { Group, Image as KonvaImage, Layer, Rect, Stage, Text, Transformer } from 'react-konva'
import { useAuth } from '@payloadcms/ui'

import {
  EDITOR_RICH_TEXT_EDITOR_SCOPE_CSS,
  TEXT_ALIGNMENT_OPTIONS,
  TEXT_FONT_OPTIONS,
  buildEditorRichTextSvgDataUrl,
  buildFontStyle,
  convertPlainTextToEditorHtml,
  getCssFontWeight,
  getEditorRichTextHtml,
  getFontStyleFlags,
  measureEditorRichTextContentHeight,
  normalizeEditorRichTextHtml,
  stripEditorRichTextHtml,
} from '@/components/admin/graphicsEditorShared'
import { useActiveTenant } from '@/components/admin/hooks/useActiveTenant'
import type {
  GraphicHeadshotBinding,
  GraphicHeadshotLayer,
  GraphicImageLayer,
  GraphicRepRole,
  GraphicScene,
  GraphicTextAlign,
  GraphicTextLayer,
} from '@/lib/graphics/defaultScene'
import { defaultGraphicScene, normalizeGraphicScene } from '@/lib/graphics/defaultScene'

const STAGE_WIDTH = 1200
const STAGE_HEIGHT = 630
const HEADSHOT_SIZE_LIMITS = { min: 180, max: 560 }
const TITLE_WIDTH_LIMITS = { min: 220, max: 860 }
const REP_NAME_WIDTH_LIMITS = { min: 180, max: 520 }
const IMAGE_WIDTH_LIMITS = { min: 80, max: 1040 }
const IMAGE_HEIGHT_LIMITS = { min: 80, max: 540 }
const STACK_BREAKPOINT = 1080
const COMPACT_BREAKPOINT = 1320
const WIDE_BREAKPOINT = 1600
const BRAND_COLORS = ['#102145', '#152b70', '#a02626', '#b91c1c', '#ffffff', '#111827']

type MediaDoc = {
  id: string
  alt?: string | null
  url?: string | null
  thumbnailURL?: string | null
  filename?: string | null
  title?: string | null
}

type TenantDoc = {
  id: string
  name?: string | null
  slug?: string | null
}

type TenantRelation = string | TenantDoc | null | undefined

type PostDoc = {
  id: string
  title?: string | null
  graphicTemplate?: string | null
  graphicDesign?: string | null
  meta?: {
    image?: string | MediaDoc | null
  } | null
}

type RepInfoDoc = {
  id: string
  name?: string | null
  officeTitle?: string | null
}

type StandardMediaDoc = {
  id: string
  mobileHeadshot?: string | MediaDoc | null
  bannerImage?: string | MediaDoc | null
  defaultFeaturedImage?: string | MediaDoc | null
}

type TemplateDoc = {
  id: string
  title?: string | null
  backgroundImage?: string | MediaDoc | null
  scene?: GraphicScene | null
}

type DesignDoc = {
  id: string
  title?: string | null
  updatedAt?: string | null
  template?: string | TemplateDoc | null
  sourcePost?: string | PostDoc | null
  primaryTenant?: TenantRelation
  secondaryTenant?: TenantRelation
  backgroundImage?: string | MediaDoc | null
  titleOverride?: string | null
  scene?: GraphicScene | null
  exportedMedia?: string | MediaDoc | null
}

type TenantAssets = {
  repInfo: RepInfoDoc | null
  standardMedia: StandardMediaDoc | null
}

type Selection =
  | { kind: 'headline' }
  | { kind: 'repName'; role: GraphicRepRole }
  | { kind: 'headshot'; id: string }
  | { kind: 'image'; id: string }
  | null

type CanvasContextMenuState = {
  x: number
  y: number
  target: Exclude<Selection, null> | 'canvas'
} | null

type PickerState = {
  open: boolean
  query: string
  target: 'background' | { kind: 'image'; id: string }
}

type GraphicHeadshotBindingPatch = {
  type?: GraphicHeadshotBinding['type']
  role?: GraphicRepRole
  mediaID?: string | null
}

type EditableTextTarget =
  | { kind: 'headline' }
  | { kind: 'repName'; role: GraphicRepRole }

type InlineTextEditorState = {
  target: EditableTextTarget
  html: string
} | null

const getEditableTextTargetKey = (target: EditableTextTarget) =>
  target.kind === 'headline' ? 'headline' : `repName:${target.role}`

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}

const getString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)

const getMediaDoc = (value: unknown): MediaDoc | null =>
  value && typeof value === 'object' && typeof (value as Record<string, unknown>).id === 'string'
    ? (value as MediaDoc)
    : null

const getTenantDoc = (value: unknown): TenantDoc | null =>
  value && typeof value === 'object' && typeof (value as Record<string, unknown>).id === 'string'
    ? (value as TenantDoc)
    : null

const getMediaID = (value: unknown): string | undefined => {
  const mediaDoc = getMediaDoc(value)
  return mediaDoc?.id
}

const getTenantID = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value
  return getTenantDoc(value)?.id
}

const proxiedUrl = (url: string | undefined | null) => {
  if (typeof url !== 'string' || url.length === 0) return undefined
  if (url.startsWith('/')) return url
  return `/api/media-proxy?url=${encodeURIComponent(url)}`
}

const readSelectedImageUrl = (mediaValue: string | MediaDoc | null | undefined) => {
  const mediaDoc = getMediaDoc(mediaValue)
  if (mediaDoc?.url) return proxiedUrl(mediaDoc.url)
  return undefined
}

const getBindingType = (headshot: GraphicHeadshotLayer): GraphicHeadshotBinding['type'] => headshot.binding?.type || 'tenant-headshot'

function useLoadedImage(src: string | undefined) {
  const [image, setImage] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    if (!src) {
      setImage(null)
      return
    }

    let cancelled = false
    const nextImage = new window.Image()
    nextImage.crossOrigin = 'anonymous'
    nextImage.onload = () => {
      if (!cancelled) setImage(nextImage)
    }
    nextImage.src = src

    return () => {
      cancelled = true
    }
  }, [src])

  return image
}

function useLoadedImages(srcByID: Record<string, string | undefined>) {
  const [images, setImages] = useState<Record<string, HTMLImageElement | null>>({})

  useEffect(() => {
    const entries = Object.entries(srcByID)
    if (!entries.length) {
      setImages({})
      return
    }

    let cancelled = false
    setImages((current) => {
      const next: Record<string, HTMLImageElement | null> = {}
      for (const [id] of entries) next[id] = current[id] || null
      return next
    })

    entries.forEach(([id, src]) => {
      if (!src) return
      const nextImage = new window.Image()
      nextImage.crossOrigin = 'anonymous'
      nextImage.onload = () => {
        if (cancelled) return
        setImages((current) => ({ ...current, [id]: nextImage }))
      }
      nextImage.onerror = () => {
        if (cancelled) return
        setImages((current) => ({ ...current, [id]: current[id] || null }))
      }
      nextImage.src = src
    })

    return () => {
      cancelled = true
    }
  }, [srcByID])

  return images
}

function useContainerWidth() {
  const ref = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const updateWidth = () => setWidth(element.clientWidth)
    updateWidth()

    const observer = new ResizeObserver(() => updateWidth())
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return { ref, width }
}

function useViewportWidth() {
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const update = () => setWidth(window.innerWidth)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return width
}

function wrapText(text: string, font: string, maxWidth: number) {
  const paragraphs = text.replace(/\r\n/g, '\n').split('\n')
  const allLines: string[] = []

  const measureWrap = (rawParagraph: string) => {
    const words = rawParagraph.trim().split(/\s+/).filter(Boolean)
    if (!words.length) return ['']

    if (typeof document === 'undefined') {
      const match = /(\d+)px/.exec(font)
      const fontSize = match?.[1] ? Number(match[1]) : 34
      const approxCharWidth = fontSize * 0.52
      const maxChars = Math.max(8, Math.floor(maxWidth / approxCharWidth))
      const lines: string[] = []
      let current = words[0] || ''

      for (const word of words.slice(1)) {
        const next = `${current} ${word}`
        if (next.length <= maxChars) current = next
        else {
          lines.push(current)
          current = word
        }
      }

      lines.push(current)
      return lines
    }

    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) return [rawParagraph]

    context.font = font
    const lines: string[] = []
    let current = words[0] || ''

    for (const word of words.slice(1)) {
      const next = `${current} ${word}`
      if (context.measureText(next).width <= maxWidth) current = next
      else {
        lines.push(current)
        current = word
      }
    }

    lines.push(current)
    return lines
  }

  paragraphs.forEach((paragraph, index) => {
    allLines.push(...measureWrap(paragraph))
    if (index < paragraphs.length - 1) allLines.push('')
  })

  return allLines
}

const stripHtml = stripEditorRichTextHtml
const convertPlainTextToHtml = convertPlainTextToEditorHtml
const RICH_TEXT_EDITOR_SCOPE_CSS = EDITOR_RICH_TEXT_EDITOR_SCOPE_CSS

const RICH_TEXT_BLOCK_SELECTOR = 'p, div, h1, h2, h3, li'

const normalizeRichTextHtml = normalizeEditorRichTextHtml

const resetRichTextContentScale = (node: Konva.Node) => {
  ;(node as Konva.Container)
    .find?.('.rich-text-render-content')
    .forEach((child) => {
      child.scaleX(1)
      child.scaleY(1)
    })
}

const getTextLayerHtml = (layer: GraphicTextLayer, fallbackText: string) =>
  getEditorRichTextHtml(layer, fallbackText)

const isRichTextBlockElement = (node: Node | null): node is HTMLElement =>
  node instanceof HTMLElement && /^(P|DIV|H1|H2|H3|LI)$/i.test(node.tagName)

const getClosestRichTextBlock = (node: Node | null, root: HTMLElement): HTMLElement | null => {
  let current: Node | null = node
  while (current && current !== root) {
    if (isRichTextBlockElement(current)) return current
    current = current.parentNode
  }
  return null
}

const selectionMatchesWholeBlock = (range: Range, block: HTMLElement) => {
  const blockRange = document.createRange()
  blockRange.selectNodeContents(block)
  return (
    range.compareBoundaryPoints(Range.START_TO_START, blockRange) === 0 &&
    range.compareBoundaryPoints(Range.END_TO_END, blockRange) === 0
  )
}

const measureRichTextLayerHeight = (layer: GraphicTextLayer, fallbackText: string) => {
  return Math.max(
    1,
    Math.round(
      layer.height ??
        measureEditorRichTextContentHeight(layer, fallbackText, {
          defaultFontFamily: 'Georgia, Times New Roman, serif',
          defaultFontSize: 28,
          defaultLineHeight: 1.08,
        }),
    ),
  )
}

const buildRichTextSvgDataUrl = (layer: GraphicTextLayer, fallbackText: string) => {
  return buildEditorRichTextSvgDataUrl(layer, fallbackText, {
    defaultFontFamily: 'Georgia, Times New Roman, serif',
    defaultFontSize: 28,
    defaultLineHeight: 1.08,
  })
}

function fitHeadlineText(text: string, layer: GraphicTextLayer, fitScale = 1) {
  const clean = text.length > 0 ? text : 'Headline'
  const layerHeight = Math.max(120, Math.round((layer.height ?? 200) * fitScale))
  const layerWidth = Math.max(220, Math.round(layer.width * fitScale))
  const fontFamily = layer.fontFamily || 'Georgia, Times New Roman, serif'

  const startFontSize = Math.max(28, Math.round((layer.fontSize || 38) * fitScale))
  const endFontSize = Math.max(14, Math.round(18 * fitScale))

  for (let fontSize = startFontSize; fontSize >= endFontSize; fontSize -= 1) {
    const lineHeight = Math.round(fontSize * 1.08)
    const lines = wrapText(clean, `${fontSize}px ${fontFamily}`, layerWidth)
    if (lines.length <= 7 && lines.length * lineHeight <= layerHeight) {
      return { fontSize, lineHeight, lines }
    }
  }

  const fallbackFontSize = endFontSize
  const lines = wrapText(clean, `${fallbackFontSize}px ${fontFamily}`, layerWidth).slice(0, 7)
  return { fontSize: fallbackFontSize, lineHeight: Math.max(18, Math.round(fallbackFontSize * 1.08)), lines }
}

function computeHeadshotPlacement(image: HTMLImageElement | null, layer: GraphicHeadshotLayer) {
  const frame = { width: layer.size, height: layer.size }
  if (!image) return { width: frame.width, height: frame.height, x: 0, y: 0 }

  const baseScale = Math.max(frame.width / image.width, frame.height / image.height)
  const scale = baseScale * layer.crop.zoom
  const width = image.width * scale
  const height = image.height * scale
  const centeredX = (frame.width - width) / 2
  const centeredY = (frame.height - height) / 2
  const minX = Math.min(0, frame.width - width)
  const minY = Math.min(0, frame.height - height)
  const x = clamp(centeredX + layer.crop.offsetX, minX, 0)
  const y = clamp(centeredY + layer.crop.offsetY, minY, 0)

  return { width, height, x, y }
}

function dataUrlToBlob(dataUrl: string) {
  const [header, content] = dataUrl.split(',')
  const match = header?.match(/data:(.*?);base64/)
  const mime = match?.[1] || 'image/png'
  const binary = atob(content || '')
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type: mime })
}

const getRepLabel = (name: string | undefined | null) => {
  if (!name) return 'REP. NAME'
  return `REP. ${name.toUpperCase()}`
}

const dedupeMediaOptions = (docs: MediaDoc[]) => {
  const seen = new Set<string>()
  return docs.filter((item) => {
    if (!item.id || seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

const buildDesignTitle = (postTitle: string | undefined | null, fallback: string) => postTitle || fallback || 'Graphic Design'

const buildMediaSearchParams = (tenantID: string, query: string) => {
  const params = new URLSearchParams({
    limit: '24',
    depth: '0',
    sort: '-updatedAt',
    'where[tenant][equals]': tenantID,
  })

  const cleanQuery = query.trim()
  if (cleanQuery) {
    params.set('where[or][0][alt][contains]', cleanQuery)
    params.set('where[or][1][title][contains]', cleanQuery)
    params.set('where[or][2][filename][contains]', cleanQuery)
  }

  return params
}

const buildGraphicDesignSearchParams = (tenantID: string, query: string) => {
  const params = new URLSearchParams({
    limit: '12',
    depth: '1',
    sort: '-updatedAt',
    'where[tenant][equals]': tenantID,
  })

  const cleanQuery = query.trim()
  if (cleanQuery) {
    params.set('where[or][0][title][contains]', cleanQuery)
    params.set('where[or][1][notes][contains]', cleanQuery)
  }

  return params
}

const upsertGraphicDesign = (list: DesignDoc[], nextDoc: DesignDoc) => {
  const seen = new Set<string>()
  return [nextDoc, ...list]
    .filter((item) => {
      if (!item.id || seen.has(item.id)) return false
      seen.add(item.id)
      return true
    })
    .slice(0, 12)
}

const isEditableTextSelection = (selection: Selection): selection is EditableTextTarget => {
  if (!selection) return false
  return selection.kind === 'headline' || selection.kind === 'repName'
}

const hasSuperRole = (value: unknown) => {
  if (!value || typeof value !== 'object') return false
  const roles = (value as { roles?: unknown }).roles
  return Array.isArray(roles) && roles.includes('super')
}

export const GraphicTemplateEditor: React.FC = () => {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user } = useAuth()
  const templateIdParam = searchParams.get('templateId') || ''
  const designIdParam = searchParams.get('designId') || ''
  const { tenantID, tenantName } = useActiveTenant()
  const stageRef = useRef<Konva.Stage | null>(null)
  const transformerRef = useRef<Konva.Transformer | null>(null)
  const headshotRefs = useRef<Record<string, Konva.Group | null>>({})
  const imageRefs = useRef<Record<string, Konva.Group | null>>({})
  const titleRef = useRef<Konva.Group | null>(null)
  const repNameRefs = useRef<Record<GraphicRepRole, Konva.Group | null>>({
    primary: null,
    secondary: null,
  })
  const textToolbarRef = useRef<HTMLDivElement | null>(null)
  const richTextEditorRef = useRef<HTMLDivElement | null>(null)
  const richTextEditorSeedRef = useRef<string | null>(null)
  const richTextSelectionRef = useRef<Range | null>(null)
  const textTransformPreviewRef = useRef<Record<string, Partial<GraphicTextLayer>>>({})
  const backgroundUploadRef = useRef<HTMLInputElement | null>(null)
  const { ref: stageContainerRef, width: stageContainerWidth } = useContainerWidth()
  const viewportWidth = useViewportWidth()

  const [loading, setLoading] = useState(true)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [savingDesign, setSavingDesign] = useState(false)
  const [savingMedia, setSavingMedia] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [canvasMenu, setCanvasMenu] = useState<CanvasContextMenuState>(null)
  const [uploadingBackground, setUploadingBackground] = useState(false)
  const [backgroundPicker, setBackgroundPicker] = useState<PickerState>({ open: false, query: '', target: 'background' })
  const [designBrowserQuery, setDesignBrowserQuery] = useState('')
  const [graphicDesigns, setGraphicDesigns] = useState<DesignDoc[]>([])
  const [loadingGraphicDesigns, setLoadingGraphicDesigns] = useState(false)
  const [imageLayerCache, setImageLayerCache] = useState<Record<string, HTMLImageElement | null>>({})
  const [collapsedPanels, setCollapsedPanels] = useState<Record<string, boolean>>({
    template: false,
    content: true,
    text: false,
    repBindings: true,
    headshots: true,
    images: false,
    background: true,
    designs: true,
  })
  const [inlineTextEditor, setInlineTextEditor] = useState<InlineTextEditorState>(null)
  const [textTransformPreview, setTextTransformPreview] = useState<Record<string, Partial<GraphicTextLayer>>>({})

  const [postDoc, setPostDoc] = useState<PostDoc | null>(null)
  const [templates, setTemplates] = useState<TemplateDoc[]>([])
  const [designID, setDesignID] = useState<string>(designIdParam)
  const [templateID, setTemplateID] = useState<string>(templateIdParam)
  const [templateTitle, setTemplateTitle] = useState('Newsroom Card')
  const [backgroundMediaID, setBackgroundMediaID] = useState<string>('')
  const [mediaOptions, setMediaOptions] = useState<MediaDoc[]>([])
  const [backgroundPickerItems, setBackgroundPickerItems] = useState<MediaDoc[]>([])
  const [tenants, setTenants] = useState<TenantDoc[]>([])
  const [primaryAssets, setPrimaryAssets] = useState<TenantAssets>({ repInfo: null, standardMedia: null })
  const [secondaryAssets, setSecondaryAssets] = useState<TenantAssets>({ repInfo: null, standardMedia: null })

  const [secondaryTenantID, setSecondaryTenantID] = useState<string>('')
  const [scene, setScene] = useState<GraphicScene>(defaultGraphicScene())
  const [titleOverride, setTitleOverride] = useState('')
  const [selection, setSelection] = useState<Selection>(null)

  const docID = searchParams.get('docId') || ''
  const collection = searchParams.get('collection') || 'posts'
  const isStackedLayout = viewportWidth > 0 && viewportWidth < STACK_BREAKPOINT
  const sidebarColumnWidth = useMemo(() => {
    if (isStackedLayout) return undefined
    if (viewportWidth < COMPACT_BREAKPOINT) return 320
    if (viewportWidth < WIDE_BREAKPOINT) return 348
    return 384
  }, [isStackedLayout, viewportWidth])
  const editorGridColumns = useMemo(() => {
    if (isStackedLayout) return 'minmax(0, 1fr)'
    return `${sidebarColumnWidth || 348}px minmax(0, 1fr)`
  }, [isStackedLayout, sidebarColumnWidth])

  const headlineText = scene.headlineLayer.text || titleOverride || postDoc?.title || 'Headline'
  const viewportStageWidth = useMemo(() => {
    if (!viewportWidth) return stageContainerWidth || STAGE_WIDTH

    if (isStackedLayout) {
      return Math.max(0, viewportWidth - 72)
    }

    const outerPadding = 48
    const gridGap = 20
    const sectionPadding = 48
    const sectionBorderAllowance = 4
    const innerStagePadding = 24

    return Math.max(
      0,
      viewportWidth -
        outerPadding -
        (sidebarColumnWidth || 348) -
        gridGap -
        sectionPadding -
        innerStagePadding -
        sectionBorderAllowance,
    )
  }, [isStackedLayout, sidebarColumnWidth, stageContainerWidth, viewportWidth])
  const contentFitScale = useMemo(() => {
    if (!stageContainerWidth) return 1
    return clamp(stageContainerWidth / 1600, 0.82, 1)
  }, [stageContainerWidth])
  const previewScale = useMemo(() => {
    const measuredWidth = stageContainerWidth
      ? stageContainerWidth - (isStackedLayout ? 8 : 24)
      : STAGE_WIDTH
    const availableWidth = Math.max(0, Math.min(measuredWidth, viewportStageWidth))
    return Math.min(availableWidth / STAGE_WIDTH, 1)
  }, [isStackedLayout, stageContainerWidth, viewportStageWidth])

  const selectedTemplate = useMemo(() => templates.find((item) => item.id === templateID) || null, [templateID, templates])

  const backgroundOption = useMemo(() => {
    return (
      mediaOptions.find((item) => item.id === backgroundMediaID) ||
      getMediaDoc(selectedTemplate?.backgroundImage) ||
      null
    )
  }, [backgroundMediaID, mediaOptions, selectedTemplate])

  const backgroundImage = useLoadedImage(proxiedUrl(backgroundOption?.url))

  const primaryRepName = getRepLabel(primaryAssets.repInfo?.name)
  const secondaryRepName = getRepLabel(secondaryAssets.repInfo?.name)
  const isSuperAdmin = hasSuperRole(user)
  const richTextRenderUrls = useMemo(
    () => ({
      headline: scene.headlineLayer.html?.trim() ? buildRichTextSvgDataUrl(scene.headlineLayer, headlineText) : undefined,
      primary: scene.repNameLayers.primary.html?.trim()
        ? buildRichTextSvgDataUrl(scene.repNameLayers.primary, primaryRepName)
        : undefined,
      secondary:
        secondaryTenantID && scene.repNameLayers.secondary.html?.trim()
          ? buildRichTextSvgDataUrl(scene.repNameLayers.secondary, secondaryRepName)
          : undefined,
    }),
    [headlineText, primaryRepName, scene.headlineLayer, scene.repNameLayers.primary, scene.repNameLayers.secondary, secondaryRepName, secondaryTenantID],
  )
  const richTextRenderImages = useLoadedImages(richTextRenderUrls)

  const headshotSourceURLs = useMemo(
    () =>
      scene.headshots.map((headshot) => {
        if (headshot.binding.type === 'none') return undefined
        if (headshot.binding.type === 'media') {
          const mediaID = headshot.binding.mediaID
          return proxiedUrl(mediaOptions.find((media) => media.id === mediaID)?.url)
        }
        if (headshot.binding.role === 'secondary') return readSelectedImageUrl(secondaryAssets.standardMedia?.mobileHeadshot)
        return readSelectedImageUrl(primaryAssets.standardMedia?.mobileHeadshot)
      }),
    [mediaOptions, primaryAssets.standardMedia?.mobileHeadshot, scene.headshots, secondaryAssets.standardMedia?.mobileHeadshot],
  )

  const imageLayerSourceURLs = useMemo(
    () =>
      scene.imageLayers.map((layer) => {
        const doc = mediaOptions.find((media) => media.id === layer.mediaID)
        return proxiedUrl(doc?.url)
      }),
    [mediaOptions, scene.imageLayers],
  )

  const headshotImages = [useLoadedImage(headshotSourceURLs[0]), useLoadedImage(headshotSourceURLs[1])]
  const fittedHeadline = useMemo(
    () => fitHeadlineText(headlineText, scene.headlineLayer, contentFitScale),
    [contentFitScale, headlineText, scene.headlineLayer],
  )

  const secondaryTenantOptions = useMemo(
    () => tenants.filter((tenant) => tenant.id !== tenantID),
    [tenantID, tenants],
  )

  useEffect(() => {
    const loadTenantAssets = async (nextTenantID: string): Promise<TenantAssets> => {
      const [repResponse, standardResponse] = await Promise.all([
        fetch(`/api/rep-info?limit=1&where[tenant][equals]=${encodeURIComponent(nextTenantID)}&depth=0`, {
          credentials: 'include',
        }),
        fetch(`/api/standard-media?limit=1&where[tenant][equals]=${encodeURIComponent(nextTenantID)}&depth=1`, {
          credentials: 'include',
        }),
      ])

      const repPayload = repResponse.ok ? await repResponse.json() : null
      const standardPayload = standardResponse.ok ? await standardResponse.json() : null

      return {
        repInfo: Array.isArray(repPayload?.docs) ? ((repPayload.docs[0] as RepInfoDoc | undefined) ?? null) : null,
        standardMedia: Array.isArray(standardPayload?.docs)
          ? ((standardPayload.docs[0] as StandardMediaDoc | undefined) ?? null)
          : null,
      }
    }

    const load = async () => {
      if (!tenantID) {
        setLoading(false)
        return
      }

      setLoading(true)
      setMessage(null)

      try {
        const requests: Promise<Response>[] = [
          fetch('/api/graphic-templates?limit=100&depth=1&sort=title', { credentials: 'include' }),
          fetch(`/api/media?limit=80&where[tenant][equals]=${encodeURIComponent(tenantID)}&depth=0&sort=-updatedAt`, {
            credentials: 'include',
          }),
          fetch('/api/tenants?limit=250&depth=0&sort=name', { credentials: 'include' }),
          fetch(`/api/rep-info?limit=1&where[tenant][equals]=${encodeURIComponent(tenantID)}&depth=0`, {
            credentials: 'include',
          }),
          fetch(`/api/standard-media?limit=1&where[tenant][equals]=${encodeURIComponent(tenantID)}&depth=1`, {
            credentials: 'include',
          }),
        ]

        if (docID && collection === 'posts') {
          requests.push(fetch(`/api/posts/${docID}?draft=true&depth=1`, { credentials: 'include' }))
        }

        const responses = await Promise.all(requests)
        const payloads = await Promise.all(responses.map(async (response) => (response.ok ? response.json() : null)))

        const [templatesPayload, mediaPayload, tenantsPayload, repPayload, standardPayload, postPayload] = payloads
        const nextTemplates = Array.isArray(templatesPayload?.docs) ? (templatesPayload.docs as TemplateDoc[]) : []
        const nextMedia = Array.isArray(mediaPayload?.docs) ? (mediaPayload.docs as MediaDoc[]) : []
        const nextTenants = Array.isArray(tenantsPayload?.docs) ? (tenantsPayload.docs as TenantDoc[]) : []
        const nextPrimaryAssets: TenantAssets = {
          repInfo: Array.isArray(repPayload?.docs) ? ((repPayload.docs[0] as RepInfoDoc | undefined) ?? null) : null,
          standardMedia: Array.isArray(standardPayload?.docs)
            ? ((standardPayload.docs[0] as StandardMediaDoc | undefined) ?? null)
            : null,
        }
        const nextPost = (postPayload as PostDoc | null) ?? null

        setTemplates(nextTemplates)
        setMediaOptions(dedupeMediaOptions(nextMedia))
        setTenants(nextTenants)
        setPrimaryAssets(nextPrimaryAssets)
        setPostDoc(nextPost)

        const resolvedDesignID = designIdParam || getString(nextPost?.graphicDesign) || ''
        let designDoc: DesignDoc | null = null

        if (resolvedDesignID) {
          const designResponse = await fetch(`/api/graphic-designs/${resolvedDesignID}?draft=true&depth=1`, {
            credentials: 'include',
          })
          designDoc = designResponse.ok ? ((await designResponse.json()) as DesignDoc) : null
        }

        const designTemplateID = getString(asRecord(designDoc?.template).id) || getString(designDoc?.template)
        const postTemplateID = getString(nextPost?.graphicTemplate)
        const resolvedTemplateID = templateIdParam || designTemplateID || postTemplateID || nextTemplates[0]?.id || ''
        const activeTemplate = nextTemplates.find((item) => item.id === resolvedTemplateID) || nextTemplates[0] || null

        const resolvedSecondaryTenantID = getTenantID(designDoc?.secondaryTenant) || ''

        setDesignID(designDoc?.id || '')
        setTemplateID(activeTemplate?.id || '')
        setTemplateTitle(activeTemplate?.title || 'Newsroom Card')
        setBackgroundMediaID(
          getMediaID(designDoc?.backgroundImage) ||
            getMediaID(activeTemplate?.backgroundImage) ||
            getMediaID(nextPrimaryAssets.standardMedia?.bannerImage) ||
            '',
        )
        setTitleOverride(getString(designDoc?.titleOverride) || '')
        setScene(normalizeGraphicScene(designDoc?.scene || activeTemplate?.scene || defaultGraphicScene()))
        setSecondaryTenantID(resolvedSecondaryTenantID)

        const backgroundDoc = getMediaDoc(designDoc?.backgroundImage) || getMediaDoc(activeTemplate?.backgroundImage)
        if (backgroundDoc) {
          setMediaOptions((current) => dedupeMediaOptions([backgroundDoc, ...current]))
        }

        if (resolvedSecondaryTenantID) {
          setSecondaryAssets(await loadTenantAssets(resolvedSecondaryTenantID))
        } else {
          setSecondaryAssets({ repInfo: null, standardMedia: null })
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error))
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [collection, designIdParam, docID, templateIdParam, tenantID])

  useEffect(() => {
    const loadSecondaryAssets = async () => {
      if (!secondaryTenantID) {
        setSecondaryAssets({ repInfo: null, standardMedia: null })
        return
      }

      try {
        const [repResponse, standardResponse] = await Promise.all([
          fetch(`/api/rep-info?limit=1&where[tenant][equals]=${encodeURIComponent(secondaryTenantID)}&depth=0`, {
            credentials: 'include',
          }),
          fetch(`/api/standard-media?limit=1&where[tenant][equals]=${encodeURIComponent(secondaryTenantID)}&depth=1`, {
            credentials: 'include',
          }),
        ])

        const repPayload = repResponse.ok ? await repResponse.json() : null
        const standardPayload = standardResponse.ok ? await standardResponse.json() : null

        setSecondaryAssets({
          repInfo: Array.isArray(repPayload?.docs) ? ((repPayload.docs[0] as RepInfoDoc | undefined) ?? null) : null,
          standardMedia: Array.isArray(standardPayload?.docs)
            ? ((standardPayload.docs[0] as StandardMediaDoc | undefined) ?? null)
            : null,
        })
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error))
      }
    }

    if (!loading) void loadSecondaryAssets()
  }, [loading, secondaryTenantID])

  useEffect(() => {
    const loadBackgroundChoices = async () => {
      if (!tenantID || !backgroundPicker.open) return

      try {
        const response = await fetch(`/api/media?${buildMediaSearchParams(tenantID, backgroundPicker.query).toString()}`, {
          credentials: 'include',
        })
        const payload = response.ok ? await response.json() : null
        const docs = Array.isArray(payload?.docs) ? (payload.docs as MediaDoc[]) : []
        setBackgroundPickerItems(dedupeMediaOptions(docs))
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error))
      }
    }

    void loadBackgroundChoices()
  }, [backgroundPicker.open, backgroundPicker.query, tenantID])

  useEffect(() => {
    const loadGraphicDesigns = async () => {
      if (!tenantID) return

      setLoadingGraphicDesigns(true)

      try {
        const response = await fetch(
          `/api/graphic-designs?${buildGraphicDesignSearchParams(tenantID, designBrowserQuery).toString()}`,
          { credentials: 'include' },
        )
        const payload = response.ok ? await response.json() : null
        const docs = Array.isArray(payload?.docs) ? (payload.docs as DesignDoc[]) : []
        setGraphicDesigns(docs)
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error))
      } finally {
        setLoadingGraphicDesigns(false)
      }
    }

    void loadGraphicDesigns()
  }, [designBrowserQuery, tenantID])

  useEffect(() => {
    let cancelled = false

    const loadImages = async () => {
      const pairs = await Promise.all(
        scene.imageLayers.map(async (layer, index) => {
          const src = imageLayerSourceURLs[index]
          if (!src) return [layer.id, null] as const

          const image = await new Promise<HTMLImageElement | null>((resolve) => {
            const nextImage = new window.Image()
            nextImage.crossOrigin = 'anonymous'
            nextImage.onload = () => resolve(nextImage)
            nextImage.onerror = () => resolve(null)
            nextImage.src = src
          })

          return [layer.id, image] as const
        }),
      )

      if (cancelled) return
      setImageLayerCache(Object.fromEntries(pairs))
    }

    if (typeof window !== 'undefined') void loadImages()

    return () => {
      cancelled = true
    }
  }, [imageLayerSourceURLs, scene.imageLayers])

  useEffect(() => {
    const transformer = transformerRef.current
    if (!transformer) return

    if (!selection) {
      transformer.nodes([])
      transformer.getLayer()?.batchDraw()
      return
    }

    const node =
      selection.kind === 'headline'
          ? titleRef.current
          : selection.kind === 'repName'
            ? repNameRefs.current[selection.role]
            : selection.kind === 'image'
              ? imageRefs.current[selection.id]
              : headshotRefs.current[selection.id]

    if (node) {
      transformer.nodes([node])
      transformer.getLayer()?.batchDraw()
    }
  }, [scene, selection])

  useEffect(() => {
    if (!inlineTextEditor || !richTextEditorRef.current) return
    const editorKey =
      inlineTextEditor.target.kind === 'headline'
        ? 'headline'
        : `repName:${inlineTextEditor.target.role}`
    if (richTextEditorSeedRef.current !== editorKey) {
      richTextEditorRef.current.innerHTML = inlineTextEditor.html || ''
      richTextEditorSeedRef.current = editorKey
    }
    richTextEditorRef.current.focus()
    const selectionRange = document.createRange()
    selectionRange.selectNodeContents(richTextEditorRef.current)
    selectionRange.collapse(false)
    const browserSelection = window.getSelection()
    browserSelection?.removeAllRanges()
    browserSelection?.addRange(selectionRange)
  }, [inlineTextEditor])

  const updateHeadline = (patch: Partial<GraphicTextLayer>) => {
    setScene((current) => ({ ...current, headlineLayer: { ...current.headlineLayer, ...patch } }))
  }

  const updateRepName = (role: GraphicRepRole, patch: Partial<GraphicTextLayer>) => {
    setScene((current) => ({
      ...current,
      repNameLayers: {
        ...current.repNameLayers,
        [role]: { ...current.repNameLayers[role], ...patch },
      },
    }))
  }

  const updateHeadshot = (id: string, patch: Partial<GraphicHeadshotLayer>) => {
    setScene((current) => ({
      ...current,
      headshots: current.headshots.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }))
  }

  const updateImageLayer = (id: string, patch: Partial<GraphicImageLayer>) => {
    setScene((current) => ({
      ...current,
      imageLayers: current.imageLayers.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }))
  }

  const updateHeadshotBinding = (id: string, patch: GraphicHeadshotBindingPatch) => {
    setScene((current) => ({
      ...current,
      headshots: current.headshots.map((item) => {
        if (item.id !== id) return item

        const currentBinding = item.binding

        if (patch.type === 'media') {
          return {
            ...item,
            binding: {
              type: 'media',
              mediaID:
                typeof patch.mediaID === 'string'
                  ? patch.mediaID
                  : currentBinding.type === 'media'
                    ? currentBinding.mediaID
                    : null,
            },
          }
        }

        if (patch.type === 'none') {
          return { ...item, binding: { type: 'none' } }
        }

        if (patch.type === 'tenant-headshot' || currentBinding.type === 'tenant-headshot') {
          return {
            ...item,
            binding: {
              type: 'tenant-headshot',
              role: patch.role || (currentBinding.type === 'tenant-headshot' ? currentBinding.role : 'primary'),
            },
          }
        }

        return item
      }),
    }))
  }

  const addSecondHeadshot = () => {
    setScene((current) => {
      if (current.headshots.length >= 2) return current
      return {
        ...current,
        headshots: [
          ...current.headshots,
          {
            id: 'headshot-secondary',
            x: 274,
            y: 168,
            size: 236,
            crop: {
              zoom: 1,
              offsetX: 0,
              offsetY: 0,
            },
            binding: {
              type: 'tenant-headshot',
              role: 'secondary',
            },
          },
        ],
      }
    })
  }

  const addImageLayer = () => {
    const id = `image-${Date.now()}`
    setScene((current) => ({
      ...current,
      imageLayers: [
        ...current.imageLayers,
        {
          id,
          x: 120,
          y: 120,
          width: 260,
          height: 180,
          mediaID: null,
          opacity: 1,
        },
      ],
    }))
    setSelection({ kind: 'image', id })
    setBackgroundPicker({ open: true, query: '', target: { kind: 'image', id } })
  }

  const removeImageLayer = (id: string) => {
    setScene((current) => ({
      ...current,
      imageLayers: current.imageLayers.filter((item) => item.id !== id),
    }))
    if (selection?.kind === 'image' && selection.id === id) setSelection(null)
  }

  const resolveTextLayer = (target: EditableTextTarget): GraphicTextLayer => {
    if (target.kind === 'headline') return scene.headlineLayer
    return scene.repNameLayers[target.role]
  }

  const updateTextLayer = (target: EditableTextTarget, patch: Partial<GraphicTextLayer>) => {
    if (target.kind === 'headline') {
      updateHeadline(patch)
      return
    }
    if (target.kind === 'repName') {
      updateRepName(target.role, patch)
      return
    }
  }

  const setTextTransformPreviewPatch = (target: EditableTextTarget, patch: Partial<GraphicTextLayer> | null) => {
    const key = getEditableTextTargetKey(target)
    const next = { ...textTransformPreviewRef.current }
    if (patch) next[key] = patch
    else delete next[key]
    textTransformPreviewRef.current = next
    setTextTransformPreview(next)
  }

  const fitTextLayerToContent = (target: EditableTextTarget) => {
    const layer = resolveTextLayer(target)
    updateTextLayer(target, {
      height: measureEditorRichTextContentHeight(layer, getRenderedTextValue(target), {
        defaultFontFamily: 'Georgia, Times New Roman, serif',
        defaultFontSize: 28,
        defaultLineHeight: 1.08,
      }),
    })
  }

  const getRenderedTextValue = (target: EditableTextTarget): string => {
    const layer = resolveTextLayer(target)
    if (typeof layer.text === 'string' && layer.text.length > 0) return layer.text
    if (target.kind === 'headline') return headlineText
    return target.role === 'primary' ? primaryRepName : secondaryRepName
  }

  const beginInlineTextEdit = (target: EditableTextTarget) => {
    setSelection(target)
    const layer = resolveTextLayer(target)
    setInlineTextEditor({
      target,
      html: getTextLayerHtml(layer, getRenderedTextValue(target)),
    })
  }

  const commitInlineTextEdit = () => {
    if (!inlineTextEditor) return
    const html = normalizeRichTextHtml(richTextEditorRef.current?.innerHTML || inlineTextEditor.html || '')
    const text = stripHtml(html).replace(/\u00a0/g, ' ').trim() || getRenderedTextValue(inlineTextEditor.target)
    updateTextLayer(inlineTextEditor.target, { html, text })
    if (inlineTextEditor.target.kind === 'headline') {
      setTitleOverride(text)
    }
    richTextEditorSeedRef.current = null
    setInlineTextEditor(null)
  }

  useEffect(() => {
    if (!selection || (selection.kind !== 'headline' && selection.kind !== 'repName')) return
    const transformer = transformerRef.current
    if (!transformer) return
    const sideAnchors = transformer.find('._anchor').filter((anchor) => {
      const name = typeof anchor.name === 'function' ? anchor.name() : ''
      return name === 'middle-left' || name === 'middle-right' || name === 'top-center' || name === 'bottom-center'
    })

    sideAnchors.forEach((anchor) => {
      anchor.off('dblclick.fittext dbltap.fittext')
      anchor.on('dblclick.fittext dbltap.fittext', () => fitTextLayerToContent(selection))
    })

    return () => {
      sideAnchors.forEach((anchor) => anchor.off('dblclick.fittext dbltap.fittext'))
    }
  }, [scene, selection])

  const removeHeadshot = (id: string) => {
    setScene((current) => {
      if (current.headshots.length <= 1) return current
      return {
        ...current,
        headshots: current.headshots.filter((item) => item.id !== id),
      }
    })

    if (selection?.kind === 'headshot' && selection.id === id) {
      setSelection(null)
    }
  }

  const loadTemplate = (nextTemplateID: string) => {
    setTemplateID(nextTemplateID)
    const nextTemplate = templates.find((item) => item.id === nextTemplateID)
    if (!nextTemplate) return
    setTemplateTitle(nextTemplate.title || 'Newsroom Card')
    setBackgroundMediaID(getMediaID(nextTemplate.backgroundImage) || '')
    setScene(normalizeGraphicScene(nextTemplate.scene || defaultGraphicScene()))
    setSelection(null)
  }

  const uploadMediaAsset = async (file: File, alt: string) => {
    if (!tenantID) throw new Error('No tenant selected')

    const formData = new FormData()
    formData.append('file', file)
    formData.append('alt', alt)
    formData.append('tenant', tenantID)

    const response = await fetch('/api/media-canvas/upload', {
      method: 'POST',
      body: formData,
      credentials: 'include',
      headers: { 'X-Payload-Tenant': tenantID },
    })

    const data = await response.json()
    if (!response.ok) throw new Error(data?.message || 'Failed to upload media')

    const uploaded = data?.doc || data
    const mediaDoc: MediaDoc = {
      id: getString(uploaded?.id) || '',
      alt: getString(uploaded?.alt),
      url: getString(uploaded?.url),
      thumbnailURL: getString(uploaded?.thumbnailURL),
      filename: getString(uploaded?.filename),
      title: getString(uploaded?.title),
    }

    if (!mediaDoc.id) throw new Error('Upload did not return a media id')

    setMediaOptions((current) => dedupeMediaOptions([mediaDoc, ...current]))
    return mediaDoc
  }

  const buildDesignPayload = (exportedMediaID?: string | null) => ({
    title: buildDesignTitle(postDoc?.title, templateTitle),
    template: templateID || null,
    sourceCollection: collection,
    sourcePost: docID || null,
    primaryTenant: tenantID || null,
    secondaryTenant: secondaryTenantID || null,
    backgroundImage: backgroundMediaID || null,
    titleOverride: titleOverride || null,
    scene,
    exportedMedia: exportedMediaID ?? null,
    tenant: tenantID || null,
  })

  const persistPostGraphicLinks = async (patch: Record<string, unknown>) => {
    if (!docID || collection !== 'posts') return

    const response = await fetch(`/api/posts/${docID}?draft=true`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(patch),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data?.message || 'Failed to update post graphic links')
  }

  const saveDesignRecord = async (options?: { exportedMediaID?: string | null; syncSEO?: boolean }) => {
    if (!tenantID) throw new Error('No tenant selected')

    const payload = buildDesignPayload(options?.exportedMediaID)
    const response = await fetch(designID ? `/api/graphic-designs/${designID}?draft=true` : '/api/graphic-designs?draft=true', {
      method: designID ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data?.message || 'Failed to save graphic design')

    const savedID = getString(data?.doc?.id) || getString(data?.id)
    const savedDoc = (data?.doc as DesignDoc | undefined) || null
    if (savedID) setDesignID(savedID)
    if (savedDoc?.id) {
      setGraphicDesigns((current) => upsertGraphicDesign(current, savedDoc))
    }

    const postPatch: Record<string, unknown> = {
      graphicDesign: savedID || designID || null,
      graphicTemplate: templateID || null,
    }

    if (options?.syncSEO && options.exportedMediaID) {
      postPatch.meta = { image: options.exportedMediaID }
    }

    await persistPostGraphicLinks(postPatch)
    return savedID || designID || ''
  }

  const saveTemplate = async () => {
    setSavingTemplate(true)
    setMessage(null)

    const body = {
      title: templateTitle,
      sourceCollection: collection,
      backgroundImage: backgroundMediaID || null,
      scene,
    }

    try {
      const response = await fetch(templateID ? `/api/graphic-templates/${templateID}?draft=true` : '/api/graphic-templates?draft=true', {
        method: templateID ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.message || 'Failed to save template')

      const savedID = getString(data?.doc?.id) || getString(data?.id)
      if (savedID) setTemplateID(savedID)
      setMessage('Template saved')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setSavingTemplate(false)
    }
  }

  const saveDesign = async () => {
    setSavingDesign(true)
    setMessage(null)

    try {
      await saveDesignRecord()
      setMessage('Graphic design saved')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setSavingDesign(false)
    }
  }

  const exportStageDataUrl = async () => {
    const stage = stageRef.current
    if (!stage) return null
    const previousSelection = selection
    const previousScaleX = stage.scaleX()
    const previousScaleY = stage.scaleY()

    setSelection(null)
    stage.scale({ x: 1, y: 1 })
    stage.draw()
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))

    const dataUrl = stage.toDataURL({ pixelRatio: 2 })

    stage.scale({ x: previousScaleX, y: previousScaleY })
    stage.draw()
    setSelection(previousSelection)
    return dataUrl
  }

  const uploadExportedGraphic = async () => {
    const dataUrl = await exportStageDataUrl()
    if (!dataUrl) throw new Error('Failed to render image')

    const blob = dataUrlToBlob(dataUrl)
    const filenameBase = (postDoc?.title || templateTitle || 'graphic')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')

    const mediaDoc = await uploadMediaAsset(
      new File([blob], `${filenameBase || 'graphic'}.png`, { type: 'image/png' }),
      postDoc?.title || templateTitle || 'Graphic',
    )

    return { dataUrl, mediaDoc, filenameBase }
  }

  const saveToMediaGallery = async () => {
    setSavingMedia(true)
    setMessage(null)

    try {
      const { mediaDoc } = await uploadExportedGraphic()
      await saveDesignRecord({ exportedMediaID: mediaDoc.id, syncSEO: false })
      setMessage('Saved to Media Gallery')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setSavingMedia(false)
    }
  }

  const saveToSEO = async () => {
    if (!docID || (collection !== 'posts' && collection !== 'pages')) return
    setSavingMedia(true)
    setMessage(null)

    try {
      const { mediaDoc } = await uploadExportedGraphic()
      if (!mediaDoc?.id) throw new Error('Failed to upload image for SEO')

      await saveDesignRecord({ exportedMediaID: mediaDoc.id, syncSEO: true })
      setMessage('Saved to SEO image and Media Gallery')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setSavingMedia(false)
    }
  }

  const downloadPng = async () => {
    try {
      const dataUrl = await exportStageDataUrl()
      if (!dataUrl) throw new Error('Failed to render PNG')

      const filenameBase = (postDoc?.title || templateTitle || 'graphic')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = `${filenameBase || 'graphic'}.png`
      document.body.appendChild(link)
      link.click()
      link.remove()
      setMessage('PNG downloaded')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  const uploadBackgroundFile = async (file: File) => {
    setUploadingBackground(true)
    setMessage(null)

    try {
      const uploaded = await uploadMediaAsset(file, `Background for ${templateTitle || postDoc?.title || 'Graphic'}`)
      setBackgroundMediaID(uploaded.id)
      setMessage('Background uploaded to Media Gallery')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setUploadingBackground(false)
    }
  }

  const openBackgroundPicker = (target: PickerState['target'] = 'background') => {
    setBackgroundPicker({ open: true, query: '', target })
  }

  const closeBackgroundPicker = () => {
    setBackgroundPicker((current) => ({ ...current, open: false }))
  }

  const chooseBackground = (mediaID: string) => {
    if (backgroundPicker.target === 'background') {
      setBackgroundMediaID(mediaID)
    } else {
      updateImageLayer(backgroundPicker.target.id, { mediaID: mediaID || null })
    }
    closeBackgroundPicker()
  }

  const openGraphicDesign = (design: DesignDoc) => {
    const sourcePostID = getString(design.sourcePost) || docID || ''
    const templateID = getString(asRecord(design.template).id) || getString(design.template)
    const params = new URLSearchParams({
      collection: collection || 'posts',
      designId: design.id,
    })
    if (sourcePostID) params.set('docId', sourcePostID)
    if (templateID) params.set('templateId', templateID)
    router.push(`/graphics-editor?${params.toString()}`)
  }

  const backToPost = () => {
    if (docID && collection === 'posts') {
      router.push(`/admin/collections/posts/${docID}`)
      return
    }
    router.back()
  }

  const openCanvasMenu = (
    event: { preventDefault: () => void; clientX?: number; clientY?: number },
    target: Exclude<Selection, null> | 'canvas',
  ) => {
    event.preventDefault()
    setSelection(target === 'canvas' ? null : target)
    setCanvasMenu({ x: event.clientX ?? 0, y: event.clientY ?? 0, target })
  }

  const closeCanvasMenu = () => setCanvasMenu(null)

  const handleCanvasMenuAction = async (action: string) => {
    if (!canvasMenu) return
    const target = canvasMenu.target
    closeCanvasMenu()

    if (action === 'reset-scene') {
      resetScene()
      return
    }

    if (action === 'add-headshot') {
      addSecondHeadshot()
      return
    }

    if (action === 'add-image') {
      addImageLayer()
      return
    }

    if (action === 'remove-headshot' && target !== 'canvas' && target.kind === 'headshot') {
      removeHeadshot(target.id)
      return
    }

    if (action === 'remove-image' && target !== 'canvas' && target.kind === 'image') {
      removeImageLayer(target.id)
      return
    }

    if (action === 'reset-headshot' && target !== 'canvas' && target.kind === 'headshot') {
      const fallbackScene = defaultGraphicScene()
      const isSecondary = target.id.includes('secondary')
      const fallback: Partial<GraphicHeadshotLayer> = isSecondary
        ? {
            id: 'headshot-secondary',
            x: 274,
            y: 168,
            size: 236,
            crop: { zoom: 1, offsetX: 0, offsetY: 0 },
            binding: { type: 'tenant-headshot', role: 'secondary' as const },
          }
        : (fallbackScene.headshots[0] as GraphicHeadshotLayer)

      updateHeadshot(target.id, fallback)
      return
    }

    if (action === 'reset-headline' && target !== 'canvas' && target.kind === 'headline') {
      updateHeadline({ x: 548, y: 244, width: 510, align: 'center' })
      return
    }

    if (action === 'reset-rep' && target !== 'canvas' && target.kind === 'repName') {
      updateRepName(target.role, defaultGraphicScene().repNameLayers[target.role])
    }
  }

  const resetScene = () => {
    setScene(defaultGraphicScene())
    setTitleOverride('')
    setBackgroundMediaID(getMediaID(selectedTemplate?.backgroundImage) || '')
    setSelection(null)
    setInlineTextEditor(null)
  }

  const headshotMeta = scene.headshots.map((headshot) => ({
    id: headshot.id,
    label: headshot.binding.type === 'tenant-headshot' ? `${headshot.binding.role === 'secondary' ? 'Secondary' : 'Primary'} tenant headshot` : 'Headshot slot',
  }))
  const selectedTextTarget = isEditableTextSelection(selection) ? selection : null
  const selectedTextLayer = selectedTextTarget ? resolveTextLayer(selectedTextTarget) : null
  const isTextToolbarActive = Boolean(selectedTextTarget && selectedTextLayer)
  const isRichTextEditing = Boolean(inlineTextEditor)
  const selectedTextFontFlags = getFontStyleFlags(selectedTextLayer?.fontStyle)
  const isEditingHeadline = Boolean(inlineTextEditor?.target.kind === 'headline')
  const isEditingPrimaryRepName = Boolean(inlineTextEditor?.target.kind === 'repName' && inlineTextEditor.target.role === 'primary')
  const isEditingSecondaryRepName = Boolean(inlineTextEditor?.target.kind === 'repName' && inlineTextEditor.target.role === 'secondary')
  const stageContainerBox = stageContainerRef.current?.getBoundingClientRect()
  const stageCanvasBox = stageRef.current?.container().getBoundingClientRect()
  const stageOffsetX =
    stageContainerBox && stageCanvasBox
      ? stageCanvasBox.left - stageContainerBox.left
      : Math.max(0, (stageContainerWidth - STAGE_WIDTH * previewScale) / 2)
  const stageOffsetY =
    stageContainerBox && stageCanvasBox
      ? stageCanvasBox.top - stageContainerBox.top
      : 0

  const saveRichTextSelection = () => {
    const browserSelection = window.getSelection()
    if (!browserSelection || !browserSelection.rangeCount || !richTextEditorRef.current) return
    const range = browserSelection.getRangeAt(0)
    if (!richTextEditorRef.current.contains(range.commonAncestorContainer)) return
    richTextSelectionRef.current = range.cloneRange()
  }

  const restoreRichTextSelection = () => {
    if (!richTextSelectionRef.current) return
    const browserSelection = window.getSelection()
    if (!browserSelection) return
    browserSelection.removeAllRanges()
    browserSelection.addRange(richTextSelectionRef.current)
  }

  const applySelectedTextFormatting = (patch: Partial<GraphicTextLayer>) => {
    if (!selectedTextTarget || !selectedTextLayer) return
    updateTextLayer(selectedTextTarget, patch)
  }

  const applyRichTextSelectionStyle = (styles: Record<string, string>) => {
    if (!isRichTextEditing || !richTextEditorRef.current) return
    restoreRichTextSelection()
    const browserSelection = window.getSelection()
    if (!browserSelection || !browserSelection.rangeCount) return
    const range = browserSelection.getRangeAt(0)
    if (!richTextEditorRef.current.contains(range.commonAncestorContainer) || range.collapsed) return

    const root = richTextEditorRef.current
    const selectedBlocks = Array.from(root.querySelectorAll<HTMLElement>(RICH_TEXT_BLOCK_SELECTOR)).filter((block) => {
      try {
        return range.intersectsNode(block)
      } catch {
        return false
      }
    })

    if (selectedBlocks.length > 1) {
      selectedBlocks.forEach((block) => Object.assign(block.style, styles))
      richTextEditorRef.current.focus()
      saveRichTextSelection()
      return
    }

    const singleBlock = selectedBlocks[0] || getClosestRichTextBlock(range.commonAncestorContainer, root)
    if (singleBlock && selectionMatchesWholeBlock(range, singleBlock)) {
      Object.assign(singleBlock.style, styles)
      richTextEditorRef.current.focus()
      saveRichTextSelection()
      return
    }

    const span = document.createElement('span')
    Object.assign(span.style, styles)
    span.appendChild(range.extractContents())
    range.insertNode(span)
    const nextRange = document.createRange()
    nextRange.selectNodeContents(span)
    browserSelection.removeAllRanges()
    browserSelection.addRange(nextRange)
    richTextSelectionRef.current = nextRange.cloneRange()
    richTextEditorRef.current.focus()
  }

  const runRichTextCommand = (command: string, value?: string) => {
    if (!isRichTextEditing) return
    restoreRichTextSelection()
    document.execCommand(command, false, command === 'formatBlock' && value ? `<${value}>` : value)
    saveRichTextSelection()
    richTextEditorRef.current?.focus()
  }

  const transformSelectedTextCase = (mode: 'upper' | 'lower' | 'title') => {
    if (isRichTextEditing && richTextEditorRef.current) {
      restoreRichTextSelection()
      const browserSelection = window.getSelection()
      if (!browserSelection || !browserSelection.rangeCount) return
      const range = browserSelection.getRangeAt(0)
      if (!richTextEditorRef.current.contains(range.commonAncestorContainer) || range.collapsed) return
      const text = range.toString()
      const nextText =
        mode === 'upper'
          ? text.toUpperCase()
          : mode === 'lower'
            ? text.toLowerCase()
            : text.replace(/\b\w+/g, (segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
      range.deleteContents()
      range.insertNode(document.createTextNode(nextText))
      saveRichTextSelection()
      return
    }

    if (!selectedTextLayer) return
    const nextText =
      mode === 'upper'
        ? (selectedTextLayer.text || '').toUpperCase()
        : mode === 'lower'
          ? (selectedTextLayer.text || '').toLowerCase()
          : (selectedTextLayer.text || '').replace(/\b\w+/g, (segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    applySelectedTextFormatting({ text: nextText, html: undefined })
    if (selectedTextTarget?.kind === 'headline') setTitleOverride(nextText)
  }

  const inlineEditorBox =
    inlineTextEditor
      ? (() => {
          const layer = resolveTextLayer(inlineTextEditor.target)
          const safePreviewScale = Math.max(previewScale, 0.01)
          const width = Math.max(140, Math.round(layer.width * previewScale))
          const rawHeight = Math.max(
            48 / safePreviewScale,
            inlineTextEditor.target.kind === 'headline'
              ? layer.height || 190
              : measureRichTextLayerHeight(layer, getRenderedTextValue(inlineTextEditor.target)),
          )
          const height = Math.max(
            48,
            Math.round(rawHeight * previewScale),
          )
          return {
            contentHeight: rawHeight,
            contentScale: safePreviewScale,
            contentWidth: Math.max(140 / safePreviewScale, layer.width),
            left: stageOffsetX + layer.x * previewScale,
            top: stageOffsetY + layer.y * previewScale,
            width,
            height,
          }
        })()
      : null

  const previewTextLayerTransform = (
    target: EditableTextTarget,
    fallbackText: string,
    widthLimits: { min: number; max: number },
    node: Konva.Node,
  ) => {
    const key = getEditableTextTargetKey(target)
    const source = { ...resolveTextLayer(target), ...textTransformPreviewRef.current[key] }
    const activeAnchor = transformerRef.current?.getActiveAnchor() || ''
    const isHorizontalEdge = activeAnchor === 'middle-left' || activeAnchor === 'middle-right'
    const isVerticalEdge = activeAnchor === 'top-center' || activeAnchor === 'bottom-center'
    const isCorner = !isHorizontalEdge && !isVerticalEdge
    const currentHeight = measureRichTextLayerHeight(source, fallbackText)
    const nextWidth = isVerticalEdge
      ? source.width
      : clamp(Math.round(source.width * Math.max(Math.abs(node.scaleX()), 0.1)), widthLimits.min, widthLimits.max)
    const nextHeight = isHorizontalEdge
      ? currentHeight
      : Math.max(8, Math.round(currentHeight * Math.max(Math.abs(node.scaleY()), 0.1)))
    const nextFontSize = isCorner
      ? clamp(Math.round((source.fontSize || 28) * Math.max(0.1, Math.min(Math.abs(node.scaleX()), Math.abs(node.scaleY())))), 8, 180)
      : source.fontSize
    const patch = {
      fontSize: nextFontSize,
      height: nextHeight,
      width: nextWidth,
      x: node.x(),
      y: node.y(),
    }
    node.scaleX(1)
    node.scaleY(1)
    resetRichTextContentScale(node)
    setTextTransformPreviewPatch(target, patch)
  }

  const finishTextLayerTransform = (target: EditableTextTarget, node: Konva.Node) => {
    const key = getEditableTextTargetKey(target)
    const preview = textTransformPreviewRef.current[key]
    node.scaleX(1)
    node.scaleY(1)
    resetRichTextContentScale(node)
    if (preview) {
      updateTextLayer(target, preview)
      setTextTransformPreviewPatch(target, null)
    }
  }

  if (loading) {
    return <div style={{ padding: 24 }}>Loading graphics editor…</div>
  }

  const headlineLayer = { ...scene.headlineLayer, ...textTransformPreview.headline }
  const primaryRepNameLayer = { ...scene.repNameLayers.primary, ...textTransformPreview['repName:primary'] }
  const secondaryRepNameLayer = { ...scene.repNameLayers.secondary, ...textTransformPreview['repName:secondary'] }

  return (
    <div
      style={{
        display: 'grid',
        gap: 20,
        gridTemplateColumns: editorGridColumns,
        padding: 24,
        alignItems: 'start',
      }}
    >
      <aside
        style={{
          borderRadius: 20,
          border: '1px solid rgba(17, 24, 39, 0.12)',
          background: 'rgba(255,255,255,0.86)',
          padding: 20,
          display: 'grid',
          gap: 18,
          alignSelf: 'start',
        }}
      >
        <section style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 20 }}>Graphics Editor</h2>
            <button type="button" onClick={backToPost} style={secondaryButtonStyle}>
              Back to post
            </button>
          </div>
          <div style={hintStyle}>
            Tenant: <strong>{tenantName || tenantID || 'none selected'}</strong>
            <br />
            Post: <strong>{postDoc?.title || 'No post loaded'}</strong>
            <br />
            Design: <strong>{designID || 'unsaved'}</strong>
          </div>
        </section>

        <section style={{ display: 'grid', gap: 10 }}>
          <div style={sectionLabelStyle}>Template</div>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={fieldLabelStyle}>Template</span>
            <select value={templateID} onChange={(event) => loadTemplate(event.target.value)} style={controlStyle}>
              <option value="">New template</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.title || 'Untitled'}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={fieldLabelStyle}>Template title</span>
            <input value={templateTitle} onChange={(event) => setTemplateTitle(event.target.value)} style={controlStyle} />
          </label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {isSuperAdmin ? (
              <button type="button" onClick={saveTemplate} style={primaryButtonStyle} disabled={savingTemplate}>
                {savingTemplate ? 'Saving template…' : templateID ? 'Update template' : 'Save template'}
              </button>
            ) : null}
            <button type="button" onClick={resetScene} style={secondaryButtonStyle}>
              Reset scene
            </button>
          </div>
        </section>

        <section style={{ display: 'grid', gap: 10 }}>
          <div style={sectionLabelStyle}>Content</div>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={fieldLabelStyle}>Title override</span>
            <textarea
              rows={5}
              value={titleOverride}
              onChange={(event) => {
                setTitleOverride(event.target.value)
                updateHeadline({ text: event.target.value, html: undefined })
              }}
              placeholder="Supports manual line breaks"
              style={{ ...controlStyle, resize: 'vertical', minHeight: 110 }}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={fieldLabelStyle}>Headline alignment</span>
            <select
              value={scene.headlineLayer.align}
              onChange={(event) => updateHeadline({ align: event.target.value as GraphicTextAlign })}
              style={controlStyle}
            >
              <option value="center">Center</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
          </label>
        </section>

        <section style={{ display: 'grid', gap: 12 }}>
          <div style={sectionLabelStyle}>Rep Bindings</div>
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={slotCardStyle}>
              <strong style={{ fontSize: 13 }}>Primary rep</strong>
              <div style={hintStyle}>{primaryAssets.repInfo?.name || tenantName || 'Current tenant rep not found'}</div>
            </div>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={fieldLabelStyle}>Secondary rep tenant</span>
              <select value={secondaryTenantID} onChange={(event) => setSecondaryTenantID(event.target.value)} style={controlStyle}>
                <option value="">None</option>
                {secondaryTenantOptions.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name || tenant.slug || tenant.id}
                  </option>
                ))}
              </select>
            </label>
            {secondaryTenantID ? (
              <div style={hintStyle}>
                Secondary rep: <strong>{secondaryAssets.repInfo?.name || 'No rep-info found for that tenant'}</strong>
              </div>
            ) : null}
            {scene.headshots.length < 2 ? (
              <button type="button" onClick={addSecondHeadshot} style={secondaryButtonStyle}>
                Add second headshot slot
              </button>
            ) : null}
          </div>
        </section>

        <section style={{ display: 'grid', gap: 12 }}>
          <div style={sectionLabelStyle}>Headshot Slots</div>
          {scene.headshots.map((headshot, index) => {
            const bindingType = getBindingType(headshot)
            const selectedMediaID = headshot.binding.type === 'media' ? headshot.binding.mediaID || '' : ''
            const selectedMedia = mediaOptions.find((media) => media.id === selectedMediaID)

            return (
              <div key={headshot.id} style={slotCardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <strong style={{ fontSize: 13 }}>{headshotMeta[index]?.label || `Headshot Slot ${index + 1}`}</strong>
                  <button type="button" onClick={() => setSelection({ kind: 'headshot', id: headshot.id })} style={secondaryButtonStyle}>
                    Select on canvas
                  </button>
                </div>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={fieldLabelStyle}>Binding source</span>
                  <select
                    value={
                      bindingType === 'tenant-headshot' && headshot.binding.type === 'tenant-headshot'
                        ? `${bindingType}:${headshot.binding.role}`
                        : bindingType
                    }
                    onChange={(event) => {
                      const nextValue = event.target.value
                      if (nextValue === 'media') {
                        updateHeadshotBinding(headshot.id, { type: 'media', mediaID: selectedMediaID || mediaOptions[0]?.id || null })
                        return
                      }
                      if (nextValue === 'none') {
                        updateHeadshotBinding(headshot.id, { type: 'none' })
                        return
                      }
                      if (nextValue === 'tenant-headshot:secondary') {
                        updateHeadshotBinding(headshot.id, { type: 'tenant-headshot', role: 'secondary' })
                        return
                      }
                      updateHeadshotBinding(headshot.id, { type: 'tenant-headshot', role: 'primary' })
                    }}
                    style={controlStyle}
                  >
                    <option value="tenant-headshot:primary">Primary tenant headshot</option>
                    <option value="tenant-headshot:secondary">Secondary tenant headshot</option>
                    <option value="media">Media gallery asset</option>
                    <option value="none">None</option>
                  </select>
                </label>

                {bindingType === 'media' ? (
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={fieldLabelStyle}>Media gallery asset</span>
                    <select
                      value={selectedMediaID}
                      onChange={(event) => updateHeadshotBinding(headshot.id, { type: 'media', mediaID: event.target.value || null })}
                      style={controlStyle}
                    >
                      <option value="">Choose an image</option>
                      {mediaOptions.map((media) => (
                        <option key={media.id} value={media.id}>
                          {media.alt || media.title || media.filename || media.id}
                        </option>
                      ))}
                    </select>
                    {selectedMedia ? <div style={hintStyle}>{selectedMedia.alt || selectedMedia.filename || selectedMedia.id}</div> : null}
                  </label>
                ) : null}

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={fieldLabelStyle}>Crop zoom</span>
                  <input
                    type="range"
                    min={1}
                    max={1.8}
                    step={0.01}
                    value={headshot.crop.zoom || 1}
                    onChange={(event) =>
                      updateHeadshot(headshot.id, {
                        crop: {
                          ...headshot.crop,
                          zoom: Number(event.target.value),
                        },
                      })
                    }
                  />
                </label>

          <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
                  <label style={{ display: 'grid', gap: 4 }}>
                    <span style={fieldLabelStyle}>Crop X</span>
                    <input
                      type="range"
                      min={-160}
                      max={160}
                      step={1}
                      value={headshot.crop.offsetX}
                      onChange={(event) =>
                        updateHeadshot(headshot.id, {
                          crop: {
                            ...headshot.crop,
                            offsetX: Number(event.target.value),
                          },
                        })
                      }
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 4 }}>
                    <span style={fieldLabelStyle}>Crop Y</span>
                    <input
                      type="range"
                      min={-160}
                      max={160}
                      step={1}
                      value={headshot.crop.offsetY}
                      onChange={(event) =>
                        updateHeadshot(headshot.id, {
                          crop: {
                            ...headshot.crop,
                            offsetY: Number(event.target.value),
                          },
                        })
                      }
                    />
                  </label>
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => removeHeadshot(headshot.id)} style={secondaryButtonStyle} disabled={scene.headshots.length <= 1}>
                    Remove slot
                  </button>
                </div>
              </div>
            )
          })}
        </section>

        <details open={!collapsedPanels.images} style={collapsibleStyle}>
          <summary style={summaryStyle} onClick={() => setCollapsedPanels((current) => ({ ...current, images: !current.images }))}>
            Images
          </summary>
          <div style={collapsibleBodyStyle}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" onClick={addImageLayer} style={secondaryButtonStyle}>
                Add image
              </button>
            </div>
            {scene.imageLayers.length === 0 ? <div style={hintStyle}>No extra image layers yet.</div> : null}
            {scene.imageLayers.map((layer) => {
              const imageDoc = mediaOptions.find((media) => media.id === layer.mediaID)
              return (
                <div key={layer.id} style={slotCardStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <strong style={{ fontSize: 13 }}>Image layer</strong>
                    <button type="button" onClick={() => setSelection({ kind: 'image', id: layer.id })} style={secondaryButtonStyle}>
                      Select on canvas
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => openBackgroundPicker({ kind: 'image', id: layer.id })} style={secondaryButtonStyle}>
                      Choose image
                    </button>
                    <button type="button" onClick={() => removeImageLayer(layer.id)} style={secondaryButtonStyle}>
                      Remove
                    </button>
                  </div>
                  <div style={hintStyle}>{imageDoc ? imageDoc.alt || imageDoc.title || imageDoc.filename || imageDoc.id : 'No media selected'}</div>
                </div>
              )
            })}
          </div>
        </details>

        <details open={!collapsedPanels.background} style={collapsibleStyle}>
          <summary style={summaryStyle} onClick={() => setCollapsedPanels((current) => ({ ...current, background: !current.background }))}>
            Background
          </summary>
          <div style={collapsibleBodyStyle}>
          <input
            ref={backgroundUploadRef}
            type="file"
            accept="image/*"
            hidden
            onChange={async (event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (!file) return
              await uploadBackgroundFile(file)
            }}
          />
          <div
            style={{
              border: '1px dashed rgba(17, 24, 39, 0.18)',
              borderRadius: 16,
              padding: 12,
              background: 'rgba(248, 250, 252, 0.72)',
              display: 'grid',
              gap: 10,
            }}
          >
            <div style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.5 }}>
              Pick a background from the media library or upload a new one into the tenant gallery.
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => openBackgroundPicker()} style={secondaryButtonStyle}>
                Choose from media library
              </button>
              <button type="button" onClick={() => backgroundUploadRef.current?.click()} style={secondaryButtonStyle} disabled={uploadingBackground}>
                {uploadingBackground ? 'Uploading…' : 'Upload background image'}
              </button>
              <button type="button" onClick={() => setBackgroundMediaID('')} style={secondaryButtonStyle}>
                Clear background
              </button>
            </div>
            <div style={hintStyle}>
              {backgroundOption ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  <strong>Selected background</strong>
                  <div
                    style={{
                      height: 120,
                      borderRadius: 14,
                      backgroundColor: '#e5e7eb',
                      backgroundImage: `url(${proxiedUrl(backgroundOption.thumbnailURL || backgroundOption.url) || ''})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                  />
                  <div>{backgroundOption.alt || backgroundOption.title || backgroundOption.filename || backgroundOption.id}</div>
                </div>
              ) : (
                <div>Pattern only</div>
              )}
            </div>
          </div>
          </div>
        </details>

        <details open={!collapsedPanels.designs} style={collapsibleStyle}>
          <summary style={summaryStyle} onClick={() => setCollapsedPanels((current) => ({ ...current, designs: !current.designs }))}>
            Saved Designs
          </summary>
          <div style={collapsibleBodyStyle}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={fieldLabelStyle}>Search designs</span>
            <input
              value={designBrowserQuery}
              onChange={(event) => setDesignBrowserQuery(event.target.value)}
              placeholder="Search by title or notes"
              style={controlStyle}
            />
          </label>
          <div
            style={{
              display: 'grid',
              gap: 10,
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              maxHeight: 420,
              overflowY: 'auto',
              paddingRight: 4,
            }}
          >
            {loadingGraphicDesigns ? <div style={hintStyle}>Loading designs…</div> : null}
            {!loadingGraphicDesigns && graphicDesigns.length === 0 ? <div style={hintStyle}>No saved designs yet.</div> : null}
            {graphicDesigns.map((design) => {
              const previewDoc = getMediaDoc(design.exportedMedia)
              const preview = proxiedUrl(previewDoc?.thumbnailURL || previewDoc?.url)
              const templateName = getString(asRecord(design.template).title) || getString(design.template) || 'Template'

              return (
                <button
                  key={design.id}
                  type="button"
                  onClick={() => openGraphicDesign(design)}
                  style={{
                    ...backgroundCardStyle,
                    borderColor: design.id === designID ? '#0ea5e9' : 'rgba(17, 24, 39, 0.12)',
                    boxShadow: design.id === designID ? '0 0 0 2px rgba(14,165,233,0.12)' : 'none',
                    textAlign: 'left',
                  }}
                >
                  <div
                    style={{
                      height: 96,
                      borderRadius: 12,
                      backgroundColor: '#e5e7eb',
                      backgroundImage: preview ? `url(${preview})` : undefined,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                  />
                  <div style={{ display: 'grid', gap: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{design.title || 'Untitled design'}</div>
                    <div style={{ fontSize: 11, lineHeight: 1.35, color: '#475569' }}>{templateName}</div>
                  </div>
                </button>
              )
            })}
          </div>
          </div>
        </details>
      </aside>

      <section
        style={{
          borderRadius: 24,
          border: '1px solid rgba(17, 24, 39, 0.12)',
          background: 'rgba(255,255,255,0.86)',
          padding: isStackedLayout ? 14 : '16px 32px 16px 16px',
          position: isStackedLayout ? 'relative' : 'sticky',
          top: isStackedLayout ? undefined : 18,
          overflow: 'auto',
          minWidth: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 14,
          }}
        >
          <div style={{ display: 'grid', gap: 4 }}>
            <strong style={{ fontSize: 16, color: '#0f172a' }}>Canvas</strong>
            <span style={{ fontSize: 12, color: '#64748b' }}>Double-click text to edit in place. Right-click for slot actions.</span>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button type="button" onClick={saveToMediaGallery} style={secondaryButtonStyle} disabled={savingMedia}>
              {savingMedia ? 'Saving…' : 'Save to Media'}
            </button>
            <button type="button" onClick={downloadPng} style={secondaryButtonStyle}>
              Download PNG
            </button>
          </div>
        </div>
        <div ref={textToolbarRef} style={textToolbarStyle}>
          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              alignItems: 'center',
              opacity: selectedTextTarget && selectedTextLayer ? 1 : 0,
              pointerEvents: selectedTextTarget && selectedTextLayer ? 'auto' : 'none',
            }}
          >
            <button
              type="button"
              title="Bold"
              aria-label="Bold"
              style={selectedTextFontFlags.bold ? activeIconToolbarButtonStyle : iconToolbarButtonStyle}
              onMouseDown={(event) => {
                if (isRichTextEditing) {
                  event.preventDefault()
                  runRichTextCommand('bold')
                  return
                }
                applySelectedTextFormatting({
                  fontStyle: buildFontStyle({
                    bold: !selectedTextFontFlags.bold,
                    italic: selectedTextFontFlags.italic,
                  }),
                })
              }}
              disabled={!isTextToolbarActive}
            >
              <Bold size={14} strokeWidth={2.25} />
            </button>
            <button
              type="button"
              title="Italic"
              aria-label="Italic"
              style={selectedTextFontFlags.italic ? activeIconToolbarButtonStyle : iconToolbarButtonStyle}
              onMouseDown={(event) => {
                if (isRichTextEditing) {
                  event.preventDefault()
                  runRichTextCommand('italic')
                  return
                }
                applySelectedTextFormatting({
                  fontStyle: buildFontStyle({
                    bold: selectedTextFontFlags.bold,
                    italic: !selectedTextFontFlags.italic,
                  }),
                })
              }}
              disabled={!isTextToolbarActive}
            >
              <Italic size={14} strokeWidth={2.25} />
            </button>
            <button
              type="button"
              title="Underline"
              aria-label="Underline"
              style={selectedTextLayer?.textDecoration === 'underline' ? activeIconToolbarButtonStyle : iconToolbarButtonStyle}
              onMouseDown={(event) => {
                if (isRichTextEditing) {
                  event.preventDefault()
                  runRichTextCommand('underline')
                  return
                }
                applySelectedTextFormatting({
                  textDecoration: selectedTextLayer?.textDecoration === 'underline' ? 'none' : 'underline',
                })
              }}
              disabled={!isTextToolbarActive}
            >
              <Underline size={14} strokeWidth={2.25} />
            </button>
            {isRichTextEditing ? (
              <>
                {[
                  { label: 'H1', command: 'formatBlock', value: 'h1' },
                  { label: 'H2', command: 'formatBlock', value: 'h2' },
                  { label: 'H3', command: 'formatBlock', value: 'h3' },
                  { label: 'P', command: 'formatBlock', value: 'p' },
                  { label: '•', command: 'insertUnorderedList' },
                  { label: '1.', command: 'insertOrderedList' },
                ].map((action) => (
                  <button
                    key={`${action.command}-${action.label}`}
                    type="button"
                    style={iconToolbarButtonStyle}
                    onMouseDown={(event) => {
                      event.preventDefault()
                      runRichTextCommand(action.command, action.value)
                    }}
                    disabled={!isTextToolbarActive}
                  >
                    {action.label}
                  </button>
                ))}
              </>
            ) : null}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {TEXT_ALIGNMENT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  title={option.label}
                  aria-label={option.label}
                  style={selectedTextLayer?.align === option.value || (!selectedTextLayer?.align && option.value === 'left') ? activeIconToolbarButtonStyle : iconToolbarButtonStyle}
                  onMouseDown={(event) => {
                    if (isRichTextEditing) {
                      event.preventDefault()
                      runRichTextCommand(option.value === 'left' ? 'justifyLeft' : option.value === 'center' ? 'justifyCenter' : 'justifyRight')
                      return
                    }
                    applySelectedTextFormatting({ align: option.value as GraphicTextAlign })
                  }}
                  disabled={!isTextToolbarActive}
                >
                  {option.value === 'left' ? (
                    <AlignLeft size={14} strokeWidth={2.25} />
                  ) : option.value === 'center' ? (
                    <AlignCenter size={14} strokeWidth={2.25} />
                  ) : (
                    <AlignRight size={14} strokeWidth={2.25} />
                  )}
                </button>
              ))}
            </div>
            <label style={{ display: 'grid' }}>
              <select
                title="Font family"
                aria-label="Font family"
                value={selectedTextLayer?.fontFamily || TEXT_FONT_OPTIONS[0].value}
                onMouseDown={(event) => {
                  if (isRichTextEditing) event.preventDefault()
                }}
                onChange={(event) => {
                  if (isRichTextEditing) {
                    applyRichTextSelectionStyle({ fontFamily: event.target.value })
                    richTextEditorRef.current?.focus()
                    return
                  }
                  applySelectedTextFormatting({ fontFamily: event.target.value })
                }}
                style={{ ...toolbarSelectStyle, width: 170 }}
                disabled={!isTextToolbarActive}
              >
                {TEXT_FONT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid' }}>
              <input
                type="number"
                title="Font size"
                aria-label="Font size"
                min={12}
                max={160}
                step={1}
                value={selectedTextLayer?.fontSize || 32}
                onChange={(event) => {
                  const nextValue = Number(event.target.value)
                  if (isRichTextEditing) {
                    applyRichTextSelectionStyle({ fontSize: `${nextValue}px` })
                    richTextEditorRef.current?.focus()
                    return
                  }
                  applySelectedTextFormatting({ fontSize: nextValue })
                }}
                style={{ ...toolbarInputStyle, width: 72 }}
                disabled={!isTextToolbarActive}
              />
            </label>
            <label style={{ display: 'grid' }}>
              <input
                type="number"
                title="Line height"
                aria-label="Line height"
                min={0.8}
                max={2}
                step={0.05}
                value={selectedTextLayer?.lineHeight || 1}
                onChange={(event) => {
                  const nextValue = Number(event.target.value) || 1
                  if (isRichTextEditing) {
                    applyRichTextSelectionStyle({ lineHeight: String(nextValue), display: 'inline-block' })
                    richTextEditorRef.current?.focus()
                    return
                  }
                  applySelectedTextFormatting({ lineHeight: nextValue })
                }}
                style={{ ...toolbarInputStyle, width: 70 }}
                disabled={!isTextToolbarActive}
              />
            </label>
            <label style={{ display: 'grid' }}>
              <input
                type="number"
                title="Letter spacing"
                aria-label="Letter spacing"
                min={-2}
                max={30}
                step={0.5}
                value={selectedTextLayer?.letterSpacing || 0}
                onChange={(event) => {
                  const nextValue = Number(event.target.value) || 0
                  if (isRichTextEditing) {
                    applyRichTextSelectionStyle({ letterSpacing: `${nextValue}px` })
                    richTextEditorRef.current?.focus()
                    return
                  }
                  applySelectedTextFormatting({ letterSpacing: nextValue })
                }}
                style={{ ...toolbarInputStyle, width: 70 }}
                disabled={!isTextToolbarActive}
              />
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {BRAND_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Choose ${color}`}
                  onMouseDown={(event) => {
                    if (isRichTextEditing) {
                      event.preventDefault()
                      applyRichTextSelectionStyle({ color })
                      return
                    }
                    applySelectedTextFormatting({ color })
                  }}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    border: selectedTextLayer?.color === color ? '2px solid #0f172a' : '1px solid rgba(15,23,42,0.18)',
                    background: color,
                    cursor: 'pointer',
                  }}
                  disabled={!isTextToolbarActive}
                />
              ))}
            </div>
            <input
              type="color"
              value={selectedTextLayer?.color || '#111111'}
              onChange={(event) => {
                if (isRichTextEditing) {
                  applyRichTextSelectionStyle({ color: event.target.value })
                  richTextEditorRef.current?.focus()
                  return
                }
                applySelectedTextFormatting({ color: event.target.value })
              }}
              style={{ width: 28, height: 28, border: 'none', background: 'transparent', padding: 0 }}
              disabled={!isTextToolbarActive}
            />
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" style={toolbarButtonStyle} onMouseDown={(event) => { if (isRichTextEditing) event.preventDefault(); transformSelectedTextCase('upper') }} disabled={!isTextToolbarActive}>
                UPPER
              </button>
              <button type="button" style={toolbarButtonStyle} onMouseDown={(event) => { if (isRichTextEditing) event.preventDefault(); transformSelectedTextCase('lower') }} disabled={!isTextToolbarActive}>
                lower
              </button>
              <button type="button" style={toolbarButtonStyle} onMouseDown={(event) => { if (isRichTextEditing) event.preventDefault(); transformSelectedTextCase('title') }} disabled={!isTextToolbarActive}>
                Title
              </button>
            </div>
          </div>
        </div>
        {message ? <div style={{ ...hintStyle, marginBottom: 12 }}>{message}</div> : null}
        <div
          ref={stageContainerRef}
          style={{
            width: '100%',
            position: 'relative',
            paddingRight: isStackedLayout ? 8 : 24,
            minWidth: 0,
            display: 'flex',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <Stage
            ref={stageRef}
            width={STAGE_WIDTH}
            height={STAGE_HEIGHT}
            scaleX={previewScale}
            scaleY={previewScale}
            style={{
              width: `${STAGE_WIDTH * previewScale}px`,
              height: `${STAGE_HEIGHT * previewScale}px`,
              display: 'block',
              borderRadius: 18,
              maxWidth: '100%',
              flex: '0 0 auto',
            }}
            onMouseDown={(event) => {
              if (event.target === event.target.getStage()) {
                setSelection(null)
                closeCanvasMenu()
              }
            }}
            onContextMenu={(event) => openCanvasMenu(event.evt, 'canvas')}
          >
            <Layer>
              <Rect width={STAGE_WIDTH} height={STAGE_HEIGHT} fill="#f7f4ef" />
              {backgroundImage ? <KonvaImage image={backgroundImage} width={STAGE_WIDTH} height={STAGE_HEIGHT} opacity={0.94} /> : null}

              {scene.imageLayers.map((layer) => {
                const image = imageLayerCache[layer.id] || null
                return (
                  <Group
                    key={layer.id}
                    ref={(node) => {
                      imageRefs.current[layer.id] = node
                    }}
                    x={layer.x}
                    y={layer.y}
                    draggable
                    onClick={() => setSelection({ kind: 'image', id: layer.id })}
                    onTap={() => setSelection({ kind: 'image', id: layer.id })}
                    onContextMenu={(event) => {
                      event.cancelBubble = true
                      openCanvasMenu(event.evt, { kind: 'image', id: layer.id })
                    }}
                    onDragEnd={(event) => updateImageLayer(layer.id, { x: event.target.x(), y: event.target.y() })}
                    onTransformEnd={(event) => {
                      const node = event.target
                      const nextWidth = clamp(Math.round(layer.width * node.scaleX()), IMAGE_WIDTH_LIMITS.min, IMAGE_WIDTH_LIMITS.max)
                      const nextHeight = clamp(Math.round(layer.height * node.scaleY()), IMAGE_HEIGHT_LIMITS.min, IMAGE_HEIGHT_LIMITS.max)
                      node.scaleX(1)
                      node.scaleY(1)
                      updateImageLayer(layer.id, { x: node.x(), y: node.y(), width: nextWidth, height: nextHeight })
                    }}
                  >
                    {image ? <KonvaImage image={image} width={layer.width} height={layer.height} opacity={layer.opacity ?? 1} /> : null}
                    {!image ? (
                      <Rect
                        width={layer.width}
                        height={layer.height}
                        cornerRadius={14}
                        fill="rgba(148, 163, 184, 0.12)"
                        stroke="rgba(148, 163, 184, 0.42)"
                        dash={[10, 8]}
                      />
                    ) : null}
                  </Group>
                )
              })}

              {scene.headshots.map((headshot, index) => {
                const image = headshotImages[index] || null
                const placement = computeHeadshotPlacement(image, headshot)
                return (
                  <Group
                    key={headshot.id}
                    ref={(node) => {
                      headshotRefs.current[headshot.id] = node
                    }}
                    x={headshot.x}
                    y={headshot.y}
                    draggable
                    onClick={() => setSelection({ kind: 'headshot', id: headshot.id })}
                    onTap={() => setSelection({ kind: 'headshot', id: headshot.id })}
                    onContextMenu={(event) => {
                      event.cancelBubble = true
                      openCanvasMenu(event.evt, { kind: 'headshot', id: headshot.id })
                    }}
                    onDragEnd={(event) => updateHeadshot(headshot.id, { x: event.target.x(), y: event.target.y() })}
                    onTransformEnd={(event) => {
                      const node = event.target
                      const scale = Math.max(node.scaleX(), node.scaleY())
                      const nextSize = clamp(Math.round(headshot.size * scale), HEADSHOT_SIZE_LIMITS.min, HEADSHOT_SIZE_LIMITS.max)
                      node.scaleX(1)
                      node.scaleY(1)
                      updateHeadshot(headshot.id, { x: node.x(), y: node.y(), size: nextSize })
                    }}
                  >
                    <Group
                      clipFunc={(ctx) => {
                        ctx.beginPath()
                        ctx.arc(headshot.size / 2, headshot.size / 2, headshot.size / 2, 0, Math.PI * 2)
                        ctx.closePath()
                      }}
                    >
                      {image ? (
                        <KonvaImage
                          image={image}
                          x={placement.x}
                          y={placement.y}
                          width={placement.width}
                          height={placement.height}
                          onClick={() => setSelection({ kind: 'headshot', id: headshot.id })}
                          onTap={() => setSelection({ kind: 'headshot', id: headshot.id })}
                        />
                      ) : null}
                    </Group>
                  </Group>
                )
              })}

              <Group
                ref={(node) => {
                  repNameRefs.current.primary = node
                }}
                x={primaryRepNameLayer.x}
                y={primaryRepNameLayer.y}
                draggable={!isEditingPrimaryRepName}
                onClick={() => setSelection({ kind: 'repName', role: 'primary' })}
                onTap={() => setSelection({ kind: 'repName', role: 'primary' })}
                onContextMenu={(event) => {
                  event.cancelBubble = true
                  openCanvasMenu(event.evt, { kind: 'repName', role: 'primary' })
                }}
                onDragEnd={(event) => updateRepName('primary', { x: event.target.x(), y: event.target.y() })}
                onDblClick={() => beginInlineTextEdit({ kind: 'repName', role: 'primary' })}
                onTransformStart={() => {
                  setTextTransformPreviewPatch({ kind: 'repName', role: 'primary' }, {
                    fontSize: scene.repNameLayers.primary.fontSize,
                    height: scene.repNameLayers.primary.height ?? measureRichTextLayerHeight(scene.repNameLayers.primary, primaryRepName),
                    width: scene.repNameLayers.primary.width,
                    x: scene.repNameLayers.primary.x,
                    y: scene.repNameLayers.primary.y,
                  })
                }}
                onTransform={(event) => {
                  previewTextLayerTransform({ kind: 'repName', role: 'primary' }, primaryRepName, REP_NAME_WIDTH_LIMITS, event.target)
                }}
                onTransformEnd={(event) => {
                  const node = event.target
                  finishTextLayerTransform({ kind: 'repName', role: 'primary' }, node)
                }}
              >
                {!isEditingPrimaryRepName && !textTransformPreview['repName:primary'] && richTextRenderImages.primary ? (
                  <KonvaImage
                    name="rich-text-render-content"
                    image={richTextRenderImages.primary}
                    width={primaryRepNameLayer.width}
                    height={measureRichTextLayerHeight(primaryRepNameLayer, primaryRepName)}
                  />
                ) : !isEditingPrimaryRepName ? (
                  <Text
                    name="rich-text-render-content"
                    width={primaryRepNameLayer.width}
                    height={measureRichTextLayerHeight(primaryRepNameLayer, primaryRepName)}
                    text={stripHtml(getTextLayerHtml(primaryRepNameLayer, primaryRepName)) || primaryRepName}
                    fontFamily={primaryRepNameLayer.fontFamily || 'Georgia, Times New Roman, serif'}
                    fontSize={Math.max(22, Math.round((primaryRepNameLayer.fontSize || 28) * contentFitScale))}
                    fill={primaryRepNameLayer.color || '#aa2426'}
                    fontStyle={primaryRepNameLayer.fontStyle}
                    textDecoration={primaryRepNameLayer.textDecoration}
                    align={primaryRepNameLayer.align}
                    lineHeight={primaryRepNameLayer.lineHeight || 1}
                    letterSpacing={primaryRepNameLayer.letterSpacing || 0}
                  />
                ) : null}
              </Group>

              {secondaryTenantID && scene.headshots.some((item) => item.binding.type === 'tenant-headshot' && item.binding.role === 'secondary') ? (
                <Group
                  ref={(node) => {
                    repNameRefs.current.secondary = node
                  }}
                  x={secondaryRepNameLayer.x}
                  y={secondaryRepNameLayer.y}
                  draggable={!isEditingSecondaryRepName}
                  onClick={() => setSelection({ kind: 'repName', role: 'secondary' })}
                  onTap={() => setSelection({ kind: 'repName', role: 'secondary' })}
                  onContextMenu={(event) => {
                    event.cancelBubble = true
                    openCanvasMenu(event.evt, { kind: 'repName', role: 'secondary' })
                  }}
                  onDragEnd={(event) => updateRepName('secondary', { x: event.target.x(), y: event.target.y() })}
                  onDblClick={() => beginInlineTextEdit({ kind: 'repName', role: 'secondary' })}
                  onTransformStart={() => {
                    setTextTransformPreviewPatch({ kind: 'repName', role: 'secondary' }, {
                      fontSize: scene.repNameLayers.secondary.fontSize,
                      height: scene.repNameLayers.secondary.height ?? measureRichTextLayerHeight(scene.repNameLayers.secondary, secondaryRepName),
                      width: scene.repNameLayers.secondary.width,
                      x: scene.repNameLayers.secondary.x,
                      y: scene.repNameLayers.secondary.y,
                    })
                  }}
                  onTransform={(event) => {
                    previewTextLayerTransform({ kind: 'repName', role: 'secondary' }, secondaryRepName, REP_NAME_WIDTH_LIMITS, event.target)
                  }}
                  onTransformEnd={(event) => {
                    const node = event.target
                    finishTextLayerTransform({ kind: 'repName', role: 'secondary' }, node)
                  }}
                >
                  {!isEditingSecondaryRepName && !textTransformPreview['repName:secondary'] && richTextRenderImages.secondary ? (
                    <KonvaImage
                      name="rich-text-render-content"
                      image={richTextRenderImages.secondary}
                      width={secondaryRepNameLayer.width}
                      height={measureRichTextLayerHeight(secondaryRepNameLayer, secondaryRepName)}
                    />
                  ) : !isEditingSecondaryRepName ? (
                    <Text
                      name="rich-text-render-content"
                      width={secondaryRepNameLayer.width}
                      height={measureRichTextLayerHeight(secondaryRepNameLayer, secondaryRepName)}
                      text={stripHtml(getTextLayerHtml(secondaryRepNameLayer, secondaryRepName)) || secondaryRepName}
                      fontFamily={secondaryRepNameLayer.fontFamily || 'Georgia, Times New Roman, serif'}
                      fontSize={Math.max(20, Math.round((secondaryRepNameLayer.fontSize || 26) * contentFitScale))}
                      fill={secondaryRepNameLayer.color || '#aa2426'}
                      fontStyle={secondaryRepNameLayer.fontStyle}
                      textDecoration={secondaryRepNameLayer.textDecoration}
                      align={secondaryRepNameLayer.align}
                      lineHeight={secondaryRepNameLayer.lineHeight || 1}
                      letterSpacing={secondaryRepNameLayer.letterSpacing || 0}
                    />
                  ) : null}
                </Group>
              ) : null}

              <Group
                ref={titleRef}
                x={headlineLayer.x}
                y={headlineLayer.y}
                draggable={!isEditingHeadline}
                onClick={() => setSelection({ kind: 'headline' })}
                onTap={() => setSelection({ kind: 'headline' })}
                onContextMenu={(event) => {
                  event.cancelBubble = true
                  openCanvasMenu(event.evt, { kind: 'headline' })
                }}
                onDragEnd={(event) => updateHeadline({ x: event.target.x(), y: event.target.y() })}
                onTransformStart={() => {
                  setTextTransformPreviewPatch({ kind: 'headline' }, {
                    fontSize: scene.headlineLayer.fontSize,
                    height: scene.headlineLayer.height ?? measureRichTextLayerHeight(scene.headlineLayer, headlineText),
                    width: scene.headlineLayer.width,
                    x: scene.headlineLayer.x,
                    y: scene.headlineLayer.y,
                  })
                }}
                onTransform={(event) => {
                  previewTextLayerTransform({ kind: 'headline' }, headlineText, TITLE_WIDTH_LIMITS, event.target)
                }}
                onTransformEnd={(event) => {
                  const node = event.target
                  finishTextLayerTransform({ kind: 'headline' }, node)
                }}
              >
                <Rect
                  x={-12}
                  y={-8}
                  width={headlineLayer.width + 24}
                  height={(headlineLayer.height ?? measureRichTextLayerHeight(headlineLayer, headlineText)) + 16}
                  cornerRadius={18}
                  fill={selection?.kind === 'headline' ? 'rgba(125, 211, 252, 0.08)' : 'transparent'}
                  stroke={selection?.kind === 'headline' ? '#7dd3fc' : 'transparent'}
                  dash={selection?.kind === 'headline' ? [10, 8] : []}
                />
                {!isEditingHeadline && !textTransformPreview.headline && richTextRenderImages.headline ? (
                  <KonvaImage
                    name="rich-text-render-content"
                    image={richTextRenderImages.headline}
                    width={headlineLayer.width}
                    height={headlineLayer.height ?? measureRichTextLayerHeight(headlineLayer, headlineText)}
                    onDblClick={() => beginInlineTextEdit({ kind: 'headline' })}
                  />
                ) : !isEditingHeadline ? (
                  <Text
                    name="rich-text-render-content"
                    width={headlineLayer.width}
                    height={headlineLayer.height ?? measureRichTextLayerHeight(headlineLayer, headlineText)}
                    text={stripHtml(getTextLayerHtml(headlineLayer, headlineText)) || headlineText}
                    fontFamily={headlineLayer.fontFamily || 'Georgia, Times New Roman, serif'}
                    fontSize={Math.max(14, Math.round((headlineLayer.fontSize || 38) * contentFitScale))}
                    lineHeight={headlineLayer.lineHeight || 1.08}
                    fill={headlineLayer.color || '#a02626'}
                    align={headlineLayer.align}
                    fontStyle={headlineLayer.fontStyle}
                    textDecoration={headlineLayer.textDecoration}
                    onDblClick={() => beginInlineTextEdit({ kind: 'headline' })}
                  />
                ) : null}
              </Group>

              <Transformer
                ref={transformerRef}
                rotateEnabled={false}
                flipEnabled={false}
                enabledAnchors={
                  selection?.kind === 'headline'
                    ? ['top-left', 'top-center', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right']
                    : selection?.kind === 'repName'
                      ? ['top-left', 'top-center', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right']
                      : selection?.kind === 'image'
                        ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
                      : selection?.kind === 'headshot'
                        ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
                        : []
                }
                borderStroke="#0ea5e9"
                anchorStroke="#0ea5e9"
                anchorFill="#ffffff"
                anchorSize={10}
                boundBoxFunc={(_, newBox) => {
                  if (selection?.kind === 'headline') {
                    return {
                      ...newBox,
                      width: clamp(newBox.width, TITLE_WIDTH_LIMITS.min, TITLE_WIDTH_LIMITS.max),
                      height: Math.max(8, newBox.height),
                    }
                  }

                  if (selection?.kind === 'repName') {
                    return {
                      ...newBox,
                      width: clamp(newBox.width, REP_NAME_WIDTH_LIMITS.min, REP_NAME_WIDTH_LIMITS.max),
                      height: Math.max(8, newBox.height),
                    }
                  }

                  if (selection?.kind === 'headshot') {
                    const nextSize = clamp(Math.max(newBox.width, newBox.height), HEADSHOT_SIZE_LIMITS.min, HEADSHOT_SIZE_LIMITS.max)
                    return { ...newBox, width: nextSize, height: nextSize, rotation: 0 }
                  }

                  if (selection?.kind === 'image') {
                    return {
                      ...newBox,
                      width: clamp(newBox.width, IMAGE_WIDTH_LIMITS.min, IMAGE_WIDTH_LIMITS.max),
                      height: clamp(newBox.height, IMAGE_HEIGHT_LIMITS.min, IMAGE_HEIGHT_LIMITS.max),
                      rotation: 0,
                    }
                  }

                  return newBox
                }}
              />
            </Layer>
          </Stage>
          {inlineTextEditor && inlineEditorBox ? (
            <div
              style={{
                boxSizing: 'border-box',
                position: 'absolute',
                left: inlineEditorBox.left,
                top: inlineEditorBox.top,
                width: inlineEditorBox.width,
                height: inlineEditorBox.height,
                zIndex: 40,
                overflow: 'hidden',
              }}
            >
              <style>{RICH_TEXT_EDITOR_SCOPE_CSS}</style>
              <div
                ref={richTextEditorRef}
                data-rich-text-editor="true"
                contentEditable
                suppressContentEditableWarning
                onBlur={(event) => {
                  const nextFocused = event.relatedTarget as Node | null
                  if (nextFocused && textToolbarRef.current?.contains(nextFocused)) return
                  commitInlineTextEdit()
                }}
                onMouseUp={saveRichTextSelection}
                onKeyUp={saveRichTextSelection}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                    event.preventDefault()
                    commitInlineTextEdit()
                    return
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    richTextEditorSeedRef.current = null
                    setInlineTextEditor(null)
                  }
                }}
                style={{
                  boxSizing: 'border-box',
                  display: 'block',
                  width: inlineEditorBox.contentWidth,
                  height: inlineEditorBox.contentHeight,
                  minHeight: inlineEditorBox.contentHeight,
                  maxHeight: inlineEditorBox.contentHeight,
                  padding: 0,
                  margin: 0,
                  borderWidth: 0,
                  borderStyle: 'solid',
                  borderColor: 'transparent',
                  background: 'transparent',
                  boxShadow: 'none',
                  color: selectedTextLayer?.color || '#111827',
                  fontFamily: selectedTextLayer?.fontFamily || 'Georgia, Times New Roman, serif',
                  fontSize: `${Math.max(1, selectedTextLayer?.fontSize || 28)}px`,
                  fontStyle: selectedTextLayer?.fontStyle?.includes('italic') ? 'italic' : 'normal',
                  fontWeight: getCssFontWeight(selectedTextLayer?.fontStyle),
                  textDecoration: selectedTextLayer?.textDecoration || 'none',
                  textAlign: selectedTextLayer?.align || 'left',
                  lineHeight: `${selectedTextLayer?.lineHeight || 1.08}`,
                  letterSpacing: `${selectedTextLayer?.letterSpacing || 0}px`,
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  whiteSpace: 'normal',
                  outline: 'none',
                  transform: `scale(${inlineEditorBox.contentScale})`,
                  transformOrigin: 'left top',
                }}
              />
            </div>
          ) : null}

          {backgroundPicker.open ? (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1200,
                background: 'rgba(15, 23, 42, 0.42)',
                display: 'grid',
                placeItems: 'center',
                padding: 20,
              }}
              onClick={closeBackgroundPicker}
            >
              <div
                style={{
                  width: 'min(980px, 100%)',
                  maxHeight: 'min(80vh, 900px)',
                  overflow: 'auto',
                  borderRadius: 20,
                  background: '#ffffff',
                  border: '1px solid rgba(17, 24, 39, 0.12)',
                  boxShadow: '0 28px 70px rgba(15, 23, 42, 0.28)',
                  padding: 20,
                  display: 'grid',
                  gap: 16,
                }}
                onClick={(event) => event.stopPropagation()}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'grid', gap: 4 }}>
                    <strong style={{ fontSize: 18 }}>
                      {backgroundPicker.target === 'background' ? 'Choose Background' : 'Choose Image'}
                    </strong>
                    <span style={hintStyle}>
                      Browse tenant media, search, or close the picker without changing anything.
                    </span>
                  </div>
                  <button type="button" style={secondaryButtonStyle} onClick={closeBackgroundPicker}>
                    Close
                  </button>
                </div>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={fieldLabelStyle}>Search media</span>
                  <input
                    value={backgroundPicker.query}
                    onChange={(event) => setBackgroundPicker((current) => ({ ...current, query: event.target.value }))}
                    placeholder="Search by alt text, title, or filename"
                    style={controlStyle}
                  />
                </label>
                <div
                  style={{
                    display: 'grid',
                    gap: 12,
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  }}
                >
                  {backgroundPicker.target === 'background' ? (
                    <button type="button" style={{ ...backgroundCardStyle, borderColor: backgroundMediaID === '' ? '#0ea5e9' : 'rgba(17, 24, 39, 0.12)' }} onClick={() => chooseBackground('')}>
                    <div
                      style={{
                        height: 120,
                        borderRadius: 12,
                        background: 'linear-gradient(135deg, #f8fafc, #e2e8f0)',
                      }}
                    />
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', textAlign: 'left' }}>Pattern only</div>
                    </button>
                  ) : null}
                  {backgroundPickerItems.map((item) => {
                    const preview = proxiedUrl(item.thumbnailURL || item.url)
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => chooseBackground(item.id)}
                        style={{
                          ...backgroundCardStyle,
                          borderColor: backgroundMediaID === item.id ? '#0ea5e9' : 'rgba(17, 24, 39, 0.12)',
                          boxShadow: backgroundMediaID === item.id ? '0 0 0 2px rgba(14,165,233,0.12)' : 'none',
                          textAlign: 'left',
                        }}
                      >
                        <div
                          style={{
                            height: 120,
                            borderRadius: 12,
                            backgroundColor: '#e5e7eb',
                            backgroundImage: preview ? `url(${preview})` : undefined,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                          }}
                        />
                        <div style={{ fontSize: 12, lineHeight: 1.35, color: '#334155' }}>
                          {item.alt || item.title || item.filename || item.id}
                        </div>
                      </button>
                    )
                  })}
                </div>
                {backgroundPickerItems.length === 0 ? <div style={hintStyle}>No media matched that search.</div> : null}
              </div>
            </div>
          ) : null}

          {canvasMenu ? (
            <div
              style={{
                position: 'fixed',
                left: canvasMenu.x,
                top: canvasMenu.y,
                zIndex: 1000,
                minWidth: 190,
                borderRadius: 14,
                border: '1px solid rgba(17, 24, 39, 0.14)',
                background: '#ffffff',
                boxShadow: '0 18px 45px rgba(15, 23, 42, 0.18)',
                padding: 8,
                display: 'grid',
                gap: 4,
              }}
              onMouseLeave={closeCanvasMenu}
            >
              {canvasMenu.target === 'canvas' ? (
                <>
                  <button type="button" style={contextMenuButtonStyle} onClick={() => void handleCanvasMenuAction('add-headshot')}>
                    Add headshot slot
                  </button>
                  <button type="button" style={contextMenuButtonStyle} onClick={() => void handleCanvasMenuAction('add-image')}>
                    Add image
                  </button>
                  <button type="button" style={contextMenuButtonStyle} onClick={() => void handleCanvasMenuAction('reset-scene')}>
                    Reset scene
                  </button>
                </>
              ) : canvasMenu.target.kind === 'image' ? (
                <>
                  <button
                    type="button"
                    style={contextMenuButtonStyle}
                    onClick={() => {
                      const target = canvasMenu.target
                      if (target !== 'canvas' && target.kind === 'image') openBackgroundPicker({ kind: 'image', id: target.id })
                    }}
                  >
                    Choose image
                  </button>
                  <button type="button" style={contextMenuButtonStyle} onClick={() => void handleCanvasMenuAction('remove-image')}>
                    Remove image
                  </button>
                </>
              ) : canvasMenu.target.kind === 'headshot' ? (
                <>
                  <button type="button" style={contextMenuButtonStyle} onClick={() => void handleCanvasMenuAction('reset-headshot')}>
                    Reset headshot
                  </button>
                  <button type="button" style={contextMenuButtonStyle} onClick={() => void handleCanvasMenuAction('remove-headshot')}>
                    Remove slot
                  </button>
                </>
              ) : canvasMenu.target.kind === 'headline' ? (
                <button type="button" style={contextMenuButtonStyle} onClick={() => void handleCanvasMenuAction('reset-headline')}>
                  Reset headline
                </button>
              ) : (
                <button type="button" style={contextMenuButtonStyle} onClick={() => void handleCanvasMenuAction('reset-rep')}>
                  Reset rep name
                </button>
              )}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}

const controlStyle: React.CSSProperties = {
  border: '1px solid rgba(17, 24, 39, 0.12)',
  borderRadius: 12,
  background: '#ffffff',
  color: '#111827',
  padding: '10px 12px',
  fontSize: 14,
  lineHeight: 1.4,
  width: '100%',
}

const hintStyle: React.CSSProperties = {
  borderRadius: 14,
  background: '#f7fafc',
  border: '1px solid rgba(17, 24, 39, 0.08)',
  padding: '12px 14px',
  color: '#4b5563',
  fontSize: 13,
  lineHeight: 1.6,
}

const sectionLabelStyle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 13,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#374151',
}

const collapsibleStyle: React.CSSProperties = {
  display: 'grid',
  gap: 10,
}

const summaryStyle: React.CSSProperties = {
  ...sectionLabelStyle,
  cursor: 'pointer',
  listStyle: 'none',
}

const collapsibleBodyStyle: React.CSSProperties = {
  display: 'grid',
  gap: 12,
}

const textToolbarStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
  alignItems: 'center',
  marginBottom: 14,
  padding: '8px 10px',
  borderRadius: 16,
  border: '1px solid rgba(15, 23, 42, 0.1)',
  background: 'rgba(248,250,252,0.92)',
}

const iconToolbarButtonStyle: React.CSSProperties = {
  border: '1px solid rgba(17, 24, 39, 0.12)',
  borderRadius: 999,
  background: '#ffffff',
  color: '#111827',
  width: 32,
  height: 32,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
}

const activeIconToolbarButtonStyle: React.CSSProperties = {
  ...iconToolbarButtonStyle,
  background: '#102145',
  borderColor: '#102145',
  color: '#ffffff',
}

const toolbarButtonStyle: React.CSSProperties = {
  border: '1px solid rgba(17, 24, 39, 0.12)',
  borderRadius: 999,
  background: '#ffffff',
  color: '#111827',
  padding: '6px 10px',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
}

const toolbarSelectStyle: React.CSSProperties = {
  border: '1px solid rgba(17, 24, 39, 0.12)',
  borderRadius: 10,
  background: '#ffffff',
  color: '#111827',
  padding: '6px 10px',
  fontSize: 13,
  lineHeight: 1.3,
}

const toolbarInputStyle: React.CSSProperties = {
  border: '1px solid rgba(17, 24, 39, 0.12)',
  borderRadius: 10,
  background: '#ffffff',
  color: '#111827',
  padding: '6px 8px',
  fontSize: 13,
  lineHeight: 1.3,
}

const primaryButtonStyle: React.CSSProperties = {
  border: 'none',
  borderRadius: 999,
  background: '#102145',
  color: '#ffffff',
  padding: '12px 16px',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
}

const secondaryButtonStyle: React.CSSProperties = {
  border: '1px solid rgba(17, 24, 39, 0.12)',
  borderRadius: 999,
  background: '#ffffff',
  color: '#111827',
  padding: '12px 16px',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
}

const backgroundCardStyle: React.CSSProperties = {
  border: '1px solid rgba(17, 24, 39, 0.12)',
  borderRadius: 16,
  background: '#ffffff',
  padding: 8,
  display: 'grid',
  gap: 8,
  cursor: 'pointer',
}

const slotCardStyle: React.CSSProperties = {
  display: 'grid',
  gap: 10,
  padding: 14,
  borderRadius: 16,
  border: '1px solid rgba(17, 24, 39, 0.1)',
  background: 'rgba(248, 250, 252, 0.82)',
}

const contextMenuButtonStyle: React.CSSProperties = {
  width: '100%',
  border: 'none',
  background: 'transparent',
  color: '#111827',
  padding: '10px 12px',
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 600,
  textAlign: 'left',
  cursor: 'pointer',
}
