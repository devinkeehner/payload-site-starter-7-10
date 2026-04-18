'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type Konva from 'konva'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  Clipboard,
  Copy,
  Eye,
  EyeOff,
  Italic,
  Layers,
  Lock,
  Trash2,
  Underline,
  Unlock,
  X,
} from 'lucide-react'
import { Group, Image as KonvaImage, Layer, Rect, Stage, Text, Transformer } from 'react-konva'
import { Button, useAuth } from '@payloadcms/ui'
import { useTenantSelection } from '@payloadcms/plugin-multi-tenant/client'

import {
  EDITOR_COMPONENTS,
  EditorLayerItem,
  appendEditorLayers,
  TEXT_ALIGNMENT_OPTIONS,
  TEXT_FONT_OPTIONS,
  buildFontStyle,
  buildEditorLayers,
  clampNumber,
  createEditorNodeID,
  duplicateImage,
  duplicateRect,
  duplicateText,
  formatAutosaveLabel,
  getCssFontWeight,
  getEditorLayerItem,
  getShortcutNudgeDistance,
  getFontStyleFlags,
  getResizedTextTransform,
  hasEditorClipboard,
  hydrateEditorLayers,
  isEditableTarget,
  isCustomLayerKind,
  patchEditorLayer,
  readEditorClipboard,
  removeEditorLayers,
  reorderCustomEditorLayer,
  setEditorClipboard,
  useEditorAutosave,
} from '@/components/admin/graphicsEditorShared'
import { useActiveTenant } from '@/components/admin/hooks/useActiveTenant'

const BASE_CANVAS_WIDTH = 1200
const BASE_CANVAS_HEIGHT = 1600
const STAGE_WIDTH = 1600
const STAGE_HEIGHT = 1000
const MAX_PREVIEW_WIDTH = 760
const MAX_PREVIEW_HEIGHT = 900
const SCENE_KIND = 'experimental-town-graphic/v1'
type MailSide = 'front' | 'back'
const DEFAULT_MAIL_SIDE: MailSide = 'front'
const BRAND_BLUE = '#6b7280'
const BRAND_RED = '#334155'
const BRAND_COLORS = [BRAND_BLUE, '#9ca3af', BRAND_RED, '#ffffff', '#111827']
const WEBSITE_TEXT = 'CTHOUSEGOP.COM/BUDGET'
const MAILER_BACKSIDE_ONE_ASSET_BASE = '/graphics-editor-mail/mailer-backside-one'
const MAILER_BACKSIDE_ONE_ASSETS = {
  paper: `${MAILER_BACKSIDE_ONE_ASSET_BASE}/notepaper.png`,
  qr: `${MAILER_BACKSIDE_ONE_ASSET_BASE}/qr.png`,
  arrow: `${MAILER_BACKSIDE_ONE_ASSET_BASE}/arrow.png`,
  screenshot: `${MAILER_BACKSIDE_ONE_ASSET_BASE}/site-screenshot.png`,
} as const
const MAILER_BACKSIDE_ONE_ROTATION = {
  paper: -118.4,
  arrow: 163.9,
} as const
const MAILER_BACKSIDE_ONE_FAST_FACTS = [
  {
    id: 'back-fast-facts-paper-title',
    x: 1077,
    y: 39,
    width: 416,
    text: 'FAST FACTS:\nHOUSE GOP PROPOSAL',
    fontSize: 18,
    fontFamily: '"Comic Sans MS", "Marker Felt", cursive',
    fontStyle: '700',
  },
  {
    id: 'back-fast-facts-paper-spends',
    x: 1107,
    y: 67,
    width: 629,
    text: 'Spends less than budgets from\nlegislative Democrats and Governor',
    fontSize: 13,
    fontFamily: '"Comic Sans MS", "Marker Felt", cursive',
    fontStyle: '700',
  },
  {
    id: 'back-fast-facts-paper-sustainable',
    x: 1154,
    y: 168,
    width: 517,
    text: "Sustainable: Doesn’t rely on\nvolatile, one-time revenues",
    fontSize: 13,
    fontFamily: '"Comic Sans MS", "Marker Felt", cursive',
    fontStyle: '700',
  },
  {
    id: 'back-fast-facts-paper-relief',
    x: 1197,
    y: 242,
    width: 481,
    text: 'Provides more than $400\nmillion in tax relief',
    fontSize: 13,
    fontFamily: '"Comic Sans MS", "Marker Felt", cursive',
    fontStyle: '700',
  },
  {
    id: 'back-fast-facts-paper-cap',
    x: 1236,
    y: 318,
    width: 445,
    text: 'More than $167 million\nbelow the spending cap',
    fontSize: 13,
    fontFamily: '"Comic Sans MS", "Marker Felt", cursive',
    fontStyle: '700',
  },
  {
    id: 'back-fast-facts-paper-reclaims',
    x: 1276,
    y: 387,
    width: 430,
    text: 'Reclaims CT revenue\nfrom New York',
    fontSize: 13,
    fontFamily: '"Comic Sans MS", "Marker Felt", cursive',
    fontStyle: '700',
  },
] as const
const LEGACY_BACKSIDE_REMOVED_TEXT_IDS = new Set(['back-fast-facts-title', 'back-fast-facts-copy'])
const LEGACY_BACKSIDE_REMOVED_RECT_IDS = new Set(['back-divider'])
const LEGACY_BACKSIDE_IMAGE_SIGNATURES = {
  'back-note-paper': { x: 1025, y: 4, width: 700, height: 500 },
  'back-site-screenshot': { x: 615, y: 592, width: 400, height: 245 },
  'back-arrow': { x: 1188, y: 695, width: 118, height: 160 },
  'back-qr': { x: 1322, y: 695, width: 138, height: 138 },
} as const
const LEGACY_BACKSIDE_RECT_SIGNATURES = {
  'back-divider': { x: 553, y: 0, width: 4, height: STAGE_HEIGHT },
  'back-monitor-frame': { x: 560, y: 556, width: 476, height: 333 },
  'back-monitor-screen': { x: 590, y: 589, width: 416, height: 260 },
  'back-monitor-stand': { x: 760, y: 889, width: 80, height: 72 },
  'back-monitor-base': { x: 730, y: 950, width: 140, height: 14 },
  'back-qr-border-top': { x: 1176, y: 609, width: 410, height: 3 },
  'back-qr-border-right': { x: 1583, y: 609, width: 3, height: 344 },
  'back-qr-border-bottom': { x: 1072, y: 951, width: 514, height: 3 },
  'back-qr-border-left': { x: 1072, y: 609, width: 3, height: 391 },
} as const
const LEGACY_BACKSIDE_TEXT_SIGNATURES = {
  'back-office-title': { x: 24, y: 58, width: 220, text: 'State Representative' },
  'back-tax-relief-title': { x: 598, y: 18, width: 470, text: 'TAX AND FEE RELIEF' },
  'back-tax-relief-copy': {
    x: 598,
    y: 76,
    width: 580,
    text:
      "Increase property tax credit\nReduce healthcare costs\nLower vehicle sales tax\nNo tax on tips\nEliminate many license fees\nEliminate Social Security tax\nRemove Passport to Parks fee\nEliminate children's clothing taxes\nProvide $2.5 million to help municipalities cover early voting costs.",
  },
  'back-funding-title': { x: 24, y: 640, width: 360, text: 'How the plan is funded' },
  'back-funding-copy': {
    x: 24,
    y: 696,
    width: 470,
    text:
      'Recover $340 million by challenging New York’s “convenience of employer” rule.\nSave $153 million by budgeting state employee positions based on realistic hiring trends rather than funding all vacancies at once.',
  },
  'back-qr-title': { x: 1136, y: 639, width: 430, text: 'SCAN FOR MORE DETAILS' },
  'back-qr-or-visit': { x: 1128, y: 877, width: 74, text: 'OR\nVISIT:' },
  'back-qr-website': { x: 1208, y: 935, width: 360, text: WEBSITE_TEXT },
} as const
const MAIL_PLACEHOLDER_WIDTH = 560
const MAIL_PLACEHOLDER_HEIGHT = 364
const HEADLINE_WIDTH_LIMITS = { min: 240, max: 1060 }
const TOWN_LABEL_WIDTH_LIMITS = { min: 90, max: 760 }
const TOWN_LABEL_HEIGHT_LIMITS = { min: 24, max: 84 }
const TOWN_FONT_SIZE_LIMITS = { min: 14, max: 58 }
const TOWN_AMOUNT_FONT_SIZE_LIMITS = { min: 24, max: 124 }
const TOWN_GROUP_HEIGHT_LIMITS = { min: 56, max: 240 }
const MAIL_SCENE_BUNDLE_KIND = 'graphics-editor-mail-bundle/v1'
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

type TenantSelectOption = {
  label: string
  value: string
}

type MailExportJobState = {
  id: string
  status: 'queued' | 'running' | 'complete' | 'error'
  total: number
  completed: number
  currentTenantLabel: string | null
  skippedCount: number
  error: string | null
  downloadName: string
  downloadUrl: string | null
}

type TemplateDoc = {
  id: string
  title?: string | null
  backgroundImage?: string | MediaDoc | null
  scene?: ExperimentalTownScene | MailSceneBundle | null
  notes?: string | null
}

type DesignDoc = {
  id: string
  title?: string | null
  updatedAt?: string | null
  template?: string | TemplateDoc | null
  primaryTenant?: string | TenantDoc | null
  backgroundImage?: string | MediaDoc | null
  scene?: ExperimentalTownScene | MailSceneBundle | null
  exportedMedia?: string | MediaDoc | null
  notes?: string | null
}

type MailEditorNotes = {
  mode: 'graphics-editor-mail'
  selectedTenantID?: string | null
}

type MailSceneBundle = {
  kind: typeof MAIL_SCENE_BUNDLE_KIND
  frontScene: ExperimentalTownScene
  backScene: ExperimentalTownScene
  activeMailSide?: MailSide
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
  letterSpacing?: number
  lineHeight?: number
  textAlign?: 'left' | 'center' | 'right'
  textDecoration?: string
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
  letterSpacing?: number
  lineHeight?: number
  textAlign?: 'left' | 'center' | 'right'
  textDecoration?: string
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
  fontFamily?: string
  fontStyle?: string
  letterSpacing?: number
  lineHeight?: number
  textAlign?: 'left' | 'center' | 'right'
  textDecoration?: string
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

type CustomRectElement = {
  id: string
  x: number
  y: number
  width: number
  height: number
  fill: string
}

type CustomTextElement = {
  id: string
  x: number
  y: number
  width: number
  height?: number
  rotation?: number
  text: string
  fontSize: number
  color: string
  fontFamily?: string
  fontStyle?: string
  letterSpacing?: number
  lineHeight?: number
  textAlign?: 'left' | 'center' | 'right'
  textDecoration?: string
}

type CustomImageElement = {
  id: string
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  mediaID: string
  sourceUrl: string
  alt?: string
}

const sanitizeTemplateDoc = (item: TemplateDoc) => ({ ...item, backgroundImage: null })
const sanitizeDesignDoc = (item: DesignDoc) => ({ ...item, backgroundImage: null })

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
  customImages: CustomImageElement[]
  customRects: CustomRectElement[]
  customTexts: CustomTextElement[]
  layers: EditorLayerItem[]
  townColumns: 1 | 2
  townRows: TownSceneRow[]
}

type Selection =
  | { kind: 'eyebrow'; id: string }
  | { kind: 'headline'; id: string }
  | { kind: 'subhead'; id: string }
  | { kind: 'footer'; id: string }
  | { kind: 'headshot'; id: string }
  | { kind: 'custom-image'; id: string }
  | { kind: 'custom-rect'; id: string }
  | { kind: 'custom-text'; id: string }
  | { kind: 'towns'; id: 'town-stack' }
  | { kind: 'towns-left'; id: 'town-stack-left' }
  | { kind: 'towns-right'; id: 'town-stack-right' }
  | { kind: 'town'; id: string }
  | null

type TextSelection = Exclude<Selection, null> & {
  kind: 'eyebrow' | 'headline' | 'subhead' | 'footer' | 'custom-text'
}

type InlineTextEditorState = {
  target: TextSelection
  value: string
} | null

const getLayerTarget = (
  selection: Exclude<Selection, null>,
): { id: string; kind: EditorLayerItem['kind'] } | null => {
  if (selection.kind === 'towns' || selection.kind === 'towns-left' || selection.kind === 'towns-right') return null
  return {
    id: selection.id,
    kind: selection.kind as EditorLayerItem['kind'],
  }
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const cloneScene = (scene: ExperimentalTownScene): ExperimentalTownScene => JSON.parse(JSON.stringify(scene)) as ExperimentalTownScene

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}

const getString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)

const getMediaDoc = (value: unknown): MediaDoc | null =>
  value && typeof value === 'object' && typeof (value as Record<string, unknown>).id === 'string'
    ? (value as MediaDoc)
    : null

const readRawMediaUrl = (value: unknown) => {
  const mediaDoc = getMediaDoc(value)
  return mediaDoc?.url || mediaDoc?.thumbnailURL || undefined
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

const measureTownLabelWidth = (town: string, fontSize = 36) =>
  clamp(Math.ceil(measureText(town.toUpperCase(), `700 ${fontSize}px Arial`)) + 32, TOWN_LABEL_WIDTH_LIMITS.min, TOWN_LABEL_WIDTH_LIMITS.max)

const getRenderedTownLabelWidth = (row: TownSceneRow) =>
  measureTownLabelWidth(row.town, row.townFontSize)

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

const measureCustomTextHeight = (item: Pick<CustomTextElement, 'text' | 'width' | 'fontSize' | 'fontFamily' | 'lineHeight' | 'height'>) => {
  const fontSize = item.fontSize || 28
  const fontFamily = item.fontFamily || 'Arial'
  const lineHeight = item.lineHeight || 1.1
  const lines = wrapTextToWidth(item.text || '', `${fontSize}px ${fontFamily}`, item.width)
  const measuredHeight = Math.max(fontSize + 8, Math.ceil(lines.length * fontSize * lineHeight))
  return Math.max(item.height || 0, measuredHeight)
}

const measureTownGroupHeight = (row: TownSceneRow) =>
  Math.max(row.labelHeight, row.amountY - row.labelY + row.amountFontSize + 10)

const measureTownStackBounds = (rows: TownSceneRow[]) => {
  if (!rows.length) return { x: 0, y: 0, width: 0, height: 0 }

  const left = Math.min(...rows.map((row) => row.labelX))
  const top = Math.min(...rows.map((row) => row.labelY))
  const right = Math.max(...rows.map((row) => row.labelX + Math.max(getRenderedTownLabelWidth(row), 300)))
  const bottom = Math.max(...rows.map((row) => row.labelY + measureTownGroupHeight(row)))

  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  }
}

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const sceneBundleToXml = (bundle: MailSceneBundle, tenantLabel: string) => {
  const serializeNode = (key: string, value: unknown): string => {
    if (Array.isArray(value)) {
      return `<${key}>${value.map((item) => serializeNode('item', item)).join('')}</${key}>`
    }
    if (value && typeof value === 'object') {
      return `<${key}>${Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => serializeNode(childKey, childValue)).join('')}</${key}>`
    }
    return `<${key}>${escapeXml(String(value ?? ''))}</${key}>`
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n<graphicsEditorMail tenant="${escapeXml(tenantLabel)}">${serializeNode('bundle', bundle)}</graphicsEditorMail>\n`
}

const relayoutTownRows = (current: ExperimentalTownScene, townColumns: 1 | 2) => {
  const includedRows = current.townRows.filter((row) => row.included)
  if (!includedRows.length) return { ...current, townColumns }

  const startX = Math.min(...includedRows.map((row) => row.labelX))
  const startY = Math.min(...includedRows.map((row) => row.labelY))
  const columnGap = 68
  const rowGap = 40
  const rowsPerColumn = townColumns === 2 ? Math.ceil(includedRows.length / 2) : includedRows.length

  let maxFirstColumnWidth = 0
  includedRows.slice(0, rowsPerColumn).forEach((row) => {
    maxFirstColumnWidth = Math.max(maxFirstColumnWidth, getRenderedTownLabelWidth(row))
  })

  const nextRows = [...current.townRows]
  let firstColumnY = startY
  let secondColumnY = startY

  includedRows.forEach((row, index) => {
    const nextRow = nextRows.find((candidate) => candidate.id === row.id)
    if (!nextRow) return

    const columnIndex = townColumns === 2 && index >= rowsPerColumn ? 1 : 0
    const nextLabelX = columnIndex === 0 ? startX : startX + maxFirstColumnWidth + columnGap
    const nextLabelY = columnIndex === 0 ? firstColumnY : secondColumnY
    const amountOffsetX = nextRow.amountX - nextRow.labelX
    const amountOffsetY = nextRow.amountY - nextRow.labelY

    nextRow.labelX = nextLabelX
    nextRow.labelY = nextLabelY
    nextRow.labelWidth = getRenderedTownLabelWidth(nextRow)
    nextRow.amountX = nextLabelX + amountOffsetX
    nextRow.amountY = nextLabelY + amountOffsetY

    const rowHeight = measureTownGroupHeight(nextRow)
    if (columnIndex === 0) {
      firstColumnY += rowHeight + rowGap
    } else {
      secondColumnY += rowHeight + rowGap
    }
  })

  return {
    ...current,
    townColumns,
    townRows: nextRows,
  }
}

const alignSubheadToHeadline = (current: ExperimentalTownScene) => {
  const headlineHeight = measureHeadlineHeight(current.headline)
  return {
    ...current,
    subhead: {
      ...current.subhead,
      x: current.headline.x + 2,
      y: current.headline.y + headlineHeight + 26,
    },
  }
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value || 0)

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

const buildCircularHeadshotDataUrl = async ({
  image,
  placement,
  size,
}: {
  image: HTMLImageElement | null
  placement: { x: number; y: number; width: number; height: number }
  size: number
}) => {
  if (!image || size <= 0) return null
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(size * 2))
  canvas.height = Math.max(1, Math.round(size * 2))
  const context = canvas.getContext('2d')
  if (!context) return null
  const scale = canvas.width / size

  context.save()
  context.scale(scale, scale)
  context.beginPath()
  context.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
  context.closePath()
  context.clip()
  context.drawImage(image, placement.x, placement.y, placement.width, placement.height)
  context.restore()

  return canvas.toDataURL('image/png')
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

const isExperimentalScene = (value: unknown): value is ExperimentalTownScene =>
  asRecord(value).kind === SCENE_KIND

const isMailSceneBundle = (value: unknown): value is MailSceneBundle => {
  const record = asRecord(value)
  return (
    record.kind === MAIL_SCENE_BUNDLE_KIND &&
    isExperimentalScene(record.frontScene) &&
    isExperimentalScene(record.backScene)
  )
}

const hasSuperRole = (value: unknown) => {
  if (!value || typeof value !== 'object') return false
  const roles = (value as { roles?: unknown }).roles
  return Array.isArray(roles) && roles.includes('super')
}

const parseMailEditorNotes = (value: string | null | undefined): MailEditorNotes | null => {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    if (parsed.mode !== 'graphics-editor-mail') return null
    return {
      mode: 'graphics-editor-mail',
      selectedTenantID: typeof parsed.selectedTenantID === 'string' ? parsed.selectedTenantID : null,
    }
  } catch {
    return null
  }
}

const stringifyMailEditorNotes = (selectedTenantID: string | null | undefined) =>
  JSON.stringify({
    mode: 'graphics-editor-mail',
    selectedTenantID: selectedTenantID || null,
  } satisfies MailEditorNotes)

const buildMailSceneBundle = (
  frontScene: ExperimentalTownScene,
  backScene: ExperimentalTownScene,
  activeMailSide: MailSide,
): MailSceneBundle => ({
  kind: MAIL_SCENE_BUNDLE_KIND,
  frontScene,
  backScene,
  activeMailSide,
})

const scaleBaseScene = (scene: ExperimentalTownScene) => {
  const scaleX = STAGE_WIDTH / BASE_CANVAS_WIDTH
  const scaleY = STAGE_HEIGHT / BASE_CANVAS_HEIGHT

  const scaledScene = {
    ...scene,
    eyebrow: {
      ...scene.eyebrow,
      x: scene.eyebrow.x * scaleX,
      y: scene.eyebrow.y * scaleY,
      width: scene.eyebrow.width * scaleX,
      fontSize: scene.eyebrow.fontSize * scaleY,
      barWidth: scene.eyebrow.barWidth * scaleX,
      barHeight: scene.eyebrow.barHeight * scaleY,
      paddingX: scene.eyebrow.paddingX * scaleX,
      paddingY: scene.eyebrow.paddingY * scaleY,
    },
    headline: {
      ...scene.headline,
      x: scene.headline.x * scaleX,
      y: scene.headline.y * scaleY,
      width: scene.headline.width * scaleX,
      fontSize: scene.headline.fontSize * scaleY,
    },
    subhead: {
      ...scene.subhead,
      x: scene.subhead.x * scaleX,
      y: scene.subhead.y * scaleY,
      dividerWidth: scene.subhead.dividerWidth * scaleX,
      dividerHeight: scene.subhead.dividerHeight * scaleY,
      fontSize: scene.subhead.fontSize * scaleY,
    },
    footer: {
      ...scene.footer,
      x: scene.footer.x * scaleX,
      y: scene.footer.y * scaleY,
      width: scene.footer.width * scaleX,
      height: scene.footer.height * scaleY,
      textX: scene.footer.textX * scaleX,
      textY: scene.footer.textY * scaleY,
      fontSize: scene.footer.fontSize * scaleY,
    },
    headshot: {
      ...scene.headshot,
      x: scene.headshot.x * scaleX,
      y: scene.headshot.y * scaleY,
      size: scene.headshot.size * scaleY,
      crop: {
        ...scene.headshot.crop,
        offsetX: scene.headshot.crop.offsetX * scaleX,
        offsetY: scene.headshot.crop.offsetY * scaleY,
      },
    },
    customImages: scene.customImages.map((item) => ({
      ...item,
      x: item.x * scaleX,
      y: item.y * scaleY,
      width: item.width * scaleX,
      height: item.height * scaleY,
    })),
    customRects: scene.customRects.map((item) => ({
      ...item,
      x: item.x * scaleX,
      y: item.y * scaleY,
      width: item.width * scaleX,
      height: item.height * scaleY,
    })),
    customTexts: scene.customTexts.map((item) => ({
      ...item,
      x: item.x * scaleX,
      y: item.y * scaleY,
      width: item.width * scaleX,
      fontSize: item.fontSize * scaleY,
    })),
    townRows: scene.townRows.map((row) => ({
      ...row,
      labelX: row.labelX * scaleX,
      labelY: row.labelY * scaleY,
      labelWidth: row.labelWidth * scaleX,
      labelHeight: row.labelHeight * scaleY,
      amountX: row.amountX * scaleX,
      amountY: row.amountY * scaleY,
      townFontSize: row.townFontSize * scaleY,
      amountFontSize: row.amountFontSize * scaleY,
    })),
  } satisfies ExperimentalTownScene
  return {
    ...scaledScene,
    layers: buildEditorLayers(scaledScene),
  }
}

const createBaseScene = (data: TownFundingResponse, _tenantName: string | undefined) => {
  const headlineText = deriveDefaultHeadline(data.repInfo?.name)
  const townRows = data.townRows.map((row, index) => {
    const top = 670 + index * 174
    return {
      id: row.id,
      townKey: normalizeTownKey(row.town),
      town: row.town,
      strapAid: row.strapAid,
      included: true,
      labelX: 72,
      labelY: top,
      labelWidth: measureTownLabelWidth(row.town, 36),
      labelHeight: 54,
      amountX: 72,
      amountY: top + 72,
      townFontSize: 36,
      amountFontSize: 74,
      labelColor: BRAND_RED,
      textColor: BRAND_BLUE,
    }
  })

  const scene = {
    kind: SCENE_KIND,
    backgroundMediaID: null,
    eyebrow: {
      id: 'eyebrow',
      x: 72,
      y: 70,
      width: 260,
      text: 'REAL RELIEF FOR CONNECTICUT',
      fontSize: 22,
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
      width: 760,
      text: headlineText,
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
      fontSize: 30,
      color: BRAND_BLUE,
      fontFamily: 'Arial',
      fontStyle: 'italic 700',
    },
    footer: {
      id: 'footer',
      x: 0,
      y: 1490,
      width: STAGE_WIDTH,
      height: 80,
      backgroundColor: BRAND_RED,
      text: WEBSITE_TEXT,
      textX: 78,
      textY: 1510,
      fontSize: 34,
      color: '#ffffff',
      fontStyle: 'italic 700',
    },
    headshot: {
      id: 'headshot',
      x: 820,
      y: 1188,
      size: 400,
      crop: {
        zoom: 1,
        offsetX: 0,
        offsetY: 0,
      },
    },
    customImages: [],
    customRects: [],
    customTexts: [],
    layers: [],
    townColumns: 1 as const,
    townRows,
  } satisfies ExperimentalTownScene

  const scaledScene = scaleBaseScene(scene)

  const alignedScene = alignSubheadToHeadline({
    ...scaledScene,
    headline: {
      ...scaledScene.headline,
      fontSize: 50,
    },
    headshot: {
      ...scaledScene.headshot,
      x: 475,
      y: 180,
      size: 496,
      crop: {
        ...scaledScene.headshot.crop,
        zoom: 1,
      },
    },
  })
  return {
    ...alignedScene,
    layers: buildEditorLayers(alignedScene),
  }
}

const createBackScene = (data: TownFundingResponse, tenantName: string | undefined) => {
  const repName = data.repInfo?.name?.trim() || tenantName?.trim() || 'State Representative'
  const backTownColumns = 2
  const rowsPerColumn = Math.ceil(data.townRows.length / 2)
  const backTownRows = data.townRows.map((row, index) => {
    const columnIndex = index >= rowsPerColumn ? 1 : 0
    const indexInColumn = columnIndex === 0 ? index : index - rowsPerColumn
    const labelX = columnIndex === 0 ? 28 : 292
    const amountX = columnIndex === 0 ? 19 : 284
    const labelY = 352 + indexInColumn * 137

    return {
      id: row.id,
      townKey: normalizeTownKey(row.town),
      town: row.town,
      strapAid: row.strapAid,
      included: true,
      labelX,
      labelY,
      labelWidth: measureTownLabelWidth(row.town, 24),
      labelHeight: 36,
      amountX,
      amountY: labelY + 37,
      townFontSize: 24,
      amountFontSize: 40,
      labelColor: BRAND_RED,
      textColor: BRAND_BLUE,
    }
  })

  const scene = {
    kind: SCENE_KIND,
    backgroundMediaID: null,
    eyebrow: {
      id: 'eyebrow',
      x: 33,
      y: 30,
      width: 488,
      text: 'PITCHING REAL RELIEF FOR CONNECTICUT',
      fontSize: 14,
      color: '#ffffff',
      fontFamily: '"Arial Narrow", Arial, sans-serif',
      fontStyle: '700',
      lineHeight: 1,
      barWidth: 488,
      barHeight: 20,
      paddingX: 10,
      paddingY: 4,
      backgroundColor: '#111111',
    },
    headline: {
      id: 'headline',
      x: 21,
      y: 90,
      width: 520,
      text: `${buildRepShortName(repName).replace('Rep. ', '')} Announces\nSchools/Taxpayers Relief &\nAffordability Plan (STRAP)`,
      fontSize: 31,
      color: '#111111',
      fontFamily: 'Georgia, Times New Roman, serif',
      fontStyle: '700',
      lineHeight: 1.05,
    },
    subhead: {
      id: 'subhead',
      x: 24,
      y: 0,
      dividerWidth: 0,
      dividerHeight: 0,
      dividerColor: '#111111',
      text: 'STRAP FUNDING PER TOWN',
      fontSize: 16,
      color: '#111111',
      fontFamily: '"Arial Narrow", Arial, sans-serif',
      fontStyle: 'italic 700',
    },
    footer: {
      id: 'footer',
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      backgroundColor: '#ffffff',
      text: '',
      textX: 0,
      textY: 0,
      fontSize: 12,
      color: '#111111',
      fontStyle: '400',
    },
    headshot: {
      id: 'headshot',
      x: STAGE_WIDTH + 120,
      y: STAGE_HEIGHT + 120,
      size: 0,
      crop: {
        zoom: 1,
        offsetX: 0,
        offsetY: 0,
      },
    },
    customImages: [
      {
        id: 'back-note-paper',
        x: 1071,
        y: 65,
        width: 1121,
        height: 800,
        rotation: MAILER_BACKSIDE_ONE_ROTATION.paper,
        mediaID: 'mailer-backside-one-paper',
        sourceUrl: MAILER_BACKSIDE_ONE_ASSETS.paper,
        alt: 'Fast facts paper',
      },
      {
        id: 'back-site-screenshot',
        x: 643,
        y: 586,
        width: 337,
        height: 208,
        mediaID: 'mailer-backside-one-screenshot',
        sourceUrl: MAILER_BACKSIDE_ONE_ASSETS.screenshot,
        alt: 'Budget website screenshot',
      },
      {
        id: 'back-arrow',
        x: 1228,
        y: 703,
        width: 118,
        height: 160,
        rotation: MAILER_BACKSIDE_ONE_ROTATION.arrow,
        mediaID: 'mailer-backside-one-arrow',
        sourceUrl: MAILER_BACKSIDE_ONE_ASSETS.arrow,
        alt: 'Arrow',
      },
      {
        id: 'back-qr',
        x: 1358,
        y: 686,
        width: 258,
        height: 258,
        mediaID: 'mailer-backside-one-qr',
        sourceUrl: MAILER_BACKSIDE_ONE_ASSETS.qr,
        alt: 'QR code',
      },
    ],
    customRects: [
      {
        id: 'back-divider-left',
        x: 581,
        y: -2,
        width: 2,
        height: STAGE_HEIGHT + 4,
        fill: '#111111',
      },
      {
        id: 'back-divider-right',
        x: 590,
        y: -42,
        width: 1,
        height: STAGE_HEIGHT + 86,
        fill: '#111111',
      },
      {
        id: 'back-monitor-frame',
        x: 557,
        y: 564,
        width: 565,
        height: 341,
        fill: '#111111',
      },
      {
        id: 'back-monitor-screen',
        x: 581,
        y: 590,
        width: 516,
        height: 290,
        fill: '#ffffff',
      },
      {
        id: 'back-monitor-stand',
        x: 557,
        y: 905,
        width: 565,
        height: 53,
        fill: '#f1f1f1',
      },
      {
        id: 'back-monitor-base',
        x: 741,
        y: 957,
        width: 196,
        height: 59,
        fill: '#f7f7f7',
      },
      {
        id: 'back-qr-border-top',
        x: 1102,
        y: 619,
        width: 563,
        height: 2,
        fill: '#111111',
      },
      {
        id: 'back-qr-border-right',
        x: 1664,
        y: 619,
        width: 2,
        height: 424,
        fill: '#111111',
      },
      {
        id: 'back-qr-border-bottom',
        x: 1102,
        y: 1042,
        width: 563,
        height: 2,
        fill: '#111111',
      },
      {
        id: 'back-qr-border-left',
        x: 1102,
        y: 619,
        width: 2,
        height: 424,
        fill: '#111111',
      },
    ],
    customTexts: [
      {
        id: 'back-office-title',
        x: 21,
        y: 58,
        width: 240,
        text: 'State Representative',
        fontSize: 18,
        color: '#111111',
        fontFamily: 'Georgia, Times New Roman, serif',
        fontStyle: '400',
        lineHeight: 1,
      },
      {
        id: 'back-tax-relief-title',
        x: 622,
        y: 16,
        width: 652,
        text: 'TAX AND FEE RELIEF',
        fontSize: 34,
        color: '#111111',
        fontFamily: '"Arial Narrow", Arial, sans-serif',
        fontStyle: '700',
        lineHeight: 1,
      },
      {
        id: 'back-tax-relief-copy',
        x: 622,
        y: 92,
        width: 580,
        text:
          "Increase property tax credit\nReduce healthcare costs\nLower vehicle sales tax\nNo tax on tips\nEliminate many license fees\nEliminate Social Security tax\nRemove Passport to Parks fee\nEliminate children's clothing taxes\nProvide $2.5 million to help municipalities cover early voting costs.",
        fontSize: 18,
        color: '#111111',
        fontFamily: 'Arial',
        fontStyle: '400',
        lineHeight: 1.25,
      },
      {
        id: 'back-funding-title',
        x: 19,
        y: 659,
        width: 529,
        text: 'How the plan is funded',
        fontSize: 20,
        color: '#1d4ed8',
        fontFamily: 'Arial',
        fontStyle: '700',
        lineHeight: 1,
        textDecoration: 'underline',
      },
      {
        id: 'back-funding-copy',
        x: 21,
        y: 707,
        width: 523,
        text:
          'Recover $340 million by challenging New York’s “convenience of employer” rule.\nSave $153 million by budgeting state employee positions based on realistic hiring trends rather than funding all vacancies at once.',
        fontSize: 18,
        color: '#111111',
        fontFamily: 'Arial',
        fontStyle: '400',
        lineHeight: 1.22,
      },
      ...MAILER_BACKSIDE_ONE_FAST_FACTS.map((item) => ({
        ...item,
        color: '#111111',
        lineHeight: 1.05,
        rotation: MAILER_BACKSIDE_ONE_ROTATION.paper / 4.16,
      })),
      {
        id: 'back-qr-title',
        x: 1136,
        y: 639,
        width: 551,
        text: 'SCAN FOR MORE DETAILS',
        fontSize: 22,
        color: '#111111',
        fontFamily: '"Arial Narrow", Arial, sans-serif',
        fontStyle: '700',
        lineHeight: 1,
      },
      {
        id: 'back-qr-or-visit',
        x: 1138,
        y: 899,
        width: 136,
        text: 'OR\nVISIT:',
        fontSize: 18,
        color: '#111111',
        fontFamily: '"Arial Narrow", Arial, sans-serif',
        fontStyle: '700',
        lineHeight: 1.05,
      },
      {
        id: 'back-qr-website',
        x: 1112,
        y: 939,
        width: 483,
        text: WEBSITE_TEXT,
        fontSize: 22,
        color: '#111111',
        fontFamily: '"Arial Narrow", Arial, sans-serif',
        fontStyle: '700',
        lineHeight: 1,
      },
    ],
    layers: [],
    townColumns: backTownColumns as 1 | 2,
    townRows: backTownRows,
  } satisfies ExperimentalTownScene

  const alignedScene = alignSubheadToHeadline(scene)
  return {
    ...alignedScene,
    layers: buildEditorLayers(alignedScene),
  }
}

const mergeSceneWithFreshData = (savedScene: ExperimentalTownScene | null | undefined, baseScene: ExperimentalTownScene) => {
  if (!savedScene || !isExperimentalScene(savedScene)) return baseScene

  const savedRowsByKey = new Map(
    (savedScene.townRows || []).map((row) => [row.townKey || normalizeTownKey(row.town), row] as const),
  )
  const baseCustomImagesByID = new Map(baseScene.customImages.map((item) => [item.id, item] as const))
  const baseCustomRectsByID = new Map(baseScene.customRects.map((item) => [item.id, item] as const))
  const baseCustomTextsByID = new Map(baseScene.customTexts.map((item) => [item.id, item] as const))

  const mergedCustomImagesByID = new Map(baseScene.customImages.map((item) => [item.id, item] as const))
  if (Array.isArray(savedScene.customImages)) {
    for (const item of savedScene.customImages) {
        const legacy = LEGACY_BACKSIDE_IMAGE_SIGNATURES[item.id as keyof typeof LEGACY_BACKSIDE_IMAGE_SIGNATURES]
        const baseItem = baseCustomImagesByID.get(item.id)
        if (!legacy || !baseItem) {
          mergedCustomImagesByID.set(item.id, item)
          continue
        }
        mergedCustomImagesByID.set(
          item.id,
          item.x === legacy.x && item.y === legacy.y && item.width === legacy.width && item.height === legacy.height
            ? baseItem
            : item,
        )
    }
  }

  const mergedCustomRectsByID = new Map(baseScene.customRects.map((item) => [item.id, item] as const))
  if (Array.isArray(savedScene.customRects)) {
    for (const item of savedScene.customRects) {
        if (LEGACY_BACKSIDE_REMOVED_RECT_IDS.has(item.id)) continue
        const legacy = LEGACY_BACKSIDE_RECT_SIGNATURES[item.id as keyof typeof LEGACY_BACKSIDE_RECT_SIGNATURES]
        const baseItem = baseCustomRectsByID.get(item.id)
        if (!legacy || !baseItem) {
          mergedCustomRectsByID.set(item.id, item)
          continue
        }
        mergedCustomRectsByID.set(
          item.id,
          item.x === legacy.x && item.y === legacy.y && item.width === legacy.width && item.height === legacy.height
            ? baseItem
            : item,
        )
    }
  }

  const mergedCustomTextsByID = new Map(baseScene.customTexts.map((item) => [item.id, item] as const))
  if (Array.isArray(savedScene.customTexts)) {
    for (const item of savedScene.customTexts) {
      if (LEGACY_BACKSIDE_REMOVED_TEXT_IDS.has(item.id)) continue
      const legacy = LEGACY_BACKSIDE_TEXT_SIGNATURES[item.id as keyof typeof LEGACY_BACKSIDE_TEXT_SIGNATURES]
      const baseItem = baseCustomTextsByID.get(item.id)
      if (!legacy || !baseItem) {
        mergedCustomTextsByID.set(item.id, item)
        continue
      }
      mergedCustomTextsByID.set(
        item.id,
        item.x === legacy.x && item.y === legacy.y && item.width === legacy.width && item.text === legacy.text ? baseItem : item,
      )
    }
  }

  return alignSubheadToHeadline({
    ...baseScene,
    ...savedScene,
    backgroundMediaID: null,
    eyebrow: { ...baseScene.eyebrow, ...savedScene.eyebrow },
    headline: { ...baseScene.headline, ...savedScene.headline },
    subhead: { ...baseScene.subhead, ...savedScene.subhead },
    footer: { ...baseScene.footer, ...savedScene.footer, text: baseScene.footer.text },
    headshot: {
      ...baseScene.headshot,
      ...savedScene.headshot,
      crop: {
        ...baseScene.headshot.crop,
        ...savedScene.headshot?.crop,
      },
    },
    customImages: [...mergedCustomImagesByID.values()],
    customRects: [...mergedCustomRectsByID.values()],
    customTexts: [...mergedCustomTextsByID.values()],
    layers: hydrateEditorLayers({
      baseLayers: buildEditorLayers({
        ...baseScene,
        customImages: [...mergedCustomImagesByID.values()],
        customRects: [...mergedCustomRectsByID.values()],
        customTexts: [...mergedCustomTextsByID.values()],
      }),
      savedLayers: savedScene.layers,
    }),
    townColumns: savedScene.townColumns === 2 ? 2 : 1,
    townRows: baseScene.townRows.map((row) => {
      const savedRow = savedRowsByKey.get(row.townKey)
      return savedRow ? { ...row, ...savedRow, town: row.town, townKey: row.townKey } : row
    }),
  } satisfies ExperimentalTownScene)
}

export const ExperimentalTownGraphicMailEditor: React.FC = () => {
  const { user } = useAuth()
  const { options: tenantSelectionOptions = [], selectedTenantID, setTenant } = useTenantSelection()
  const { tenantID, tenantName } = useActiveTenant()
  const searchParams = useSearchParams()
  const { ref: stageContainerRef, width: stageContainerWidth } = useContainerWidth()
  const viewportHeight = useViewportHeight()
  const requestedDesignID = searchParams.get('designId') || ''
  const requestedTemplateID = searchParams.get('templateId') || ''
  const stageRef = useRef<Konva.Stage | null>(null)
  const headlineRef = useRef<Konva.Group | null>(null)
  const headshotRef = useRef<Konva.Group | null>(null)
  const customImageRefs = useRef<Record<string, Konva.Group | null>>({})
  const customRectRefs = useRef<Record<string, Konva.Group | null>>({})
  const customTextRefs = useRef<Record<string, Konva.Group | null>>({})
  const townStackRef = useRef<Konva.Group | null>(null)
  const leftTownStackRef = useRef<Konva.Group | null>(null)
  const rightTownStackRef = useRef<Konva.Group | null>(null)
  const townRefs = useRef<Record<string, Konva.Group | null>>({})
  const transformerRef = useRef<Konva.Transformer | null>(null)
  const frontSceneRef = useRef<ExperimentalTownScene | null>(null)
  const backSceneRef = useRef<ExperimentalTownScene | null>(null)
  const activeMailSideRef = useRef<MailSide>(DEFAULT_MAIL_SIDE)
  const selectionRef = useRef<Selection>(null)
  const loadingRef = useRef(true)
  const tenantIDRef = useRef<string | null>(tenantID)
  const headshotImageRef = useRef<HTMLImageElement | null>(null)
  const undoStackRef = useRef<Record<MailSide, ExperimentalTownScene[]>>({
    front: [],
    back: [],
  })
  const redoStackRef = useRef<Record<MailSide, ExperimentalTownScene[]>>({
    front: [],
    back: [],
  })
  const skipHistoryRef = useRef(false)
  const isSuperAdmin = hasSuperRole(user)
  const [isMounted, setIsMounted] = useState(false)
  const [isResizingHeadline, setIsResizingHeadline] = useState(false)
  const [previewZoom, setPreviewZoom] = useState(1)
  const [activeMailSide, setActiveMailSide] = useState<MailSide>(DEFAULT_MAIL_SIDE)

  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [townData, setTownData] = useState<TownFundingResponse | null>(null)
  const [frontScene, setFrontScene] = useState<ExperimentalTownScene | null>(null)
  const [backScene, setBackScene] = useState<ExperimentalTownScene | null>(null)
  const [selection, setSelection] = useState<Selection>(null)
  const [inlineTextEditor, setInlineTextEditor] = useState<InlineTextEditorState>(null)
  const [templateID, setTemplateID] = useState('')
  const [templateTitle, setTemplateTitle] = useState('Experimental Town Graphic')
  const [designID, setDesignID] = useState('')
  const [designTitle, setDesignTitle] = useState('Town Graphic')
  const [templates, setTemplates] = useState<TemplateDoc[]>([])
  const [designs, setDesigns] = useState<DesignDoc[]>([])
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [savingDesign, setSavingDesign] = useState(false)
  const [savingMedia, setSavingMedia] = useState(false)
  const [downloadingPptx, setDownloadingPptx] = useState(false)
  const [exportingAllReps, setExportingAllReps] = useState(false)
  const [mailExportJob, setMailExportJob] = useState<MailExportJobState | null>(null)
  const [designsSectionOpen, setDesignsSectionOpen] = useState(false)
  const [contentSectionOpen, setContentSectionOpen] = useState(false)
  const [townsSectionOpen, setTownsSectionOpen] = useState(false)
  const [inspectorSectionOpen, setInspectorSectionOpen] = useState(false)
  const [templateSectionOpen, setTemplateSectionOpen] = useState(false)
  const [sceneRevision, setSceneRevision] = useState(0)

  const tenantOptions = useMemo<TenantSelectOption[]>(
    () =>
      Array.isArray(tenantSelectionOptions)
        ? tenantSelectionOptions
            .map((option) => {
              if (!option || typeof option !== 'object') return null
              const typed = option as { label?: unknown; value?: unknown }
              if (typed.value == null) return null
              return {
                label: typed.label == null ? String(typed.value) : String(typed.label),
                value: String(typed.value),
              }
            })
            .filter((option): option is TenantSelectOption => Boolean(option))
        : [],
    [tenantSelectionOptions],
  )
  const scene = activeMailSide === 'front' ? frontScene : backScene
  const selectedTenantValue = selectedTenantID ? String(selectedTenantID) : ''
  const tenantIndex = useMemo(
    () => tenantOptions.findIndex((option) => option.value === selectedTenantValue),
    [tenantOptions, selectedTenantValue],
  )

  useEffect(() => {
    frontSceneRef.current = frontScene
  }, [frontScene])

  useEffect(() => {
    backSceneRef.current = backScene
  }, [backScene])

  useEffect(() => {
    activeMailSideRef.current = activeMailSide
  }, [activeMailSide])

  useEffect(() => {
    selectionRef.current = selection
  }, [selection])

  useEffect(() => {
    loadingRef.current = loading
  }, [loading])

  useEffect(() => {
    tenantIDRef.current = tenantID
  }, [tenantID])

  const setSceneForSide = (
    side: MailSide,
    nextScene: ExperimentalTownScene | null | ((current: ExperimentalTownScene | null) => ExperimentalTownScene | null),
  ) => {
    if (typeof nextScene === 'function') {
      const updater = nextScene
      if (side === 'front') {
        setFrontScene(updater)
      } else {
        setBackScene(updater)
      }
      return
    }

    if (side === 'front') {
      setFrontScene(nextScene)
    } else {
      setBackScene(nextScene)
    }
  }

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    if (!isMounted) return
    if (!tenantID) {
      setLoading(false)
      setTownData(null)
      setActiveMailSide(DEFAULT_MAIL_SIDE)
      setFrontScene(null)
      setBackScene(null)
      setSceneRevision(0)
      clearUndoHistory('front')
      clearUndoHistory('back')
      return
    }

    let cancelled = false

    const load = async () => {
      setLoading(true)
      setMessage(null)

      try {
        const [townResponse, templateResponse, designResponse] = await Promise.all([
          fetch(`/api/graphics-experimental/town-funding?tenant=${tenantID}`, { credentials: 'include' }),
          fetch(`/api/graphic-templates?${buildTemplateSearchParams().toString()}`, { credentials: 'include' }),
          fetch(`/api/graphic-designs?${buildDesignSearchParams(tenantID).toString()}`, { credentials: 'include' }),
        ])

        const [townJson, templateJson, designJson] = await Promise.all([
          townResponse.json(),
          templateResponse.json(),
          designResponse.json(),
        ])

        if (!townResponse.ok) throw new Error(getString(asRecord(townJson).message) || 'Failed to load town data')

        const nextTownData = townJson as TownFundingResponse
        const nextTemplates = Array.isArray(asRecord(templateJson).docs)
          ? ((asRecord(templateJson).docs as TemplateDoc[]) || [])
            .map(sanitizeTemplateDoc)
            .filter((doc) => isMailSceneBundle(doc.scene) || (isExperimentalScene(doc.scene) && Boolean(parseMailEditorNotes(doc.notes))))
          : []
        const nextDesigns = Array.isArray(asRecord(designJson).docs)
          ? ((asRecord(designJson).docs as DesignDoc[]) || [])
            .map(sanitizeDesignDoc)
            .filter((doc) => isMailSceneBundle(doc.scene) || (isExperimentalScene(doc.scene) && Boolean(parseMailEditorNotes(doc.notes))))
          : []
        const selectedDesign = requestedDesignID
          ? nextDesigns.find((item) => item.id === requestedDesignID)
          : nextDesigns.find((item) => parseMailEditorNotes(item.notes)?.selectedTenantID === tenantID) || nextDesigns[0]
        const selectedTemplate = !selectedDesign && requestedTemplateID ? nextTemplates.find((item) => item.id === requestedTemplateID) : undefined
        const storedTenantID =
          parseMailEditorNotes(selectedDesign?.notes)?.selectedTenantID ||
          parseMailEditorNotes(selectedTemplate?.notes)?.selectedTenantID ||
          null

        if (storedTenantID && storedTenantID !== tenantID) {
          setTenant({ id: storedTenantID, refresh: true })
          return
        }

        const frontBaseScene = createBaseScene(nextTownData, tenantName)
        const backBaseScene = createBackScene(nextTownData, tenantName)
        const selectedDesignBundle = isMailSceneBundle(selectedDesign?.scene) ? selectedDesign.scene : null
        const selectedTemplateBundle = isMailSceneBundle(selectedTemplate?.scene) ? selectedTemplate.scene : null
        const selectedDesignScene = isExperimentalScene(selectedDesign?.scene) ? selectedDesign.scene : null
        const selectedTemplateScene = isExperimentalScene(selectedTemplate?.scene) ? selectedTemplate.scene : null
        const frontNextScene = selectedDesign
          ? mergeSceneWithFreshData(selectedDesignBundle?.frontScene || selectedDesignScene, frontBaseScene)
          : selectedTemplate
            ? mergeSceneWithFreshData(selectedTemplateBundle?.frontScene || selectedTemplateScene, frontBaseScene)
            : frontBaseScene
        const backNextScene = selectedDesign
          ? mergeSceneWithFreshData(selectedDesignBundle?.backScene || selectedDesignScene, backBaseScene)
          : selectedTemplate
            ? mergeSceneWithFreshData(selectedTemplateBundle?.backScene || selectedTemplateScene, backBaseScene)
            : backBaseScene

        if (cancelled) return

        setTownData(nextTownData)
        setTemplates(nextTemplates)
        setDesigns(nextDesigns)
        setSceneRevision(0)
        clearUndoHistory('front')
        clearUndoHistory('back')
        setFrontScene(cloneScene(frontNextScene))
        setBackScene(cloneScene(backNextScene))
        setActiveMailSide(selectedDesignBundle?.activeMailSide || selectedTemplateBundle?.activeMailSide || DEFAULT_MAIL_SIDE)
        setSelection(null)
        setInlineTextEditor(null)
        clearUndoHistory(DEFAULT_MAIL_SIDE)
        clearUndoHistory('back')
        setTemplateID(selectedTemplate?.id || getString(selectedDesign?.template) || getString(asRecord(selectedDesign?.template).id) || '')
        setTemplateTitle(selectedTemplate?.title || 'Experimental Town Graphic')
        setDesignID(selectedDesign?.id || '')
        setDesignTitle(selectedDesign?.title || buildDesignTitle(nextTownData.tenant?.name || tenantName, 'Town Graphic'))
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : String(error))
          setTownData(null)
          setFrontScene(null)
          setBackScene(null)
          setActiveMailSide(DEFAULT_MAIL_SIDE)
          setSceneRevision(0)
          clearUndoHistory('front')
          clearUndoHistory('back')
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

  useEffect(() => {
    if (!mailExportJob || (mailExportJob.status !== 'queued' && mailExportJob.status !== 'running')) return

    const interval = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/graphics-editor-mail/export-all?jobId=${encodeURIComponent(mailExportJob.id)}`, {
          credentials: 'include',
        })
        const json = (await response.json()) as MailExportJobState | { message?: string }
        if (!response.ok) throw new Error(getString(asRecord(json).message) || 'Failed to poll export job')
        const nextJob = json as MailExportJobState
        setMailExportJob(nextJob)
        if (nextJob.status === 'complete') {
          setExportingAllReps(false)
          setMessage(
            nextJob.skippedCount
              ? `Exported ${nextJob.completed} reps. Skipped ${nextJob.skippedCount}.`
              : `Exported ${nextJob.completed} reps.`,
          )
        } else if (nextJob.status === 'error') {
          setExportingAllReps(false)
          setMessage(nextJob.error || 'Export job failed')
        }
      } catch (error) {
        setExportingAllReps(false)
        setMessage(error instanceof Error ? error.message : String(error))
      }
    }, 2000)

    return () => window.clearInterval(interval)
  }, [mailExportJob])

  const previewScale = useMemo(() => {
    const fallbackHeight = viewportHeight > 0 ? Math.min(MAX_PREVIEW_HEIGHT, Math.max(520, viewportHeight - 220)) : MAX_PREVIEW_HEIGHT
    const fallbackScale = Math.min(1, MAX_PREVIEW_WIDTH / STAGE_WIDTH, fallbackHeight / STAGE_HEIGHT)
    if (!stageContainerWidth) return Math.max(0.35, Math.min(1, fallbackScale * previewZoom))
    const maxHeight = viewportHeight > 0 ? Math.min(MAX_PREVIEW_HEIGHT, Math.max(520, viewportHeight - 220)) : MAX_PREVIEW_HEIGHT
    const fitScale = Math.min(1, stageContainerWidth / STAGE_WIDTH, MAX_PREVIEW_WIDTH / STAGE_WIDTH, maxHeight / STAGE_HEIGHT)
    return Math.max(0.35, Math.min(1, fitScale * previewZoom))
  }, [previewZoom, stageContainerWidth, viewportHeight])
  const previewWidth = STAGE_WIDTH * previewScale
  const previewHeight = STAGE_HEIGHT * previewScale
  const transformerAnchorSize = useMemo(() => clamp(Math.round(9 / Math.max(previewScale, 0.72)), 8, 11), [previewScale])

  const headshotUrl = useMemo(
    () => readMediaUrl(townData?.standardMedia?.mobileHeadshot) || undefined,
    [townData],
  )
  const headshotImage = useLoadedImage(headshotUrl)
  const customImageUrls = useMemo(
    () =>
      scene
        ? Object.fromEntries(scene.customImages.map((item) => [item.id, proxiedUrl(item.sourceUrl) || undefined]))
        : {},
    [scene],
  )
  const customImages = useLoadedImages(customImageUrls)

  useEffect(() => {
    headshotImageRef.current = headshotImage
  }, [headshotImage])

  const selectedTownRow = useMemo(() => {
    if (!scene || selection?.kind !== 'town') return null
    return scene.townRows.find((row) => row.id === selection.id) || null
  }, [scene, selection])

  const selectedCustomRect = useMemo(() => {
    if (!scene || selection?.kind !== 'custom-rect') return null
    return scene.customRects.find((item) => item.id === selection.id) || null
  }, [scene, selection])

  const selectedCustomImage = useMemo(() => {
    if (!scene || selection?.kind !== 'custom-image') return null
    return scene.customImages.find((item) => item.id === selection.id) || null
  }, [scene, selection])

  const selectedCustomText = useMemo(() => {
    if (!scene || selection?.kind !== 'custom-text') return null
    return scene.customTexts.find((item) => item.id === selection.id) || null
  }, [scene, selection])

  const layerStateMap = useMemo(
    () => new Map<string, EditorLayerItem>((scene?.layers || []).map((item) => [`${item.kind}:${item.id}`, item] as const)),
    [scene?.layers],
  )
  const getLayerState = (kind: string, id: string) => layerStateMap.get(`${kind}:${id}`) || null
  const isLayerHidden = (kind: string, id: string) => Boolean(getLayerState(kind, id)?.hidden)
  const isLayerLocked = (kind: string, id: string) => Boolean(getLayerState(kind, id)?.locked)
  const selectedLayer = useMemo(
    () => (selection ? getEditorLayerItem(scene?.layers, getLayerTarget(selection)) : null),
    [scene?.layers, selection],
  )
  const layerPanelItems = useMemo(
    () =>
      [...(scene?.layers || [])]
        .sort((left, right) => right.order - left.order)
        .map((item) => {
          if (!scene) return { item, label: item.kind, reorderable: false }
          if (item.kind === 'town') {
            const row = scene.townRows.find((entry) => entry.id === item.id)
            return { item, label: row ? row.town : 'Town row', reorderable: false }
          }
          if (item.kind === 'custom-image') {
            const index = scene.customImages.findIndex((entry) => entry.id === item.id)
            return { item, label: `Image ${index + 1}`, reorderable: true }
          }
          if (item.kind === 'custom-rect') {
            const index = scene.customRects.findIndex((entry) => entry.id === item.id)
            return { item, label: `Shape ${index + 1}`, reorderable: true }
          }
          if (item.kind === 'custom-text') {
            const index = scene.customTexts.findIndex((entry) => entry.id === item.id)
            const currentText = scene.customTexts.find((entry) => entry.id === item.id)
            return {
              item,
              label: currentText?.text?.trim() ? currentText.text.trim().slice(0, 28) : `Text ${index + 1}`,
              reorderable: true,
            }
          }
          const labels: Record<string, string> = {
            eyebrow: 'Eyebrow',
            headline: 'Headline',
            subhead: 'Subhead',
            footer: 'Footer',
            headshot: 'Headshot',
          }
          return { item, label: labels[item.kind] || item.kind, reorderable: false }
        }),
    [scene],
  )

  const includedTownRows = useMemo(
    () => (scene ? scene.townRows.filter((row) => row.included && !isLayerHidden('town', row.id)) : []),
    [scene, layerStateMap],
  )
  const townStackBounds = useMemo(() => measureTownStackBounds(includedTownRows), [includedTownRows])
  const townRowsPerColumn = useMemo(
    () => (scene?.townColumns === 2 ? Math.ceil(includedTownRows.length / 2) : includedTownRows.length),
    [includedTownRows.length, scene?.townColumns],
  )
  const leftTownRows = useMemo(
    () => (scene?.townColumns === 2 ? includedTownRows.slice(0, townRowsPerColumn) : includedTownRows),
    [includedTownRows, scene?.townColumns, townRowsPerColumn],
  )
  const rightTownRows = useMemo(
    () => (scene?.townColumns === 2 ? includedTownRows.slice(townRowsPerColumn) : []),
    [includedTownRows, scene?.townColumns, townRowsPerColumn],
  )
  const leftTownBounds = useMemo(() => measureTownStackBounds(leftTownRows), [leftTownRows])
  const rightTownBounds = useMemo(() => measureTownStackBounds(rightTownRows), [rightTownRows])

  const selectedTextTarget = useMemo<TextSelection | null>(() => {
    if (!selection) return null
    return ['eyebrow', 'headline', 'subhead', 'footer', 'custom-text'].includes(selection.kind) ? (selection as TextSelection) : null
  }, [selection])

  useEffect(() => {
    if (!selection) return
    if (!isLayerHidden(selection.kind, selection.id)) return
    setSelection(null)
    setInlineTextEditor(null)
  }, [isLayerHidden, selection])

  useEffect(() => {
    const transformer = transformerRef.current
    const node =
      selection?.kind === 'headline'
        ? headlineRef.current
        : selection?.kind === 'headshot'
          ? headshotRef.current
          : selection?.kind === 'custom-image'
            ? customImageRefs.current[selection.id] || null
          : selection?.kind === 'custom-rect'
            ? customRectRefs.current[selection.id] || null
          : selection?.kind === 'custom-text'
            ? customTextRefs.current[selection.id] || null
          : selection?.kind === 'towns'
            ? townStackRef.current
          : selection?.kind === 'towns-left'
            ? leftTownStackRef.current
          : selection?.kind === 'towns-right'
            ? rightTownStackRef.current
          : selection?.kind === 'town'
            ? townRefs.current[selection.id] || null
          : null
    if (!transformer) return

    if (node && !selectedLayer?.locked) {
      transformer.nodes([node])
      transformer.getLayer()?.batchDraw()
      return
    }

    transformer.nodes([])
    transformer.getLayer()?.batchDraw()
  }, [scene, selectedLayer?.locked, selection])

  useEffect(() => {
    if (selection?.kind !== 'headline') {
      setIsResizingHeadline(false)
    }
  }, [selection])

  useEffect(() => {
    if (selection && ['eyebrow', 'headline', 'subhead', 'footer', 'custom-text'].includes(selection.kind)) return
    setInlineTextEditor(null)
  }, [selection])

  const setSceneWithoutHistory = (nextScene: ExperimentalTownScene | null, side: MailSide = activeMailSide) => {
    skipHistoryRef.current = true
    setSceneForSide(
      side,
      nextScene
        ? {
            ...nextScene,
            layers: hydrateEditorLayers({
              baseLayers: buildEditorLayers(nextScene),
              savedLayers: nextScene.layers,
            }),
          }
        : nextScene,
    )
  }

  const getActiveScene = (side: MailSide = activeMailSide) => (side === 'front' ? frontScene : backScene)

  const updateScene = (
    updater: (current: ExperimentalTownScene) => ExperimentalTownScene,
    side: MailSide = activeMailSide,
  ) => {
    const currentScene = getActiveScene(side)
    if (!currentScene) return
    if (!skipHistoryRef.current) {
      undoStackRef.current[side] = [...undoStackRef.current[side].slice(-49), cloneScene(currentScene)]
      redoStackRef.current[side] = []
      setSceneRevision((revision) => revision + 1)
    } else {
      skipHistoryRef.current = false
    }
    const nextScene = updater(currentScene)
    setSceneForSide(side, {
      ...nextScene,
      layers: hydrateEditorLayers({
        baseLayers: buildEditorLayers(nextScene),
        savedLayers: nextScene.layers,
      }),
    })
  }

  const clearUndoHistory = (side: MailSide = activeMailSide) => {
    undoStackRef.current[side] = []
    redoStackRef.current[side] = []
  }

  const updateLayerState = (
    target: { id: string; kind: EditorLayerItem['kind'] },
    patch: Partial<Pick<EditorLayerItem, 'hidden' | 'locked'>>,
    side: MailSide = activeMailSide,
  ) => {
    updateScene(
      (current) => ({
        ...current,
        layers: patchEditorLayer(current.layers, target, patch),
      }),
      side,
    )
  }

  const reorderSelectedLayer = (direction: 'backward' | 'forward' | 'front' | 'back', side: MailSide = activeMailSide) => {
    if (!selection || !isCustomLayerKind(selection.kind)) return false
    const target = getLayerTarget(selection)
    if (!target) return false
    updateScene(
      (current) => ({
        ...current,
        layers: reorderCustomEditorLayer(current.layers, target, direction),
      }),
      side,
    )
    return true
  }

  const reorderLayerTarget = (
    target: { id: string; kind: EditorLayerItem['kind'] },
    direction: 'backward' | 'forward' | 'front' | 'back',
    side: MailSide = activeMailSide,
  ) => {
    if (!isCustomLayerKind(target.kind)) return false
    updateScene(
      (current) => ({
        ...current,
        layers: reorderCustomEditorLayer(current.layers, target, direction),
      }),
      side,
    )
    return true
  }

  const undoLastChange = (side: MailSide = activeMailSide) => {
    const previousScene = undoStackRef.current[side].pop()
    const currentScene = getActiveScene(side)
    if (!previousScene || !currentScene) return
    redoStackRef.current[side] = [...redoStackRef.current[side].slice(-49), cloneScene(currentScene)]
    setSceneWithoutHistory(previousScene, side)
    setSelection(null)
  }

  const redoLastChange = (side: MailSide = activeMailSide) => {
    const nextScene = redoStackRef.current[side].pop()
    const currentScene = getActiveScene(side)
    if (!nextScene || !currentScene) return
    undoStackRef.current[side] = [...undoStackRef.current[side].slice(-49), cloneScene(currentScene)]
    setSceneWithoutHistory(nextScene, side)
    setSelection(null)
  }

  const syncSubheadToHeadline = (current: ExperimentalTownScene) => alignSubheadToHeadline(current)

  const updateTownRow = (rowID: string, patch: Partial<TownSceneRow>) => {
    updateScene((current) => ({
      ...current,
      townRows: current.townRows.map((row) => (row.id === rowID ? { ...row, ...patch } : row)),
    }))
  }

  const addCustomRect = () => {
    let nextID = ''
    updateScene((current) => {
      const nextRect = {
        id: createEditorNodeID('custom-rect'),
        x: 120,
        y: 120,
        width: 320,
        height: 56,
        fill: BRAND_RED,
      }
      nextID = nextRect.id
      return {
        ...current,
        customRects: [...current.customRects, nextRect],
        layers: appendEditorLayers(current.layers, [{ id: nextRect.id, kind: 'custom-rect', group: 'custom' }]),
      }
    })
    if (nextID) setSelection({ kind: 'custom-rect', id: nextID })
  }

  const addCustomText = () => {
    let nextID = ''
    updateScene((current) => {
      const nextText = {
        id: createEditorNodeID('custom-text'),
        x: 140,
        y: 136,
        width: 280,
        height: 96,
        text: 'Custom text',
        fontSize: 28,
        color: '#111111',
        fontFamily: 'Arial',
        fontStyle: '700',
        lineHeight: 1.1,
      }
      nextID = nextText.id
      return {
        ...current,
        customTexts: [...current.customTexts, nextText],
        layers: appendEditorLayers(current.layers, [{ id: nextText.id, kind: 'custom-text', group: 'custom' }]),
      }
    })
    if (nextID) setSelection({ kind: 'custom-text', id: nextID })
  }

  const addCustomImage = (mediaDoc: MediaDoc) => {
    const rawUrl = readRawMediaUrl(mediaDoc)
    if (!rawUrl) throw new Error('Uploaded media did not include a URL')

    let nextID = ''
    updateScene((current) => {
      const nextImage = {
        id: createEditorNodeID('custom-image'),
        x: 180,
        y: 180,
        width: 240,
        height: 240,
        mediaID: mediaDoc.id,
        sourceUrl: rawUrl,
        alt: mediaDoc.alt || mediaDoc.title || mediaDoc.filename || 'Custom image',
      }
      nextID = nextImage.id
      return {
        ...current,
        customImages: [...current.customImages, nextImage],
        layers: appendEditorLayers(current.layers, [{ id: nextImage.id, kind: 'custom-image', group: 'custom' }]),
      }
    })
    if (nextID) setSelection({ kind: 'custom-image', id: nextID })
  }

  const updateCustomImage = (imageID: string, patch: Partial<CustomImageElement>) => {
    updateScene((current) => ({
      ...current,
      customImages: current.customImages.map((item) => (item.id === imageID ? { ...item, ...patch } : item)),
    }))
  }

  const updateCustomRect = (rectID: string, patch: Partial<CustomRectElement>) => {
    updateScene((current) => ({
      ...current,
      customRects: current.customRects.map((item) => (item.id === rectID ? { ...item, ...patch } : item)),
    }))
  }

  const updateCustomText = (textID: string, patch: Partial<CustomTextElement>) => {
    updateScene((current) => ({
      ...current,
      customTexts: current.customTexts.map((item) => (item.id === textID ? { ...item, ...patch } : item)),
    }))
  }

  const updateSelectionPosition = (x: number, y: number) => {
    if (!scene || !selection) return
    if (isLayerLocked(selection.kind, selection.id)) return
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
    if (selection.kind === 'custom-image') updateCustomImage(selection.id, { x, y })
    if (selection.kind === 'custom-rect') updateCustomRect(selection.id, { x, y })
    if (selection.kind === 'custom-text') updateCustomText(selection.id, { x, y })
    if (selection.kind === 'towns') {
      updateScene((current) => {
        const rows = current.townRows.filter((row) => row.included)
        const bounds = measureTownStackBounds(rows)
        const deltaX = x - bounds.x
        const deltaY = y - bounds.y
        return {
          ...current,
          townRows: current.townRows.map((row) =>
            row.included
              ? {
                  ...row,
                  labelX: row.labelX + deltaX,
                  labelY: row.labelY + deltaY,
                  amountX: row.amountX + deltaX,
                  amountY: row.amountY + deltaY,
                }
              : row,
          ),
        }
      })
    }
    if (selection.kind === 'towns-left' || selection.kind === 'towns-right') {
      updateScene((current) => {
        const includedRows = current.townRows.filter((row) => row.included)
        const rowsPerColumn = current.townColumns === 2 ? Math.ceil(includedRows.length / 2) : includedRows.length
        const columnRows =
          selection.kind === 'towns-left'
            ? includedRows.slice(0, rowsPerColumn)
            : includedRows.slice(rowsPerColumn)
        const bounds = measureTownStackBounds(columnRows)
        const columnRowIDs = new Set(columnRows.map((row) => row.id))
        const deltaX = x - bounds.x
        const deltaY = y - bounds.y
        return {
          ...current,
          townRows: current.townRows.map((row) =>
            columnRowIDs.has(row.id)
              ? {
                  ...row,
                  labelX: row.labelX + deltaX,
                  labelY: row.labelY + deltaY,
                  amountX: row.amountX + deltaX,
                  amountY: row.amountY + deltaY,
                }
              : row,
          ),
        }
      })
    }
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

  const resolveSelectedTextLayer = (current: ExperimentalTownScene, target: TextSelection) => {
    if (target.kind === 'eyebrow') return current.eyebrow
    if (target.kind === 'headline') return current.headline
    if (target.kind === 'subhead') return current.subhead
    if (target.kind === 'custom-text') return current.customTexts.find((item) => item.id === target.id) || null
    return current.footer
  }

  const updateSelectedTextLayer = (target: TextSelection, patch: Partial<SceneTextElement | SubheadElement | FooterElement>) => {
    updateScene((current) => {
      if (target.kind === 'eyebrow') return { ...current, eyebrow: { ...current.eyebrow, ...patch } }
      if (target.kind === 'headline') return syncSubheadToHeadline({ ...current, headline: { ...current.headline, ...patch } })
      if (target.kind === 'subhead') return { ...current, subhead: { ...current.subhead, ...patch } }
      if (target.kind === 'custom-text') {
        return {
          ...current,
          customTexts: current.customTexts.map((item) => (item.id === target.id ? { ...item, ...patch } : item)),
        }
      }
      return { ...current, footer: { ...current.footer, ...patch } }
    })
  }

  const switchTenantByOffset = (offset: -1 | 1) => {
    if (tenantIndex < 0) return
    const nextTenant = tenantOptions[tenantIndex + offset]
    if (!nextTenant) return
    setTenant({ id: nextTenant.value, refresh: true })
  }

  const getCurrentSceneBundle = (): MailSceneBundle | null => {
    if (!frontSceneRef.current || !backSceneRef.current) return null
    return buildMailSceneBundle(frontSceneRef.current, backSceneRef.current, activeMailSideRef.current)
  }

  const resolveTextLayer = (current: ExperimentalTownScene, target: TextSelection) => resolveSelectedTextLayer(current, target)

  const beginInlineTextEdit = (target: TextSelection) => {
    const currentScene = getActiveScene()
    if (!currentScene) return
    if (isLayerLocked(target.kind, target.id)) return
    const currentLayer = resolveTextLayer(currentScene, target)
    if (!currentLayer) return
    setSelection(target)
    setInlineTextEditor({ target, value: currentLayer.text || '' })
  }

  const commitInlineTextEdit = () => {
    if (!inlineTextEditor) return
    updateSelectedTextLayer(inlineTextEditor.target, { text: inlineTextEditor.value })
    setInlineTextEditor(null)
  }

  const resetCurrentSide = () => {
    if (!townData) return
    const nextScene = activeMailSide === 'front' ? createBaseScene(townData, tenantName) : createBackScene(townData, tenantName)
    clearUndoHistory(activeMailSide)
    setSceneWithoutHistory(nextScene, activeMailSide)
    setSelection(null)
    setInlineTextEditor(null)
    setMessage(`${activeMailSide === 'front' ? 'Front' : 'Back'} side reset`)
  }

  const resetAllSides = () => {
    if (!townData) return
    const nextFrontScene = createBaseScene(townData, tenantName)
    const nextBackScene = createBackScene(townData, tenantName)
    clearUndoHistory('front')
    clearUndoHistory('back')
    setSceneWithoutHistory(nextFrontScene, 'front')
    setSceneWithoutHistory(nextBackScene, 'back')
    setSelection(null)
    setInlineTextEditor(null)
    setMessage('Design reset to defaults')
  }

  const loadTemplate = (nextTemplateID: string) => {
    if (!scene || !townData) return
    setTemplateID(nextTemplateID)
    if (!nextTemplateID) {
      const frontBaseScene = createBaseScene(townData, tenantName)
      const backBaseScene = createBackScene(townData, tenantName)
      setSceneRevision(0)
      clearUndoHistory('front')
      clearUndoHistory('back')
      setSceneWithoutHistory(frontBaseScene, 'front')
      setSceneWithoutHistory(backBaseScene, 'back')
      setSelection(null)
      return
    }
    const template = templates.find((item) => item.id === nextTemplateID)
    if (!template) return
    const storedNotes = parseMailEditorNotes(template.notes)
    if (storedNotes?.selectedTenantID && storedNotes.selectedTenantID !== tenantID) {
      setTenant({ id: storedNotes.selectedTenantID, refresh: true })
      return
    }
    const frontBaseScene = createBaseScene(townData, tenantName)
    const backBaseScene = createBackScene(townData, tenantName)
    const savedBundle = isMailSceneBundle(template.scene) ? template.scene : null
    const savedScene = isExperimentalScene(template.scene) ? template.scene : null
    setTemplateTitle(template.title || 'Experimental Town Graphic')
    setSceneRevision(0)
    clearUndoHistory('front')
    clearUndoHistory('back')
    setSceneWithoutHistory(mergeSceneWithFreshData(savedBundle?.frontScene || savedScene, frontBaseScene), 'front')
    setSceneWithoutHistory(mergeSceneWithFreshData(savedBundle?.backScene || savedScene, backBaseScene), 'back')
    setActiveMailSide(savedBundle?.activeMailSide || DEFAULT_MAIL_SIDE)
    setSelection(null)
    setInlineTextEditor(null)
  }

  const loadDesign = (nextDesignID: string) => {
    if (!scene || !townData) return
    setDesignID(nextDesignID)
    if (!nextDesignID) {
      const frontBaseScene = createBaseScene(townData, tenantName)
      const backBaseScene = createBackScene(townData, tenantName)
      setSceneRevision(0)
      clearUndoHistory('front')
      clearUndoHistory('back')
      setSceneWithoutHistory(frontBaseScene, 'front')
      setSceneWithoutHistory(backBaseScene, 'back')
      setSelection(null)
      return
    }
    const design = designs.find((item) => item.id === nextDesignID)
    if (!design) return
    const storedNotes = parseMailEditorNotes(design.notes)
    if (storedNotes?.selectedTenantID && storedNotes.selectedTenantID !== tenantID) {
      setTenant({ id: storedNotes.selectedTenantID, refresh: true })
      return
    }
    const frontBaseScene = createBaseScene(townData, tenantName)
    const backBaseScene = createBackScene(townData, tenantName)
    const savedBundle = isMailSceneBundle(design.scene) ? design.scene : null
    const savedScene = isExperimentalScene(design.scene) ? design.scene : null
    setDesignTitle(design.title || 'Town Graphic')
    setTemplateID(getString(asRecord(design.template).id) || getString(design.template) || '')
    setSceneRevision(0)
    clearUndoHistory('front')
    clearUndoHistory('back')
    setSceneWithoutHistory(mergeSceneWithFreshData(savedBundle?.frontScene || savedScene, frontBaseScene), 'front')
    setSceneWithoutHistory(mergeSceneWithFreshData(savedBundle?.backScene || savedScene, backBaseScene), 'back')
    setActiveMailSide(savedBundle?.activeMailSide || DEFAULT_MAIL_SIDE)
    setSelection(null)
    setInlineTextEditor(null)
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
    return mediaDoc
  }

  const handleAddCustomImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      setMessage(null)
      const mediaDoc = await uploadMediaAsset(file, file.name.replace(/\.[^.]+$/, ''))
      addCustomImage(mediaDoc)
      setMessage('Image added')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  const insertComponent = (componentID: string, side: MailSide = activeMailSide) => {
    const component = EDITOR_COMPONENTS.find((item) => item.id === componentID)
    if (!component) return
    const bundle = component.build({
      brandBlue: BRAND_BLUE,
      brandRed: BRAND_RED,
      stageHeight: STAGE_HEIGHT,
      stageWidth: STAGE_WIDTH,
      websiteText: WEBSITE_TEXT,
    })
    let selectedID = ''
    updateScene((current) => {
      selectedID = bundle.texts[0]?.id || bundle.rects[0]?.id || ''
      return {
        ...current,
        customRects: [...current.customRects, ...bundle.rects],
        customTexts: [...current.customTexts, ...bundle.texts],
        layers: appendEditorLayers(current.layers, [
          ...bundle.rects.map((item) => ({ id: item.id, kind: 'custom-rect' as const, group: 'custom' as const })),
          ...bundle.texts.map((item) => ({ id: item.id, kind: 'custom-text' as const, group: 'custom' as const })),
        ]),
      }
    }, side)
    if (selectedID) {
      const isText = bundle.texts.some((item) => item.id === selectedID)
      setSelection(isText ? { kind: 'custom-text', id: selectedID } : { kind: 'custom-rect', id: selectedID })
    }
    setMessage(`${component.label} inserted on ${side}`)
  }

  const duplicateSelectedCustomObject = (side: MailSide = activeMailSide) => {
    const currentScene = getActiveScene(side)
    if (!currentScene || !selection) return false

    if (selection.kind === 'custom-rect') {
      const current = currentScene.customRects.find((item) => item.id === selection.id)
      if (!current) return false
      const nextRect = duplicateRect(current)
      updateScene((draft) => ({
        ...draft,
        customRects: [...draft.customRects, nextRect],
        layers: appendEditorLayers(draft.layers, [{ id: nextRect.id, kind: 'custom-rect', group: 'custom' }]),
      }), side)
      setSelection({ kind: 'custom-rect', id: nextRect.id })
      return true
    }

    if (selection.kind === 'custom-text') {
      const current = currentScene.customTexts.find((item) => item.id === selection.id)
      if (!current) return false
      const nextText = duplicateText(current)
      updateScene((draft) => ({
        ...draft,
        customTexts: [...draft.customTexts, nextText],
        layers: appendEditorLayers(draft.layers, [{ id: nextText.id, kind: 'custom-text', group: 'custom' }]),
      }), side)
      setSelection({ kind: 'custom-text', id: nextText.id })
      return true
    }

    if (selection.kind === 'custom-image') {
      const current = currentScene.customImages.find((item) => item.id === selection.id)
      if (!current) return false
      const nextImage = duplicateImage(current)
      updateScene((draft) => ({
        ...draft,
        customImages: [...draft.customImages, nextImage],
        layers: appendEditorLayers(draft.layers, [{ id: nextImage.id, kind: 'custom-image', group: 'custom' }]),
      }), side)
      setSelection({ kind: 'custom-image', id: nextImage.id })
      return true
    }

    return false
  }

  const deleteSelectedCustomObject = (side: MailSide = activeMailSide) => {
    if (!selection) return false

    if (selection.kind === 'custom-rect') {
      updateScene((current) => ({
        ...current,
        customRects: current.customRects.filter((item) => item.id !== selection.id),
        layers: removeEditorLayers(current.layers, [{ id: selection.id, kind: 'custom-rect' }]),
      }), side)
      setSelection(null)
      return true
    }

    if (selection.kind === 'custom-text') {
      updateScene((current) => ({
        ...current,
        customTexts: current.customTexts.filter((item) => item.id !== selection.id),
        layers: removeEditorLayers(current.layers, [{ id: selection.id, kind: 'custom-text' }]),
      }), side)
      setSelection(null)
      return true
    }

    if (selection.kind === 'custom-image') {
      updateScene((current) => ({
        ...current,
        customImages: current.customImages.filter((item) => item.id !== selection.id),
        layers: removeEditorLayers(current.layers, [{ id: selection.id, kind: 'custom-image' }]),
      }), side)
      setSelection(null)
      return true
    }

    return false
  }

  const copySelectedCustomObject = (side: MailSide = activeMailSide) => {
    const currentScene = getActiveScene(side)
    if (!currentScene || !selection || isLayerLocked(selection.kind, selection.id)) return false

    if (selection.kind === 'custom-rect') {
      const current = currentScene.customRects.find((item) => item.id === selection.id)
      if (!current) return false
      setEditorClipboard({ kind: 'custom-rect', payload: current })
      return true
    }

    if (selection.kind === 'custom-text') {
      const current = currentScene.customTexts.find((item) => item.id === selection.id)
      if (!current) return false
      setEditorClipboard({ kind: 'custom-text', payload: current })
      return true
    }

    if (selection.kind === 'custom-image') {
      const current = currentScene.customImages.find((item) => item.id === selection.id)
      if (!current) return false
      setEditorClipboard({ kind: 'custom-image', payload: current })
      return true
    }

    return false
  }

  const pasteClipboardObject = (side: MailSide = activeMailSide) => {
    const clipboard = readEditorClipboard()
    if (!clipboard) return false

    if (clipboard.kind === 'custom-rect') {
      const nextRect = duplicateRect(clipboard.payload)
      updateScene((current) => ({
        ...current,
        customRects: [...current.customRects, nextRect],
        layers: appendEditorLayers(current.layers, [{ id: nextRect.id, kind: 'custom-rect', group: 'custom' }]),
      }), side)
      setEditorClipboard({ kind: 'custom-rect', payload: nextRect })
      setSelection({ kind: 'custom-rect', id: nextRect.id })
      return true
    }

    if (clipboard.kind === 'custom-text') {
      const nextText = duplicateText(clipboard.payload)
      updateScene((current) => ({
        ...current,
        customTexts: [...current.customTexts, nextText],
        layers: appendEditorLayers(current.layers, [{ id: nextText.id, kind: 'custom-text', group: 'custom' }]),
      }), side)
      setEditorClipboard({ kind: 'custom-text', payload: nextText })
      setSelection({ kind: 'custom-text', id: nextText.id })
      return true
    }

    if (clipboard.kind === 'custom-image') {
      const nextImage = duplicateImage(clipboard.payload as CustomImageElement)
      updateScene((current) => ({
        ...current,
        customImages: [...current.customImages, nextImage],
        layers: appendEditorLayers(current.layers, [{ id: nextImage.id, kind: 'custom-image', group: 'custom' }]),
      }), side)
      setEditorClipboard({ kind: 'custom-image', payload: nextImage })
      setSelection({ kind: 'custom-image', id: nextImage.id })
      return true
    }

    return false
  }

  const nudgeSelectedObject = (deltaX: number, deltaY: number, side: MailSide = activeMailSide) => {
    if (!selection) return false
    if (isLayerLocked(selection.kind, selection.id)) return false

    if (selection.kind === 'custom-rect') {
      const current = getActiveScene(side)?.customRects.find((item) => item.id === selection.id)
      if (!current) return false
      updateCustomRect(selection.id, { x: current.x + deltaX, y: current.y + deltaY })
      return true
    }

    if (selection.kind === 'custom-text') {
      const current = getActiveScene(side)?.customTexts.find((item) => item.id === selection.id)
      if (!current) return false
      updateCustomText(selection.id, { x: current.x + deltaX, y: current.y + deltaY })
      return true
    }

    if (selection.kind === 'custom-image') {
      const current = getActiveScene(side)?.customImages.find((item) => item.id === selection.id)
      if (!current) return false
      updateCustomImage(selection.id, { x: current.x + deltaX, y: current.y + deltaY })
      return true
    }

    return false
  }

  const buildTemplatePayload = () => {
    const bundle = getCurrentSceneBundle()
    if (!bundle) throw new Error('No scene available')
    return {
      title: templateTitle || 'Experimental Town Graphic',
      sourceCollection: 'pages',
      scene: bundle,
      notes: stringifyMailEditorNotes(selectedTenantID ? String(selectedTenantID) : tenantID),
    }
  }

  const buildDesignPayload = (exportedMediaID?: string | null) => {
    const bundle = getCurrentSceneBundle()
    if (!bundle) throw new Error('No scene available')
    return {
      title: designTitle || buildDesignTitle(townData?.tenant?.name || tenantName, 'Town Graphic'),
      template: templateID || null,
      sourceCollection: 'pages',
      sourcePost: null,
      primaryTenant: tenantID || null,
      secondaryTenant: null,
      titleOverride: bundle.frontScene.headline.text || null,
      scene: bundle,
      exportedMedia: exportedMediaID ?? null,
      notes: stringifyMailEditorNotes(selectedTenantID ? String(selectedTenantID) : tenantID),
      tenant: tenantID || null,
    }
  }

  const moveTownRow = (rowID: string, direction: -1 | 1) => {
    updateScene((current) => {
      const index = current.townRows.findIndex((row) => row.id === rowID)
      if (index === -1) return current
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= current.townRows.length) return current
      const nextRows = [...current.townRows]
      const [movedRow] = nextRows.splice(index, 1)
      if (!movedRow) return current
      nextRows.splice(nextIndex, 0, movedRow)
      return relayoutTownRows({ ...current, townRows: nextRows }, current.townColumns)
    })
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
          const normalizedSavedDoc = sanitizeTemplateDoc(savedDoc)
          const next = [normalizedSavedDoc, ...current.filter((item) => item.id !== normalizedSavedDoc.id)]
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
    const savedDoc = sanitizeDesignDoc(((asRecord(data).doc || data) as DesignDoc) || null)
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
      markSaved()
      setMessage('Design saved')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setSavingDesign(false)
    }
  }

  const { autosaveState, markSaved, resetAutosave } = useEditorAutosave({
    enabled: Boolean(scene && !loading),
    revision: sceneRevision,
    onError: (message) => setMessage(message),
    onSave: async () => {
      await saveDesign()
    },
  })

  useEffect(() => {
    if (loading) return
    if (sceneRevision === 0) resetAutosave()
  }, [loading, resetAutosave, sceneRevision])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return

      const modifier = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()

      if (modifier && !event.shiftKey && key === 'z') {
        event.preventDefault()
        undoLastChange()
        return
      }

      if ((modifier && event.shiftKey && key === 'z') || (modifier && key === 'y')) {
        event.preventDefault()
        redoLastChange()
        return
      }

      if (modifier && key === 'd') {
        if (!duplicateSelectedCustomObject()) return
        event.preventDefault()
        return
      }

      if (modifier && key === 'c') {
        if (!copySelectedCustomObject()) return
        event.preventDefault()
        return
      }

      if (modifier && key === 'v') {
        if (!pasteClipboardObject()) return
        event.preventDefault()
        return
      }

      if (modifier && key === 's') {
        event.preventDefault()
        void handleSaveDesign()
        return
      }

      if (event.key === 'Escape') {
        setSelection(null)
        setInlineTextEditor(null)
        return
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (!deleteSelectedCustomObject()) return
        event.preventDefault()
        return
      }

      if (event.key.startsWith('Arrow')) {
        const distance = getShortcutNudgeDistance(event)
        const deltaX = event.key === 'ArrowLeft' ? -distance : event.key === 'ArrowRight' ? distance : 0
        const deltaY = event.key === 'ArrowUp' ? -distance : event.key === 'ArrowDown' ? distance : 0
        if (!deltaX && !deltaY) return
        if (!nudgeSelectedObject(deltaX, deltaY)) return
        event.preventDefault()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    copySelectedCustomObject,
    deleteSelectedCustomObject,
    duplicateSelectedCustomObject,
    handleSaveDesign,
    nudgeSelectedObject,
    pasteClipboardObject,
    redoLastChange,
    undoLastChange,
  ])

  const waitForStagePaint = async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined))))
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
    await waitForStagePaint()
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
      markSaved()
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
      const filenameBase = `${(designTitle || templateTitle || townData?.tenant?.slug || 'town-graphic')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')}-${activeMailSideRef.current}`
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

  const downloadPptx = async () => {
    try {
      setDownloadingPptx(true)
      const bundle = getCurrentSceneBundle()
      if (!bundle) throw new Error('No scene bundle available for PPTX export')
      const filenameBase = (designTitle || templateTitle || townData?.tenant?.slug || 'town-graphic')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')

      const [frontCircularHeadshotDataUrl, backCircularHeadshotDataUrl] = await Promise.all([
        buildCircularHeadshotDataUrl({
          image: headshotImage,
          placement: headshotPlacement,
          size: bundle.frontScene.headshot.size,
        }),
        buildCircularHeadshotDataUrl({
          image: headshotImage,
          placement: backHeadshotPlacement,
          size: bundle.backScene.headshot.size,
        }),
      ])

      const response = await fetch('/api/graphics-editor-mail/pptx', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          filenameBase,
          title: designTitle || templateTitle || 'Mailer Graphic',
          frontScene: bundle.frontScene,
          backScene: bundle.backScene,
          frontCircularHeadshotDataUrl: frontCircularHeadshotDataUrl || null,
          backCircularHeadshotDataUrl: backCircularHeadshotDataUrl || null,
        }),
      })
      if (!response.ok) {
        const message = await response.text()
        throw new Error(message || `PPTX export failed (${response.status})`)
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${filenameBase || 'town-graphic'}.pptx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setMessage('PPTX downloaded')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setDownloadingPptx(false)
    }
  }

  const downloadTemplateXml = async () => {
    try {
      const bundle = getCurrentSceneBundle()
      if (!bundle) throw new Error('No scene bundle available')
      const xml = sceneBundleToXml(bundle, townData?.tenant?.name || tenantName || tenantID || 'unknown-tenant')
      const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' })
      const filenameBase = (designTitle || templateTitle || townData?.tenant?.slug || 'town-graphic')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${filenameBase || 'town-graphic'}.xml`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setMessage('Template XML downloaded')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  const exportAllRepsZip = async () => {
    if (!tenantOptions.length) return

    try {
      setExportingAllReps(true)
      setMailExportJob(null)
      setMessage('Starting server export…')
      const response = await fetch('/api/graphics-editor-mail/export-all', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          tenantOptions,
          requestedDesignID,
          requestedTemplateID,
        }),
      })
      const json = (await response.json()) as { jobID?: string; message?: string }
      if (!response.ok || !json.jobID) {
        throw new Error(getString(asRecord(json).message) || 'Failed to start export job')
      }
      setMailExportJob({
        id: json.jobID,
        status: 'queued',
        total: tenantOptions.length,
        completed: 0,
        currentTenantLabel: null,
        skippedCount: 0,
        error: null,
        downloadName: 'graphics-editor-mail-all-reps.zip',
        downloadUrl: null,
      })
      setMessage('Server export started…')
    } catch (error) {
      setExportingAllReps(false)
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  const downloadMailExportJob = () => {
    if (!mailExportJob?.downloadUrl) return
    const link = document.createElement('a')
    link.href = mailExportJob.downloadUrl
    link.download = mailExportJob.downloadName
    document.body.appendChild(link)
    link.click()
    link.remove()
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
              : selection?.kind === 'custom-image' && selectedCustomImage
                ? (
                    <div style={slotCardStyle}>
                      <strong style={{ fontSize: 13 }}>Selected: Image</strong>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={fieldLabelStyle}>X</span>
                        <input type="number" value={Math.round(selectedCustomImage.x)} onChange={(event) => updateSelectionPosition(Number(event.target.value), selectedCustomImage.y)} style={controlStyle} />
                      </label>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={fieldLabelStyle}>Y</span>
                        <input type="number" value={Math.round(selectedCustomImage.y)} onChange={(event) => updateSelectionPosition(selectedCustomImage.x, Number(event.target.value))} style={controlStyle} />
                      </label>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={fieldLabelStyle}>Width</span>
                        <input type="number" value={Math.round(selectedCustomImage.width)} onChange={(event) => updateCustomImage(selectedCustomImage.id, { width: Math.max(20, Number(event.target.value) || selectedCustomImage.width) })} style={controlStyle} />
                      </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={fieldLabelStyle}>Height</span>
                      <input type="number" value={Math.round(selectedCustomImage.height)} onChange={(event) => updateCustomImage(selectedCustomImage.id, { height: Math.max(20, Number(event.target.value) || selectedCustomImage.height) })} style={controlStyle} />
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={fieldLabelStyle}>Rotation</span>
                      <input type="number" step={0.1} value={selectedCustomImage.rotation || 0} onChange={(event) => updateCustomImage(selectedCustomImage.id, { rotation: Number(event.target.value) || 0 })} style={controlStyle} />
                    </label>
                  </div>
                )
                : selection?.kind === 'custom-rect' && selectedCustomRect
                ? (
                    <div style={slotCardStyle}>
                      <strong style={{ fontSize: 13 }}>Selected: Rectangle</strong>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={fieldLabelStyle}>Fill</span>
                        <input value={selectedCustomRect.fill} onChange={(event) => updateCustomRect(selectedCustomRect.id, { fill: event.target.value })} style={controlStyle} />
                      </label>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={fieldLabelStyle}>X</span>
                        <input type="number" value={Math.round(selectedCustomRect.x)} onChange={(event) => updateSelectionPosition(Number(event.target.value), selectedCustomRect.y)} style={controlStyle} />
                      </label>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={fieldLabelStyle}>Y</span>
                        <input type="number" value={Math.round(selectedCustomRect.y)} onChange={(event) => updateSelectionPosition(selectedCustomRect.x, Number(event.target.value))} style={controlStyle} />
                      </label>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={fieldLabelStyle}>Width</span>
                        <input type="number" value={Math.round(selectedCustomRect.width)} onChange={(event) => updateCustomRect(selectedCustomRect.id, { width: Number(event.target.value) || selectedCustomRect.width })} style={controlStyle} />
                      </label>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={fieldLabelStyle}>Height</span>
                        <input type="number" value={Math.round(selectedCustomRect.height)} onChange={(event) => updateCustomRect(selectedCustomRect.id, { height: Number(event.target.value) || selectedCustomRect.height })} style={controlStyle} />
                      </label>
                    </div>
                  )
                : selection?.kind === 'custom-text' && selectedCustomText
                  ? (
                    <div style={slotCardStyle}>
                      <strong style={{ fontSize: 13 }}>Selected: Text Box</strong>
                        <label style={{ display: 'grid', gap: 6 }}>
                          <span style={fieldLabelStyle}>Rotation</span>
                          <input type="number" step={0.1} value={selectedCustomText.rotation || 0} onChange={(event) => updateCustomText(selectedCustomText.id, { rotation: Number(event.target.value) || 0 })} style={controlStyle} />
                        </label>
                        <label style={{ display: 'grid', gap: 6 }}>
                          <span style={fieldLabelStyle}>Text</span>
                          <textarea value={selectedCustomText.text} onChange={(event) => updateCustomText(selectedCustomText.id, { text: event.target.value })} style={{ ...controlStyle, resize: 'vertical', minHeight: 120 }} />
                        </label>
                        <label style={{ display: 'grid', gap: 6 }}>
                          <span style={fieldLabelStyle}>X</span>
                          <input type="number" value={Math.round(selectedCustomText.x)} onChange={(event) => updateSelectionPosition(Number(event.target.value), selectedCustomText.y)} style={controlStyle} />
                        </label>
                        <label style={{ display: 'grid', gap: 6 }}>
                          <span style={fieldLabelStyle}>Y</span>
                          <input type="number" value={Math.round(selectedCustomText.y)} onChange={(event) => updateSelectionPosition(selectedCustomText.x, Number(event.target.value))} style={controlStyle} />
                        </label>
                        <label style={{ display: 'grid', gap: 6 }}>
                          <span style={fieldLabelStyle}>Width</span>
                          <input type="number" value={Math.round(selectedCustomText.width)} onChange={(event) => updateCustomText(selectedCustomText.id, { width: Number(event.target.value) || selectedCustomText.width })} style={controlStyle} />
                        </label>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={fieldLabelStyle}>Height</span>
                        <input type="number" value={Math.round(selectedCustomText.height || measureCustomTextHeight(selectedCustomText))} onChange={(event) => updateCustomText(selectedCustomText.id, { height: Math.max(measureCustomTextHeight(selectedCustomText), Number(event.target.value) || selectedCustomText.height || 0) })} style={controlStyle} />
                      </label>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={fieldLabelStyle}>Font size</span>
                        <input type="number" value={Math.round(selectedCustomText.fontSize)} onChange={(event) => updateCustomText(selectedCustomText.id, { fontSize: Number(event.target.value) || selectedCustomText.fontSize })} style={controlStyle} />
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
                          <span style={fieldLabelStyle}>Bar width</span>
                          <input type="number" value={Math.round(getRenderedTownLabelWidth(selectedTownRow))} readOnly style={{ ...controlStyle, background: '#f8fafc' }} />
                        </label>
                        <label style={{ display: 'grid', gap: 6 }}>
                          <span style={fieldLabelStyle}>Amount font size</span>
                          <input type="number" value={Math.round(selectedTownRow.amountFontSize)} onChange={(event) => updateTownRow(selectedTownRow.id, { amountFontSize: Number(event.target.value) })} style={controlStyle} />
                        </label>
                      </div>
                    )
                  : null

  const selectedTextLayer = selectedTextTarget ? resolveSelectedTextLayer(scene, selectedTextTarget) : null
  const isTextToolbarActive = Boolean(selectedTextTarget && selectedTextLayer && !selectedLayer?.locked)
  const selectedTextFontFlags = getFontStyleFlags(selectedTextLayer?.fontStyle)
  const applySelectedTextFormatting = (
    patch: Partial<SceneTextElement | SubheadElement | FooterElement | CustomTextElement>,
  ) => {
    if (!selectedTextTarget || !selectedTextLayer || selectedLayer?.locked) return
    updateSelectedTextLayer(selectedTextTarget, patch)
  }
  const toggleSelectedTextBold = () => {
    if (!selectedTextLayer) return
    applySelectedTextFormatting({
      fontStyle: buildFontStyle({
        bold: !selectedTextFontFlags.bold,
        italic: selectedTextFontFlags.italic,
      }),
    })
  }
  const toggleSelectedTextItalic = () => {
    if (!selectedTextLayer) return
    applySelectedTextFormatting({
      fontStyle: buildFontStyle({
        bold: selectedTextFontFlags.bold,
        italic: !selectedTextFontFlags.italic,
      }),
    })
  }
  const selectedTextInspectorPanel = selectedTextLayer ? (
    <div style={slotCardStyle}>
      <strong style={{ fontSize: 13 }}>Text Styling</strong>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" style={selectedTextFontFlags.bold ? activeToolbarButtonStyle : toolbarButtonStyle} onClick={toggleSelectedTextBold}>
          Bold
        </button>
        <button type="button" style={selectedTextFontFlags.italic ? activeToolbarButtonStyle : toolbarButtonStyle} onClick={toggleSelectedTextItalic}>
          Italic
        </button>
        <button
          type="button"
          style={selectedTextLayer.textDecoration === 'underline' ? activeToolbarButtonStyle : toolbarButtonStyle}
          onClick={() => applySelectedTextFormatting({ textDecoration: selectedTextLayer.textDecoration === 'underline' ? 'none' : 'underline' })}
        >
          Underline
        </button>
      </div>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={fieldLabelStyle}>Font</span>
          <select
            value={selectedTextLayer.fontFamily || TEXT_FONT_OPTIONS[0].value}
            onChange={(event) => applySelectedTextFormatting({ fontFamily: event.target.value })}
            style={controlStyle}
          >
            {TEXT_FONT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={fieldLabelStyle}>Align</span>
          <select
            value={selectedTextLayer.textAlign || 'left'}
            onChange={(event) => applySelectedTextFormatting({ textAlign: event.target.value as 'left' | 'center' | 'right' })}
            style={controlStyle}
          >
            {TEXT_ALIGNMENT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={fieldLabelStyle}>Font size</span>
          <input
            type="number"
            min={10}
            max={200}
            step={1}
            value={Math.round(selectedTextLayer.fontSize)}
            onChange={(event) => applySelectedTextFormatting({ fontSize: Number(event.target.value) || selectedTextLayer.fontSize })}
            style={controlStyle}
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={fieldLabelStyle}>Line height</span>
          <input
            type="number"
            min={0.8}
            max={2}
            step={0.05}
            value={selectedTextLayer.lineHeight || 1}
            onChange={(event) => applySelectedTextFormatting({ lineHeight: Number(event.target.value) || selectedTextLayer.lineHeight || 1 })}
            style={controlStyle}
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={fieldLabelStyle}>Letter spacing</span>
          <input
            type="number"
            min={-2}
            max={30}
            step={0.5}
            value={selectedTextLayer.letterSpacing || 0}
            onChange={(event) => applySelectedTextFormatting({ letterSpacing: Number(event.target.value) || 0 })}
            style={controlStyle}
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={fieldLabelStyle}>Color</span>
          <input
            type="color"
            value={selectedTextLayer.color || '#111111'}
            onChange={(event) => applySelectedTextFormatting({ color: event.target.value })}
            style={{ ...controlStyle, minHeight: 44, padding: 6 }}
          />
        </label>
      </div>
    </div>
  ) : null
  const stageOffsetX = Math.max(0, (stageContainerWidth - previewWidth) / 2)
  const inlineEditorBox =
    inlineTextEditor
      ? (() => {
          const currentLayer = resolveTextLayer(scene, inlineTextEditor.target)
          if (!currentLayer) return null
          const inlineWidth =
            inlineTextEditor.target.kind === 'subhead'
              ? scene.subhead.dividerWidth
              : inlineTextEditor.target.kind === 'footer'
                ? scene.footer.width
                : (currentLayer as SceneTextElement).width
          const width =
            inlineTextEditor.target.kind === 'subhead' && activeMailSide === 'front'
              ? Math.max(220, scene.subhead.dividerWidth * previewScale)
              : Math.max(180, inlineWidth * previewScale)
          const height =
            inlineTextEditor.target.kind === 'headline'
              ? Math.max(180, measureHeadlineHeight(scene.headline) * previewScale)
              : inlineTextEditor.target.kind === 'subhead'
                ? Math.max(88, ((scene.subhead.fontSize || 28) + 28) * previewScale)
                : Math.max(96, Math.max(72, ((currentLayer.fontSize || 28) * (currentLayer.lineHeight || 1.12) * 2.4) * previewScale))
          return {
            left: stageOffsetX + currentLayer.x * previewScale,
            top: currentLayer.y * previewScale,
            width,
            height,
          }
        })()
      : null

  const headshotPlacement = computeCoverPlacement(headshotImage, scene.headshot.size, scene.headshot.size, scene.headshot.crop)
  const backHeadshotPlacement = computeCoverPlacement(
    headshotImage,
    scene.headshot.size,
    scene.headshot.size,
    scene.headshot.crop,
  )

  const renderTownStack = (
    rows: TownSceneRow[],
    bounds: { x: number; y: number; width: number; height: number },
    stackSelection: Extract<Selection, { kind: 'towns' | 'towns-left' | 'towns-right' }>,
    stackRef: React.MutableRefObject<Konva.Group | null>,
  ) => (
    <Group
      ref={stackRef}
      x={bounds.x}
      y={bounds.y}
      draggable={rows.length > 0 && !rows.some((row) => isLayerLocked('town', row.id))}
      onDragEnd={(event) => {
        setSelection(stackSelection)
        updateSelectionPosition(event.target.x(), event.target.y())
      }}
      onMouseDown={() => setSelection(stackSelection)}
      onTransformEnd={(event) => {
        const node = event.target
        const rawScale = Math.max(node.scaleX(), node.scaleY())
        const nextBoundsWidth = clamp(
          Math.round(bounds.width * rawScale),
          TOWN_LABEL_WIDTH_LIMITS.min,
          STAGE_WIDTH - 40,
        )
        const nextBoundsHeight = clamp(
          Math.round(bounds.height * rawScale),
          TOWN_GROUP_HEIGHT_LIMITS.min,
          STAGE_HEIGHT - 80,
        )
        const uniformScale = Math.min(
          nextBoundsWidth / Math.max(bounds.width, 1),
          nextBoundsHeight / Math.max(bounds.height, 1),
        )
        const originX = bounds.x
        const originY = bounds.y
        const rowIDs = new Set(rows.map((row) => row.id))

        node.scaleX(1)
        node.scaleY(1)

        updateScene((current) => ({
          ...current,
          townRows: current.townRows.map((row) => {
            if (!rowIDs.has(row.id)) return row

            const relativeX = row.labelX - originX
            const relativeY = row.labelY - originY
            const nextTownFontSize = clamp(
              Math.round(row.townFontSize * uniformScale),
              TOWN_FONT_SIZE_LIMITS.min,
              TOWN_FONT_SIZE_LIMITS.max,
            )
            const nextLabelWidth = measureTownLabelWidth(row.town, nextTownFontSize)
            const nextLabelHeight = clamp(
              Math.round(row.labelHeight * uniformScale),
              TOWN_LABEL_HEIGHT_LIMITS.min,
              TOWN_LABEL_HEIGHT_LIMITS.max,
            )
            const nextAmountFontSize = clamp(
              Math.round(row.amountFontSize * uniformScale),
              TOWN_AMOUNT_FONT_SIZE_LIMITS.min,
              TOWN_AMOUNT_FONT_SIZE_LIMITS.max,
            )
            const nextLabelX = node.x() + Math.round(relativeX * uniformScale)
            const nextLabelY = node.y() + Math.round(relativeY * uniformScale)
            const nextAmountOffsetX = Math.max(0, Math.round((row.amountX - row.labelX) * uniformScale))
            const nextAmountGap = clamp(
              Math.round((row.amountY - row.labelY - row.labelHeight) * uniformScale),
              10,
              40,
            )
            const nextAmountOffsetY = nextLabelHeight + nextAmountGap

            return {
              ...row,
              labelX: nextLabelX,
              labelY: nextLabelY,
              labelWidth: nextLabelWidth,
              labelHeight: nextLabelHeight,
              townFontSize: nextTownFontSize,
              amountFontSize: nextAmountFontSize,
              amountX: nextLabelX + nextAmountOffsetX,
              amountY: nextLabelY + nextAmountOffsetY,
            }
          }),
        }))
      }}
    >
      {selection?.kind === stackSelection.kind ? (
        <Rect
          x={-10}
          y={-12}
          width={bounds.width + 20}
          height={bounds.height + 24}
          stroke="#0ea5e9"
          dash={[10, 6]}
          cornerRadius={12}
        />
      ) : null}
      {rows.map((row) => (
        <Group
          key={row.id}
          ref={(node) => {
            townRefs.current[row.id] = node
          }}
          x={row.labelX - bounds.x}
          y={row.labelY - bounds.y}
        >
          <Rect width={getRenderedTownLabelWidth(row)} height={row.labelHeight} fill={row.labelColor} />
          <Text
            x={14}
            y={8}
            width={getRenderedTownLabelWidth(row) - 22}
            text={row.town.toUpperCase()}
            fontFamily="Arial"
            fontSize={row.townFontSize}
            fontStyle="700"
            fill="#ffffff"
          />
          <Text
            x={row.amountX - row.labelX}
            y={row.amountY - row.labelY}
            text={formatCurrency(row.strapAid)}
            fontFamily="Arial"
            fontSize={row.amountFontSize}
            fontStyle="700"
            fill={row.textColor}
          />
        </Group>
      ))}
    </Group>
  )

  const renderCustomImageNode = (item: CustomImageElement) => {
    const rotation = item.rotation || 0
    const hidden = isLayerHidden('custom-image', item.id)
    const locked = isLayerLocked('custom-image', item.id)
    if (hidden) return null

    return (
      <Group
        key={item.id}
        ref={(node) => {
          customImageRefs.current[item.id] = node
        }}
        x={item.x + item.width / 2}
        y={item.y + item.height / 2}
        offsetX={item.width / 2}
        offsetY={item.height / 2}
        rotation={rotation}
        draggable={!locked}
        onDragEnd={(event) => {
          if (locked) return
          const node = event.target
          setSelection({ kind: 'custom-image', id: item.id })
          updateCustomImage(item.id, {
            x: node.x() - item.width / 2,
            y: node.y() - item.height / 2,
          })
        }}
        onMouseDown={() => {
          if (locked) return
          setSelection({ kind: 'custom-image', id: item.id })
        }}
        onTransformEnd={(event) => {
          if (locked) return
          const node = event.target
          const nextWidth = Math.max(20, Math.round(item.width * node.scaleX()))
          const nextHeight = Math.max(20, Math.round(item.height * node.scaleY()))
          const nextRotation = Number(node.rotation().toFixed(1))
          node.scaleX(1)
          node.scaleY(1)
          node.offsetX(nextWidth / 2)
          node.offsetY(nextHeight / 2)
          updateCustomImage(item.id, {
            x: node.x() - nextWidth / 2,
            y: node.y() - nextHeight / 2,
            width: nextWidth,
            height: nextHeight,
            rotation: nextRotation,
          })
        }}
      >
        {selection?.kind === 'custom-image' && selection.id === item.id ? (
          <Rect x={-8} y={-8} width={item.width + 16} height={item.height + 16} stroke="#0ea5e9" dash={[10, 6]} cornerRadius={10} />
        ) : null}
        {customImages[item.id] ? (
          <KonvaImage image={customImages[item.id] || undefined} width={item.width} height={item.height} />
        ) : (
          <Rect width={item.width} height={item.height} fill="#e2e8f0" stroke="#94a3b8" dash={[8, 4]} />
        )}
      </Group>
    )
  }

  const renderCustomTextNode = (item: CustomTextElement) => {
    const textHeight = measureCustomTextHeight(item)
    const rotation = item.rotation || 0
    const hidden = isLayerHidden('custom-text', item.id)
    const locked = isLayerLocked('custom-text', item.id)
    if (hidden) return null

    return (
      <Group
        key={item.id}
        ref={(node) => {
          customTextRefs.current[item.id] = node
        }}
        x={item.x + item.width / 2}
        y={item.y + textHeight / 2}
        offsetX={item.width / 2}
        offsetY={textHeight / 2}
        rotation={rotation}
        draggable={!locked}
        onDragEnd={(event) => {
          if (locked) return
          const node = event.target
          setSelection({ kind: 'custom-text', id: item.id })
          updateCustomText(item.id, {
            x: node.x() - item.width / 2,
            y: node.y() - textHeight / 2,
          })
        }}
        onMouseDown={() => {
          if (locked) return
          setSelection({ kind: 'custom-text', id: item.id })
        }}
        onTransformStart={() => setIsResizingHeadline(true)}
        onTransformEnd={(event) => {
          if (locked) return
          const node = event.target
          const activeAnchor = transformerRef.current?.getActiveAnchor() || ''
          const isHorizontalEdge = activeAnchor === 'middle-left' || activeAnchor === 'middle-right'
          const isVerticalEdge = activeAnchor === 'top-center' || activeAnchor === 'bottom-center'
          const isCorner = !isHorizontalEdge && !isVerticalEdge
          const nextWidth = isVerticalEdge ? item.width : Math.max(80, Math.round(item.width * Math.max(Math.abs(node.scaleX()), 0.1)))
          const nextFontSize = isCorner
            ? getResizedTextTransform({
                fontSize: item.fontSize,
                minFontSize: 12,
                minWidth: 80,
                scaleX: node.scaleX(),
                scaleY: node.scaleY(),
                width: item.width,
              }).nextFontSize
            : item.fontSize
          const nextRotation = Number(node.rotation().toFixed(1))
          const measuredNextHeight = measureCustomTextHeight({ ...item, width: nextWidth, fontSize: nextFontSize })
          const nextHeight = isHorizontalEdge
            ? measuredNextHeight
            : Math.max(measuredNextHeight, Math.round(textHeight * Math.max(Math.abs(node.scaleY()), 0.1)))
          node.scaleX(1)
          node.scaleY(1)
          node.offsetX(nextWidth / 2)
          node.offsetY(nextHeight / 2)
          updateCustomText(item.id, {
            fontSize: nextFontSize,
            height: nextHeight,
            x: node.x() - nextWidth / 2,
            y: node.y() - nextHeight / 2,
            width: nextWidth,
            rotation: nextRotation,
          })
          setIsResizingHeadline(false)
        }}
      >
        {selection?.kind === 'custom-text' && selection.id === item.id ? (
          <Rect x={-8} y={-8} width={item.width + 16} height={textHeight + 16} stroke="#0ea5e9" dash={[10, 6]} cornerRadius={10} />
        ) : null}
        <Text
          width={item.width}
          height={textHeight}
          text={item.text}
          align={item.textAlign || 'left'}
          fontFamily={item.fontFamily || 'Arial'}
          fontSize={item.fontSize}
          fontStyle={item.fontStyle}
          fill={item.color}
          letterSpacing={item.letterSpacing || 0}
          lineHeight={item.lineHeight || 1.1}
          textDecoration={item.textDecoration}
          onDblClick={() => {
            if (locked) return
            beginInlineTextEdit({ kind: 'custom-text', id: item.id })
          }}
        />
      </Group>
    )
  }

  const renderOrderedCustomLayers = () =>
    (scene?.layers || [])
      .filter((item) => item.group === 'custom')
      .sort((left, right) => left.order - right.order)
      .map((item) => {
        if (item.kind === 'custom-image') {
          const customImage = scene?.customImages.find((entry) => entry.id === item.id)
          return customImage ? renderCustomImageNode(customImage) : null
        }
        if (item.kind === 'custom-rect') {
          const customRect = scene?.customRects.find((entry) => entry.id === item.id)
          if (!customRect || isLayerHidden('custom-rect', customRect.id)) return null
          const locked = isLayerLocked('custom-rect', customRect.id)
          return (
            <Group
              key={customRect.id}
              ref={(node) => {
                customRectRefs.current[customRect.id] = node
              }}
              x={customRect.x}
              y={customRect.y}
              draggable={!locked}
              onDragEnd={(event) => {
                if (locked) return
                setSelection({ kind: 'custom-rect', id: customRect.id })
                updateCustomRect(customRect.id, { x: event.target.x(), y: event.target.y() })
              }}
              onMouseDown={() => {
                if (locked) return
                setSelection({ kind: 'custom-rect', id: customRect.id })
              }}
              onTransformEnd={(event) => {
                if (locked) return
                const node = event.target
                const nextWidth = Math.max(40, Math.round(customRect.width * node.scaleX()))
                const nextHeight = Math.max(20, Math.round(customRect.height * node.scaleY()))
                node.scaleX(1)
                node.scaleY(1)
                updateCustomRect(customRect.id, { x: node.x(), y: node.y(), width: nextWidth, height: nextHeight })
              }}
            >
              {selection?.kind === 'custom-rect' && selection.id === customRect.id ? (
                <Rect x={-8} y={-8} width={customRect.width + 16} height={customRect.height + 16} stroke="#0ea5e9" dash={[10, 6]} cornerRadius={10} />
              ) : null}
              <Rect width={customRect.width} height={customRect.height} fill={customRect.fill} cornerRadius={8} />
            </Group>
          )
        }
        const customText = scene?.customTexts.find((entry) => entry.id === item.id)
        return customText ? renderCustomTextNode(customText) : null
      })

  return (
    <div
      style={{
        display: 'grid',
        gap: 12,
        gridTemplateColumns: 'minmax(280px, 380px) minmax(0, 1fr)',
        gridTemplateRows: 'auto 1fr',
        padding: 12,
        alignItems: 'start',
      }}
    >
      <section
        style={{
          gridColumn: '1 / -1',
          borderRadius: 16,
          border: '1px solid rgba(17, 24, 39, 0.12)',
          background: 'rgba(255,255,255,0.94)',
          padding: '8px 10px',
          display: 'flex',
          gap: 8,
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => {
              setSelection(null)
              setInlineTextEditor(null)
              setActiveMailSide('front')
            }}
            style={activeMailSide === 'front' ? activeToolbarButtonStyle : secondaryButtonStyle}
          >
            Front
          </button>
          <button
            type="button"
            onClick={() => {
              setSelection(null)
              setInlineTextEditor(null)
              setActiveMailSide('back')
            }}
            style={activeMailSide === 'back' ? activeToolbarButtonStyle : secondaryButtonStyle}
          >
            Back
          </button>
          <details style={commandMenuStyle}>
            <summary style={commandMenuSummaryStyle}>Export</summary>
            <div style={commandMenuPanelStyle}>
              <button type="button" onClick={saveToMediaGallery} disabled={savingMedia} style={menuActionButtonStyle}>
                {savingMedia ? 'Saving…' : 'Save to Media'}
              </button>
              <button type="button" onClick={downloadPng} style={menuActionButtonStyle}>
                Download PNG
              </button>
              <button type="button" onClick={downloadPptx} disabled={downloadingPptx} style={menuActionButtonStyle}>
                {downloadingPptx ? 'Building PPTX…' : 'Download PPTX'}
              </button>
              <button type="button" onClick={downloadTemplateXml} style={menuActionButtonStyle}>
                Export XML
              </button>
              <button
                type="button"
                onClick={exportAllRepsZip}
                disabled={exportingAllReps || tenantOptions.length === 0}
                style={menuActionButtonStyle}
              >
                {exportingAllReps ? 'Building Server ZIP…' : 'Export All ZIP'}
              </button>
              {mailExportJob?.status === 'complete' && mailExportJob.downloadUrl ? (
                <button type="button" onClick={downloadMailExportJob} style={menuActionButtonStyle}>
                  Download ZIP
                </button>
              ) : null}
            </div>
          </details>
          {isSuperAdmin ? (
            <button
              type="button"
              onClick={saveTemplate}
              disabled={savingTemplate}
              style={savingTemplate ? disabledButtonStyle : secondaryButtonStyle}
            >
              {savingTemplate ? 'Saving template…' : templateID ? 'Update template' : 'Save template'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleSaveDesign}
            disabled={savingDesign}
            style={savingDesign ? disabledButtonStyle : secondaryButtonStyle}
          >
            {savingDesign ? 'Saving design…' : designID ? 'Update design' : 'Save design'}
          </button>
          <button type="button" onClick={resetCurrentSide} style={secondaryButtonStyle}>
            Reset Side
          </button>
          <button type="button" onClick={resetAllSides} style={secondaryButtonStyle}>
            Reset All
          </button>
          <button
            type="button"
            onClick={() => undoLastChange()}
            disabled={undoStackRef.current[activeMailSide].length === 0}
            style={undoStackRef.current[activeMailSide].length === 0 ? disabledButtonStyle : secondaryButtonStyle}
          >
            Undo
          </button>
          <button
            type="button"
            onClick={() => redoLastChange()}
            disabled={redoStackRef.current[activeMailSide].length === 0}
            style={redoStackRef.current[activeMailSide].length === 0 ? disabledButtonStyle : secondaryButtonStyle}
          >
            Redo
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569' }}>
            <span>Zoom</span>
            <select
              value={String(previewZoom)}
              onChange={(event) => setPreviewZoom(Number(event.target.value))}
              style={{ ...controlStyle, width: 88, padding: '6px 8px' }}
            >
              <option value="0.75">75%</option>
              <option value="0.9">90%</option>
              <option value="1">Fit</option>
              <option value="1.1">110%</option>
              <option value="1.25">125%</option>
            </select>
          </label>
          <div style={{ fontSize: 12, color: '#475569' }}>
            Autosave: <strong>{formatAutosaveLabel(autosaveState)}</strong>
          </div>
          {mailExportJob ? (
            <div style={{ fontSize: 12, color: '#475569' }}>
              {mailExportJob.status === 'running' || mailExportJob.status === 'queued'
                ? `ZIP ${mailExportJob.completed}/${mailExportJob.total}${mailExportJob.currentTenantLabel ? ` · ${mailExportJob.currentTenantLabel}` : ''}`
                : mailExportJob.status === 'complete'
                  ? `ZIP ready · ${mailExportJob.completed}/${mailExportJob.total}${mailExportJob.skippedCount ? ` · ${mailExportJob.skippedCount} skipped` : ''}`
                  : mailExportJob.error
                    ? `ZIP failed · ${mailExportJob.error}`
                    : null}
            </div>
          ) : null}
        </div>
      </section>

      <aside
        style={{
          borderRadius: 16,
          border: '1px solid rgba(17, 24, 39, 0.12)',
          background: 'rgba(255,255,255,0.9)',
          padding: 10,
          display: 'grid',
          gap: 10,
          alignSelf: 'start',
          maxHeight: 'calc(100vh - 48px)',
          overflowY: 'auto',
        }}
      >
        <details open={designsSectionOpen} onToggle={(event) => setDesignsSectionOpen((event.currentTarget as HTMLDetailsElement).open)} style={detailsStyle}>
          <summary style={detailsSummaryStyle}>Document</summary>
          <div style={accordionBodyStyle}>
            {isMounted && tenantOptions.length > 0 ? (
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={fieldLabelStyle}>Switch tenant</span>
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr) 40px', gap: 6 }}>
                    <button type="button" onClick={() => switchTenantByOffset(-1)} style={tenantIndex <= 0 ? disabledButtonStyle : secondaryButtonStyle} disabled={tenantIndex <= 0}>
                      ←
                    </button>
                    <select
                      value={selectedTenantValue}
                      onChange={(event) => {
                        const nextTenantID = event.target.value || undefined
                        setTenant({ id: nextTenantID, refresh: true })
                      }}
                      style={controlStyle}
                    >
                      {tenantOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => switchTenantByOffset(1)}
                      style={tenantIndex < 0 || tenantIndex >= tenantOptions.length - 1 ? disabledButtonStyle : secondaryButtonStyle}
                      disabled={tenantIndex < 0 || tenantIndex >= tenantOptions.length - 1}
                    >
                      →
                    </button>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    {tenantIndex >= 0 ? `${tenantIndex + 1} of ${tenantOptions.length}` : `${tenantOptions.length} reps`}
                  </div>
                </div>
              </label>
            ) : null}
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
          </div>
        </details>

        <details open={contentSectionOpen} onToggle={(event) => setContentSectionOpen((event.currentTarget as HTMLDetailsElement).open)} style={detailsStyle}>
          <summary style={detailsSummaryStyle}>Content + Insert</summary>
          <div style={accordionBodyStyle}>
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
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button
                onClick={() => {
                  addCustomRect()
                  setMessage('Added rectangle')
                }}
                buttonStyle="secondary"
              >
                Add Rectangle
              </Button>
              <Button
                onClick={() => {
                  addCustomText()
                  setMessage('Added text box')
                }}
                buttonStyle="secondary"
              >
                Add Text Box
              </Button>
            </div>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={fieldLabelStyle}>Add Image</span>
              <input type="file" accept="image/*" onChange={handleAddCustomImage} style={controlStyle} />
            </label>
            <div style={{ display: 'grid', gap: 8 }}>
              <span style={fieldLabelStyle}>Reusable components</span>
              {EDITOR_COMPONENTS.map((component) => (
                <button
                  key={component.id}
                  type="button"
                  onClick={() => insertComponent(component.id)}
                  style={{
                    ...secondaryButtonStyle,
                    display: 'grid',
                    justifyItems: 'start',
                    gap: 4,
                  }}
                >
                  <strong>{component.label}</strong>
                  <span style={{ fontSize: 12, color: '#64748b' }}>{component.description}</span>
                </button>
              ))}
            </div>
            <div style={{ ...hintStyle, padding: '10px 12px' }}>Website is fixed to <strong>{WEBSITE_TEXT}</strong></div>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={fieldLabelStyle}>Footer text size</span>
                <input
                  type="number"
                  value={scene.footer.fontSize}
                  onChange={(event) =>
                    updateScene((current) => ({
                      ...current,
                      footer: {
                        ...current.footer,
                        fontSize: Number(event.target.value) || current.footer.fontSize,
                      },
                    }))
                  }
                  style={controlStyle}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={fieldLabelStyle}>Footer bar height</span>
                <input
                  type="number"
                  value={scene.footer.height}
                  onChange={(event) =>
                    updateScene((current) => {
                      const nextHeight = Number(event.target.value) || current.footer.height
                      return {
                        ...current,
                        footer: {
                          ...current.footer,
                          height: nextHeight,
                        },
                      }
                    })
                  }
                  style={controlStyle}
                />
              </label>
            </div>
          </div>
        </details>

        <details open={townsSectionOpen} onToggle={(event) => setTownsSectionOpen((event.currentTarget as HTMLDetailsElement).open)} style={detailsStyle}>
          <summary style={detailsSummaryStyle}>Towns</summary>
          <div style={accordionBodyStyle}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={fieldLabelStyle}>Town layout</span>
              <select
                value={scene.townColumns}
                onChange={(event) =>
                  updateScene((current) => relayoutTownRows(current, Number(event.target.value) === 2 ? 2 : 1))
                }
                style={controlStyle}
              >
                <option value={1}>Single column</option>
                <option value={2}>Two columns</option>
              </select>
            </label>
            {scene.townRows.map((row) => (
              <details key={row.id} style={nestedDetailsStyle}>
                <summary style={nestedSummaryStyle}>
                  <span>{row.town}</span>
                  <span style={{ fontSize: 12, color: '#64748b' }}>{formatCurrency(row.strapAid)}</span>
                </summary>
                <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#111827' }}>
                      <input type="checkbox" checked={row.included} onChange={(event) => updateTownRow(row.id, { included: event.target.checked })} />
                      Include town
                    </label>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button type="button" onClick={() => moveTownRow(row.id, -1)} style={secondaryButtonStyle} disabled={scene.townRows[0]?.id === row.id}>
                        ↑
                      </button>
                      <button type="button" onClick={() => moveTownRow(row.id, 1)} style={secondaryButtonStyle} disabled={scene.townRows[scene.townRows.length - 1]?.id === row.id}>
                        ↓
                      </button>
                      <button type="button" onClick={() => setSelection({ kind: 'town', id: row.id })} style={secondaryButtonStyle}>
                        Select
                      </button>
                    </div>
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
                  <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={fieldLabelStyle}>Town size</span>
                      <input
                        type="number"
                        value={row.townFontSize}
                        onChange={(event) => updateTownRow(row.id, { townFontSize: Number(event.target.value) || row.townFontSize })}
                        style={controlStyle}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={fieldLabelStyle}>Bar width</span>
                      <input type="number" value={getRenderedTownLabelWidth(row)} readOnly style={{ ...controlStyle, background: '#f8fafc' }} />
                    </label>
                  </div>
                </div>
              </details>
            ))}
          </div>
        </details>

        <details open style={detailsStyle}>
          <summary style={detailsSummaryStyle}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Layers size={14} />
              Layers
            </span>
          </summary>
          <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
            {layerPanelItems.map(({ item, label, reorderable }) => {
              const isSelected = selection?.kind === item.kind && selection.id === item.id
              return (
                <div
                  key={`${item.kind}:${item.id}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) auto',
                    gap: 8,
                    alignItems: 'center',
                    padding: '6px 8px',
                    borderRadius: 12,
                    border: isSelected ? '1px solid rgba(14,165,233,0.45)' : '1px solid rgba(15,23,42,0.08)',
                    background: isSelected ? 'rgba(14,165,233,0.08)' : '#ffffff',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setSelection({ kind: item.kind, id: item.id } as Exclude<Selection, null>)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                      textAlign: 'left',
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#0f172a',
                      cursor: 'pointer',
                    }}
                  >
                    {label}
                  </button>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {reorderable ? (
                      <>
                        <button type="button" title="Send to back" onClick={() => reorderLayerTarget({ id: item.id, kind: item.kind }, 'back')} style={iconToolbarButtonStyle}>
                          <ChevronsDown size={12} />
                        </button>
                        <button type="button" title="Send backward" onClick={() => reorderLayerTarget({ id: item.id, kind: item.kind }, 'backward')} style={iconToolbarButtonStyle}>
                          <ChevronDown size={12} />
                        </button>
                        <button type="button" title="Bring forward" onClick={() => reorderLayerTarget({ id: item.id, kind: item.kind }, 'forward')} style={iconToolbarButtonStyle}>
                          <ChevronUp size={12} />
                        </button>
                        <button type="button" title="Bring to front" onClick={() => reorderLayerTarget({ id: item.id, kind: item.kind }, 'front')} style={iconToolbarButtonStyle}>
                          <ChevronsUp size={12} />
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      title={item.hidden ? 'Show layer' : 'Hide layer'}
                      onClick={() => updateLayerState({ id: item.id, kind: item.kind }, { hidden: !item.hidden })}
                      style={item.hidden ? activeIconToolbarButtonStyle : iconToolbarButtonStyle}
                    >
                      {item.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                    <button
                      type="button"
                      title={item.locked ? 'Unlock layer' : 'Lock layer'}
                      onClick={() => updateLayerState({ id: item.id, kind: item.kind }, { locked: !item.locked })}
                      style={item.locked ? activeIconToolbarButtonStyle : iconToolbarButtonStyle}
                    >
                      {item.locked ? <Lock size={12} /> : <Unlock size={12} />}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </details>

        <details open={inspectorSectionOpen} onToggle={(event) => setInspectorSectionOpen((event.currentTarget as HTMLDetailsElement).open)} style={detailsStyle}>
          <summary style={detailsSummaryStyle}>Inspector</summary>
          <div style={accordionBodyStyle}>
            {selection ? (
              <>
                <div style={hintStyle}>
                  Selected: <strong>{selection.kind === 'town' && selectedTownRow ? selectedTownRow.town : selection.kind}</strong>
                </div>
                {selection.kind === 'custom-image' || selection.kind === 'custom-rect' || selection.kind === 'custom-text' ? (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Button onClick={() => duplicateSelectedCustomObject()} buttonStyle="secondary">Duplicate</Button>
                    <Button onClick={() => deleteSelectedCustomObject()} buttonStyle="secondary">Delete</Button>
                  </div>
                ) : null}
                {selectedTextInspectorPanel}
                {selectedElementPanel}
              </>
            ) : (
              <div style={hintStyle}>Select an object on the canvas to inspect and edit its coordinates and size.</div>
            )}
          </div>
        </details>

        {message ? <div style={hintStyle}>{message}</div> : null}

        <details open={templateSectionOpen} onToggle={(event) => setTemplateSectionOpen((event.currentTarget as HTMLDetailsElement).open)} style={detailsStyle}>
          <summary style={detailsSummaryStyle}>Templates</summary>
          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
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
          </div>
        </details>
      </aside>

      <section
        style={{
          borderRadius: 14,
          border: '1px solid rgba(17, 24, 39, 0.12)',
          background: 'rgba(255,255,255,0.9)',
          padding: 6,
          overflow: 'hidden',
          minWidth: 0,
        }}
      >
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', padding: '0 6px 4px' }}>
          <button
            type="button"
            title="Clear selection"
            aria-label="Clear selection"
            onClick={() => {
              setSelection(null)
              setInlineTextEditor(null)
            }}
            style={iconToolbarButtonStyle}
            >
              <X size={14} strokeWidth={2.25} />
            </button>
          <button
            type="button"
            title="Copy"
            aria-label="Copy"
            onClick={() => copySelectedCustomObject()}
            disabled={!selection || !['custom-image', 'custom-rect', 'custom-text'].includes(selection.kind)}
            style={!selection || !['custom-image', 'custom-rect', 'custom-text'].includes(selection.kind) ? disabledIconToolbarButtonStyle : iconToolbarButtonStyle}
          >
            <Clipboard size={14} strokeWidth={2.1} />
          </button>
          <button
            type="button"
            title="Duplicate"
            aria-label="Duplicate"
            onClick={() => duplicateSelectedCustomObject()}
            disabled={!selection || !['custom-image', 'custom-rect', 'custom-text'].includes(selection.kind)}
            style={!selection || !['custom-image', 'custom-rect', 'custom-text'].includes(selection.kind) ? disabledIconToolbarButtonStyle : iconToolbarButtonStyle}
          >
            <Copy size={14} strokeWidth={2.1} />
          </button>
          <button
            type="button"
            title="Delete"
            aria-label="Delete"
            onClick={() => deleteSelectedCustomObject()}
            disabled={!selection || !['custom-image', 'custom-rect', 'custom-text'].includes(selection.kind)}
            style={!selection || !['custom-image', 'custom-rect', 'custom-text'].includes(selection.kind) ? disabledIconToolbarButtonStyle : iconToolbarButtonStyle}
          >
            <Trash2 size={14} strokeWidth={2.1} />
          </button>
          <button
            type="button"
            title="Paste"
            aria-label="Paste"
            onClick={() => pasteClipboardObject()}
            disabled={!hasEditorClipboard()}
            style={!hasEditorClipboard() ? disabledIconToolbarButtonStyle : iconToolbarButtonStyle}
          >
            <Copy size={14} strokeWidth={2.1} />
          </button>
          <button
            type="button"
            title="Send backward"
            aria-label="Send backward"
            onClick={() => reorderSelectedLayer('backward')}
            disabled={!selection || !isCustomLayerKind(selection.kind)}
            style={!selection || !isCustomLayerKind(selection.kind) ? disabledIconToolbarButtonStyle : iconToolbarButtonStyle}
          >
            <ChevronDown size={14} strokeWidth={2.1} />
          </button>
          <button
            type="button"
            title="Bring forward"
            aria-label="Bring forward"
            onClick={() => reorderSelectedLayer('forward')}
            disabled={!selection || !isCustomLayerKind(selection.kind)}
            style={!selection || !isCustomLayerKind(selection.kind) ? disabledIconToolbarButtonStyle : iconToolbarButtonStyle}
          >
            <ChevronUp size={14} strokeWidth={2.1} />
          </button>
          {selection ? (
            <>
              {getLayerTarget(selection) ? (
              <button
                type="button"
                title={selectedLayer?.hidden ? 'Show layer' : 'Hide layer'}
                aria-label={selectedLayer?.hidden ? 'Show layer' : 'Hide layer'}
                onClick={() => {
                  const target = getLayerTarget(selection)
                  if (!target) return
                  updateLayerState(target, { hidden: !selectedLayer?.hidden })
                }}
                style={selectedLayer?.hidden ? activeIconToolbarButtonStyle : iconToolbarButtonStyle}
              >
                {selectedLayer?.hidden ? <EyeOff size={14} strokeWidth={2.1} /> : <Eye size={14} strokeWidth={2.1} />}
              </button>
              ) : null}
              {getLayerTarget(selection) ? (
              <button
                type="button"
                title={selectedLayer?.locked ? 'Unlock layer' : 'Lock layer'}
                aria-label={selectedLayer?.locked ? 'Unlock layer' : 'Lock layer'}
                onClick={() => {
                  const target = getLayerTarget(selection)
                  if (!target) return
                  updateLayerState(target, { locked: !selectedLayer?.locked })
                }}
                style={selectedLayer?.locked ? activeIconToolbarButtonStyle : iconToolbarButtonStyle}
              >
                {selectedLayer?.locked ? <Lock size={14} strokeWidth={2.1} /> : <Unlock size={14} strokeWidth={2.1} />}
              </button>
              ) : null}
            </>
          ) : null}
        </div>
        <div style={textToolbarStyle}>
          <div
            style={{
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
              alignItems: 'center',
              opacity: isTextToolbarActive ? 1 : 0,
              pointerEvents: isTextToolbarActive ? 'auto' : 'none',
            }}
          >
            <button
              type="button"
              title="Bold"
              aria-label="Bold"
              style={selectedTextFontFlags.bold ? activeIconToolbarButtonStyle : iconToolbarButtonStyle}
              onClick={toggleSelectedTextBold}
              disabled={!isTextToolbarActive}
            >
              <Bold size={14} strokeWidth={2.25} />
            </button>
            <button
              type="button"
              title="Italic"
              aria-label="Italic"
              style={selectedTextFontFlags.italic ? activeIconToolbarButtonStyle : iconToolbarButtonStyle}
              onClick={toggleSelectedTextItalic}
              disabled={!isTextToolbarActive}
            >
              <Italic size={14} strokeWidth={2.25} />
            </button>
            <button
              type="button"
              title="Underline"
              aria-label="Underline"
              style={selectedTextLayer?.textDecoration === 'underline' ? activeIconToolbarButtonStyle : iconToolbarButtonStyle}
              onClick={() =>
                applySelectedTextFormatting({
                  textDecoration: selectedTextLayer?.textDecoration === 'underline' ? 'none' : 'underline',
                })
              }
              disabled={!isTextToolbarActive}
            >
              <Underline size={14} strokeWidth={2.25} />
            </button>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {TEXT_ALIGNMENT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  title={option.label}
                  aria-label={option.label}
                  style={selectedTextLayer?.textAlign === option.value || (!selectedTextLayer?.textAlign && option.value === 'left') ? activeIconToolbarButtonStyle : iconToolbarButtonStyle}
                  onClick={() => applySelectedTextFormatting({ textAlign: option.value })}
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
                onChange={(event) => applySelectedTextFormatting({ fontFamily: event.target.value })}
                style={{ ...toolbarSelectStyle, width: 150 }}
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
                max={140}
                step={1}
                value={selectedTextLayer?.fontSize || 32}
                onChange={(event) => applySelectedTextFormatting({ fontSize: Number(event.target.value) })}
                style={{ ...toolbarInputStyle, width: 68 }}
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
                onChange={(event) => applySelectedTextFormatting({ lineHeight: Number(event.target.value) || 1 })}
                style={{ ...toolbarInputStyle, width: 64 }}
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
                onChange={(event) => applySelectedTextFormatting({ letterSpacing: Number(event.target.value) || 0 })}
                style={{ ...toolbarInputStyle, width: 64 }}
                disabled={!isTextToolbarActive}
              />
            </label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {BRAND_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Choose ${color}`}
                  onClick={() => applySelectedTextFormatting({ color })}
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
              <input
                type="color"
                value={selectedTextLayer?.color || '#111111'}
                onChange={(event) => applySelectedTextFormatting({ color: event.target.value })}
                style={{ width: 28, height: 28, border: 'none', background: 'transparent', padding: 0 }}
                disabled={!isTextToolbarActive}
              />
            </div>
          </div>
        </div>
        <div
          ref={stageContainerRef}
          style={{
            width: '100%',
            display: 'flex',
            justifyContent: 'center',
            overflow: 'hidden',
            position: 'relative',
            borderRadius: 18,
            background: '#e5e7eb',
            padding: 6,
          }}
        >
          <Stage
            ref={stageRef}
            width={STAGE_WIDTH}
            height={STAGE_HEIGHT}
            scaleX={previewScale}
            scaleY={previewScale}
            style={{
              width: `${previewWidth}px`,
              height: `${previewHeight}px`,
              borderRadius: 20,
              background: '#f5f2ec',
              display: 'block',
              flex: '0 0 auto',
            }}
            onMouseDown={(event) => {
              if (event.target === event.target.getStage()) setSelection(null)
            }}
          >
            <Layer>
              <Group
                clipFunc={(ctx) => {
                  ctx.beginPath()
                  ctx.rect(0, 0, STAGE_WIDTH, STAGE_HEIGHT)
                  ctx.closePath()
                }}
              >
                <Rect width={STAGE_WIDTH} height={STAGE_HEIGHT} fill="#f7f4ef" />
                <Rect width={STAGE_WIDTH} height={STAGE_HEIGHT} fill="rgba(255,255,255,0.66)" />
                {activeMailSide === 'front' ? (
                  <>
                    {renderOrderedCustomLayers()}

                    {!isLayerHidden('eyebrow', scene.eyebrow.id) ? (
                    <Group
                      x={scene.eyebrow.x}
                      y={scene.eyebrow.y}
                      draggable={!isLayerLocked('eyebrow', scene.eyebrow.id)}
                      onDragEnd={(event) => updateSelectionPosition(event.target.x(), event.target.y())}
                      onMouseDown={() => {
                        if (isLayerLocked('eyebrow', scene.eyebrow.id)) return
                        setSelection({ kind: 'eyebrow', id: scene.eyebrow.id })
                      }}
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
                        align={scene.eyebrow.textAlign || 'left'}
                        fontFamily={scene.eyebrow.fontFamily || 'Arial'}
                        fontSize={scene.eyebrow.fontSize}
                        fontStyle={scene.eyebrow.fontStyle}
                        fill={scene.eyebrow.color}
                        letterSpacing={scene.eyebrow.letterSpacing || 0}
                        lineHeight={scene.eyebrow.lineHeight || 1}
                        textDecoration={scene.eyebrow.textDecoration}
                        wrap="none"
                        onDblClick={() => beginInlineTextEdit({ kind: 'eyebrow', id: scene.eyebrow.id })}
                      />
                    </Group>
                    ) : null}

                    {!isLayerHidden('headline', scene.headline.id) ? (
                    <Group
                      x={scene.headline.x}
                      y={scene.headline.y}
                      ref={headlineRef}
                      draggable={selection?.kind === 'headline' && !isResizingHeadline && !isLayerLocked('headline', scene.headline.id)}
                      onDragEnd={(event) => updateSelectionPosition(event.target.x(), event.target.y())}
                      onMouseDown={() => {
                        if (isLayerLocked('headline', scene.headline.id)) return
                        setSelection({ kind: 'headline', id: scene.headline.id })
                      }}
	                      onTransformStart={() => setIsResizingHeadline(true)}
	                      onTransformEnd={(event) => {
	                        if (isLayerLocked('headline', scene.headline.id)) return
	                        const node = event.target
	                        const { nextFontSize, nextWidth } = getResizedTextTransform({
	                          fontSize: scene.headline.fontSize,
	                          maxFontSize: 160,
	                          minFontSize: 20,
	                          minWidth: HEADLINE_WIDTH_LIMITS.min,
	                          scaleX: node.scaleX(),
	                          scaleY: node.scaleY(),
	                          width: scene.headline.width,
	                        })
	                        node.scaleX(1)
	                        node.scaleY(1)
	                        updateHeadline({
	                          fontSize: nextFontSize,
	                          x: node.x(),
	                          y: node.y(),
	                          width: clampNumber(nextWidth, HEADLINE_WIDTH_LIMITS.min, HEADLINE_WIDTH_LIMITS.max),
	                        })
	                        setIsResizingHeadline(false)
	                      }}
                    >
                      {selection?.kind === 'headline' ? (
                        <Rect x={-12} y={-12} width={scene.headline.width + 24} height={measureHeadlineHeight(scene.headline) + 24} stroke="#0ea5e9" dash={[10, 6]} cornerRadius={14} />
                      ) : null}
                      <Text
                        width={scene.headline.width}
                        text={scene.headline.text}
                        align={scene.headline.textAlign || 'left'}
                        fontFamily={scene.headline.fontFamily || 'Georgia, Times New Roman, serif'}
                        fontSize={scene.headline.fontSize}
                        letterSpacing={scene.headline.letterSpacing || 0}
                        lineHeight={scene.headline.lineHeight || 1.04}
                        fill={scene.headline.color}
                        textDecoration={scene.headline.textDecoration}
                        onDblClick={() => beginInlineTextEdit({ kind: 'headline', id: scene.headline.id })}
                      />
                    </Group>
                    ) : null}

                    {!isLayerHidden('subhead', scene.subhead.id) ? (
                    <Group
                      x={scene.subhead.x}
                      y={scene.subhead.y}
                      onMouseDown={() => {
                        if (isLayerLocked('subhead', scene.subhead.id)) return
                        setSelection({ kind: 'subhead', id: scene.subhead.id })
                      }}
                    >
                      {selection?.kind === 'subhead' ? (
                        <Rect x={-10} y={-12} width={Math.max(scene.subhead.dividerWidth + 20, 320)} height={74} stroke="#0ea5e9" dash={[10, 6]} cornerRadius={12} />
                      ) : null}
                      <Rect width={scene.subhead.dividerWidth} height={scene.subhead.dividerHeight} fill={scene.subhead.dividerColor} />
                      <Text
                        width={Math.max(scene.subhead.dividerWidth + 24, 320)}
                        y={14}
                        text={scene.subhead.text}
                        align={scene.subhead.textAlign || 'left'}
                        fontFamily={scene.subhead.fontFamily || 'Arial'}
                        fontSize={scene.subhead.fontSize}
                        fontStyle={scene.subhead.fontStyle}
                        fill={scene.subhead.color}
                        letterSpacing={scene.subhead.letterSpacing || 0}
                        lineHeight={scene.subhead.lineHeight || 1}
                        textDecoration={scene.subhead.textDecoration}
                        onDblClick={() => beginInlineTextEdit({ kind: 'subhead', id: scene.subhead.id })}
                      />
                    </Group>
                    ) : null}

                    {scene.townColumns === 2 ? (
                      <>
                        {renderTownStack(leftTownRows, leftTownBounds, { kind: 'towns-left', id: 'town-stack-left' }, leftTownStackRef)}
                        {renderTownStack(rightTownRows, rightTownBounds, { kind: 'towns-right', id: 'town-stack-right' }, rightTownStackRef)}
                      </>
                    ) : (
                      renderTownStack(includedTownRows, townStackBounds, { kind: 'towns', id: 'town-stack' }, townStackRef)
                    )}

                    {!isLayerHidden('footer', scene.footer.id) ? (
                    <Group
                      x={scene.footer.x}
                      y={scene.footer.y}
                      draggable={!isLayerLocked('footer', scene.footer.id)}
                      onDragEnd={(event) => updateSelectionPosition(event.target.x(), event.target.y())}
                      onMouseDown={() => {
                        if (isLayerLocked('footer', scene.footer.id)) return
                        setSelection({ kind: 'footer', id: scene.footer.id })
                      }}
                    >
                      {selection?.kind === 'footer' ? (
                        <Rect x={-8} y={-8} width={scene.footer.width + 16} height={scene.footer.height + 16} stroke="#0ea5e9" dash={[10, 6]} />
                      ) : null}
                      <Rect width={scene.footer.width} height={scene.footer.height} fill={scene.footer.backgroundColor} />
                      <Text
                        x={scene.footer.textX - scene.footer.x}
                        y={scene.footer.textY - scene.footer.y}
                        width={Math.max(80, scene.footer.width - (scene.footer.textX - scene.footer.x) * 2)}
                        text={scene.footer.text}
                        align={scene.footer.textAlign || 'left'}
                        fontFamily={scene.footer.fontFamily || 'Arial'}
                        fontSize={scene.footer.fontSize}
                        fontStyle={scene.footer.fontStyle}
                        fill={scene.footer.color}
                        letterSpacing={scene.footer.letterSpacing || 0}
                        lineHeight={scene.footer.lineHeight || 1}
                        textDecoration={scene.footer.textDecoration}
                        onDblClick={() => beginInlineTextEdit({ kind: 'footer', id: scene.footer.id })}
                      />
                    </Group>
                    ) : null}

                    {scene.headshot.size > 0 && !isLayerHidden('headshot', scene.headshot.id) ? (
                      <Group
                        x={scene.headshot.x}
                        y={scene.headshot.y}
                        ref={headshotRef}
                        draggable={!isLayerLocked('headshot', scene.headshot.id)}
                        onClick={() => {
                          if (isLayerLocked('headshot', scene.headshot.id)) return
                          setSelection({ kind: 'headshot', id: scene.headshot.id })
                        }}
                        onTap={() => {
                          if (isLayerLocked('headshot', scene.headshot.id)) return
                          setSelection({ kind: 'headshot', id: scene.headshot.id })
                        }}
                        onDragEnd={(event) => updateHeadshot({ x: event.target.x(), y: event.target.y() })}
                        onTransformEnd={(event) => {
                          if (isLayerLocked('headshot', scene.headshot.id)) return
                          const node = event.target
                          const scale = Math.max(node.scaleX(), node.scaleY())
                          const nextSize = Math.max(180, Math.round(scene.headshot.size * scale))
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
                              onClick={() => {
                                if (isLayerLocked('headshot', scene.headshot.id)) return
                                setSelection({ kind: 'headshot', id: scene.headshot.id })
                              }}
                              onTap={() => {
                                if (isLayerLocked('headshot', scene.headshot.id)) return
                                setSelection({ kind: 'headshot', id: scene.headshot.id })
                              }}
                            />
                          ) : null}
                        </Group>
                      </Group>
                    ) : null}

                    <Rect
                      x={STAGE_WIDTH - MAIL_PLACEHOLDER_WIDTH}
                      y={STAGE_HEIGHT - MAIL_PLACEHOLDER_HEIGHT}
                      width={MAIL_PLACEHOLDER_WIDTH}
                      height={MAIL_PLACEHOLDER_HEIGHT}
                      fill="#ffffff"
                      stroke="#94a3b8"
                      strokeWidth={2}
                      cornerRadius={16}
                    />
                  </>
                ) : (
                  <>
                    {renderOrderedCustomLayers()}

                    {scene.headshot.size > 0 && !isLayerHidden('headshot', scene.headshot.id) ? (
                      <Group
                        x={scene.headshot.x}
                        y={scene.headshot.y}
                        ref={headshotRef}
                        draggable={!isLayerLocked('headshot', scene.headshot.id)}
                        onClick={() => {
                          if (isLayerLocked('headshot', scene.headshot.id)) return
                          setSelection({ kind: 'headshot', id: scene.headshot.id })
                        }}
                        onTap={() => {
                          if (isLayerLocked('headshot', scene.headshot.id)) return
                          setSelection({ kind: 'headshot', id: scene.headshot.id })
                        }}
                        onDragEnd={(event) => updateHeadshot({ x: event.target.x(), y: event.target.y() })}
                        onTransformEnd={(event) => {
                          if (isLayerLocked('headshot', scene.headshot.id)) return
                          const node = event.target
                          const scale = Math.max(node.scaleX(), node.scaleY())
                          const nextSize = Math.max(180, Math.round(scene.headshot.size * scale))
                          node.scaleX(1)
                          node.scaleY(1)
                          updateHeadshot({ x: node.x(), y: node.y(), size: nextSize })
                        }}
                      >
                        <Group
                          clipFunc={(ctx) => {
                            ctx.beginPath()
                            ctx.arc(
                              scene.headshot.size / 2,
                              scene.headshot.size / 2,
                              scene.headshot.size / 2,
                              0,
                              Math.PI * 2,
                            )
                            ctx.closePath()
                          }}
                        >
                          {headshotImage ? (
                            <KonvaImage
                              image={headshotImage}
                              x={backHeadshotPlacement.x}
                              y={backHeadshotPlacement.y}
                              width={backHeadshotPlacement.width}
                              height={backHeadshotPlacement.height}
                              onClick={() => {
                                if (isLayerLocked('headshot', scene.headshot.id)) return
                                setSelection({ kind: 'headshot', id: scene.headshot.id })
                              }}
                              onTap={() => {
                                if (isLayerLocked('headshot', scene.headshot.id)) return
                                setSelection({ kind: 'headshot', id: scene.headshot.id })
                              }}
                            />
                          ) : (
                            <Rect
                              width={scene.headshot.size}
                              height={scene.headshot.size}
                              fill="rgba(148, 163, 184, 0.35)"
                            />
                          )}
                        </Group>
                      </Group>
                    ) : null}

                    {!isLayerHidden('subhead', scene.subhead.id) ? (
                    <Group
                      x={scene.subhead.x}
                      y={scene.subhead.y}
                      draggable={!isLayerLocked('subhead', scene.subhead.id)}
                      onDragEnd={(event) => updateSelectionPosition(event.target.x(), event.target.y())}
                      onMouseDown={() => {
                        if (isLayerLocked('subhead', scene.subhead.id)) return
                        setSelection({ kind: 'subhead', id: scene.subhead.id })
                      }}
                    >
                      {selection?.kind === 'subhead' ? (
                        <Rect
                          x={-10}
                          y={-12}
                          width={Math.max(scene.subhead.dividerWidth + 20, 220)}
                          height={Math.max(scene.subhead.fontSize + 28, 56)}
                          stroke="#0ea5e9"
                          dash={[10, 6]}
                          cornerRadius={12}
                        />
                      ) : null}
                      <Text
                        width={scene.subhead.dividerWidth}
                        text={scene.subhead.text}
                        align={scene.subhead.textAlign || 'left'}
                        fontFamily={scene.subhead.fontFamily || 'Georgia, Times New Roman, serif'}
                        fontSize={scene.subhead.fontSize}
                        fontStyle={scene.subhead.fontStyle}
                        fill={scene.subhead.color}
                        letterSpacing={scene.subhead.letterSpacing || 0}
                        lineHeight={scene.subhead.lineHeight || 1}
                        textDecoration={scene.subhead.textDecoration}
                        onDblClick={() => beginInlineTextEdit({ kind: 'subhead', id: scene.subhead.id })}
                      />
                    </Group>
                    ) : null}

                    {!isLayerHidden('headline', scene.headline.id) ? (
                    <Group
                      x={scene.headline.x}
                      y={scene.headline.y}
                      ref={headlineRef}
                      draggable={selection?.kind === 'headline' && !isResizingHeadline && !isLayerLocked('headline', scene.headline.id)}
                      onDragEnd={(event) => updateSelectionPosition(event.target.x(), event.target.y())}
                      onMouseDown={() => {
                        if (isLayerLocked('headline', scene.headline.id)) return
                        setSelection({ kind: 'headline', id: scene.headline.id })
                      }}
                      onTransformStart={() => setIsResizingHeadline(true)}
                      onTransformEnd={(event) => {
                        if (isLayerLocked('headline', scene.headline.id)) return
                        const node = event.target
                        const nextWidth = clamp(Math.round(scene.headline.width * node.scaleX()), HEADLINE_WIDTH_LIMITS.min, HEADLINE_WIDTH_LIMITS.max)
                        node.scaleX(1)
                        node.scaleY(1)
                        updateHeadline({ x: node.x(), y: node.y(), width: nextWidth })
                        setIsResizingHeadline(false)
                      }}
                    >
                      {selection?.kind === 'headline' ? (
                        <Rect
                          x={-12}
                          y={-12}
                          width={scene.headline.width + 24}
                          height={measureHeadlineHeight(scene.headline) + 24}
                          stroke="#0ea5e9"
                          dash={[10, 6]}
                          cornerRadius={14}
                        />
                      ) : null}
                      <Text
                        width={scene.headline.width}
                        height={measureHeadlineHeight(scene.headline)}
                        text={scene.headline.text}
                        align={scene.headline.textAlign || 'left'}
                        fontFamily={scene.headline.fontFamily || 'Georgia, Times New Roman, serif'}
                        fontSize={scene.headline.fontSize}
                        fontStyle={scene.headline.fontStyle}
                        fill="#374151"
                        letterSpacing={scene.headline.letterSpacing || 0}
                        verticalAlign="middle"
                        lineHeight={scene.headline.lineHeight || 1.05}
                        textDecoration={scene.headline.textDecoration}
                        onDblClick={() => beginInlineTextEdit({ kind: 'headline', id: scene.headline.id })}
                      />
                    </Group>
                    ) : null}
                  </>
                )}

              <Transformer
                ref={transformerRef}
                rotateEnabled={selection?.kind === 'custom-image' || selection?.kind === 'custom-text'}
                flipEnabled={false}
                keepRatio={selection?.kind === 'headshot' || selection?.kind === 'custom-image'}
                enabledAnchors={
                  selection?.kind === 'headline'
                    ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
                    : selection?.kind === 'custom-text'
                      ? ['top-left', 'top-center', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right']
                    : selection?.kind === 'custom-image'
                      ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
                    : selection?.kind === 'custom-rect'
                      ? ['top-left', 'top-center', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right']
                    : selection?.kind === 'towns' || selection?.kind === 'towns-left' || selection?.kind === 'towns-right'
                      ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
                    : selection?.kind === 'headshot'
                      ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
                      : []
                }
                borderStroke="#0ea5e9"
                anchorStroke="#0ea5e9"
                anchorFill="#ffffff"
                anchorSize={transformerAnchorSize}
                boundBoxFunc={(oldBox, newBox) => {
                  if (selection?.kind === 'headline') {
                    const nextWidth = clampNumber(newBox.width, HEADLINE_WIDTH_LIMITS.min, HEADLINE_WIDTH_LIMITS.max)
                    return { ...newBox, width: nextWidth, height: Math.max(60, newBox.height), rotation: 0 }
                  }

                  if (selection?.kind === 'custom-text') {
                    return { ...newBox, width: Math.max(80, newBox.width), height: Math.max(48, newBox.height) }
                  }

                  if (selection?.kind === 'custom-rect') {
                    return { ...newBox, width: Math.max(40, newBox.width), height: Math.max(20, newBox.height), rotation: 0 }
                  }

                  if (selection?.kind === 'custom-image') {
                    return { ...newBox, width: Math.max(20, newBox.width), height: Math.max(20, newBox.height) }
                  }

                  if (selection?.kind === 'towns' || selection?.kind === 'towns-left' || selection?.kind === 'towns-right') {
                    const scale = Math.max(
                      newBox.width / Math.max(oldBox.width, 1),
                      newBox.height / Math.max(oldBox.height, 1),
                    )
                    const nextWidth = clamp(oldBox.width * scale, TOWN_LABEL_WIDTH_LIMITS.min, STAGE_WIDTH - 40)
                    const nextHeight = clamp(oldBox.height * scale, TOWN_GROUP_HEIGHT_LIMITS.min, STAGE_HEIGHT - 80)
                    return { ...newBox, width: nextWidth, height: nextHeight, rotation: 0 }
                  }

                  if (selection?.kind === 'headshot') {
                    const nextSize = Math.max(180, Math.max(newBox.width, newBox.height))
                    return { ...newBox, width: nextSize, height: nextSize, rotation: 0 }
                  }
                  return newBox
                }}
              />
              </Group>
            </Layer>
          </Stage>
          {inlineTextEditor && inlineEditorBox ? (
            <div
              style={{
                position: 'absolute',
                left: inlineEditorBox.left + 10,
                top: inlineEditorBox.top + 10,
                width: inlineEditorBox.width,
                minHeight: inlineEditorBox.height,
                zIndex: 40,
              }}
            >
              <textarea
                autoFocus
                value={inlineTextEditor.value}
                onChange={(event) => setInlineTextEditor((current) => (current ? { ...current, value: event.target.value } : current))}
                onBlur={commitInlineTextEdit}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                    event.preventDefault()
                    commitInlineTextEdit()
                    return
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    setInlineTextEditor(null)
                  }
                }}
                style={{
                  width: '100%',
                  minHeight: inlineEditorBox.height,
                  resize: 'vertical',
                  padding: '12px 14px',
                  borderRadius: 14,
                  border: '2px solid #0ea5e9',
                  background: 'rgba(255,255,255,0.98)',
                  color: selectedTextLayer?.color || '#111827',
                  fontFamily: selectedTextLayer?.fontFamily || 'Arial',
                  fontSize: `${Math.max(16, ((selectedTextLayer?.fontSize || 28) * previewScale))}px`,
                  fontStyle: selectedTextLayer?.fontStyle?.includes('italic') ? 'italic' : 'normal',
                  fontWeight: getCssFontWeight(selectedTextLayer?.fontStyle),
                  textDecoration: selectedTextLayer?.textDecoration || 'none',
                  textAlign: selectedTextLayer?.textAlign || 'left',
                  lineHeight: selectedTextLayer?.lineHeight || 1.12,
                  letterSpacing: selectedTextLayer?.letterSpacing || 0,
                  boxShadow: '0 18px 45px rgba(14,165,233,0.18)',
                }}
              />
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}

const controlStyle: React.CSSProperties = {
  border: '1px solid rgba(17, 24, 39, 0.12)',
  borderRadius: 9,
  background: '#ffffff',
  color: '#111827',
  padding: '6px 9px',
  fontSize: 12,
  lineHeight: 1.2,
  width: '100%',
}

const hintStyle: React.CSSProperties = {
  borderRadius: 12,
  background: '#f7fafc',
  border: '1px solid rgba(17, 24, 39, 0.08)',
  padding: '8px 10px',
  color: '#4b5563',
  fontSize: 12,
  lineHeight: 1.35,
}

const textToolbarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  flexWrap: 'wrap',
  minHeight: 0,
  padding: '4px 6px',
  marginBottom: 4,
  borderRadius: 10,
  border: '1px solid rgba(17, 24, 39, 0.08)',
  background: '#f8fafc',
}

const toolbarButtonStyle: React.CSSProperties = {
  border: '1px solid rgba(17, 24, 39, 0.12)',
  borderRadius: 999,
  background: '#ffffff',
  color: '#111827',
  padding: '5px 8px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
}

const activeToolbarButtonStyle: React.CSSProperties = {
  ...toolbarButtonStyle,
  background: '#0f172a',
  color: '#ffffff',
  borderColor: '#0f172a',
}

const iconToolbarButtonStyle: React.CSSProperties = {
  ...toolbarButtonStyle,
  width: 28,
  height: 28,
  padding: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 12,
}

const activeIconToolbarButtonStyle: React.CSSProperties = {
  ...activeToolbarButtonStyle,
  width: 28,
  height: 28,
  padding: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 12,
}

const toolbarSelectStyle: React.CSSProperties = {
  ...controlStyle,
  minHeight: 30,
  padding: '5px 8px',
  fontSize: 12,
}

const toolbarInputStyle: React.CSSProperties = {
  ...controlStyle,
  minHeight: 30,
  padding: '5px 8px',
  fontSize: 12,
}

const detailsStyle: React.CSSProperties = {
  borderRadius: 12,
  border: '1px solid rgba(17, 24, 39, 0.1)',
  background: 'rgba(248, 250, 252, 0.82)',
  padding: '7px 9px',
}

const detailsSummaryStyle: React.CSSProperties = {
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: '#111827',
}

const accordionBodyStyle: React.CSSProperties = {
  display: 'grid',
  gap: 8,
  marginTop: 8,
}

const nestedDetailsStyle: React.CSSProperties = {
  borderRadius: 12,
  border: '1px solid rgba(17, 24, 39, 0.08)',
  background: '#ffffff',
  padding: '8px 10px',
}

const nestedSummaryStyle: React.CSSProperties = {
  cursor: 'pointer',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 8,
  fontWeight: 700,
  color: '#111827',
}

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#374151',
}

const secondaryButtonStyle: React.CSSProperties = {
  border: '1px solid rgba(17, 24, 39, 0.12)',
  borderRadius: 999,
  background: '#ffffff',
  color: '#111827',
  padding: '5px 9px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
}

const disabledButtonStyle: React.CSSProperties = {
  ...secondaryButtonStyle,
  opacity: 0.48,
  cursor: 'not-allowed',
}

const disabledIconToolbarButtonStyle: React.CSSProperties = {
  ...iconToolbarButtonStyle,
  opacity: 0.48,
  cursor: 'not-allowed',
}

const commandMenuStyle: React.CSSProperties = {
  position: 'relative',
}

const commandMenuSummaryStyle: React.CSSProperties = {
  ...secondaryButtonStyle,
  listStyle: 'none',
  userSelect: 'none',
}

const commandMenuPanelStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 6px)',
  left: 0,
  zIndex: 20,
  minWidth: 164,
  display: 'grid',
  gap: 4,
  padding: 6,
  borderRadius: 12,
  border: '1px solid rgba(17, 24, 39, 0.12)',
  background: '#ffffff',
  boxShadow: '0 14px 30px rgba(15, 23, 42, 0.12)',
}

const menuActionButtonStyle: React.CSSProperties = {
  border: 'none',
  background: '#ffffff',
  color: '#111827',
  padding: '6px 8px',
  borderRadius: 8,
  textAlign: 'left',
  fontSize: 12,
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
