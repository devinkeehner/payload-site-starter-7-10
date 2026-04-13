'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type Konva from 'konva'
import { Group, Image as KonvaImage, Layer, Rect, Stage, Text, Transformer } from 'react-konva'

import { useActiveTenant } from '@/components/admin/hooks/useActiveTenant'
import type {
  GraphicHeadshotBinding,
  GraphicHeadshotLayer,
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
const STACK_BREAKPOINT = 1080
const COMPACT_BREAKPOINT = 1320
const WIDE_BREAKPOINT = 1600

const KEYBOARD_KEYS = [
  { x: 12, y: 0, width: 214, height: 150, rotate: -10 },
  { x: 216, y: -12, width: 252, height: 170, rotate: 10 },
  { x: 472, y: 4, width: 232, height: 170, rotate: -12 },
  { x: 732, y: -14, width: 248, height: 178, rotate: 10 },
  { x: 994, y: 10, width: 188, height: 146, rotate: -10 },
  { x: 48, y: 178, width: 246, height: 172, rotate: 10 },
  { x: 324, y: 162, width: 254, height: 180, rotate: -12 },
  { x: 602, y: 188, width: 236, height: 170, rotate: 11 },
  { x: 862, y: 178, width: 214, height: 164, rotate: -10 },
  { x: 84, y: 384, width: 252, height: 172, rotate: -11 },
  { x: 364, y: 374, width: 246, height: 176, rotate: 9 },
  { x: 636, y: 392, width: 252, height: 176, rotate: -12 },
  { x: 924, y: 384, width: 224, height: 164, rotate: 10 },
]

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
  | { kind: 'masthead'; part: MastheadPart }
  | { kind: 'repName'; role: GraphicRepRole }
  | { kind: 'headshot'; id: string }
  | null

type CanvasContextMenuState = {
  x: number
  y: number
  target: Exclude<Selection, null> | 'canvas'
} | null

type PickerState = {
  open: boolean
  query: string
}

type GraphicHeadshotBindingPatch = {
  type?: GraphicHeadshotBinding['type']
  role?: GraphicRepRole
  mediaID?: string | null
}

type MastheadPart = 'fromThe' | 'houseGop' | 'newsroom' | 'line'

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

function fitHeadlineText(text: string, layer: GraphicTextLayer, fitScale = 1) {
  const clean = text.length > 0 ? text : 'Headline'
  const layerHeight = Math.max(120, Math.round((layer.height ?? 200) * fitScale))
  const layerWidth = Math.max(220, Math.round(layer.width * fitScale))

  const startFontSize = Math.max(28, Math.round(38 * fitScale))
  const endFontSize = Math.max(14, Math.round(18 * fitScale))

  for (let fontSize = startFontSize; fontSize >= endFontSize; fontSize -= 1) {
    const lineHeight = Math.round(fontSize * 1.08)
    const lines = wrapText(clean, `${fontSize}px Georgia, Times New Roman, serif`, layerWidth)
    if (lines.length <= 7 && lines.length * lineHeight <= layerHeight) {
      return { fontSize, lineHeight, lines }
    }
  }

  const fallbackFontSize = endFontSize
  const lines = wrapText(clean, `${fallbackFontSize}px Georgia, Times New Roman, serif`, layerWidth).slice(0, 7)
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

export const GraphicTemplateEditor: React.FC = () => {
  const searchParams = useSearchParams()
  const router = useRouter()
  const templateIdParam = searchParams.get('templateId') || ''
  const designIdParam = searchParams.get('designId') || ''
  const { tenantID, tenantName } = useActiveTenant()
  const stageRef = useRef<Konva.Stage | null>(null)
  const transformerRef = useRef<Konva.Transformer | null>(null)
  const headshotRefs = useRef<Record<string, Konva.Group | null>>({})
  const mastheadPartRefs = useRef<Record<MastheadPart, Konva.Node | null>>({
    fromThe: null,
    houseGop: null,
    newsroom: null,
    line: null,
  })
  const titleRef = useRef<Konva.Group | null>(null)
  const repNameRefs = useRef<Record<GraphicRepRole, Konva.Text | null>>({
    primary: null,
    secondary: null,
  })
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
  const [backgroundPicker, setBackgroundPicker] = useState<PickerState>({ open: false, query: '' })
  const [designBrowserQuery, setDesignBrowserQuery] = useState('')
  const [graphicDesigns, setGraphicDesigns] = useState<DesignDoc[]>([])
  const [loadingGraphicDesigns, setLoadingGraphicDesigns] = useState(false)

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

  const headlineText = titleOverride.length > 0 ? titleOverride : postDoc?.title || 'Headline'
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
    const transformer = transformerRef.current
    if (!transformer) return

    if (!selection) {
      transformer.nodes([])
      transformer.getLayer()?.batchDraw()
      return
    }

    const node =
      selection.kind === 'masthead'
        ? mastheadPartRefs.current[selection.part]
        : selection.kind === 'headline'
          ? titleRef.current
          : selection.kind === 'repName'
            ? repNameRefs.current[selection.role]
            : headshotRefs.current[selection.id]

    if (node) {
      transformer.nodes([node])
      transformer.getLayer()?.batchDraw()
    }
  }, [scene, selection])

  const updateHeadline = (patch: Partial<GraphicTextLayer>) => {
    setScene((current) => ({ ...current, headlineLayer: { ...current.headlineLayer, ...patch } }))
  }

  const updateMasthead = (patch: Partial<GraphicScene['masthead']>) => {
    setScene((current) => ({ ...current, masthead: { ...current.masthead, ...patch } }))
  }

  const updateMastheadPart = (part: MastheadPart, patch: Partial<GraphicScene['masthead'][MastheadPart]>) => {
    setScene((current) => ({
      ...current,
      masthead: {
        ...current.masthead,
        [part]: {
          ...current.masthead[part],
          ...patch,
        },
      },
    }))
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
    setSelection(null)
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))
    const dataUrl = stage.toDataURL({ pixelRatio: 2 })
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

  const openBackgroundPicker = () => {
    setBackgroundPicker((current) => ({ ...current, open: true }))
  }

  const closeBackgroundPicker = () => {
    setBackgroundPicker((current) => ({ ...current, open: false }))
  }

  const chooseBackground = (mediaID: string) => {
    setBackgroundMediaID(mediaID)
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

    if (action === 'remove-headshot' && target !== 'canvas' && target.kind === 'headshot') {
      removeHeadshot(target.id)
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

    if (action === 'reset-masthead' && target !== 'canvas' && target.kind === 'masthead') {
      updateMasthead(defaultGraphicScene().masthead)
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
  }

  const headshotMeta = scene.headshots.map((headshot) => ({
    id: headshot.id,
    label: headshot.binding.type === 'tenant-headshot' ? `${headshot.binding.role === 'secondary' ? 'Secondary' : 'Primary'} tenant headshot` : 'Headshot slot',
  }))

  if (loading) {
    return <div style={{ padding: 24 }}>Loading graphics editor…</div>
  }

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
          position: isStackedLayout ? 'static' : 'sticky',
          top: 18,
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
            <button type="button" onClick={saveTemplate} style={primaryButtonStyle} disabled={savingTemplate}>
              {savingTemplate ? 'Saving template…' : templateID ? 'Update template' : 'Save template'}
            </button>
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
              onChange={(event) => setTitleOverride(event.target.value)}
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

        <section style={{ display: 'grid', gap: 10 }}>
          <div style={sectionLabelStyle}>Background</div>
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
              <button type="button" onClick={openBackgroundPicker} style={secondaryButtonStyle}>
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
        </section>

        <section style={{ display: 'grid', gap: 12 }}>
          <div style={sectionLabelStyle}>Saved Designs</div>
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
        </section>

        <section style={{ display: 'grid', gap: 10 }}>
          <div style={sectionLabelStyle}>Output</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={saveDesign} style={primaryButtonStyle} disabled={savingDesign}>
              {savingDesign ? 'Saving…' : 'Save design'}
            </button>
            <button type="button" onClick={saveToSEO} style={primaryButtonStyle} disabled={savingMedia || !docID}>
              {savingMedia ? 'Saving…' : 'Save to SEO'}
            </button>
            <button type="button" onClick={saveToMediaGallery} style={secondaryButtonStyle} disabled={savingMedia}>
              {savingMedia ? 'Saving…' : 'Save to Media Gallery'}
            </button>
            <button type="button" onClick={downloadPng} style={secondaryButtonStyle}>
              Download PNG
            </button>
          </div>
          {message ? <div style={hintStyle}>{message}</div> : null}
        </section>
      </aside>

      <section
        style={{
          borderRadius: 24,
          border: '1px solid rgba(17, 24, 39, 0.12)',
          background: 'rgba(255,255,255,0.86)',
          padding: isStackedLayout ? 14 : '16px 32px 16px 16px',
          position: 'relative',
          overflow: 'auto',
          minWidth: 0,
        }}
      >
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
              {KEYBOARD_KEYS.map((key, index) => (
                <Rect
                  key={index}
                  x={key.x}
                  y={key.y}
                  width={key.width}
                  height={key.height}
                  rotation={key.rotate}
                  cornerRadius={22}
                  stroke="rgba(160, 166, 179, 0.12)"
                  strokeWidth={5}
                />
              ))}

              {scene.masthead.show ? (
                <>
                  <Text
                    ref={(node) => {
                      mastheadPartRefs.current.fromThe = node
                    }}
                    x={scene.masthead.fromThe.x}
                    y={scene.masthead.fromThe.y}
                    width={Math.round(scene.masthead.fromThe.width * contentFitScale)}
                    text="FROM THE"
                    fontFamily="Inter, Arial, sans-serif"
                    fontStyle="800 italic"
                    fontSize={Math.max(13, Math.round(16 * contentFitScale))}
                    fill="#152b70"
                    align="center"
                    letterSpacing={1}
                    draggable
                    onClick={() => setSelection({ kind: 'masthead', part: 'fromThe' })}
                    onTap={() => setSelection({ kind: 'masthead', part: 'fromThe' })}
                    onContextMenu={(event) => {
                      event.cancelBubble = true
                      openCanvasMenu(event.evt, { kind: 'masthead', part: 'fromThe' })
                    }}
                    onDragEnd={(event) => updateMastheadPart('fromThe', { x: event.target.x(), y: event.target.y() })}
                  />
                  <Text
                    ref={(node) => {
                      mastheadPartRefs.current.houseGop = node
                    }}
                    x={scene.masthead.houseGop.x}
                    y={scene.masthead.houseGop.y}
                    width={Math.round(scene.masthead.houseGop.width * contentFitScale)}
                    text="CT HOUSE GOP"
                    fontFamily="Inter, Arial, sans-serif"
                    fontStyle="800"
                    fontSize={Math.max(36, Math.round(50 * contentFitScale))}
                    fill="#b91c1c"
                    align="center"
                    draggable
                    onClick={() => setSelection({ kind: 'masthead', part: 'houseGop' })}
                    onTap={() => setSelection({ kind: 'masthead', part: 'houseGop' })}
                    onContextMenu={(event) => {
                      event.cancelBubble = true
                      openCanvasMenu(event.evt, { kind: 'masthead', part: 'houseGop' })
                    }}
                    onDragEnd={(event) => updateMastheadPart('houseGop', { x: event.target.x(), y: event.target.y() })}
                  />
                  <Text
                    ref={(node) => {
                      mastheadPartRefs.current.newsroom = node
                    }}
                    x={scene.masthead.newsroom.x}
                    y={scene.masthead.newsroom.y}
                    width={Math.round(scene.masthead.newsroom.width * contentFitScale)}
                    text="NEWSROOM"
                    fontFamily="Inter, Arial, sans-serif"
                    fontStyle="900 italic"
                    fontSize={Math.max(48, Math.round(scene.masthead.newsroom.fontSize * contentFitScale))}
                    fill="#b91c1c"
                    align="center"
                    draggable
                    onClick={() => setSelection({ kind: 'masthead', part: 'newsroom' })}
                    onTap={() => setSelection({ kind: 'masthead', part: 'newsroom' })}
                    onContextMenu={(event) => {
                      event.cancelBubble = true
                      openCanvasMenu(event.evt, { kind: 'masthead', part: 'newsroom' })
                    }}
                    onDragEnd={(event) => updateMastheadPart('newsroom', { x: event.target.x(), y: event.target.y() })}
                  />
                  <Rect
                    ref={(node) => {
                      mastheadPartRefs.current.line = node
                    }}
                    x={scene.masthead.line.x}
                    y={scene.masthead.line.y}
                    width={Math.round(scene.masthead.line.width * contentFitScale)}
                    height={scene.masthead.line.height}
                    fill="#172c70"
                    cornerRadius={999}
                    draggable
                    onClick={() => setSelection({ kind: 'masthead', part: 'line' })}
                    onTap={() => setSelection({ kind: 'masthead', part: 'line' })}
                    onContextMenu={(event) => {
                      event.cancelBubble = true
                      openCanvasMenu(event.evt, { kind: 'masthead', part: 'line' })
                    }}
                    onDragEnd={(event) => updateMastheadPart('line', { x: event.target.x(), y: event.target.y() })}
                  />
                </>
              ) : null}

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

              <Text
                ref={(node) => {
                  repNameRefs.current.primary = node
                }}
                x={scene.repNameLayers.primary.x}
                y={scene.repNameLayers.primary.y}
                width={scene.repNameLayers.primary.width}
                text={primaryRepName}
                fontFamily="Georgia, Times New Roman, serif"
                fontSize={Math.max(22, Math.round(28 * contentFitScale))}
                fill="#aa2426"
                draggable
                onClick={() => setSelection({ kind: 'repName', role: 'primary' })}
                onTap={() => setSelection({ kind: 'repName', role: 'primary' })}
                onContextMenu={(event) => {
                  event.cancelBubble = true
                  openCanvasMenu(event.evt, { kind: 'repName', role: 'primary' })
                }}
                onDragEnd={(event) => updateRepName('primary', { x: event.target.x(), y: event.target.y() })}
                onTransformEnd={(event) => {
                  const node = event.target
                  const nextWidth = clamp(
                    Math.round(scene.repNameLayers.primary.width * node.scaleX()),
                    REP_NAME_WIDTH_LIMITS.min,
                    REP_NAME_WIDTH_LIMITS.max,
                  )
                  node.scaleX(1)
                  node.scaleY(1)
                  updateRepName('primary', { x: node.x(), y: node.y(), width: nextWidth })
                }}
              />

              {secondaryTenantID && scene.headshots.some((item) => item.binding.type === 'tenant-headshot' && item.binding.role === 'secondary') ? (
                <Text
                  ref={(node) => {
                    repNameRefs.current.secondary = node
                  }}
                  x={scene.repNameLayers.secondary.x}
                  y={scene.repNameLayers.secondary.y}
                  width={scene.repNameLayers.secondary.width}
                  text={secondaryRepName}
                  fontFamily="Georgia, Times New Roman, serif"
                  fontSize={Math.max(20, Math.round(26 * contentFitScale))}
                  fill="#aa2426"
                  draggable
                  onClick={() => setSelection({ kind: 'repName', role: 'secondary' })}
                  onTap={() => setSelection({ kind: 'repName', role: 'secondary' })}
                  onContextMenu={(event) => {
                    event.cancelBubble = true
                    openCanvasMenu(event.evt, { kind: 'repName', role: 'secondary' })
                  }}
                  onDragEnd={(event) => updateRepName('secondary', { x: event.target.x(), y: event.target.y() })}
                  onTransformEnd={(event) => {
                    const node = event.target
                    const nextWidth = clamp(
                      Math.round(scene.repNameLayers.secondary.width * node.scaleX()),
                      REP_NAME_WIDTH_LIMITS.min,
                      REP_NAME_WIDTH_LIMITS.max,
                    )
                    node.scaleX(1)
                    node.scaleY(1)
                    updateRepName('secondary', { x: node.x(), y: node.y(), width: nextWidth })
                  }}
                />
              ) : null}

              <Group
                ref={titleRef}
                x={scene.headlineLayer.x}
                y={scene.headlineLayer.y}
                draggable
                onClick={() => setSelection({ kind: 'headline' })}
                onTap={() => setSelection({ kind: 'headline' })}
                onContextMenu={(event) => {
                  event.cancelBubble = true
                  openCanvasMenu(event.evt, { kind: 'headline' })
                }}
                onDragEnd={(event) => updateHeadline({ x: event.target.x(), y: event.target.y() })}
                onTransformEnd={(event) => {
                  const node = event.target
                  const nextWidth = clamp(Math.round(scene.headlineLayer.width * node.scaleX()), TITLE_WIDTH_LIMITS.min, TITLE_WIDTH_LIMITS.max)
                  node.scaleX(1)
                  node.scaleY(1)
                  updateHeadline({ x: node.x(), y: node.y(), width: nextWidth })
                }}
              >
                <Rect
                  x={-12}
                  y={-8}
                  width={scene.headlineLayer.width + 24}
                  height={(scene.headlineLayer.height || 200) + 16}
                  cornerRadius={18}
                  fill={selection?.kind === 'headline' ? 'rgba(125, 211, 252, 0.08)' : 'transparent'}
                  stroke={selection?.kind === 'headline' ? '#7dd3fc' : 'transparent'}
                  dash={selection?.kind === 'headline' ? [10, 8] : []}
                />
                <Text
                  width={scene.headlineLayer.width}
                  text={fittedHeadline.lines.join('\n')}
                  fontFamily="Georgia, Times New Roman, serif"
                  fontSize={fittedHeadline.fontSize}
                  lineHeight={fittedHeadline.lineHeight / fittedHeadline.fontSize}
                  fill="#a02626"
                  align={scene.headlineLayer.align}
                />
              </Group>

              {scene.handle.show ? (
                  <Text
                    x={798}
                    y={498}
                    width={240}
                    text="@cthousegop"
                    fontFamily="Inter, Arial, sans-serif"
                    fontStyle="700 italic"
                    fontSize={Math.max(15, Math.round(18 * contentFitScale))}
                    fill="#172c70"
                    align="center"
                  />
              ) : null}

              <Transformer
                ref={transformerRef}
                rotateEnabled={false}
                flipEnabled={false}
                enabledAnchors={
                  selection?.kind === 'masthead'
                    ? []
                    : selection?.kind === 'headline'
                    ? ['middle-left', 'middle-right']
                    : selection?.kind === 'repName'
                      ? ['middle-left', 'middle-right']
                      : selection?.kind === 'headshot'
                        ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
                        : []
                }
                borderStroke="#0ea5e9"
                anchorStroke="#0ea5e9"
                anchorFill="#ffffff"
                anchorSize={10}
                boundBoxFunc={(_, newBox) => {
                  if (selection?.kind === 'masthead') {
                    return newBox
                  }

                  if (selection?.kind === 'headline') {
                    return {
                      ...newBox,
                      width: clamp(newBox.width, TITLE_WIDTH_LIMITS.min, TITLE_WIDTH_LIMITS.max),
                      height: scene.headlineLayer.height || 200,
                    }
                  }

                  if (selection?.kind === 'repName') {
                    return {
                      ...newBox,
                      width: clamp(newBox.width, REP_NAME_WIDTH_LIMITS.min, REP_NAME_WIDTH_LIMITS.max),
                      height: newBox.height,
                    }
                  }

                  if (selection?.kind === 'headshot') {
                    const nextSize = clamp(Math.max(newBox.width, newBox.height), HEADSHOT_SIZE_LIMITS.min, HEADSHOT_SIZE_LIMITS.max)
                    return { ...newBox, width: nextSize, height: nextSize, rotation: 0 }
                  }

                  return newBox
                }}
              />
            </Layer>
          </Stage>

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
                    <strong style={{ fontSize: 18 }}>Choose Background</strong>
                    <span style={hintStyle}>Browse tenant media, search, or close the picker without changing anything.</span>
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
                  <button type="button" style={contextMenuButtonStyle} onClick={() => void handleCanvasMenuAction('reset-scene')}>
                    Reset scene
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
              ) : canvasMenu.target.kind === 'masthead' ? (
                <button type="button" style={contextMenuButtonStyle} onClick={() => void handleCanvasMenuAction('reset-masthead')}>
                  Reset masthead
                </button>
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
