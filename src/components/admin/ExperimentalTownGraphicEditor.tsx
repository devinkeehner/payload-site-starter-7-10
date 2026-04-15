'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type Konva from 'konva'
import { Group, Image as KonvaImage, Layer, Rect, Stage, Text, Transformer } from 'react-konva'
import { Button, useAuth } from '@payloadcms/ui'

import { useActiveTenant } from '@/components/admin/hooks/useActiveTenant'

const STAGE_WIDTH = 1200
const STAGE_HEIGHT = 1600
const MAX_PREVIEW_WIDTH = 760
const MAX_PREVIEW_HEIGHT = 900
const SCENE_KIND = 'experimental-town-graphic/v1'
const BRAND_BLUE = '#1d2f8c'
const BRAND_RED = '#c3202f'

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
  matched: boolean
  needsReview: boolean
  currentEcsEntitlement: number
  strapAid: number
  percentIncrease: number
  newTotalFunding: number
  districtLabels: string
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
  unmatchedTownCount?: number
}

type TemplateDoc = {
  id: string
  title?: string | null
  backgroundImage?: string | MediaDoc | null
  scene?: ExperimentalTownScene | null
  notes?: string | null
}

type DesignDoc = {
  id: string
  title?: string | null
  updatedAt?: string | null
  template?: string | TemplateDoc | null
  primaryTenant?: string | TenantDoc | null
  backgroundImage?: string | MediaDoc | null
  scene?: ExperimentalTownScene | null
  exportedMedia?: string | MediaDoc | null
  notes?: string | null
}

type SceneTextElement = {
  id: string
  x: number
  y: number
  width: number
  text: string
  fontSize: number
  color: string
  fontFamily?: string
  fontStyle?: string
  lineHeight?: number
}

type EyebrowElement = SceneTextElement & {
  barWidth: number
  barHeight: number
  paddingX: number
  paddingY: number
  backgroundColor: string
}

type SubheadElement = {
  id: string
  x: number
  y: number
  dividerWidth: number
  dividerHeight: number
  dividerColor: string
  text: string
  fontSize: number
  color: string
  fontFamily?: string
  fontStyle?: string
}

type FooterElement = {
  id: string
  x: number
  y: number
  width: number
  height: number
  backgroundColor: string
  text: string
  textX: number
  textY: number
  fontSize: number
  color: string
  fontStyle?: string
}

type HeadshotElement = {
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

type TownSceneRow = {
  id: string
  townKey: string
  town: string
  strapAid: number
  included: boolean
  labelX: number
  labelY: number
  labelWidth: number
  labelHeight: number
  amountX: number
  amountY: number
  townFontSize: number
  amountFontSize: number
  labelColor: string
  textColor: string
}

type ExperimentalTownScene = {
  kind: typeof SCENE_KIND
  backgroundMediaID: string | null
  eyebrow: EyebrowElement
  headline: SceneTextElement
  subhead: SubheadElement
  footer: FooterElement
  headshot: HeadshotElement
  townRows: TownSceneRow[]
}

type Selection =
  | { kind: 'eyebrow'; id: string }
  | { kind: 'headline'; id: string }
  | { kind: 'subhead'; id: string }
  | { kind: 'footer'; id: string }
  | { kind: 'headshot'; id: string }
  | { kind: 'town'; id: string }
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
  const mediaDoc = getMediaDoc(value)
  return mediaDoc?.id || null
}

const proxiedUrl = (url: string | undefined | null) => {
  if (typeof url !== 'string' || !url) return undefined
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

function useViewportHeight() {
  const [height, setHeight] = useState(0)

  useEffect(() => {
    const updateHeight = () => setHeight(window.innerHeight)
    updateHeight()
    window.addEventListener('resize', updateHeight)
    return () => window.removeEventListener('resize', updateHeight)
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

const wrapTextToWidth = (text: string, font: string, maxWidth: number) => {
  const paragraphs = text.replace(/\r\n/g, '\n').split('\n')
  const lines: string[] = []

  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean)
    if (!words.length) {
      lines.push('')
      continue
    }

    let current = words[0] || ''
    for (const word of words.slice(1)) {
      const next = `${current} ${word}`
      if (measureText(next, font) <= maxWidth) current = next
      else {
        lines.push(current)
        current = word
      }
    }
    lines.push(current)
  }

  return lines
}

const measureHeadlineHeight = (headline: SceneTextElement) => {
  const fontFamily = headline.fontFamily || 'Georgia, Times New Roman, serif'
  const fontSize = headline.fontSize || 66
  const lineHeight = headline.lineHeight || 1.05
  const lines = wrapTextToWidth(headline.text || '', `${fontSize}px ${fontFamily}`, headline.width)
  return Math.max(120, Math.ceil(lines.length * fontSize * lineHeight))
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value || 0)

const slugToWebsite = (slug: string | undefined | null) => {
  if (!slug) return 'CTHOUSEGOP.COM'
  return `${slug.replace(/^www\./, '').replace(/[^a-z0-9-]/gi, '').toUpperCase()}.COM`
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

function computeCoverPlacement(
  image: HTMLImageElement | null,
  frameWidth: number,
  frameHeight: number,
  crop?: { zoom: number; offsetX: number; offsetY: number },
) {
  if (!image) return { width: frameWidth, height: frameHeight, x: 0, y: 0 }

  const zoom = crop?.zoom || 1
  const baseScale = Math.max(frameWidth / image.width, frameHeight / image.height)
  const scale = baseScale * zoom
  const width = image.width * scale
  const height = image.height * scale
  const centeredX = (frameWidth - width) / 2
  const centeredY = (frameHeight - height) / 2
  const minX = Math.min(0, frameWidth - width)
  const minY = Math.min(0, frameHeight - height)
  return {
    width,
    height,
    x: clamp(centeredX + (crop?.offsetX || 0), minX, 0),
    y: clamp(centeredY + (crop?.offsetY || 0), minY, 0),
  }
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

const buildDesignTitle = (tenantName: string | undefined | null, fallback: string) =>
  tenantName ? `${tenantName} Town Graphic` : fallback || 'Town Graphic'

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

const isExperimentalScene = (value: unknown): value is ExperimentalTownScene =>
  asRecord(value).kind === SCENE_KIND

const hasSuperRole = (value: unknown) => {
  if (!value || typeof value !== 'object') return false
  const roles = (value as { roles?: unknown }).roles
  return Array.isArray(roles) && roles.includes('super')
}

const createBaseScene = (data: TownFundingResponse, tenantName: string | undefined) => {
  const headline = deriveDefaultHeadline(data.repInfo?.name)
  const townRows = data.townRows.map((row, index) => {
    const top = 660 + index * 160
    return {
      id: row.id,
      townKey: normalizeTownKey(row.town),
      town: row.town,
      strapAid: row.strapAid,
      included: true,
      labelX: 72,
      labelY: top,
      labelWidth: measureTownLabelWidth(row.town),
      labelHeight: 48,
      amountX: 72,
      amountY: top + 64,
      townFontSize: 30,
      amountFontSize: 66,
      labelColor: BRAND_RED,
      textColor: BRAND_BLUE,
    }
  })

  const fallbackBackgroundID =
    getMediaID(data.standardMedia?.districtImage) ||
    getMediaID(data.standardMedia?.bannerImage) ||
    getMediaID(data.standardMedia?.defaultFeaturedImage) ||
    null

  return {
    kind: SCENE_KIND,
    backgroundMediaID: fallbackBackgroundID,
    eyebrow: {
      id: 'eyebrow',
      x: 72,
      y: 70,
      width: 260,
      text: 'REAL RELIEF FOR CONNECTICUT',
      fontSize: 18,
      color: '#ffffff',
      fontFamily: 'Arial',
      fontStyle: '700',
      lineHeight: 1,
      barWidth: 420,
      barHeight: 44,
      paddingX: 16,
      paddingY: 10,
      backgroundColor: BRAND_BLUE,
    },
    headline: {
      id: 'headline',
      x: 72,
      y: 140,
      width: 640,
      text: headline,
      fontSize: 66,
      color: BRAND_BLUE,
      fontFamily: 'Georgia, Times New Roman, serif',
      lineHeight: 1.05,
    },
    subhead: {
      id: 'subhead',
      x: 74,
      y: 512,
      dividerWidth: 210,
      dividerHeight: 3,
      dividerColor: '#8ea4ea',
      text: 'STRAP Aid funding per town',
      fontSize: 26,
      color: BRAND_BLUE,
      fontFamily: 'Arial',
      fontStyle: 'italic 700',
    },
    footer: {
      id: 'footer',
      x: 0,
      y: 1490,
      width: STAGE_WIDTH,
      height: 70,
      backgroundColor: BRAND_RED,
      text: slugToWebsite(data.tenant?.slug || tenantName),
      textX: 78,
      textY: 1511,
      fontSize: 28,
      color: '#ffffff',
      fontStyle: 'italic 700',
    },
    headshot: {
      id: 'headshot',
      x: 860,
      y: 1220,
      size: 340,
      crop: {
        zoom: 1,
        offsetX: 0,
        offsetY: 0,
      },
    },
    townRows,
  } satisfies ExperimentalTownScene
}

const mergeSceneWithFreshData = (savedScene: ExperimentalTownScene | null | undefined, baseScene: ExperimentalTownScene) => {
  if (!savedScene || !isExperimentalScene(savedScene)) return baseScene

  const savedRowsByKey = new Map(
    (savedScene.townRows || []).map((row) => [row.townKey || normalizeTownKey(row.town), row] as const),
  )

  return {
    ...baseScene,
    ...savedScene,
    backgroundMediaID: savedScene.backgroundMediaID ?? baseScene.backgroundMediaID,
    eyebrow: { ...baseScene.eyebrow, ...savedScene.eyebrow },
    headline: { ...baseScene.headline, ...savedScene.headline },
    subhead: { ...baseScene.subhead, ...savedScene.subhead },
    footer: { ...baseScene.footer, ...savedScene.footer },
    headshot: {
      ...baseScene.headshot,
      ...savedScene.headshot,
      crop: {
        ...baseScene.headshot.crop,
        ...savedScene.headshot?.crop,
      },
    },
    townRows: baseScene.townRows.map((row) => {
      const savedRow = savedRowsByKey.get(row.townKey)
      return savedRow ? { ...row, ...savedRow, town: row.town, townKey: row.townKey } : row
    }),
  } satisfies ExperimentalTownScene
}

const getBackgroundPreview = (scene: ExperimentalTownScene, data: TownFundingResponse | null, templates: TemplateDoc[], designs: DesignDoc[]) => {
  const selectedID = scene.backgroundMediaID
  if (!selectedID) {
    return readMediaUrl(data?.standardMedia?.districtImage) ||
      readMediaUrl(data?.standardMedia?.bannerImage) ||
      readMediaUrl(data?.standardMedia?.defaultFeaturedImage) ||
      undefined
  }

  const mediaDoc =
    getMediaDoc(data?.standardMedia?.districtImage) && getMediaID(data?.standardMedia?.districtImage) === selectedID
      ? getMediaDoc(data?.standardMedia?.districtImage)
      : getMediaDoc(data?.standardMedia?.bannerImage) && getMediaID(data?.standardMedia?.bannerImage) === selectedID
        ? getMediaDoc(data?.standardMedia?.bannerImage)
        : getMediaDoc(data?.standardMedia?.defaultFeaturedImage) &&
            getMediaID(data?.standardMedia?.defaultFeaturedImage) === selectedID
          ? getMediaDoc(data?.standardMedia?.defaultFeaturedImage)
          : templates.map((template) => getMediaDoc(template.backgroundImage)).find((item) => item?.id === selectedID) ||
            designs.map((design) => getMediaDoc(design.backgroundImage)).find((item) => item?.id === selectedID) ||
            null

  return proxiedUrl(mediaDoc?.url || mediaDoc?.thumbnailURL || null)
}

export const ExperimentalTownGraphicEditor: React.FC = () => {
  const { user } = useAuth()
  const { tenantID, tenantName } = useActiveTenant()
  const searchParams = useSearchParams()
  const { ref: stageContainerRef, width: stageContainerWidth } = useContainerWidth()
  const viewportHeight = useViewportHeight()
  const stageRef = useRef<Konva.Stage | null>(null)
  const headlineRef = useRef<Konva.Group | null>(null)
  const headshotRef = useRef<Konva.Group | null>(null)
  const transformerRef = useRef<Konva.Transformer | null>(null)
  const isSuperAdmin = hasSuperRole(user)
  const [isMounted, setIsMounted] = useState(false)
  const [isResizingHeadline, setIsResizingHeadline] = useState(false)

  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [townData, setTownData] = useState<TownFundingResponse | null>(null)
  const [scene, setScene] = useState<ExperimentalTownScene | null>(null)
  const [selection, setSelection] = useState<Selection>(null)
  const [templateID, setTemplateID] = useState('')
  const [templateTitle, setTemplateTitle] = useState('Experimental Town Graphic')
  const [designID, setDesignID] = useState('')
  const [designTitle, setDesignTitle] = useState('Town Graphic')
  const [templates, setTemplates] = useState<TemplateDoc[]>([])
  const [designs, setDesigns] = useState<DesignDoc[]>([])
  const [mediaOptions, setMediaOptions] = useState<MediaDoc[]>([])
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [savingDesign, setSavingDesign] = useState(false)
  const [savingMedia, setSavingMedia] = useState(false)

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
          ? ((asRecord(templateJson).docs as TemplateDoc[]) || []).filter((doc) => isExperimentalScene(doc.scene))
          : []
        const nextDesigns = Array.isArray(asRecord(designJson).docs)
          ? ((asRecord(designJson).docs as DesignDoc[]) || []).filter((doc) => isExperimentalScene(doc.scene))
          : []
        const nextMedia = Array.isArray(asRecord(mediaJson).docs) ? ((asRecord(mediaJson).docs as MediaDoc[]) || []) : []
        const baseScene = createBaseScene(nextTownData, tenantName)
        const requestedDesignID = searchParams.get('designId')
        const requestedTemplateID = searchParams.get('templateId')
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
        setScene(nextScene)
        setTemplateID(selectedTemplate?.id || getString(selectedDesign?.template) || getString(asRecord(selectedDesign?.template).id) || '')
        setTemplateTitle(selectedTemplate?.title || 'Experimental Town Graphic')
        setDesignID(selectedDesign?.id || '')
        setDesignTitle(selectedDesign?.title || buildDesignTitle(nextTownData.tenant?.name || tenantName, 'Town Graphic'))
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
  }, [isMounted, searchParams, tenantID, tenantName])

  const previewScale = useMemo(() => {
    const fallbackHeight = viewportHeight > 0 ? Math.min(MAX_PREVIEW_HEIGHT, Math.max(520, viewportHeight - 220)) : MAX_PREVIEW_HEIGHT
    const fallbackScale = Math.min(1, MAX_PREVIEW_WIDTH / STAGE_WIDTH, fallbackHeight / STAGE_HEIGHT)
    if (!stageContainerWidth) return fallbackScale
    const maxHeight = viewportHeight > 0 ? Math.min(MAX_PREVIEW_HEIGHT, Math.max(520, viewportHeight - 220)) : MAX_PREVIEW_HEIGHT
    return Math.min(1, stageContainerWidth / STAGE_WIDTH, MAX_PREVIEW_WIDTH / STAGE_WIDTH, maxHeight / STAGE_HEIGHT)
  }, [stageContainerWidth, viewportHeight])
  const previewWidth = STAGE_WIDTH * previewScale
  const previewHeight = STAGE_HEIGHT * previewScale

  const backgroundUrl = useMemo(
    () => (scene ? getBackgroundPreview(scene, townData, templates, designs) : undefined),
    [designs, scene, templates, townData],
  )
  const headshotUrl = useMemo(
    () => readMediaUrl(townData?.standardMedia?.mobileHeadshot) || undefined,
    [townData],
  )
  const backgroundImage = useLoadedImage(backgroundUrl)
  const headshotImage = useLoadedImage(headshotUrl)

  const selectedTownRow = useMemo(() => {
    if (!scene || selection?.kind !== 'town') return null
    return scene.townRows.find((row) => row.id === selection.id) || null
  }, [scene, selection])

  useEffect(() => {
    const transformer = transformerRef.current
    const node =
      selection?.kind === 'headline'
        ? headlineRef.current
        : selection?.kind === 'headshot'
          ? headshotRef.current
          : null
    if (!transformer) return

    if (node) {
      transformer.nodes([node])
      transformer.getLayer()?.batchDraw()
      return
    }

    transformer.nodes([])
    transformer.getLayer()?.batchDraw()
  }, [selection])

  useEffect(() => {
    if (selection?.kind !== 'headline') {
      setIsResizingHeadline(false)
    }
  }, [selection])

  const updateScene = (updater: (current: ExperimentalTownScene) => ExperimentalTownScene) => {
    setScene((current) => (current ? updater(current) : current))
  }

  const syncSubheadToHeadline = (current: ExperimentalTownScene) => {
    const headlineHeight = measureHeadlineHeight(current.headline)
    return {
      ...current,
      subhead: {
        ...current.subhead,
        y: current.headline.y + headlineHeight + 26,
      },
    }
  }

  const updateTownRow = (rowID: string, patch: Partial<TownSceneRow>) => {
    updateScene((current) => ({
      ...current,
      townRows: current.townRows.map((row) => (row.id === rowID ? { ...row, ...patch } : row)),
    }))
  }

  const updateSelectionPosition = (x: number, y: number) => {
    if (!scene || !selection) return
    if (selection.kind === 'eyebrow') updateScene((current) => ({ ...current, eyebrow: { ...current.eyebrow, x, y } }))
    if (selection.kind === 'headline') updateScene((current) => syncSubheadToHeadline({ ...current, headline: { ...current.headline, x, y } }))
    if (selection.kind === 'subhead') updateScene((current) => ({ ...current, subhead: { ...current.subhead, x, y } }))
    if (selection.kind === 'footer') {
      updateScene((current) => {
        const deltaX = x - current.footer.x
        const deltaY = y - current.footer.y
        return {
          ...current,
          footer: {
            ...current.footer,
            x,
            y,
            textX: current.footer.textX + deltaX,
            textY: current.footer.textY + deltaY,
          },
        }
      })
    }
    if (selection.kind === 'headshot') updateScene((current) => ({ ...current, headshot: { ...current.headshot, x, y } }))
    if (selection.kind === 'town') {
      updateScene((current) => ({
        ...current,
        townRows: current.townRows.map((row) =>
          row.id === selection.id
            ? {
                ...row,
                labelX: x,
                labelY: y,
                amountX: x,
                amountY: y + (row.amountY - row.labelY),
              }
            : row,
        ),
      }))
    }
  }

  const updateHeadshot = (patch: Partial<HeadshotElement>) => {
    updateScene((current) => ({ ...current, headshot: { ...current.headshot, ...patch } }))
  }

  const updateHeadline = (patch: Partial<SceneTextElement>) => {
    updateScene((current) => syncSubheadToHeadline({ ...current, headline: { ...current.headline, ...patch } }))
  }

  const loadTemplate = (nextTemplateID: string) => {
    if (!scene || !townData) return
    setTemplateID(nextTemplateID)
    if (!nextTemplateID) {
      const baseScene = createBaseScene(townData, tenantName)
      setScene(baseScene)
      setSelection(null)
      return
    }
    const template = templates.find((item) => item.id === nextTemplateID)
    if (!template) return
    const baseScene = createBaseScene(townData, tenantName)
    setTemplateTitle(template.title || 'Experimental Town Graphic')
    setScene(mergeSceneWithFreshData(template.scene, baseScene))
    setSelection(null)
  }

  const loadDesign = (nextDesignID: string) => {
    if (!scene || !townData) return
    setDesignID(nextDesignID)
    if (!nextDesignID) {
      const baseScene = createBaseScene(townData, tenantName)
      setScene(baseScene)
      setSelection(null)
      return
    }
    const design = designs.find((item) => item.id === nextDesignID)
    if (!design) return
    const baseScene = createBaseScene(townData, tenantName)
    setDesignTitle(design.title || 'Town Graphic')
    setTemplateID(getString(asRecord(design.template).id) || getString(design.template) || '')
    setScene(mergeSceneWithFreshData(design.scene, baseScene))
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
      title: templateTitle || 'Experimental Town Graphic',
      sourceCollection: 'pages',
      backgroundImage: scene.backgroundMediaID || null,
      scene,
      notes: 'experimental-town-graphic',
    }
  }

  const buildDesignPayload = (exportedMediaID?: string | null) => {
    if (!scene) throw new Error('No scene available')
    return {
      title: designTitle || buildDesignTitle(townData?.tenant?.name || tenantName, 'Town Graphic'),
      template: templateID || null,
      sourceCollection: 'pages',
      sourcePost: null,
      primaryTenant: tenantID || null,
      secondaryTenant: null,
      backgroundImage: scene.backgroundMediaID || null,
      titleOverride: scene.headline.text || null,
      scene,
      exportedMedia: exportedMediaID ?? null,
      notes: 'experimental-town-graphic',
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
        setTemplates((current) => {
          const next = [savedDoc, ...current.filter((item) => item.id !== savedDoc.id)]
          return next.slice(0, 50)
        })
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
    const dataUrl = stage.toDataURL({ pixelRatio: 2 })
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
      setMessage('Saved to Media Gallery')
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
      const filenameBase = (designTitle || templateTitle || townData?.tenant?.slug || 'town-graphic')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = `${filenameBase || 'town-graphic'}.png`
      document.body.appendChild(link)
      link.click()
      link.remove()
      setMessage('PNG downloaded')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  if (!isMounted) {
    return <div style={{ padding: 24 }}>Loading experimental town editor…</div>
  }

  if (!tenantID) {
    return <div style={{ padding: 24 }}>Select a tenant in the admin first.</div>
  }

  if (loading || !scene || !townData) {
    return <div style={{ padding: 24 }}>Loading experimental town editor…</div>
  }

  const selectedElementPanel =
    selection?.kind === 'eyebrow'
      ? (
          <div style={slotCardStyle}>
            <strong style={{ fontSize: 13 }}>Selected: Eyebrow</strong>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={fieldLabelStyle}>X</span>
              <input type="number" value={Math.round(scene.eyebrow.x)} onChange={(event) => updateSelectionPosition(Number(event.target.value), scene.eyebrow.y)} style={controlStyle} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={fieldLabelStyle}>Y</span>
              <input type="number" value={Math.round(scene.eyebrow.y)} onChange={(event) => updateSelectionPosition(scene.eyebrow.x, Number(event.target.value))} style={controlStyle} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={fieldLabelStyle}>Bar width</span>
              <input type="number" value={Math.round(scene.eyebrow.barWidth)} onChange={(event) => updateScene((current) => ({ ...current, eyebrow: { ...current.eyebrow, barWidth: Number(event.target.value) } }))} style={controlStyle} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={fieldLabelStyle}>Font size</span>
              <input type="number" value={Math.round(scene.eyebrow.fontSize)} onChange={(event) => updateScene((current) => ({ ...current, eyebrow: { ...current.eyebrow, fontSize: Number(event.target.value) } }))} style={controlStyle} />
            </label>
          </div>
        )
      : selection?.kind === 'headline'
        ? (
            <div style={slotCardStyle}>
              <strong style={{ fontSize: 13 }}>Selected: Headline</strong>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={fieldLabelStyle}>X</span>
                <input type="number" value={Math.round(scene.headline.x)} onChange={(event) => updateSelectionPosition(Number(event.target.value), scene.headline.y)} style={controlStyle} />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={fieldLabelStyle}>Y</span>
                <input type="number" value={Math.round(scene.headline.y)} onChange={(event) => updateSelectionPosition(scene.headline.x, Number(event.target.value))} style={controlStyle} />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={fieldLabelStyle}>Width</span>
                <input type="number" value={Math.round(scene.headline.width)} onChange={(event) => updateScene((current) => ({ ...current, headline: { ...current.headline, width: Number(event.target.value) } }))} style={controlStyle} />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={fieldLabelStyle}>Font size</span>
                <input type="number" value={Math.round(scene.headline.fontSize)} onChange={(event) => updateScene((current) => ({ ...current, headline: { ...current.headline, fontSize: Number(event.target.value) } }))} style={controlStyle} />
              </label>
            </div>
          )
        : selection?.kind === 'subhead'
          ? (
              <div style={slotCardStyle}>
                <strong style={{ fontSize: 13 }}>Selected: Subhead</strong>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={fieldLabelStyle}>X</span>
                  <input type="number" value={Math.round(scene.subhead.x)} onChange={(event) => updateSelectionPosition(Number(event.target.value), scene.subhead.y)} style={controlStyle} />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={fieldLabelStyle}>Y</span>
                  <input type="number" value={Math.round(scene.subhead.y)} onChange={(event) => updateSelectionPosition(scene.subhead.x, Number(event.target.value))} style={controlStyle} />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={fieldLabelStyle}>Divider width</span>
                  <input type="number" value={Math.round(scene.subhead.dividerWidth)} onChange={(event) => updateScene((current) => ({ ...current, subhead: { ...current.subhead, dividerWidth: Number(event.target.value) } }))} style={controlStyle} />
                </label>
              </div>
            )
          : selection?.kind === 'footer'
            ? (
                <div style={slotCardStyle}>
                  <strong style={{ fontSize: 13 }}>Selected: Footer</strong>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={fieldLabelStyle}>Y</span>
                    <input type="number" value={Math.round(scene.footer.y)} onChange={(event) => updateSelectionPosition(scene.footer.x, Number(event.target.value))} style={controlStyle} />
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={fieldLabelStyle}>Text X</span>
                    <input type="number" value={Math.round(scene.footer.textX)} onChange={(event) => updateScene((current) => ({ ...current, footer: { ...current.footer, textX: Number(event.target.value) } }))} style={controlStyle} />
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={fieldLabelStyle}>Text Y</span>
                    <input type="number" value={Math.round(scene.footer.textY)} onChange={(event) => updateScene((current) => ({ ...current, footer: { ...current.footer, textY: Number(event.target.value) } }))} style={controlStyle} />
                  </label>
                </div>
              )
            : selection?.kind === 'headshot'
              ? (
                  <div style={slotCardStyle}>
                    <strong style={{ fontSize: 13 }}>Selected: Headshot</strong>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={fieldLabelStyle}>X</span>
                      <input type="number" value={Math.round(scene.headshot.x)} onChange={(event) => updateSelectionPosition(Number(event.target.value), scene.headshot.y)} style={controlStyle} />
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={fieldLabelStyle}>Y</span>
                      <input type="number" value={Math.round(scene.headshot.y)} onChange={(event) => updateSelectionPosition(scene.headshot.x, Number(event.target.value))} style={controlStyle} />
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={fieldLabelStyle}>Size</span>
                      <input type="number" value={Math.round(scene.headshot.size)} onChange={(event) => updateScene((current) => ({ ...current, headshot: { ...current.headshot, size: Number(event.target.value) } }))} style={controlStyle} />
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={fieldLabelStyle}>Zoom</span>
                      <input type="number" step={0.05} value={scene.headshot.crop.zoom} onChange={(event) => updateScene((current) => ({ ...current, headshot: { ...current.headshot, crop: { ...current.headshot.crop, zoom: Number(event.target.value) } } }))} style={controlStyle} />
                    </label>
                  </div>
                )
              : selection?.kind === 'town' && selectedTownRow
                  ? (
                      <div style={slotCardStyle}>
                        <strong style={{ fontSize: 13 }}>Selected: {selectedTownRow.town}</strong>
                        <label style={{ display: 'grid', gap: 6 }}>
                          <span style={fieldLabelStyle}>Label X</span>
                          <input type="number" value={Math.round(selectedTownRow.labelX)} onChange={(event) => updateSelectionPosition(Number(event.target.value), selectedTownRow.labelY)} style={controlStyle} />
                        </label>
                        <label style={{ display: 'grid', gap: 6 }}>
                          <span style={fieldLabelStyle}>Label Y</span>
                          <input type="number" value={Math.round(selectedTownRow.labelY)} onChange={(event) => updateSelectionPosition(selectedTownRow.labelX, Number(event.target.value))} style={controlStyle} />
                        </label>
                        <label style={{ display: 'grid', gap: 6 }}>
                          <span style={fieldLabelStyle}>Label width</span>
                          <input type="number" value={Math.round(selectedTownRow.labelWidth)} onChange={(event) => updateTownRow(selectedTownRow.id, { labelWidth: Number(event.target.value) })} style={controlStyle} />
                        </label>
                        <label style={{ display: 'grid', gap: 6 }}>
                          <span style={fieldLabelStyle}>Amount font size</span>
                          <input type="number" value={Math.round(selectedTownRow.amountFontSize)} onChange={(event) => updateTownRow(selectedTownRow.id, { amountFontSize: Number(event.target.value) })} style={controlStyle} />
                        </label>
                      </div>
                    )
                  : null

  const headshotPlacement = computeCoverPlacement(headshotImage, scene.headshot.size, scene.headshot.size, scene.headshot.crop)
  const backgroundPlacement = computeCoverPlacement(backgroundImage, STAGE_WIDTH, STAGE_HEIGHT)

  return (
    <div
      style={{
        display: 'grid',
        gap: 20,
        gridTemplateColumns: 'minmax(320px, 420px) minmax(0, 1fr)',
        padding: 24,
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
          <h2 style={{ margin: 0, fontSize: 20 }}>Experimental Town Graphic</h2>
          <div style={hintStyle}>
            Tenant: <strong>{townData.tenant?.name || tenantName || tenantID}</strong>
            <br />
            Rep: <strong>{townData.repInfo?.name || 'Unknown rep'}</strong>
            <br />
            Design: <strong>{designID || 'unsaved'}</strong>
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
          {isSuperAdmin ? (
            <Button onClick={saveTemplate} disabled={savingTemplate} buttonStyle="secondary">
              {savingTemplate ? 'Saving template…' : templateID ? 'Update template' : 'Save template'}
            </Button>
          ) : null}
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
            {savingDesign ? 'Saving design…' : designID ? 'Update design' : 'Save design'}
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
              value={scene.headline.text}
              onChange={(event) => updateScene((current) => ({ ...current, headline: { ...current.headline, text: event.target.value } }))}
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

        <section style={{ display: 'grid', gap: 12 }}>
          <div style={sectionLabelStyle}>Towns</div>
          {scene.townRows.map((row) => (
            <div key={row.id} style={slotCardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#111827' }}>
                  <input type="checkbox" checked={row.included} onChange={(event) => updateTownRow(row.id, { included: event.target.checked })} />
                  {row.town}
                </label>
                <button type="button" onClick={() => setSelection({ kind: 'town', id: row.id })} style={secondaryButtonStyle}>
                  Select
                </button>
              </div>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={fieldLabelStyle}>STRAP Aid</span>
                <input
                  type="number"
                  value={row.strapAid}
                  onChange={(event) => updateTownRow(row.id, { strapAid: Number(event.target.value) || 0 })}
                  style={controlStyle}
                />
              </label>
            </div>
          ))}
        </section>

        {selectedElementPanel ? (
          <section style={{ display: 'grid', gap: 12 }}>
            <div style={sectionLabelStyle}>Selected Element</div>
            {selectedElementPanel}
          </section>
        ) : null}

        <section style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button onClick={saveToMediaGallery} disabled={savingMedia} buttonStyle="secondary">
            {savingMedia ? 'Saving…' : 'Save to Media'}
          </Button>
          <Button onClick={downloadPng} buttonStyle="secondary">
            Download PNG
          </Button>
        </section>

        {message ? <div style={hintStyle}>{message}</div> : null}
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
            Click an element to select it, then drag it directly on the canvas. The left panel keeps the text/town editing workflow.
          </span>
        </div>
        <div
          ref={stageContainerRef}
          style={{
            width: '100%',
            display: 'flex',
            justifyContent: 'center',
            overflow: 'auto',
          }}
        >
          <div
            style={{
              width: `${previewWidth}px`,
              height: `${previewHeight}px`,
              flex: '0 0 auto',
              overflow: 'hidden',
              borderRadius: 20,
              background: '#f5f2ec',
            }}
          >
            <div
              style={{
                width: `${STAGE_WIDTH}px`,
                height: `${STAGE_HEIGHT}px`,
                transform: `scale(${previewScale})`,
                transformOrigin: 'top left',
              }}
            >
              <Stage
                ref={stageRef}
                width={STAGE_WIDTH}
                height={STAGE_HEIGHT}
                onMouseDown={(event) => {
                  if (event.target === event.target.getStage()) setSelection(null)
                }}
              >
                <Layer>
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
                onDragEnd={(event) => updateSelectionPosition(event.target.x(), event.target.y())}
                onMouseDown={() => setSelection({ kind: 'eyebrow', id: scene.eyebrow.id })}
              >
                {selection?.kind === 'eyebrow' ? (
                  <Rect x={-8} y={-8} width={scene.eyebrow.barWidth + 16} height={scene.eyebrow.barHeight + 16} stroke="#0ea5e9" dash={[10, 6]} cornerRadius={10} />
                ) : null}
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
                x={scene.headline.x}
                y={scene.headline.y}
                ref={headlineRef}
                draggable={selection?.kind === 'headline' && !isResizingHeadline}
                onDragEnd={(event) => updateSelectionPosition(event.target.x(), event.target.y())}
                onMouseDown={() => setSelection({ kind: 'headline', id: scene.headline.id })}
                onTransformStart={() => setIsResizingHeadline(true)}
                onTransformEnd={(event) => {
                  const node = event.target
                  const nextWidth = clamp(Math.round(scene.headline.width * node.scaleX()), 240, 920)
                  node.scaleX(1)
                  node.scaleY(1)
                  updateHeadline({ x: node.x(), y: node.y(), width: nextWidth })
                  setIsResizingHeadline(false)
                }}
              >
                {selection?.kind === 'headline' ? (
                  <Rect x={-12} y={-12} width={scene.headline.width + 24} height={measureHeadlineHeight(scene.headline) + 24} stroke="#0ea5e9" dash={[10, 6]} cornerRadius={14} />
                ) : null}
                <Text
                  width={scene.headline.width}
                  text={scene.headline.text}
                  fontFamily={scene.headline.fontFamily || 'Georgia, Times New Roman, serif'}
                  fontSize={scene.headline.fontSize}
                  lineHeight={scene.headline.lineHeight || 1.04}
                  fill={scene.headline.color}
                />
              </Group>

              <Group
                x={scene.subhead.x}
                y={scene.subhead.y}
                draggable
                onDragEnd={(event) => updateSelectionPosition(event.target.x(), event.target.y())}
                onMouseDown={() => setSelection({ kind: 'subhead', id: scene.subhead.id })}
              >
                {selection?.kind === 'subhead' ? (
                  <Rect x={-10} y={-12} width={Math.max(scene.subhead.dividerWidth + 20, 320)} height={74} stroke="#0ea5e9" dash={[10, 6]} cornerRadius={12} />
                ) : null}
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
                  x={row.labelX}
                  y={row.labelY}
                  draggable
                  onDragEnd={(event) => {
                    setSelection({ kind: 'town', id: row.id })
                    updateSelectionPosition(event.target.x(), event.target.y())
                  }}
                  onMouseDown={() => setSelection({ kind: 'town', id: row.id })}
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
                    y={row.amountY - row.labelY}
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
                onDragEnd={(event) => updateSelectionPosition(event.target.x(), event.target.y())}
                onMouseDown={() => setSelection({ kind: 'footer', id: scene.footer.id })}
              >
                {selection?.kind === 'footer' ? (
                  <Rect x={-8} y={-8} width={scene.footer.width + 16} height={scene.footer.height + 16} stroke="#0ea5e9" dash={[10, 6]} />
                ) : null}
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

              <Group
                  x={scene.headshot.x}
                  y={scene.headshot.y}
                  ref={headshotRef}
                  draggable
                  onDragEnd={(event) => updateSelectionPosition(event.target.x(), event.target.y())}
                  onMouseDown={() => setSelection({ kind: 'headshot', id: scene.headshot.id })}
                  onTransformEnd={(event) => {
                    const node = event.target
                    const scale = Math.max(node.scaleX(), node.scaleY())
                    const nextSize = clamp(Math.round(scene.headshot.size * scale), 160, 520)
                    node.scaleX(1)
                    node.scaleY(1)
                    updateHeadshot({ x: node.x(), y: node.y(), size: nextSize })
                  }}
                >
                  <Group
                    clipFunc={(ctx) => {
                      ctx.beginPath()
                      ctx.arc(scene.headshot.size / 2, scene.headshot.size / 2, scene.headshot.size / 2, 0, Math.PI * 2)
                      ctx.closePath()
                    }}
                  >
                    {headshotImage ? (
                      <KonvaImage
                        image={headshotImage}
                        x={headshotPlacement.x}
                        y={headshotPlacement.y}
                        width={headshotPlacement.width}
                        height={headshotPlacement.height}
                      />
                    ) : null}
                  </Group>
                </Group>

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
                    const nextWidth = clamp(newBox.width, 240, 920)
                    return { ...newBox, width: nextWidth, height: measureHeadlineHeight(scene.headline), rotation: 0 }
                  }

                  if (selection?.kind === 'headshot') {
                    const nextSize = clamp(Math.max(newBox.width, newBox.height), 160, 520)
                    return { ...newBox, width: nextSize, height: nextSize, rotation: 0 }
                  }
                  return newBox
                }}
              />
                </Layer>
              </Stage>
            </div>
          </div>
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

const secondaryButtonStyle: React.CSSProperties = {
  border: '1px solid rgba(17, 24, 39, 0.12)',
  borderRadius: 999,
  background: '#ffffff',
  color: '#111827',
  padding: '8px 12px',
  fontSize: 13,
  fontWeight: 700,
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
