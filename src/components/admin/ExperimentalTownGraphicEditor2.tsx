'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type Konva from 'konva'
import { Group, Image as KonvaImage, Layer, Rect, Stage, Text, Transformer } from 'react-konva'
import { Button } from '@payloadcms/ui'

import { useActiveTenant } from '@/components/admin/hooks/useActiveTenant'

const STAGE_WIDTH = 1200
const STAGE_HEIGHT = 1600
const ARTBOARD_X = 220
const ARTBOARD_Y = 120
const WORKSPACE_WIDTH = STAGE_WIDTH + ARTBOARD_X * 2
const WORKSPACE_HEIGHT = STAGE_HEIGHT + ARTBOARD_Y * 2
const MAX_PREVIEW_HEIGHT = 860
const SCENE_KIND = 'experimental-town-graphic/v2'
const BRAND_BLUE = '#1d2f8c'
const BRAND_RED = '#c3202f'
const HEADSHOT_SIZE_LIMITS = { min: 180, max: 560 }
const TITLE_WIDTH_LIMITS = { min: 240, max: 920 }

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

type RepInfoDoc = {
  id: string
  name?: string | null
  officeTitle?: string | null
}

type TownDataRow = {
  id: string
  town: string
  strapAid: number
}

type TownFundingResponse = {
  tenant: TenantDoc | null
  repInfo: RepInfoDoc | null
  standardMedia: {
    id?: string
    mobileHeadshot?: string | MediaDoc | null
    districtImage?: string | MediaDoc | null
    bannerImage?: string | MediaDoc | null
    defaultFeaturedImage?: string | MediaDoc | null
  } | null
  townRows: TownDataRow[]
}

type TownGraphicTextLayer = {
  x: number
  y: number
  width: number
  height?: number
  text: string
  color: string
  fontSize: number
  fontFamily?: string
  fontStyle?: string
  lineHeight?: number
}

type TownGraphicEyebrow = TownGraphicTextLayer & {
  barWidth: number
  barHeight: number
  paddingX: number
  paddingY: number
  backgroundColor: string
}

type TownGraphicSubhead = {
  x: number
  y: number
  dividerWidth: number
  dividerHeight: number
  dividerColor: string
  text: string
  color: string
  fontSize: number
  fontFamily?: string
  fontStyle?: string
}

type TownGraphicFooter = {
  x: number
  y: number
  width: number
  height: number
  backgroundColor: string
  text: string
  textX: number
  textY: number
  color: string
  fontSize: number
  fontStyle?: string
}

type TownGraphicHeadshotLayer = {
  id: string
  x: number
  y: number
  size: number
  crop: {
    zoom: number
    offsetX: number
    offsetY: number
  }
}

type TownGraphicRow = {
  id: string
  townKey: string
  town: string
  strapAid: number
  included: boolean
  x: number
  y: number
  labelWidth: number
  labelHeight: number
  amountOffsetY: number
  townFontSize: number
  amountFontSize: number
  labelColor: string
  textColor: string
}

type TownGraphicScene = {
  kind: typeof SCENE_KIND
  backgroundMediaID: string | null
  eyebrow: TownGraphicEyebrow
  headlineLayer: TownGraphicTextLayer
  subhead: TownGraphicSubhead
  footer: TownGraphicFooter
  headshots: TownGraphicHeadshotLayer[]
  townRows: TownGraphicRow[]
}

type TemplateDoc = {
  id: string
  title?: string | null
  backgroundImage?: string | MediaDoc | null
  scene?: TownGraphicScene | null
}

type DesignDoc = {
  id: string
  title?: string | null
  updatedAt?: string | null
  template?: string | TemplateDoc | null
  primaryTenant?: string | TenantDoc | null
  backgroundImage?: string | MediaDoc | null
  scene?: TownGraphicScene | null
  exportedMedia?: string | MediaDoc | null
}

type Selection =
  | { kind: 'headline' }
  | { kind: 'headshot'; id: string }
  | { kind: 'town'; id: string }
  | { kind: 'eyebrow' }
  | { kind: 'subhead' }
  | { kind: 'footer' }
  | null

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}

const getString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)

const getNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

const getMediaDoc = (value: unknown): MediaDoc | null =>
  value && typeof value === 'object' && typeof (value as Record<string, unknown>).id === 'string'
    ? (value as MediaDoc)
    : null

const getMediaID = (value: unknown): string | null => {
  if (typeof value === 'string' && value) return value
  return getMediaDoc(value)?.id || null
}

const proxiedUrl = (url: string | undefined | null) => {
  if (typeof url !== "string" || !url) return undefined
  if (url.startsWith('/')) return url
  return `/api/media-proxy?url=${encodeURIComponent(url)}`
}

const readMediaUrl = (value: unknown) => {
  const mediaDoc = getMediaDoc(value)
  return proxiedUrl(mediaDoc?.url || mediaDoc?.thumbnailURL || null)
}

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

function useViewportHeight() {
  const [height, setHeight] = useState(0)

  useEffect(() => {
    const update = () => setHeight(window.innerHeight)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return height
}

function measureText(text: string, font: string) {
  if (typeof document === 'undefined') return text.length * 18
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return text.length * 18
  context.font = font
  return context.measureText(text).width
}

const normalizeTownKey = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')

const measureTownLabelWidth = (town: string, fontSize = 30) =>
  clamp(Math.ceil(measureText(town.toUpperCase(), `700 ${fontSize}px Arial`)) + 28, 180, 560)

function wrapText(text: string, font: string, maxWidth: number) {
  const paragraphs = text.replace(/\r\n/g, '\n').split('\n')
  const allLines: string[] = []

  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean)
    if (!words.length) {
      allLines.push('')
      continue
    }

    let current = words[0] || ''
    for (const word of words.slice(1)) {
      const next = `${current} ${word}`
      if (measureText(next, font) <= maxWidth) current = next
      else {
        allLines.push(current)
        current = word
      }
    }
    allLines.push(current)
  }

  return allLines
}

function fitHeadlineText(text: string, layer: TownGraphicTextLayer) {
  const clean = text.length > 0 ? text : 'Headline'
  const layerHeight = Math.max(120, layer.height ?? 240)
  const layerWidth = Math.max(220, layer.width)
  const fontFamily = layer.fontFamily || 'Georgia, Times New Roman, serif'
  const startFontSize = Math.max(28, layer.fontSize || 66)
  const endFontSize = 18

  for (let fontSize = startFontSize; fontSize >= endFontSize; fontSize -= 1) {
    const lineHeight = Math.round(fontSize * (layer.lineHeight || 1.05))
    const lines = wrapText(clean, `${fontSize}px ${fontFamily}`, layerWidth)
    if (lines.length <= 8 && lines.length * lineHeight <= layerHeight) {
      return { fontSize, lineHeight, lines }
    }
  }

  const fallbackFontSize = endFontSize
  return {
    fontSize: fallbackFontSize,
    lineHeight: Math.round(fallbackFontSize * (layer.lineHeight || 1.05)),
    lines: wrapText(clean, `${fallbackFontSize}px ${fontFamily}`, layerWidth).slice(0, 8),
  }
}

function computeHeadshotPlacement(image: HTMLImageElement | null, layer: TownGraphicHeadshotLayer) {
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

function computeCoverPlacement(
  image: HTMLImageElement | null,
  frameWidth: number,
  frameHeight: number,
) {
  if (!image) return { width: frameWidth, height: frameHeight, x: 0, y: 0 }

  const scale = Math.max(frameWidth / image.width, frameHeight / image.height)
  const width = image.width * scale
  const height = image.height * scale
  const x = (frameWidth - width) / 2
  const y = (frameHeight - height) / 2
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

const dedupeMediaOptions = (docs: MediaDoc[]) => {
  const seen = new Set<string>()
  return docs.filter((item) => {
    if (!item.id || seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

const buildRepShortName = (name: string | undefined | null) => {
  if (!name) return 'Rep. Announces'
  const clean = name.replace(/^rep\.?\s+/i, '').trim()
  const parts = clean.split(/\s+/).filter(Boolean)
  const lastName = parts[parts.length - 1] || clean
  return `Rep. ${lastName}`
}

const deriveDefaultHeadline = (repName: string | undefined | null) =>
  `${buildRepShortName(repName)} Announces\nSchools/Taxpayers\nRelief & Affordability\nPlan (STRAP Aid)`

const slugToWebsite = (slug: string | undefined | null) => {
  if (!slug) return 'CTHOUSEGOP.COM'
  return `${slug.replace(/^www\./, '').replace(/[^a-z0-9-]/gi, '').toUpperCase()}.COM`
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value || 0)

const buildTemplateSearchParams = () =>
  new URLSearchParams({
    limit: '50',
    depth: '1',
    sort: '-updatedAt',
  })

const buildDesignSearchParams = (tenantID: string) => {
  const params = new URLSearchParams({
    limit: '50',
    depth: '1',
    sort: '-updatedAt',
  })
  params.set('where[primaryTenant][equals]', tenantID)
  return params
}

const buildMediaSearchParams = (tenantID: string) =>
  new URLSearchParams({
    limit: '36',
    depth: '0',
    sort: '-updatedAt',
    'where[tenant][equals]': tenantID,
  })

const isExperimentalTownScene2 = (value: unknown): value is TownGraphicScene =>
  asRecord(value).kind === SCENE_KIND

const buildDesignTitle = (tenantName: string | undefined | null) =>
  tenantName ? `${tenantName} Town Graphic` : 'Town Graphic'

const createBaseScene = (data: TownFundingResponse, tenantName: string | undefined) => {
  const headline = deriveDefaultHeadline(data.repInfo?.name)
  const townRows = data.townRows.map((row, index) => ({
    id: row.id,
    townKey: normalizeTownKey(row.town),
    town: row.town,
    strapAid: row.strapAid,
    included: true,
    x: 72,
    y: 650 + index * 154,
    labelWidth: measureTownLabelWidth(row.town),
    labelHeight: 48,
    amountOffsetY: 60,
    townFontSize: 30,
    amountFontSize: 66,
    labelColor: BRAND_RED,
    textColor: BRAND_BLUE,
  }))

  const fallbackBackgroundID =
    getMediaID(data.standardMedia?.districtImage) ||
    getMediaID(data.standardMedia?.bannerImage) ||
    getMediaID(data.standardMedia?.defaultFeaturedImage) ||
    null

  return {
    kind: SCENE_KIND,
    backgroundMediaID: fallbackBackgroundID,
    eyebrow: {
      x: 72,
      y: 72,
      width: 0,
      height: 0,
      text: 'REAL RELIEF FOR CONNECTICUT',
      color: '#ffffff',
      fontSize: 18,
      fontFamily: 'Arial',
      fontStyle: '700',
      lineHeight: 1,
      barWidth: 420,
      barHeight: 44,
      paddingX: 16,
      paddingY: 10,
      backgroundColor: BRAND_BLUE,
    },
    headlineLayer: {
      x: 72,
      y: 142,
      width: 640,
      height: 336,
      text: headline,
      color: BRAND_BLUE,
      fontSize: 66,
      fontFamily: 'Georgia, Times New Roman, serif',
      lineHeight: 1.05,
    },
    subhead: {
      x: 72,
      y: 508,
      dividerWidth: 220,
      dividerHeight: 3,
      dividerColor: '#8ea4ea',
      text: 'STRAP Aid funding per town',
      color: BRAND_BLUE,
      fontSize: 26,
      fontFamily: 'Arial',
      fontStyle: 'italic 700',
    },
    footer: {
      x: 0,
      y: 1490,
      width: STAGE_WIDTH,
      height: 70,
      backgroundColor: BRAND_RED,
      text: slugToWebsite(data.tenant?.slug || tenantName),
      textX: 78,
      textY: 1511,
      color: '#ffffff',
      fontSize: 28,
      fontStyle: 'italic 700',
    },
    headshots: [
      {
        id: 'headshot-primary',
        x: 800,
        y: 1160,
        size: 420,
        crop: {
          zoom: 1,
          offsetX: 0,
          offsetY: 0,
        },
      },
    ],
    townRows,
  } satisfies TownGraphicScene
}

const mergeSceneWithFreshData = (savedScene: TownGraphicScene | null | undefined, baseScene: TownGraphicScene) => {
  if (!savedScene || !isExperimentalTownScene2(savedScene)) return baseScene

  const savedRowsByKey = new Map(
    (savedScene.townRows || []).map((row) => [row.townKey || normalizeTownKey(row.town), row] as const),
  )
  const fallbackHeadshot = baseScene.headshots[0]!

  return {
    ...baseScene,
    ...savedScene,
    backgroundMediaID: savedScene.backgroundMediaID ?? baseScene.backgroundMediaID,
    eyebrow: { ...baseScene.eyebrow, ...savedScene.eyebrow },
    headlineLayer: { ...baseScene.headlineLayer, ...savedScene.headlineLayer },
    subhead: { ...baseScene.subhead, ...savedScene.subhead },
    footer: { ...baseScene.footer, ...savedScene.footer },
    headshots: (savedScene.headshots || baseScene.headshots).length > 0
      ? (savedScene.headshots || baseScene.headshots).map((headshot, index) => ({
          ...(baseScene.headshots[index] || fallbackHeadshot),
          ...headshot,
          crop: {
            ...(baseScene.headshots[index] || fallbackHeadshot).crop,
            ...headshot.crop,
          },
        }))
      : baseScene.headshots,
    townRows: baseScene.townRows.map((row) => {
      const savedRow = savedRowsByKey.get(row.townKey)
      return savedRow ? { ...row, ...savedRow, town: row.town, townKey: row.townKey } : row
    }),
  } satisfies TownGraphicScene
}

const syncSubheadToHeadline = (scene: TownGraphicScene) => {
  const fitted = fitHeadlineText(scene.headlineLayer.text || '', scene.headlineLayer)
  return {
    ...scene,
    subhead: {
      ...scene.subhead,
      y: scene.headlineLayer.y + fitted.lines.length * fitted.lineHeight + 26,
    },
  }
}

export const ExperimentalTownGraphicEditor2: React.FC = () => {
  const { tenantID, tenantName } = useActiveTenant()
  const searchParams = useSearchParams()
  const requestedDesignID = searchParams.get('designId') || ''
  const requestedTemplateID = searchParams.get('templateId') || ''
  const { ref: stageContainerRef, width: stageContainerWidth } = useContainerWidth()
  const viewportWidth = useViewportWidth()
  const viewportHeight = useViewportHeight()

  const stageRef = useRef<Konva.Stage | null>(null)
  const transformerRef = useRef<Konva.Transformer | null>(null)
  const titleRef = useRef<Konva.Group | null>(null)
  const headshotRefs = useRef<Record<string, Konva.Group | null>>({})

  const [isMounted, setIsMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [savingDesign, setSavingDesign] = useState(false)
  const [savingMedia, setSavingMedia] = useState(false)

  const [townData, setTownData] = useState<TownFundingResponse | null>(null)
  const [scene, setScene] = useState<TownGraphicScene | null>(null)
  const [selection, setSelection] = useState<Selection>(null)
  const [templates, setTemplates] = useState<TemplateDoc[]>([])
  const [designs, setDesigns] = useState<DesignDoc[]>([])
  const [mediaOptions, setMediaOptions] = useState<MediaDoc[]>([])
  const [templateID, setTemplateID] = useState('')
  const [templateTitle, setTemplateTitle] = useState('Experimental Town Graphic 2')
  const [designID, setDesignID] = useState('')
  const [designTitle, setDesignTitle] = useState('Town Graphic')

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    if (!isMounted) return
    if (!tenantID) {
      setLoading(false)
      setTownData(null)
      setScene(null)
      return
    }

    let cancelled = false

    const load = async () => {
      setLoading(true)
      setMessage(null)

      try {
        const [townResponse, templateResponse, designResponse, mediaResponse] = await Promise.all([
          fetch(`/api/graphics-experimental/town-funding?tenant=${tenantID}`, { credentials: 'include' }),
          fetch(`/api/graphic-templates?${buildTemplateSearchParams().toString()}`, { credentials: 'include' }),
          fetch(`/api/graphic-designs?${buildDesignSearchParams(tenantID).toString()}`, { credentials: 'include' }),
          fetch(`/api/media?${buildMediaSearchParams(tenantID).toString()}`, { credentials: 'include' }),
        ])

        const [townJson, templateJson, designJson, mediaJson] = await Promise.all([
          townResponse.json(),
          templateResponse.json(),
          designResponse.json(),
          mediaResponse.json(),
        ])

        if (!townResponse.ok) throw new Error(getString(asRecord(townJson).message) || 'Failed to load town data')

        const nextTownData = townJson as TownFundingResponse
        const nextTemplates = Array.isArray(asRecord(templateJson).docs)
          ? ((asRecord(templateJson).docs as TemplateDoc[]) || []).filter((doc) => isExperimentalTownScene2(doc.scene))
          : []
        const nextDesigns = Array.isArray(asRecord(designJson).docs)
          ? ((asRecord(designJson).docs as DesignDoc[]) || []).filter((doc) => isExperimentalTownScene2(doc.scene))
          : []
        const nextMedia = Array.isArray(asRecord(mediaJson).docs) ? ((asRecord(mediaJson).docs as MediaDoc[]) || []) : []

        const baseScene = createBaseScene(nextTownData, tenantName)
        const selectedDesign = requestedDesignID ? nextDesigns.find((item) => item.id === requestedDesignID) : undefined
        const selectedTemplate = !selectedDesign && requestedTemplateID ? nextTemplates.find((item) => item.id === requestedTemplateID) : undefined
        const nextScene = selectedDesign
          ? mergeSceneWithFreshData(selectedDesign.scene, baseScene)
          : selectedTemplate
            ? mergeSceneWithFreshData(selectedTemplate.scene, baseScene)
            : baseScene

        if (cancelled) return

        setTownData(nextTownData)
        setTemplates(nextTemplates)
        setDesigns(nextDesigns)
        setMediaOptions(dedupeMediaOptions(nextMedia))
        setScene(syncSubheadToHeadline(nextScene))
        setTemplateID(selectedTemplate?.id || getString(asRecord(selectedDesign?.template).id) || getString(selectedDesign?.template) || '')
        setTemplateTitle(selectedTemplate?.title || 'Experimental Town Graphic 2')
        setDesignID(selectedDesign?.id || '')
        setDesignTitle(selectedDesign?.title || buildDesignTitle(nextTownData.tenant?.name || tenantName))
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : String(error))
          setTownData(null)
          setScene(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [isMounted, requestedDesignID, requestedTemplateID, tenantID, tenantName])

  const previewScale = useMemo(() => {
    const availableWidth = stageContainerWidth > 0 ? Math.max(0, stageContainerWidth - 16) : Math.max(0, viewportWidth - 72)
    const availableHeight = viewportHeight > 0 ? Math.max(520, Math.min(MAX_PREVIEW_HEIGHT, viewportHeight - 220)) : MAX_PREVIEW_HEIGHT
    if (!availableWidth) return 1
    return Math.min(availableWidth / WORKSPACE_WIDTH, availableHeight / WORKSPACE_HEIGHT, 1)
  }, [stageContainerWidth, viewportHeight, viewportWidth])

  const backgroundUrl = useMemo(() => {
    if (!scene) return undefined
    const selectedID = scene.backgroundMediaID
    const mediaDoc =
      mediaOptions.find((item) => item.id === selectedID) ||
      getMediaDoc(townData?.standardMedia?.districtImage) ||
      getMediaDoc(townData?.standardMedia?.bannerImage) ||
      getMediaDoc(townData?.standardMedia?.defaultFeaturedImage) ||
      null

    return proxiedUrl(mediaDoc?.url || mediaDoc?.thumbnailURL || null)
  }, [mediaOptions, scene, townData])

  const headshotUrl = useMemo(
    () => readMediaUrl(townData?.standardMedia?.mobileHeadshot) || undefined,
    [townData],
  )

  const backgroundImage = useLoadedImage(backgroundUrl)
  const headshotImage = useLoadedImage(headshotUrl)

  const fittedHeadline = useMemo(() => {
    if (!scene) return null
    return fitHeadlineText(scene.headlineLayer.text || '', scene.headlineLayer)
  }, [scene])

  useEffect(() => {
    const transformer = transformerRef.current
    if (!transformer) return

    const node =
      selection?.kind === 'headline'
        ? titleRef.current
        : selection?.kind === 'headshot'
          ? headshotRefs.current[selection.id]
          : null

    if (node) {
      transformer.nodes([node])
      transformer.getLayer()?.batchDraw()
    } else {
      transformer.nodes([])
      transformer.getLayer()?.batchDraw()
    }
  }, [scene, selection])

  const updateScene = (updater: (current: TownGraphicScene) => TownGraphicScene) => {
    setScene((current) => (current ? updater(current) : current))
  }

  const updateHeadline = (patch: Partial<TownGraphicTextLayer>) => {
    updateScene((current) => syncSubheadToHeadline({ ...current, headlineLayer: { ...current.headlineLayer, ...patch } }))
  }

  const updateHeadshot = (id: string, patch: Partial<TownGraphicHeadshotLayer>) => {
    updateScene((current) => ({
      ...current,
      headshots: current.headshots.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }))
  }

  const updateTownRow = (rowID: string, patch: Partial<TownGraphicRow>) => {
    updateScene((current) => ({
      ...current,
      townRows: current.townRows.map((row) => (row.id === rowID ? { ...row, ...patch } : row)),
    }))
  }

  const selectedTownRow = useMemo(() => {
    if (!scene || selection?.kind !== 'town') return null
    return scene.townRows.find((row) => row.id === selection.id) || null
  }, [scene, selection])

  const selectedHeadshot = useMemo(() => {
    if (!scene || selection?.kind !== 'headshot') return null
    return scene.headshots.find((item) => item.id === selection.id) || null
  }, [scene, selection])

  const loadTemplate = (nextTemplateID: string) => {
    if (!townData) return
    setTemplateID(nextTemplateID)
    const baseScene = createBaseScene(townData, tenantName)
    if (!nextTemplateID) {
      setScene(syncSubheadToHeadline(baseScene))
      setSelection(null)
      return
    }
    const template = templates.find((item) => item.id === nextTemplateID)
    if (!template) return
    setTemplateTitle(template.title || 'Experimental Town Graphic 2')
    setScene(syncSubheadToHeadline(mergeSceneWithFreshData(template.scene, baseScene)))
    setSelection(null)
  }

  const loadDesign = (nextDesignID: string) => {
    if (!townData) return
    setDesignID(nextDesignID)
    const baseScene = createBaseScene(townData, tenantName)
    if (!nextDesignID) {
      setScene(syncSubheadToHeadline(baseScene))
      setSelection(null)
      return
    }
    const design = designs.find((item) => item.id === nextDesignID)
    if (!design) return
    setDesignTitle(design.title || buildDesignTitle(townData.tenant?.name || tenantName))
    setTemplateID(getString(asRecord(design.template).id) || getString(design.template) || '')
    setScene(syncSubheadToHeadline(mergeSceneWithFreshData(design.scene, baseScene)))
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
    if (!response.ok) throw new Error(getString(asRecord(data).message) || 'Failed to upload media')

    const mediaDoc: MediaDoc = {
      id: getString(asRecord(data).id) || '',
      alt: getString(asRecord(data).alt),
      url: getString(asRecord(data).url),
      thumbnailURL: getString(asRecord(data).thumbnailURL),
      filename: getString(asRecord(data).filename),
      title: getString(asRecord(data).title),
    }

    if (!mediaDoc.id) throw new Error('Upload did not return a media id')
    setMediaOptions((current) => dedupeMediaOptions([mediaDoc, ...current]))
    return mediaDoc
  }

  const buildTemplatePayload = () => {
    if (!scene) throw new Error('No scene available')
    return {
      title: templateTitle || 'Experimental Town Graphic 2',
      sourceCollection: 'pages',
      backgroundImage: scene.backgroundMediaID || null,
      scene,
      notes: 'experimental-town-graphic-2',
    }
  }

  const buildDesignPayload = (exportedMediaID?: string | null) => {
    if (!scene) throw new Error('No scene available')
    return {
      title: designTitle || buildDesignTitle(townData?.tenant?.name || tenantName),
      template: templateID || null,
      sourceCollection: 'pages',
      sourcePost: null,
      primaryTenant: tenantID || null,
      secondaryTenant: null,
      backgroundImage: scene.backgroundMediaID || null,
      titleOverride: scene.headlineLayer.text || null,
      scene,
      exportedMedia: exportedMediaID ?? null,
      notes: 'experimental-town-graphic-2',
      tenant: tenantID || null,
    }
  }

  const saveTemplate = async () => {
    if (!scene) return
    setSavingTemplate(true)
    setMessage(null)

    try {
      const response = await fetch(
        templateID ? `/api/graphic-templates/${templateID}?draft=true` : '/api/graphic-templates?draft=true',
        {
          method: templateID ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(buildTemplatePayload()),
        },
      )
      const data = await response.json()
      if (!response.ok) throw new Error(getString(asRecord(data).message) || 'Failed to save template')
      const savedDoc = ((asRecord(data).doc || data) as TemplateDoc) || null
      if (savedDoc?.id) {
        setTemplateID(savedDoc.id)
        setTemplates((current) => [savedDoc, ...current.filter((item) => item.id !== savedDoc.id)].slice(0, 50))
      }
      setMessage('Template saved')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setSavingTemplate(false)
    }
  }

  const saveDesign = async (exportedMediaID?: string | null) => {
    if (!scene) return ''
    const response = await fetch(
      designID ? `/api/graphic-designs/${designID}?draft=true` : '/api/graphic-designs?draft=true',
      {
        method: designID ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(buildDesignPayload(exportedMediaID)),
      },
    )
    const data = await response.json()
    if (!response.ok) throw new Error(getString(asRecord(data).message) || 'Failed to save design')
    const savedDoc = ((asRecord(data).doc || data) as DesignDoc) || null
    if (savedDoc?.id) {
      setDesignID(savedDoc.id)
      setDesigns((current) => [savedDoc, ...current.filter((item) => item.id !== savedDoc.id)].slice(0, 50))
      return savedDoc.id
    }
    return designID
  }

  const handleSaveDesign = async () => {
    if (!scene) return
    setSavingDesign(true)
    setMessage(null)
    try {
      await saveDesign()
      setMessage('Design saved')
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
    const dataUrl = stage.toDataURL({
      x: ARTBOARD_X,
      y: ARTBOARD_Y,
      width: STAGE_WIDTH,
      height: STAGE_HEIGHT,
      pixelRatio: 2,
    })
    stage.scale({ x: previousScaleX, y: previousScaleY })
    stage.draw()
    setSelection(previousSelection)
    return dataUrl
  }

  const saveToMediaGallery = async () => {
    if (!scene) return
    setSavingMedia(true)
    setMessage(null)

    try {
      const dataUrl = await exportStageDataUrl()
      if (!dataUrl) throw new Error('Failed to render image')
      const blob = dataUrlToBlob(dataUrl)
      const filenameBase = (designTitle || templateTitle || townData?.tenant?.slug || 'town-graphic')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
      const mediaDoc = await uploadMediaAsset(
        new File([blob], `${filenameBase || 'town-graphic'}.png`, { type: 'image/png' }),
        designTitle || templateTitle || 'Town Graphic',
      )
      await saveDesign(mediaDoc.id)
      setMessage('Saved to media gallery')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setSavingMedia(false)
    }
  }

  const downloadPng = async () => {
    try {
      const dataUrl = await exportStageDataUrl()
      if (!dataUrl) throw new Error('Failed to render image')
      const link = document.createElement('a')
      const filenameBase = (designTitle || templateTitle || townData?.tenant?.slug || 'town-graphic')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
      link.href = dataUrl
      link.download = `${filenameBase || 'town-graphic'}.png`
      link.click()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  if (!isMounted || loading) {
    return <div style={{ padding: 24 }}>Loading experimental town editor 2...</div>
  }

  if (!tenantID) {
    return <div style={{ padding: 24 }}>Select a tenant in the admin first.</div>
  }

  if (!scene || !townData || !fittedHeadline) {
    return <div style={{ padding: 24 }}>{message || 'No town funding data available for this tenant.'}</div>
  }

  const primaryHeadshot = scene.headshots[0] || null
  const primaryPlacement = primaryHeadshot ? computeHeadshotPlacement(headshotImage, primaryHeadshot) : null
  const backgroundPlacement = computeCoverPlacement(backgroundImage, STAGE_WIDTH, STAGE_HEIGHT)

  return (
    <div
      style={{
        padding: 24,
        display: 'grid',
        gap: 20,
        gridTemplateColumns: 'minmax(320px, 420px) minmax(0, 1fr)',
        alignItems: 'start',
      }}
    >
      <aside
        style={{
          borderRadius: 20,
          border: '1px solid rgba(17, 24, 39, 0.12)',
          background: 'rgba(255,255,255,0.9)',
          padding: 20,
          display: 'grid',
          gap: 18,
          alignSelf: 'start',
          maxHeight: 'calc(100vh - 48px)',
          overflowY: 'auto',
        }}
      >
        <section style={{ display: 'grid', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Experimental Town Graphic 2</h2>
          <div style={hintStyle}>
            Tenant: <strong>{tenantName || townData.tenant?.name || 'Unknown'}</strong>
            <br />
            Rep: <strong>{townData.repInfo?.name || 'Unknown'}</strong>
            <br />
            Design: <strong>{designID ? designTitle : 'unsaved'}</strong>
          </div>
        </section>

        <section style={{ display: 'grid', gap: 10 }}>
          <div style={sectionLabelStyle}>Templates</div>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={fieldLabelStyle}>Open template</span>
            <select value={templateID} onChange={(event) => loadTemplate(event.target.value)} style={controlStyle}>
              <option value="">Default layout</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.title || 'Untitled template'}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={fieldLabelStyle}>Template title</span>
            <input value={templateTitle} onChange={(event) => setTemplateTitle(event.target.value)} style={controlStyle} />
          </label>
          <Button onClick={saveTemplate} disabled={savingTemplate} buttonStyle="secondary">
            {savingTemplate ? 'Saving...' : 'Save template'}
          </Button>
        </section>

        <section style={{ display: 'grid', gap: 10 }}>
          <div style={sectionLabelStyle}>Designs</div>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={fieldLabelStyle}>Open design</span>
            <select value={designID} onChange={(event) => loadDesign(event.target.value)} style={controlStyle}>
              <option value="">Default layout</option>
              {designs.map((design) => (
                <option key={design.id} value={design.id}>
                  {design.title || 'Untitled design'}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={fieldLabelStyle}>Design title</span>
            <input value={designTitle} onChange={(event) => setDesignTitle(event.target.value)} style={controlStyle} />
          </label>
          <Button onClick={handleSaveDesign} disabled={savingDesign} buttonStyle="secondary">
            {savingDesign ? 'Saving...' : 'Save design'}
          </Button>
        </section>

        <section style={{ display: 'grid', gap: 10 }}>
          <div style={sectionLabelStyle}>Copy</div>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={fieldLabelStyle}>Eyebrow</span>
            <input
              value={scene.eyebrow.text}
              onChange={(event) => updateScene((current) => ({ ...current, eyebrow: { ...current.eyebrow, text: event.target.value } }))}
              style={controlStyle}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={fieldLabelStyle}>Headline</span>
            <textarea
              rows={5}
              value={scene.headlineLayer.text}
              onChange={(event) => updateHeadline({ text: event.target.value })}
              style={{ ...controlStyle, resize: 'vertical', minHeight: 110 }}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={fieldLabelStyle}>Subhead</span>
            <input
              value={scene.subhead.text}
              onChange={(event) => updateScene((current) => ({ ...current, subhead: { ...current.subhead, text: event.target.value } }))}
              style={controlStyle}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={fieldLabelStyle}>Website</span>
            <input
              value={scene.footer.text}
              onChange={(event) => updateScene((current) => ({ ...current, footer: { ...current.footer, text: event.target.value } }))}
              style={controlStyle}
            />
          </label>
        </section>

        {selection?.kind === 'headline' ? (
          <section style={{ display: 'grid', gap: 10 }}>
            <div style={sectionLabelStyle}>Selected headline</div>
            <div style={twoColumnGridStyle}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={fieldLabelStyle}>X</span>
                <input
                  type="number"
                  value={Math.round(scene.headlineLayer.x)}
                  onChange={(event) => updateHeadline({ x: Number(event.target.value) })}
                  style={controlStyle}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={fieldLabelStyle}>Y</span>
                <input
                  type="number"
                  value={Math.round(scene.headlineLayer.y)}
                  onChange={(event) => updateHeadline({ y: Number(event.target.value) })}
                  style={controlStyle}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={fieldLabelStyle}>Width</span>
                <input
                  type="number"
                  value={Math.round(scene.headlineLayer.width)}
                  onChange={(event) => updateHeadline({ width: clamp(Number(event.target.value), TITLE_WIDTH_LIMITS.min, TITLE_WIDTH_LIMITS.max) })}
                  style={controlStyle}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={fieldLabelStyle}>Font size</span>
                <input
                  type="number"
                  value={Math.round(scene.headlineLayer.fontSize)}
                  onChange={(event) => updateHeadline({ fontSize: Number(event.target.value) })}
                  style={controlStyle}
                />
              </label>
            </div>
          </section>
        ) : null}

        {selection?.kind === 'headshot' && selectedHeadshot ? (
          <section style={{ display: 'grid', gap: 10 }}>
            <div style={sectionLabelStyle}>Selected headshot</div>
            <div style={twoColumnGridStyle}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={fieldLabelStyle}>X</span>
                <input
                  type="number"
                  value={Math.round(selectedHeadshot.x)}
                  onChange={(event) => updateHeadshot(selectedHeadshot.id, { x: Number(event.target.value) })}
                  style={controlStyle}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={fieldLabelStyle}>Y</span>
                <input
                  type="number"
                  value={Math.round(selectedHeadshot.y)}
                  onChange={(event) => updateHeadshot(selectedHeadshot.id, { y: Number(event.target.value) })}
                  style={controlStyle}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={fieldLabelStyle}>Size</span>
                <input
                  type="number"
                  value={Math.round(selectedHeadshot.size)}
                  onChange={(event) =>
                    updateHeadshot(selectedHeadshot.id, {
                      size: clamp(Number(event.target.value), HEADSHOT_SIZE_LIMITS.min, HEADSHOT_SIZE_LIMITS.max),
                    })
                  }
                  style={controlStyle}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={fieldLabelStyle}>Zoom</span>
                <input
                  type="number"
                  step={0.05}
                  value={selectedHeadshot.crop.zoom}
                  onChange={(event) =>
                    updateHeadshot(selectedHeadshot.id, {
                      crop: { ...selectedHeadshot.crop, zoom: Number(event.target.value) },
                    })
                  }
                  style={controlStyle}
                />
              </label>
            </div>
          </section>
        ) : null}

        {selection?.kind === 'town' && selectedTownRow ? (
          <section style={{ display: 'grid', gap: 10 }}>
            <div style={sectionLabelStyle}>Selected town row</div>
            <div style={twoColumnGridStyle}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={fieldLabelStyle}>X</span>
                <input
                  type="number"
                  value={Math.round(selectedTownRow.x)}
                  onChange={(event) => updateTownRow(selectedTownRow.id, { x: Number(event.target.value) })}
                  style={controlStyle}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={fieldLabelStyle}>Y</span>
                <input
                  type="number"
                  value={Math.round(selectedTownRow.y)}
                  onChange={(event) => updateTownRow(selectedTownRow.id, { y: Number(event.target.value) })}
                  style={controlStyle}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={fieldLabelStyle}>Label width</span>
                <input
                  type="number"
                  value={Math.round(selectedTownRow.labelWidth)}
                  onChange={(event) => updateTownRow(selectedTownRow.id, { labelWidth: clamp(Number(event.target.value), 180, 560) })}
                  style={controlStyle}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={fieldLabelStyle}>Amount</span>
                <input
                  type="number"
                  value={selectedTownRow.strapAid}
                  onChange={(event) => updateTownRow(selectedTownRow.id, { strapAid: Number(event.target.value) })}
                  style={controlStyle}
                />
              </label>
            </div>
          </section>
        ) : null}

        <section style={{ display: 'grid', gap: 12 }}>
          <div style={sectionLabelStyle}>Towns</div>
          {scene.townRows.map((row) => (
            <div key={row.id} style={townCardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#111827' }}>
                  <input
                    type="checkbox"
                    checked={row.included}
                    onChange={(event) => updateTownRow(row.id, { included: event.target.checked })}
                  />
                  {row.town}
                </label>
                <button type="button" style={pillButtonStyle} onClick={() => setSelection({ kind: 'town', id: row.id })}>
                  Select
                </button>
              </div>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={fieldLabelStyle}>STRAP Aid</span>
                <input
                  type="number"
                  value={row.strapAid}
                  onChange={(event) => updateTownRow(row.id, { strapAid: Number(event.target.value) })}
                  style={controlStyle}
                />
              </label>
            </div>
          ))}
        </section>

        <section style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button onClick={saveToMediaGallery} disabled={savingMedia} buttonStyle="secondary">
            {savingMedia ? 'Saving...' : 'Save to Media'}
          </Button>
          <Button onClick={downloadPng} buttonStyle="secondary">
            Download PNG
          </Button>
        </section>
      </aside>

      <section
        style={{
          borderRadius: 24,
          border: '1px solid rgba(17, 24, 39, 0.12)',
          background: 'rgba(255,255,255,0.9)',
          padding: 16,
          overflow: 'hidden',
          minWidth: 0,
        }}
      >
        <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
          <strong style={{ fontSize: 16, color: '#0f172a' }}>Canvas</strong>
          <span style={{ fontSize: 12, color: '#64748b' }}>
            Headline and headshot use the original editor transformer flow. Town rows stay direct-drag.
          </span>
        </div>
        {message ? <div style={{ ...hintStyle, marginBottom: 12 }}>{message}</div> : null}
        <div
          ref={stageContainerRef}
          style={{
            width: '100%',
            display: 'flex',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <Stage
            ref={stageRef}
            width={WORKSPACE_WIDTH}
            height={WORKSPACE_HEIGHT}
            scaleX={previewScale}
            scaleY={previewScale}
            style={{
              width: `${WORKSPACE_WIDTH * previewScale}px`,
              height: `${WORKSPACE_HEIGHT * previewScale}px`,
              display: 'block',
              borderRadius: 20,
              background: '#e5e7eb',
              flex: '0 0 auto',
            }}
            onMouseDown={(event) => {
              if (event.target === event.target.getStage()) setSelection(null)
            }}
          >
            <Layer>
              <Rect width={WORKSPACE_WIDTH} height={WORKSPACE_HEIGHT} fill="#e5e7eb" />
              <Group x={ARTBOARD_X} y={ARTBOARD_Y}>
              <Rect width={STAGE_WIDTH} height={STAGE_HEIGHT} fill="#f7f4ef" />
              {backgroundImage ? (
                <KonvaImage
                  image={backgroundImage}
                  x={backgroundPlacement.x}
                  y={backgroundPlacement.y}
                  width={backgroundPlacement.width}
                  height={backgroundPlacement.height}
                  opacity={0.96}
                />
              ) : null}
              <Rect width={STAGE_WIDTH} height={STAGE_HEIGHT} fill="rgba(255,255,255,0.66)" />

              <Group
                x={scene.eyebrow.x}
                y={scene.eyebrow.y}
                draggable
                onClick={() => setSelection({ kind: 'eyebrow' })}
                onTap={() => setSelection({ kind: 'eyebrow' })}
                onDragEnd={(event) =>
                  updateScene((current) => ({ ...current, eyebrow: { ...current.eyebrow, x: event.target.x(), y: event.target.y() } }))
                }
              >
                <Rect width={scene.eyebrow.barWidth} height={scene.eyebrow.barHeight} fill={scene.eyebrow.backgroundColor} />
                <Text
                  x={scene.eyebrow.paddingX}
                  y={scene.eyebrow.paddingY}
                  width={scene.eyebrow.barWidth - scene.eyebrow.paddingX * 2}
                  text={scene.eyebrow.text}
                  fontFamily={scene.eyebrow.fontFamily || 'Arial'}
                  fontSize={scene.eyebrow.fontSize}
                  fontStyle={scene.eyebrow.fontStyle}
                  fill={scene.eyebrow.color}
                  wrap="none"
                />
              </Group>

              <Group
                ref={titleRef}
                x={scene.headlineLayer.x}
                y={scene.headlineLayer.y}
                draggable
                onClick={() => setSelection({ kind: 'headline' })}
                onTap={() => setSelection({ kind: 'headline' })}
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
                  height={(scene.headlineLayer.height || 240) + 16}
                  cornerRadius={18}
                  fill={selection?.kind === 'headline' ? 'rgba(125, 211, 252, 0.08)' : 'transparent'}
                  stroke={selection?.kind === 'headline' ? '#7dd3fc' : 'transparent'}
                  dash={selection?.kind === 'headline' ? [10, 8] : []}
                />
                <Text
                  width={scene.headlineLayer.width}
                  text={fittedHeadline.lines.join('\n')}
                  fontFamily={scene.headlineLayer.fontFamily || 'Georgia, Times New Roman, serif'}
                  fontSize={fittedHeadline.fontSize}
                  lineHeight={fittedHeadline.lineHeight / fittedHeadline.fontSize}
                  fill={scene.headlineLayer.color}
                  fontStyle={scene.headlineLayer.fontStyle}
                />
              </Group>

              <Group
                x={scene.subhead.x}
                y={scene.subhead.y}
                draggable
                onClick={() => setSelection({ kind: 'subhead' })}
                onTap={() => setSelection({ kind: 'subhead' })}
                onDragEnd={(event) =>
                  updateScene((current) => ({ ...current, subhead: { ...current.subhead, x: event.target.x(), y: event.target.y() } }))
                }
              >
                <Rect width={scene.subhead.dividerWidth} height={scene.subhead.dividerHeight} fill={scene.subhead.dividerColor} />
                <Text
                  y={14}
                  text={scene.subhead.text}
                  fontFamily={scene.subhead.fontFamily || 'Arial'}
                  fontSize={scene.subhead.fontSize}
                  fontStyle={scene.subhead.fontStyle}
                  fill={scene.subhead.color}
                />
              </Group>

              {scene.townRows.filter((row) => row.included).map((row) => (
                <Group
                  key={row.id}
                  x={row.x}
                  y={row.y}
                  draggable
                  onClick={() => setSelection({ kind: 'town', id: row.id })}
                  onTap={() => setSelection({ kind: 'town', id: row.id })}
                  onDragEnd={(event) => updateTownRow(row.id, { x: event.target.x(), y: event.target.y() })}
                >
                  {selection?.kind === 'town' && selection.id === row.id ? (
                    <Rect x={-10} y={-12} width={Math.max(row.labelWidth + 24, 360)} height={128} stroke="#0ea5e9" dash={[10, 6]} cornerRadius={12} />
                  ) : null}
                  <Rect width={row.labelWidth} height={row.labelHeight} fill={row.labelColor} />
                  <Text
                    x={14}
                    y={8}
                    width={row.labelWidth - 22}
                    text={row.town.toUpperCase()}
                    fontFamily="Arial"
                    fontSize={row.townFontSize}
                    fontStyle="700"
                    fill="#ffffff"
                  />
                  <Text
                    y={row.amountOffsetY}
                    text={formatCurrency(row.strapAid)}
                    fontFamily="Arial"
                    fontSize={row.amountFontSize}
                    fontStyle="700"
                    fill={row.textColor}
                  />
                </Group>
              ))}

              <Group
                x={scene.footer.x}
                y={scene.footer.y}
                draggable
                onClick={() => setSelection({ kind: 'footer' })}
                onTap={() => setSelection({ kind: 'footer' })}
                onDragEnd={(event) =>
                  updateScene((current) => {
                    const deltaX = event.target.x() - current.footer.x
                    const deltaY = event.target.y() - current.footer.y
                    return {
                      ...current,
                      footer: {
                        ...current.footer,
                        x: event.target.x(),
                        y: event.target.y(),
                        textX: current.footer.textX + deltaX,
                        textY: current.footer.textY + deltaY,
                      },
                    }
                  })
                }
              >
                <Rect width={scene.footer.width} height={scene.footer.height} fill={scene.footer.backgroundColor} />
                <Text
                  x={scene.footer.textX - scene.footer.x}
                  y={scene.footer.textY - scene.footer.y}
                  text={scene.footer.text}
                  fontFamily="Arial"
                  fontSize={scene.footer.fontSize}
                  fontStyle={scene.footer.fontStyle}
                  fill={scene.footer.color}
                />
              </Group>

              {scene.headshots.map((headshot, index) => {
                const placement = computeHeadshotPlacement(headshotImage, headshot)
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
                      {index === 0 && headshotImage ? (
                        <KonvaImage
                          image={headshotImage}
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

              <Transformer
                ref={transformerRef}
                rotateEnabled={false}
                flipEnabled={false}
                enabledAnchors={
                  selection?.kind === 'headline'
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
                  if (selection?.kind === 'headline') {
                    return {
                      ...newBox,
                      width: clamp(newBox.width, TITLE_WIDTH_LIMITS.min, TITLE_WIDTH_LIMITS.max),
                      height: scene.headlineLayer.height || 240,
                      rotation: 0,
                    }
                  }

                  if (selection?.kind === 'headshot') {
                    const nextSize = clamp(Math.max(newBox.width, newBox.height), HEADSHOT_SIZE_LIMITS.min, HEADSHOT_SIZE_LIMITS.max)
                    return { ...newBox, width: nextSize, height: nextSize, rotation: 0 }
                  }

                  return newBox
                }}
              />
              </Group>
            </Layer>
          </Stage>
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

const pillButtonStyle: React.CSSProperties = {
  border: '1px solid rgba(17, 24, 39, 0.12)',
  borderRadius: 999,
  background: '#ffffff',
  color: '#111827',
  padding: '8px 12px',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
}

const townCardStyle: React.CSSProperties = {
  display: 'grid',
  gap: 10,
  padding: 14,
  borderRadius: 16,
  border: '1px solid rgba(17, 24, 39, 0.1)',
  background: 'rgba(248, 250, 252, 0.82)',
}

const twoColumnGridStyle: React.CSSProperties = {
  display: 'grid',
  gap: 10,
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
}
