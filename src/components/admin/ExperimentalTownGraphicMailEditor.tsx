'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Konva from 'konva'
import { PDFDocument } from 'pdf-lib'
import { flushSync } from 'react-dom'
import { drawLayout, layout as layoutRichText } from 'render-tag'
import type { LayoutResult } from 'render-tag'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  ImagePlus,
  Italic,
  Layers,
  Lock,
  Minus,
  Plus,
  QrCode,
  Search,
  Trash2,
  Underline,
  Unlock,
  X,
} from 'lucide-react'
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Shape, Stage, Text, Transformer } from 'react-konva'
import { Button, useAuth } from '@payloadcms/ui'
import { useTenantSelection } from '@payloadcms/plugin-multi-tenant/client'

import {
  EDITOR_COMPONENTS,
  EDITOR_ZOOM_PRESETS,
  EditorLayerItem,
  appendEditorLayers,
  TEXT_ALIGNMENT_OPTIONS,
  TEXT_FONT_OPTIONS,
  EDITOR_RICH_TEXT_EDITOR_SCOPE_CSS,
  EDITOR_RICH_TEXT_LAYOUT_CSS,
  buildFontStyle,
  buildEditorLayers,
  clampNumber,
  createEditorNodeID,
  duplicateImage,
  duplicateRect,
  duplicateText,
  formatAutosaveLabel,
  getDashPattern,
  getCssFontWeight,
  getEditorLayerItem,
  getEditorRichTextHtml,
  getShortcutNudgeDistance,
  getFontStyleFlags,
  getResizedTextTransform,
  hasEditorClipboard,
  hydrateEditorLayers,
  isEditableTarget,
  measureEditorRichTextContentHeight,
  normalizeEditorRichTextHtml,
  patchEditorLayer,
  readEditorClipboard,
  removeEditorLayers,
  reorderCustomEditorLayer,
  reorderCustomEditorLayerToIndex,
  setEditorClipboard,
  stripEditorRichTextHtml,
  useEditorAutosave,
} from '@/components/admin/graphicsEditorShared'
import { useActiveTenant } from '@/components/admin/hooks/useActiveTenant'

const BASE_CANVAS_WIDTH = 1200
const BASE_CANVAS_HEIGHT = 1600
const STAGE_WIDTH = 1600
const STAGE_HEIGHT = 1000
const LETTER_WIDTH = 8.5 * 72
const LETTER_HEIGHT = 11 * 72
const PRINT_MARGIN = 0.25 * 72
const PRINT_GAP = 0.5 * 72
const PRINT_SLOT_WIDTH = LETTER_WIDTH - PRINT_MARGIN * 2
const PRINT_SLOT_HEIGHT = (LETTER_HEIGHT - PRINT_MARGIN * 2 - PRINT_GAP) / 2
const MAX_PREVIEW_WIDTH = 760
const MAX_PREVIEW_HEIGHT = 900
const SCENE_KIND = 'experimental-town-graphic/v1'
type MailSide = 'front' | 'back'
const DEFAULT_MAIL_SIDE: MailSide = 'front'
const BRAND_BLUE = '#6b7280'
const BRAND_RED = '#334155'
const BRAND_COLORS = [BRAND_BLUE, '#9ca3af', BRAND_RED, '#ffffff', '#111827']
const MAILER_BACKSIDE_ONE_ASSET_BASE = '/graphics-editor-mail/mailer-backside-one'
const MAILER_BACKSIDE_ONE_ASSETS = {
  paper: `${MAILER_BACKSIDE_ONE_ASSET_BASE}/notepaper.png`,
  qr: `${MAILER_BACKSIDE_ONE_ASSET_BASE}/qr.png`,
  arrow: `${MAILER_BACKSIDE_ONE_ASSET_BASE}/arrow.png`,
  screenshot: `${MAILER_BACKSIDE_ONE_ASSET_BASE}/site-screenshot.png`,
} as const
const MAILER_BACKSIDE_ONE_ROTATION = {
  paper: -118.4,
  arrow: 165.5,
} as const
const MAILER_BACKSIDE_ONE_FAST_FACTS = [
  {
    id: 'back-fast-facts-paper-title',
    x: 1109.0924655755005,
    y: 48.13236479459802,
    width: 416,
    text: 'FAST FACTS:\nHOUSE GOP PROPOSAL',
    fontSize: 31,
    fontFamily: '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive',
    fontStyle: '700',
  },
  {
    id: 'back-fast-facts-paper-spends',
    x: 1128.0009408766782,
    y: 89.88979796889627,
    width: 629,
    text: 'Spends less than budgets from\nlegislative Democrats and Governor',
    fontSize: 27,
    fontFamily: '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive',
    fontStyle: '700',
  },
  {
    id: 'back-fast-facts-paper-sustainable',
    x: 1177.008868253901,
    y: 164.62100357206862,
    width: 517,
    text: "Sustainable: Doesn’t rely on\nvolatile, one-time revenues",
    fontSize: 27,
    fontFamily: '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive',
    fontStyle: '700',
  },
  {
    id: 'back-fast-facts-paper-relief',
    x: 1212.1578947368423,
    y: 252.10526315789474,
    width: 481,
    text: 'Provides more than $400\nmillion in tax relief',
    fontSize: 27,
    fontFamily: '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive',
    fontStyle: '700',
  },
  {
    id: 'back-fast-facts-paper-cap',
    x: 1249.473684210525,
    y: 319.68421052631555,
    width: 445,
    text: 'More than $167 million\nbelow the spending cap',
    fontSize: 27,
    fontFamily: '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive',
    fontStyle: '700',
  },
  {
    id: 'back-fast-facts-paper-reclaims',
    x: 1297.8947368421036,
    y: 387.00000000000006,
    width: 430,
    text: 'Reclaims CT revenue\nfrom New York',
    fontSize: 27,
    fontFamily: '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive',
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
  'back-qr-website': { x: 1208, y: 935, width: 360, text: '{{website}}' },
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
  dashStyle?: 'solid' | 'dashed' | 'dotted'
  id: string
  fillEnabled?: boolean
  groupID?: string
  x: number
  y: number
  width: number
  height: number
  fill: string
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
}

type CustomTextElement = {
  id: string
  groupID?: string
  x: number
  y: number
  width: number
  height?: number
  rotation?: number
  text: string
  html?: string
  fontSize: number
  color: string
  opacity?: number
  fontFamily?: string
  fontStyle?: string
  letterSpacing?: number
  lineHeight?: number
  shadowBlur?: number
  shadowColor?: string
  shadowOffsetX?: number
  shadowOffsetY?: number
  shadowOpacity?: number
  strokeColor?: string
  strokeWidth?: number
  textAlign?: 'left' | 'center' | 'right'
  textDecoration?: string
}

type CustomImageElement = {
  id: string
  groupID?: string
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  opacity?: number
  blurRadius?: number
  brightness?: number
  grayscale?: boolean
  shadowBlur?: number
  shadowColor?: string
  shadowOffsetX?: number
  shadowOffsetY?: number
  shadowOpacity?: number
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
  qrUrl?: string
  eyebrow: EyebrowElement
  headline: SceneTextElement
  subhead: SubheadElement
  footer: FooterElement
  headshot: HeadshotElement
  customImages: CustomImageElement[]
  customRects: CustomRectElement[]
  customTexts: CustomTextElement[]
  customGroups: CustomGroup[]
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

type CustomSelection = Exclude<Selection, null> & {
  kind: 'custom-image' | 'custom-rect' | 'custom-text'
}

type TextSelection = Exclude<Selection, null> & {
  kind: 'eyebrow' | 'headline' | 'subhead' | 'footer' | 'custom-text'
}

type InlineTextEditorState = {
  target: TextSelection
  mode: 'plain' | 'rich'
  html?: string
  text?: string
} | null

type ContextMenuState = {
  x: number
  y: number
}

type CustomGroup = {
  id: string
  memberKeys: string[]
  opacity?: number
}

const getSelectionKey = (selection: CustomSelection) => `${selection.kind}:${selection.id}`
const isSameSelection = (left: CustomSelection, right: CustomSelection) => left.kind === right.kind && left.id === right.id
const stripHtml = stripEditorRichTextHtml
const RICH_TEXT_EDITOR_SCOPE_CSS = EDITOR_RICH_TEXT_EDITOR_SCOPE_CSS
const normalizeRichTextHtml = normalizeEditorRichTextHtml

const getCustomTextHtml = (item: Pick<CustomTextElement, 'html' | 'text'>) =>
  getEditorRichTextHtml(item)

const syncCustomTextHtmlStyles = (item: Pick<CustomTextElement, 'html' | 'text'>, patch: Partial<CustomTextElement>) => {
  const hasStylePatch =
    patch.color != null ||
    patch.fontFamily != null ||
    patch.fontSize != null ||
    patch.fontStyle != null ||
    patch.letterSpacing != null ||
    patch.lineHeight != null ||
    patch.textAlign != null ||
    patch.textDecoration != null

  if (!hasStylePatch) return patch

  const sourceHtml = patch.html ?? getCustomTextHtml(item)
  if (!sourceHtml.trim() || typeof window === 'undefined') return patch

  const temp = document.createElement('div')
  temp.innerHTML = normalizeRichTextHtml(sourceHtml)
  const blocks = Array.from(temp.querySelectorAll<HTMLElement>(RICH_TEXT_BLOCK_SELECTOR))
  const targets = blocks.length ? blocks : [temp]
  const fontStyle = patch.fontStyle || ''

  targets.forEach((block) => {
    if (patch.color != null) block.style.color = patch.color
    if (patch.fontFamily != null) block.style.fontFamily = patch.fontFamily
    if (patch.fontSize != null) block.style.fontSize = `${patch.fontSize}px`
    if (patch.letterSpacing != null) block.style.letterSpacing = `${patch.letterSpacing}px`
    if (patch.lineHeight != null) block.style.lineHeight = String(patch.lineHeight)
    if (patch.textAlign != null) block.style.textAlign = patch.textAlign
    if (patch.textDecoration != null) block.style.textDecoration = patch.textDecoration
    if (patch.fontStyle != null) {
      block.style.fontStyle = fontStyle.includes('italic') ? 'italic' : 'normal'
      block.style.fontWeight = String(getCssFontWeight(fontStyle))
    }
  })

  return {
    ...patch,
    html: temp.innerHTML,
  }
}

const toTitleCase = (value: string) => value.replace(/\b\w+/g, (segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())

const RICH_TEXT_BLOCK_SELECTOR = 'p, div, h1, h2, h3, li'

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

const dedupeMediaOptions = (docs: MediaDoc[]) => {
  const seen = new Set<string>()
  return docs.filter((doc) => {
    if (!doc?.id || seen.has(doc.id)) return false
    seen.add(doc.id)
    return true
  })
}

const buildMediaSearchParams = (tenantID: string, query = '') => {
  const params = new URLSearchParams()
  params.set('limit', '80')
  params.set('depth', '0')
  params.set('sort', '-updatedAt')
  params.set('where[tenant][equals]', tenantID)
  if (query.trim()) params.set('where[alt][like]', query.trim())
  return params
}

const slugToWebsite = (slug: string | null | undefined) =>
  slug ? `https://cthousegop.com/${slug}` : 'https://cthousegop.com'

type MergeTagContext = {
  repLastName: string
  officeTitle: string
  qrUrl: string
  repName: string
  secondaryRepName: string
  tenantSlug: string
  website: string
}

const resolveMergeTags = (value: string, context: MergeTagContext) =>
  value.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, rawKey) => {
    const key = String(rawKey).toLowerCase()
    if (key === 'website') return context.website
    if (key === 'tenant_slug') return context.tenantSlug
    if (key === 'rep_name') return context.repName
    if (key === 'rep_last_name') return context.repLastName
    if (key === 'secondary_rep_name') return context.secondaryRepName
    if (key === 'office_title') return context.officeTitle
    if (key === 'qr_url') return context.qrUrl
    return ''
  })

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

const loadImageNaturalSize = (src: string) =>
  new Promise<{ width: number; height: number }>((resolve) => {
    const image = new window.Image()
    image.onload = () => resolve({ width: image.naturalWidth || image.width || 1, height: image.naturalHeight || image.height || 1 })
    image.onerror = () => resolve({ width: 1, height: 1 })
    image.src = proxiedUrl(src) || src
  })

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
      for (const [id, src] of entries) {
        next[id] = src ? current[id] || null : null
      }
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

const measureCustomTextContentHeight = (item: Pick<CustomTextElement, 'html' | 'text' | 'width' | 'fontSize' | 'fontFamily' | 'lineHeight' | 'letterSpacing' | 'textAlign' | 'color' | 'fontStyle'>) =>
  measureMailRichTextLayoutHeight(item)

const measureCustomTextHeight = (item: Pick<CustomTextElement, 'html' | 'text' | 'width' | 'fontSize' | 'fontFamily' | 'lineHeight' | 'letterSpacing' | 'textAlign' | 'color' | 'fontStyle' | 'height'>) =>
  Math.max(1, Math.round(item.height ?? measureCustomTextContentHeight(item)))

const normalizeCustomTextBox = (
  item: CustomTextElement,
  patch: Partial<CustomTextElement>,
  options: { fitHeight?: boolean } = {},
) => {
  const nextWidth = Math.max(24, Math.round(patch.width ?? item.width))
  const nextFontSize = Math.max(8, Math.round(patch.fontSize ?? item.fontSize))
  const nextText = patch.text ?? item.text
  const nextHtml = patch.html ?? item.html
  const nextFontFamily = patch.fontFamily ?? item.fontFamily
  const nextLineHeight = patch.lineHeight ?? item.lineHeight
  const contentHeight = measureCustomTextContentHeight({
    ...item,
    ...patch,
    html: nextHtml,
    text: nextText,
    width: nextWidth,
    fontSize: nextFontSize,
    fontFamily: nextFontFamily,
    lineHeight: nextLineHeight,
  })
  const currentHeight = item.height ?? contentHeight
  const requestedHeight = patch.height != null ? Math.round(patch.height) : options.fitHeight ? contentHeight : currentHeight

  return {
    ...patch,
    width: nextWidth,
    fontSize: nextFontSize,
    height: options.fitHeight ? contentHeight : Math.max(8, requestedHeight),
  }
}

const getTransformerAnchorName = (node: Konva.Node | null) => {
  if (!node || typeof node.name !== 'function') return ''
  return node.name() || ''
}

type MailRichTextRenderBox = Pick<
  CustomTextElement,
  | 'html'
  | 'text'
  | 'width'
  | 'height'
  | 'fontFamily'
  | 'fontSize'
  | 'fontStyle'
  | 'lineHeight'
  | 'letterSpacing'
  | 'textAlign'
  | 'color'
  | 'strokeColor'
  | 'strokeWidth'
  | 'textDecoration'
>

const buildMailRichTextRenderHtml = (item: MailRichTextRenderBox, htmlOverride?: string) => {
  const width = Math.max(1, Math.round(item.width))
  const sourceHtml = htmlOverride ?? getCustomTextHtml(item)
  const html = normalizeRichTextHtml(sourceHtml)
  const fontStyle = item.fontStyle || ''
  const textStroke =
    item.strokeWidth && item.strokeColor
      ? `-webkit-text-stroke:${item.strokeWidth}px ${item.strokeColor};paint-order:stroke fill;`
      : ''

  return `
    <style>
      ${EDITOR_RICH_TEXT_LAYOUT_CSS}
      .mail-rich-text-root {
        width:${width}px;
        box-sizing:border-box;
        overflow:hidden;
        color:${item.color || '#111111'};
        font-family:${item.fontFamily || 'Arial'};
        font-size:${item.fontSize || 28}px;
        font-style:${fontStyle.includes('italic') ? 'italic' : 'normal'};
        font-weight:${getCssFontWeight(fontStyle)};
        line-height:${item.lineHeight || 1.1};
        letter-spacing:${item.letterSpacing || 0}px;
        text-align:${item.textAlign || 'left'};
        text-decoration:${item.textDecoration || 'none'};
        overflow-wrap:anywhere;
        word-break:break-word;
        white-space:normal;
        ${textStroke}
      }
    </style>
    <div class="mail-rich-text-root">${html}</div>
  `
}

const getMailRichTextLayout = (item: MailRichTextRenderBox, htmlOverride?: string): LayoutResult | null => {
  if (typeof document === 'undefined') return null
  try {
    return layoutRichText({
      accuracy: 'balanced',
      html: buildMailRichTextRenderHtml(item, htmlOverride),
      width: Math.max(1, Math.round(item.width)),
    })
  } catch {
    return null
  }
}

const measureMailRichTextLayoutHeight = (item: MailRichTextRenderBox, htmlOverride?: string) => {
  const layout = getMailRichTextLayout(item, htmlOverride)
  return layout ? Math.max(1, Math.ceil(layout.height)) : measureEditorRichTextContentHeight(item, '', {
    defaultFontFamily: 'Arial',
    defaultFontSize: 28,
    defaultLineHeight: 1.1,
  })
}

type MailRichTextShapeProps = {
  fallbackText: string
  fontRenderTick: number
  height: number
  html: string
  item: CustomTextElement
  onDblClick: () => void
  width: number
}

const MailRichTextShape: React.FC<MailRichTextShapeProps> = ({
  fallbackText,
  fontRenderTick,
  height,
  html,
  item,
  onDblClick,
  width,
}) => {
  const layoutResult = useMemo(() => {
    void fontRenderTick
    return getMailRichTextLayout({ ...item, width, height }, html)
  }, [fontRenderTick, height, html, item, width])

  if (!layoutResult) {
    return (
      <Text
        height={height}
        width={width}
        text={fallbackText}
        align={item.textAlign || 'left'}
        fontFamily={item.fontFamily || 'Arial'}
        fontSize={item.fontSize}
        fontStyle={item.fontStyle}
        fill={item.color}
        stroke={item.strokeWidth ? item.strokeColor || '#ffffff' : undefined}
        strokeWidth={item.strokeWidth || 0}
        letterSpacing={item.letterSpacing || 0}
        lineHeight={item.lineHeight || 1.1}
        textDecoration={item.textDecoration}
        onDblClick={onDblClick}
        onDblTap={onDblClick}
      />
    )
  }

  return (
    <Shape
      fill="#000000"
      height={height}
      width={width}
      onDblClick={onDblClick}
      onDblTap={onDblClick}
      sceneFunc={(context: Konva.Context) => {
        const canvasContext = (context as unknown as { _context?: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D })._context
        if (!canvasContext) return
        canvasContext.save()
        canvasContext.beginPath()
        canvasContext.rect(0, 0, width, height)
        canvasContext.clip()
        drawLayout({ layout: layoutResult, width, ctx: canvasContext, pixelRatio: 1 })
        canvasContext.restore()
      }}
      hitFunc={(context: Konva.Context, shape: Konva.Shape) => {
        context.beginPath()
        context.rect(0, 0, width, height)
        context.closePath()
        context.fillStrokeShape(shape)
      }}
    />
  )
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

const deriveDistrictLabel = (rows: TownDataRow[]) => {
  const labels = [...new Set(rows.map((row) => row.districtLabels?.trim()).filter(Boolean))]
  return labels[0] || 'Assembly District'
}

const deriveTownListText = (rows: TownDataRow[]) => rows.map((row) => row.town.trim()).filter(Boolean).join(', ')

const deriveFrontRepName = (repName: string | undefined | null) =>
  (repName || 'State Representative')
    .replace(/^rep\.?\s+/i, '')
    .trim()
    .toUpperCase()

const deriveFrontOfficeTitle = (officeTitle: string | undefined | null) =>
  (officeTitle || 'State Representative').trim().toUpperCase()

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
  const repName = data.repInfo?.name?.trim() || _tenantName?.trim() || 'State Representative'
  const officeTitle = deriveFrontOfficeTitle(data.repInfo?.officeTitle)
  const districtLabel = deriveDistrictLabel(data.townRows)
  const townListText = deriveTownListText(data.townRows)
  const websiteUrl = slugToWebsite(data.tenant?.slug)

  const scene = {
    kind: SCENE_KIND,
    backgroundMediaID: null,
    qrUrl: websiteUrl,
    eyebrow: {
      id: 'eyebrow',
      x: 0,
      y: 0,
      width: 0,
      text: '',
      fontSize: 14,
      color: 'transparent',
      fontFamily: 'Arial',
      fontStyle: '400',
      lineHeight: 1,
      barWidth: 0,
      barHeight: 0,
      paddingX: 0,
      paddingY: 0,
      backgroundColor: 'transparent',
    },
    headline: {
      id: 'headline',
      x: 0,
      y: 0,
      width: 0,
      text: '',
      fontSize: 16,
      color: 'transparent',
      fontFamily: 'Georgia, Times New Roman, serif',
      lineHeight: 1.05,
    },
    subhead: {
      id: 'subhead',
      x: 0,
      y: 0,
      dividerWidth: 0,
      dividerHeight: 0,
      dividerColor: 'transparent',
      text: '',
      fontSize: 16,
      color: 'transparent',
      fontFamily: 'Arial',
      fontStyle: '400',
    },
    footer: {
      id: 'footer',
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      backgroundColor: 'transparent',
      text: '',
      textX: 0,
      textY: 0,
      fontSize: 16,
      color: 'transparent',
      fontStyle: '400',
    },
    headshot: {
      id: 'headshot',
      x: 56.05263157894713,
      y: 63.7636995642679,
      size: 744,
      crop: {
        zoom: 1,
        offsetX: 0,
        offsetY: 0,
      },
    },
    customImages: [],
    customRects: [
      {
        id: 'front-footer-bar',
        x: -3.992525692930555,
        y: 900.4693589845019,
        width: 1151,
        height: 100,
        fill: '#000000',
        fillEnabled: true,
        opacity: 1,
        shapeType: 'rect',
        strokeColor: '#111827',
        strokeWidth: 0,
        rotation: 0,
      },
      {
        id: 'front-divider-line',
        x: 921.0072364013663,
        y: 287.2217826397355,
        width: 593,
        height: 296,
        fill: BRAND_RED,
        fillEnabled: false,
        opacity: 1,
        shapeType: 'line',
        strokeColor: BRAND_RED,
        strokeWidth: 8,
        rotation: -26.2,
      },
    ],
    customTexts: [
      {
        id: 'front-news-from',
        x: 1123.1578947368425,
        y: 85.47368421052624,
        width: 280,
        height: 96,
        text: 'News from',
        fontSize: 28,
        color: '#111111',
        opacity: 1,
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontStyle: 'italic',
        lineHeight: 1.1,
        strokeColor: '#ffffff',
        strokeWidth: 0,
        textAlign: 'center',
      },
      {
        id: 'front-office-title',
        x: 949.4736842105228,
        y: 123.99999999999858,
        width: 616,
        height: 96,
        text: officeTitle,
        fontSize: 41,
        color: '#111111',
        opacity: 1,
        fontFamily: '"Arial Narrow", Arial, sans-serif',
        fontStyle: 'normal',
        lineHeight: 1.1,
        strokeColor: '#ffffff',
        strokeWidth: 0,
        textAlign: 'center',
      },
      {
        id: 'front-rep-name',
        x: 869.9210526315726,
        y: 148.13157894736673,
        width: 749,
        height: 169,
        text: deriveFrontRepName(repName),
        fontSize: 140,
        color: '#111111',
        opacity: 1,
        fontFamily: '"Source Sans 3", "Source Sans Pro", Arial, sans-serif',
        fontStyle: 'bold',
        lineHeight: 1.1,
        strokeColor: '#ffffff',
        strokeWidth: 0,
        textAlign: 'center',
      },
      {
        id: 'front-district-label',
        x: 1035.999999999999,
        y: 300.842105263157,
        width: 424,
        height: 96,
        text: districtLabel,
        fontSize: 54,
        color: '#111111',
        opacity: 1,
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontStyle: 'italic',
        lineHeight: 1.1,
        strokeColor: '#ffffff',
        strokeWidth: 0,
        textAlign: 'center',
      },
      {
        id: 'front-town-list',
        x: 910.3421052631486,
        y: 350.13157894736344,
        width: 685,
        height: 165,
        text: townListText,
        fontSize: 67,
        color: '#111111',
        opacity: 1,
        fontFamily: '"Source Sans 3", "Source Sans Pro", Arial, sans-serif',
        fontStyle: 'italic bold',
        lineHeight: 1.1,
        strokeColor: '#ffffff',
        strokeWidth: 0,
        textAlign: 'center',
      },
      {
        id: 'front-website',
        x: 47.78947368420876,
        y: 898.1578947368342,
        width: 776,
        height: 58,
        text: '{{website}}',
        fontSize: 93,
        color: '#ffffff',
        opacity: 1,
        fontFamily: '"Source Sans 3", "Source Sans Pro", Arial, sans-serif',
        fontStyle: 'italic bold',
        lineHeight: 1.1,
        strokeColor: '#ffffff',
        strokeWidth: 0,
        rotation: 0,
      },
    ],
    customGroups: [],
    layers: [],
    townColumns: 1 as const,
    townRows: [],
  } satisfies ExperimentalTownScene

  return {
    ...scene,
    layers: buildEditorLayers(scene).map((item) =>
      item.kind === 'eyebrow' || item.kind === 'headline' || item.kind === 'subhead' || item.kind === 'footer'
        ? { ...item, hidden: true }
        : item,
    ),
  }
}

const createBackScene = (data: TownFundingResponse, tenantName: string | undefined) => {
  const repName = data.repInfo?.name?.trim() || tenantName?.trim() || 'State Representative'
  const websiteUrl = slugToWebsite(data.tenant?.slug)
  const backTownColumns = 1
  const backTownRows = data.townRows.map((row, index) => {
    const labelX = 43.855860304490726
    const amountX = labelX
    const labelY = 284.76745213018637 + index * 134

    return {
      id: row.id,
      townKey: normalizeTownKey(row.town),
      town: row.town,
      strapAid: row.strapAid,
      included: true,
      labelX,
      labelY,
      labelWidth: measureTownLabelWidth(row.town, 26),
      labelHeight: 40,
      amountX,
      amountY: labelY + 50,
      townFontSize: 26,
      amountFontSize: 45,
      labelColor: BRAND_RED,
      textColor: BRAND_BLUE,
    }
  })

  const scene = {
    kind: SCENE_KIND,
    backgroundMediaID: null,
    qrUrl: websiteUrl,
    eyebrow: {
      id: 'eyebrow',
      x: 33,
      y: 30,
      width: 488,
      text: '',
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
      x: 50.22305764411015,
      y: 64.69358327325051,
      width: 678,
      text: `{{rep_last_name}} Announces\nSchools/Taxpayers Relief &\nAffordability Plan (STRAP)`,
      fontSize: 37,
      color: '#000000',
      fontFamily: 'Georgia, Times New Roman, serif',
      fontStyle: '700',
      lineHeight: 1.05,
    },
    subhead: {
      id: 'subhead',
      x: 52.22305764411015,
      y: 210.6935832732505,
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
        x: 1074.368421052631,
        y: 63.31578947368405,
        width: 1121,
        height: 800,
        rotation: MAILER_BACKSIDE_ONE_ROTATION.paper,
        mediaID: 'mailer-backside-one-paper',
        sourceUrl: MAILER_BACKSIDE_ONE_ASSETS.paper,
        alt: 'Fast facts paper',
      },
      {
        id: 'back-site-screenshot',
        x: 602.7576202716812,
        y: 591.7646430550852,
        width: 472,
        height: 290,
        mediaID: 'mailer-backside-one-screenshot',
        sourceUrl: MAILER_BACKSIDE_ONE_ASSETS.screenshot,
        alt: 'Budget website screenshot',
      },
      {
        id: 'back-arrow',
        x: 1210.1331102575077,
        y: 680.2799738719633,
        width: 138,
        height: 188,
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
        x: 581.4393031508343,
        y: 577.1359038264176,
        width: 515,
        height: 328,
        fill: '#111111',
      },
      {
        id: 'back-monitor-screen',
        x: 602.1416062332052,
        y: 590.0000000000001,
        width: 474,
        height: 290,
        fill: '#ffffff',
      },
      {
        id: 'back-monitor-stand',
        x: 584.6962924191567,
        y: 904.0000000000005,
        width: 509,
        height: 53,
        fill: '#f1f1f1',
      },
      {
        id: 'back-monitor-base',
        x: 741,
        y: 957,
        width: 196,
        height: 59,
        fill: '#999',
      },
      {
        id: 'back-white-qr-panel',
        x: 1106.6272189349042,
        y: 621.0283876553846,
        width: 593,
        height: 414,
        fill: '#FFF',
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
        id: 'back-tax-relief-title',
        x: 619.8947368421052,
        y: 20.210526315789473,
        width: 652,
        text: 'TAX AND FEE RELIEF',
        fontSize: 58,
        color: '#111111',
        fontFamily: '"Arial Narrow", Arial, sans-serif',
        fontStyle: 'italic bold',
        lineHeight: 1,
      },
      {
        id: 'back-tax-relief-copy',
        x: 627.7894736841995,
        y: 86.36842105262713,
        width: 560,
        text:
          "Increase property tax credit\nReduce healthcare costs\nLower vehicle sales tax\nNo tax on tips\nEliminate many license fees\nEliminate Social Security tax\nRemove Passport to Parks fee\nEliminate children's clothing taxes\nProvide $2.5 million to help municipalities cover early voting costs.",
        fontSize: 32,
        color: '#111111',
        fontFamily: '"Source Sans 3", "Source Sans Pro", Arial, sans-serif',
        fontStyle: 'normal',
        lineHeight: 1.45,
      },
      {
        id: 'back-funding-title',
        x: 45.26315789473648,
        y: 679.7105263157888,
        width: 703,
        text: 'How the plan is funded',
        fontSize: 46,
        color: '#000000',
        fontFamily: 'Arial',
        fontStyle: '700',
        lineHeight: 1,
        textDecoration: 'none',
      },
      {
        id: 'back-funding-copy',
        x: 42.05263157894723,
        y: 751.5263157894724,
        width: 523,
        text:
          'Recover $340 million by challenging New York’s “convenience of employer” rule.\nSave $153 million by budgeting state employee positions based on realistic hiring trends rather than funding all vacancies at once.',
        fontSize: 28,
        color: '#111111',
        fontFamily: '"Source Sans 3", "Source Sans Pro", Arial, sans-serif',
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
        x: 1125.473684210526,
        y: 630.5789473684206,
        width: 551,
        text: 'SCAN FOR MORE DETAILS',
        fontSize: 42,
        color: '#111111',
        fontFamily: '"Arial Narrow", Arial, sans-serif',
        fontStyle: '700',
        lineHeight: 1,
      },
      {
        id: 'back-qr-or-visit',
        x: 1127.1842105263147,
        y: 921.8947368421025,
        width: 509,
        text: 'OR VISIT:',
        fontSize: 31,
        color: '#111111',
        fontFamily: '"Source Sans 3", "Source Sans Pro", Arial, sans-serif',
        fontStyle: 'bold',
        lineHeight: 1.1,
      },
      {
        id: 'back-qr-website',
        x: 1128.6578947368416,
        y: 946.5263157894709,
        width: 509,
        text: '{{website}}',
        fontSize: 51,
        color: '#111111',
        fontFamily: '"Source Sans 3", "Source Sans Pro", Arial, sans-serif',
        fontStyle: 'bold',
        lineHeight: 1.1,
      },
      {
        id: 'back-top-banner-text',
        x: 75.18421052631442,
        y: 19.631578947365675,
        width: 509,
        text: 'Pitching Real Relief for Connecticut',
        fontSize: 26,
        color: '#ffffff',
        fontFamily: '"Source Sans 3", "Source Sans Pro", Arial, sans-serif',
        fontStyle: 'bold',
        lineHeight: 1.1,
      },
    ],
    customGroups: [],
    layers: [],
    townColumns: backTownColumns as 1 | 2,
    townRows: backTownRows,
  } satisfies ExperimentalTownScene

  return {
    ...scene,
    layers: buildEditorLayers(scene),
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
    customGroups: Array.isArray(savedScene.customGroups) ? savedScene.customGroups : [],
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
  const customImageNodeRefs = useRef<Record<string, Konva.Image | null>>({})
  const customRectRefs = useRef<Record<string, Konva.Group | null>>({})
  const customTextRefs = useRef<Record<string, Konva.Group | null>>({})
  const richTextEditorRef = useRef<HTMLDivElement | null>(null)
  const richTextEditorSeedRef = useRef<string | null>(null)
  const textToolbarRef = useRef<HTMLDivElement | null>(null)
  const richTextSelectionRef = useRef<Range | null>(null)
  const dragSelectionSnapshotRef = useRef<Record<string, { x: number; y: number }> | null>(null)
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
  const customTextTransformPreviewRef = useRef<Record<string, Partial<CustomTextElement>>>({})
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
  const [fontRenderTick, setFontRenderTick] = useState(0)
  const [isResizingHeadline, setIsResizingHeadline] = useState(false)
  const [previewZoom, setPreviewZoom] = useState(1)
  const [activeMailSide, setActiveMailSide] = useState<MailSide>(DEFAULT_MAIL_SIDE)

  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [townData, setTownData] = useState<TownFundingResponse | null>(null)
  const [frontScene, setFrontScene] = useState<ExperimentalTownScene | null>(null)
  const [backScene, setBackScene] = useState<ExperimentalTownScene | null>(null)
  const [selection, setSelection] = useState<Selection>(null)
  const [selectedCustomTargets, setSelectedCustomTargets] = useState<CustomSelection[]>([])
  const [inlineTextEditor, setInlineTextEditor] = useState<InlineTextEditorState>(null)
  const [customTextTransformPreview, setCustomTextTransformPreview] = useState<Record<string, Partial<CustomTextElement>>>({})
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
  const [downloadingPrintPdf, setDownloadingPrintPdf] = useState(false)
  const [downloadingPptx, setDownloadingPptx] = useState(false)
  const [exportingAllReps, setExportingAllReps] = useState(false)
  const [mailExportJob, setMailExportJob] = useState<MailExportJobState | null>(null)
  const [designsSectionOpen, setDesignsSectionOpen] = useState(false)
  const [contentSectionOpen, setContentSectionOpen] = useState(false)
  const [imagesSectionOpen, setImagesSectionOpen] = useState(false)
  const [townsSectionOpen, setTownsSectionOpen] = useState(false)
  const [inspectorSectionOpen, setInspectorSectionOpen] = useState(false)
  const [templateSectionOpen, setTemplateSectionOpen] = useState(false)
  const [sceneRevision, setSceneRevision] = useState(0)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [mediaQuery, setMediaQuery] = useState('')
  const [draggedLayerKey, setDraggedLayerKey] = useState<string | null>(null)

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
    if (typeof document === 'undefined' || !('fonts' in document)) return
    let cancelled = false
    document.fonts.ready
      .then(() => {
        if (!cancelled) setFontRenderTick((tick) => tick + 1)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
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
    if (!isMounted || !tenantID) {
      setMediaOptions([])
      return
    }

    let cancelled = false

    const loadMedia = async () => {
      try {
        const response = await fetch(`/api/media?${buildMediaSearchParams(tenantID, mediaQuery).toString()}`, {
          credentials: 'include',
        })
        const payload = await response.json()
        if (!response.ok) throw new Error(getString(asRecord(payload).message) || 'Failed to load media')
        if (!cancelled) {
          const docs = Array.isArray(asRecord(payload).docs) ? ((asRecord(payload).docs as MediaDoc[]) || []) : []
          setMediaOptions(dedupeMediaOptions(docs))
        }
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : String(error))
      }
    }

    void loadMedia()
    return () => {
      cancelled = true
    }
  }, [isMounted, mediaQuery, tenantID])

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
  const mergeTagContext = useMemo<MergeTagContext>(() => {
    const tenantSlug = townData?.tenant?.slug || ''
    const website = slugToWebsite(tenantSlug)
    const repName = townData?.repInfo?.name?.trim() || tenantName || ''
    const repLastName = buildRepShortName(repName).replace(/^Rep\.\s*/i, '')
    return {
      officeTitle: townData?.repInfo?.officeTitle?.trim() || 'State Representative',
      qrUrl: scene?.qrUrl?.trim() || website,
      repLastName,
      repName,
      secondaryRepName: '',
      tenantSlug,
      website,
    }
  }, [scene?.qrUrl, tenantName, townData?.repInfo?.name, townData?.repInfo?.officeTitle, townData?.tenant?.slug])
  const resolveSceneText = useCallback((value: string) => resolveMergeTags(value || '', mergeTagContext), [mergeTagContext])
  const resolveSceneHtml = useCallback((value: string) => resolveMergeTags(value || '', mergeTagContext), [mergeTagContext])

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
  const selectedCustomKeys = useMemo(
    () => new Set(selectedCustomTargets.map((item) => getSelectionKey(item))),
    [selectedCustomTargets],
  )
  const canGroupSelectedCustomTargets = selectedCustomTargets.length > 1
  const getCustomGroupMembers = (target: CustomSelection, sourceScene: ExperimentalTownScene | null = scene) => {
    if (!sourceScene) return [target]
    const collection =
      target.kind === 'custom-image'
        ? sourceScene.customImages
        : target.kind === 'custom-rect'
          ? sourceScene.customRects
          : sourceScene.customTexts
    const entry = collection.find((item) => item.id === target.id)
    const groupID = entry?.groupID
    if (!groupID) return [target]

    const members: CustomSelection[] = [
      ...sourceScene.customImages.filter((item) => item.groupID === groupID).map((item) => ({ kind: 'custom-image' as const, id: item.id })),
      ...sourceScene.customRects.filter((item) => item.groupID === groupID).map((item) => ({ kind: 'custom-rect' as const, id: item.id })),
      ...sourceScene.customTexts.filter((item) => item.groupID === groupID).map((item) => ({ kind: 'custom-text' as const, id: item.id })),
    ]
    return members.length ? members : [target]
  }
  const setPrimarySelection = (nextSelection: Selection) => {
    setSelection(nextSelection)
    if (!nextSelection || (nextSelection.kind !== 'custom-image' && nextSelection.kind !== 'custom-rect' && nextSelection.kind !== 'custom-text')) {
      setSelectedCustomTargets([])
      return
    }
    setSelectedCustomTargets(getCustomGroupMembers(nextSelection))
  }
  const toggleCustomSelection = (target: CustomSelection) => {
    const targetGroup = getCustomGroupMembers(target)
    setSelectedCustomTargets((current) => {
      const hasAll = targetGroup.every((item) => current.some((entry) => isSameSelection(entry, item)))
      const next = hasAll
        ? current.filter((entry) => !targetGroup.some((item) => isSameSelection(entry, item)))
        : [...current.filter((entry) => !targetGroup.some((item) => isSameSelection(entry, item))), ...targetGroup]
      const nextPrimary = next.find((entry) => isSameSelection(entry, target)) || next[next.length - 1] || null
      setSelection(nextPrimary)
      return next
    })
  }
  const handleCustomSelection = (target: CustomSelection, additive = false) => {
    if (isLayerLocked(target.kind, target.id) || isLayerHidden(target.kind, target.id)) return
    if (additive) {
      toggleCustomSelection(target)
      return
    }
    setSelection(target)
    setSelectedCustomTargets(getCustomGroupMembers(target))
  }

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
            return { item, label: row ? row.town : 'Town row', reorderable: true }
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
          return { item, label: labels[item.kind] || item.kind, reorderable: true }
        }),
    [scene],
  )
  const getLayerOrder = useCallback(
    (kind: EditorLayerItem['kind'], id: string) => getLayerState(kind, id)?.order ?? 0,
    [layerStateMap],
  )
  const townStackOrder = useMemo(() => {
    const townOrders = (scene?.layers || [])
      .filter((item) => item.kind === 'town')
      .map((item) => item.order)
      .sort((left, right) => left - right)
    return townOrders[0] ?? 0
  }, [scene?.layers])
  const rightTownStackOrder = useMemo(() => townStackOrder + 1, [townStackOrder])

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
  const filteredMediaOptions = useMemo(() => {
    const query = mediaQuery.trim().toLowerCase()
    if (!query) return mediaOptions
    return mediaOptions.filter((media) =>
      [media.alt, media.title, media.filename].some((part) => typeof part === 'string' && part.toLowerCase().includes(query)),
    )
  }, [mediaOptions, mediaQuery])

  useEffect(() => {
    if (!selection) return
    if (!isLayerHidden(selection.kind, selection.id)) return
    setPrimarySelection(null)
    setInlineTextEditor(null)
  }, [isLayerHidden, selection])

  useEffect(() => {
    const transformer = transformerRef.current
    if (!transformer) return

    const multiNodes =
      selectedCustomTargets.length > 1
        ? selectedCustomTargets
            .map((target) =>
              target.kind === 'custom-image'
                ? customImageRefs.current[target.id] || null
                : target.kind === 'custom-rect'
                  ? customRectRefs.current[target.id] || null
                  : customTextRefs.current[target.id] || null,
            )
            .filter(Boolean) as Konva.Node[]
        : []
    const singleNode =
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

    if (multiNodes.length > 1) {
      transformer.nodes(multiNodes)
      transformer.getLayer()?.batchDraw()
      return
    }

    if (singleNode && !selectedLayer?.locked) {
      transformer.nodes([singleNode])
      transformer.getLayer()?.batchDraw()
      return
    }

    transformer.nodes([])
    transformer.getLayer()?.batchDraw()
  }, [scene, selectedCustomTargets, selectedLayer?.locked, selection])

  useEffect(() => {
    if (selection?.kind !== 'headline') {
      setIsResizingHeadline(false)
    }
  }, [selection])

  useEffect(() => {
    if (!selection || (selection.kind !== 'custom-image' && selection.kind !== 'custom-rect' && selection.kind !== 'custom-text')) {
      if (selectedCustomTargets.length) setSelectedCustomTargets([])
      return
    }
    if (!selectedCustomTargets.some((item) => isSameSelection(item, selection))) {
      setSelectedCustomTargets(getCustomGroupMembers(selection))
    }
  }, [selectedCustomTargets, selection])

  useEffect(() => {
    if (selection && ['eyebrow', 'headline', 'subhead', 'footer', 'custom-text'].includes(selection.kind) && selectedCustomTargets.length <= 1) return
    setInlineTextEditor(null)
  }, [selectedCustomTargets.length, selection])

  useEffect(() => {
    if (!inlineTextEditor || inlineTextEditor.mode !== 'rich' || !richTextEditorRef.current) return
    const editorKey = `${inlineTextEditor.target.kind}:${inlineTextEditor.target.id}`
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

  useEffect(() => {
    if (!scene) return
    scene.customImages.forEach((item) => {
      const node = customImageNodeRefs.current[item.id]
      if (!node) return
      const hasFilters = Boolean(item.grayscale || item.blurRadius || item.brightness)
      if (hasFilters) {
        node.cache()
      } else {
        node.clearCache()
      }
    })
    stageRef.current?.getLayers().forEach((layer) => layer.batchDraw())
  }, [customImages, scene])

  useEffect(() => {
    const handleWindowPointerDown = () => setContextMenu(null)
    window.addEventListener('pointerdown', handleWindowPointerDown)
    window.addEventListener('scroll', handleWindowPointerDown, true)
    return () => {
      window.removeEventListener('pointerdown', handleWindowPointerDown)
      window.removeEventListener('scroll', handleWindowPointerDown, true)
    }
  }, [])

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
    if (!selection || !getEditorLayerItem(getActiveScene(side)?.layers, getLayerTarget(selection))) return false
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
    if (!getEditorLayerItem(getActiveScene(side)?.layers, target)) return false
    updateScene(
      (current) => ({
        ...current,
        layers: reorderCustomEditorLayer(current.layers, target, direction),
      }),
      side,
    )
    return true
  }

  const moveLayerTargetToIndex = (
    target: { id: string; kind: EditorLayerItem['kind'] },
    nextIndex: number,
    side: MailSide = activeMailSide,
  ) => {
    if (!getEditorLayerItem(getActiveScene(side)?.layers, target)) return false
    updateScene(
      (current) => ({
        ...current,
        layers: reorderCustomEditorLayerToIndex(current.layers, target, nextIndex),
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

  const restoreTownRowsForSide = (side: MailSide = activeMailSide) => {
    if (!townData) return
    const seedScene = side === 'back' ? createBackScene(townData, tenantName) : createBaseScene(townData, tenantName)
    updateScene(
      (current) => ({
        ...current,
        townColumns: seedScene.townColumns,
        townRows: seedScene.townRows,
        layers: hydrateEditorLayers({
          baseLayers: buildEditorLayers({
            ...current,
            townRows: seedScene.townRows,
          }),
          savedLayers: (current.layers || []).filter((item) => item.kind !== 'town'),
        }),
      }),
      side,
    )
    setSelection(null)
  }

  const addCustomRect = (shapeType: 'rect' | 'circle' | 'line' = 'rect') => {
    let nextID = ''
    updateScene((current) => {
      const nextRect = {
        id: createEditorNodeID('custom-rect'),
        x: 120,
        y: 120,
        width: shapeType === 'line' ? 240 : 320,
        height: shapeType === 'circle' ? 180 : shapeType === 'line' ? 120 : 56,
        fill: BRAND_RED,
        fillEnabled: shapeType !== 'line',
        opacity: 1,
        shapeType,
        strokeColor: shapeType === 'line' ? BRAND_RED : '#111827',
        strokeWidth: shapeType === 'line' ? 8 : 0,
      }
      nextID = nextRect.id
      return {
        ...current,
        customRects: [...current.customRects, nextRect],
        layers: appendEditorLayers(current.layers, [{ id: nextRect.id, kind: 'custom-rect', group: 'custom' }]),
      }
    })
    if (nextID) handleCustomSelection({ kind: 'custom-rect', id: nextID })
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
        html: '<p><strong>Custom text</strong></p>',
        fontSize: 28,
        color: '#111111',
        opacity: 1,
        fontFamily: 'Arial',
        fontStyle: '700',
        lineHeight: 1.1,
        strokeColor: '#ffffff',
        strokeWidth: 0,
      }
      nextID = nextText.id
      return {
        ...current,
        customTexts: [...current.customTexts, nextText],
        layers: appendEditorLayers(current.layers, [{ id: nextText.id, kind: 'custom-text', group: 'custom' }]),
      }
    })
    if (nextID) handleCustomSelection({ kind: 'custom-text', id: nextID })
  }

  const addCustomImage = async (mediaDoc: MediaDoc) => {
    const rawUrl = readRawMediaUrl(mediaDoc)
    if (!rawUrl) throw new Error('Uploaded media did not include a URL')
    const naturalSize = await loadImageNaturalSize(rawUrl)
    const aspectRatio = naturalSize.width > 0 && naturalSize.height > 0 ? naturalSize.width / naturalSize.height : 1
    const maxInsertWidth = 360
    const maxInsertHeight = 260
    const width = Math.max(96, Math.round(Math.min(maxInsertWidth, maxInsertHeight * aspectRatio)))
    const height = Math.max(96, Math.round(width / Math.max(aspectRatio, 0.01)))

    let nextID = ''
    updateScene((current) => {
      const nextImage = {
        id: createEditorNodeID('custom-image'),
        x: 180,
        y: 180,
        width: width > maxInsertWidth ? maxInsertWidth : width,
        height: width > maxInsertWidth ? Math.max(96, Math.round(maxInsertWidth / Math.max(aspectRatio, 0.01))) : height,
        opacity: 1,
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
    if (nextID) handleCustomSelection({ kind: 'custom-image', id: nextID })
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
      customTexts: current.customTexts.map((item) =>
        item.id === textID ? { ...item, ...normalizeCustomTextBox(item, syncCustomTextHtmlStyles(item, patch)) } : item,
      ),
    }))
  }

  const setCustomTextTransformPreviewPatch = (textID: string, patch: Partial<CustomTextElement> | null) => {
    const currentPatch = customTextTransformPreviewRef.current[textID]
    if (!patch && !currentPatch) return
    if (patch && currentPatch && JSON.stringify(currentPatch) === JSON.stringify(patch)) return
    const next = { ...customTextTransformPreviewRef.current }
    if (patch) next[textID] = patch
    else delete next[textID]
    customTextTransformPreviewRef.current = next
    setCustomTextTransformPreview(next)
  }

  const fitCustomTextToContent = useCallback((textID: string) => {
    updateScene((current) => ({
      ...current,
      customTexts: current.customTexts.map((item) =>
        item.id === textID ? { ...item, ...normalizeCustomTextBox(item, {}, { fitHeight: true }) } : item,
      ),
    }))
  }, [updateScene])

  useEffect(() => {
    const transformer = transformerRef.current
    if (!transformer || selection?.kind !== 'custom-text') return

    const anchors = transformer.find('._anchor')
    const sideAnchors = anchors.filter((anchor) => {
      const name = getTransformerAnchorName(anchor)
      return (
        name.includes('middle-left') ||
        name.includes('middle-right') ||
        name.includes('top-center') ||
        name.includes('bottom-center')
      )
    })

    sideAnchors.forEach((anchor) => {
      anchor.on('dblclick.fittext dbltap.fittext', () => fitCustomTextToContent(selection.id))
    })

    return () => {
      sideAnchors.forEach((anchor) => anchor.off('dblclick.fittext dbltap.fittext'))
    }
  }, [fitCustomTextToContent, selection])

  useEffect(() => {
    if (selection?.kind !== 'custom-text') return
    if (!customTextTransformPreview[selection.id]) return
    transformerRef.current?.forceUpdate()
    stageRef.current?.getLayers().forEach((layer) => layer.batchDraw())
  }, [customTextTransformPreview, selection])

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

  const updateSelectedTextLayer = (target: TextSelection, patch: Partial<SceneTextElement | SubheadElement | FooterElement | CustomTextElement>) => {
    updateScene((current) => {
      if (target.kind === 'eyebrow') return { ...current, eyebrow: { ...current.eyebrow, ...patch } }
      if (target.kind === 'headline') return syncSubheadToHeadline({ ...current, headline: { ...current.headline, ...patch } })
      if (target.kind === 'subhead') return { ...current, subhead: { ...current.subhead, ...patch } }
      if (target.kind === 'custom-text') {
        return {
          ...current,
          customTexts: current.customTexts.map((item) =>
            item.id === target.id
              ? { ...item, ...normalizeCustomTextBox(item, syncCustomTextHtmlStyles(item, patch as Partial<CustomTextElement>)) }
              : item,
          ),
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

  const resolveSceneForOutput = useCallback(
    (source: ExperimentalTownScene): ExperimentalTownScene => ({
      ...source,
      eyebrow: { ...source.eyebrow, text: resolveSceneText(source.eyebrow.text) },
      headline: { ...source.headline, text: resolveSceneText(source.headline.text) },
      subhead: { ...source.subhead, text: resolveSceneText(source.subhead.text) },
      footer: { ...source.footer, text: resolveSceneText(source.footer.text) },
      customTexts: source.customTexts.map((item) => ({
        ...item,
        text: resolveSceneText(item.text),
        html: item.html ? resolveSceneHtml(item.html) : item.html,
      })),
    }),
    [resolveSceneHtml, resolveSceneText],
  )

  const getResolvedSceneBundle = useCallback((): MailSceneBundle | null => {
    const bundle = getCurrentSceneBundle()
    if (!bundle) return null
    return {
      ...bundle,
      frontScene: resolveSceneForOutput(bundle.frontScene),
      backScene: resolveSceneForOutput(bundle.backScene),
    }
  }, [resolveSceneForOutput])

  const resolveTextLayer = (current: ExperimentalTownScene, target: TextSelection) => resolveSelectedTextLayer(current, target)

  const beginInlineTextEdit = (target: TextSelection) => {
    const currentScene = getActiveScene()
    if (!currentScene) return
    if (isLayerLocked(target.kind, target.id)) return
    const currentLayer = resolveTextLayer(currentScene, target)
    if (!currentLayer) return
    setPrimarySelection(target)
    if (target.kind === 'custom-text') {
      setInlineTextEditor({ target, mode: 'rich', html: getCustomTextHtml(currentLayer as CustomTextElement) })
      return
    }
    setInlineTextEditor({ target, mode: 'plain', text: currentLayer.text || '' })
  }

  const commitInlineTextEdit = () => {
    if (!inlineTextEditor) return
    if (inlineTextEditor.mode === 'rich' && inlineTextEditor.target.kind === 'custom-text') {
      const currentScene = getActiveScene()
      const currentItem = currentScene?.customTexts.find((item) => item.id === inlineTextEditor.target.id) || null
      const html = normalizeRichTextHtml(richTextEditorRef.current?.innerHTML || inlineTextEditor.html || '')
      const text = stripHtml(html).replace(/\u00a0/g, ' ').trim() || 'Text'
      updateCustomText(inlineTextEditor.target.id, {
        html,
        text,
        height: currentItem?.height,
      })
      richTextEditorSeedRef.current = null
      setInlineTextEditor(null)
      return
    }
    updateSelectedTextLayer(inlineTextEditor.target, { text: inlineTextEditor.text || '' })
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
      setTemplateTitle('Experimental Town Graphic')
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
      setDesignTitle(buildDesignTitle(townData.tenant?.name || tenantName, 'Town Graphic'))
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
      setMediaOptions((current) => dedupeMediaOptions([mediaDoc, ...current]))
      await addCustomImage(mediaDoc)
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
      websiteText: mergeTagContext.website,
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
      handleCustomSelection(isText ? { kind: 'custom-text', id: selectedID } : { kind: 'custom-rect', id: selectedID })
    }
    setMessage(`${component.label} inserted on ${side}`)
  }

  const getActiveCustomSelections = () =>
    selectedCustomTargets.length
      ? selectedCustomTargets
      : selection && (selection.kind === 'custom-image' || selection.kind === 'custom-rect' || selection.kind === 'custom-text')
        ? [selection]
        : []
  const canUngroupSelectedCustomTargets = getActiveCustomSelections().some((target) => {
    if (!scene) return false
    if (target.kind === 'custom-image') return Boolean(scene.customImages.find((item) => item.id === target.id)?.groupID)
    if (target.kind === 'custom-rect') return Boolean(scene.customRects.find((item) => item.id === target.id)?.groupID)
    return Boolean(scene.customTexts.find((item) => item.id === target.id)?.groupID)
  })

  const groupSelectedCustomObjects = (side: MailSide = activeMailSide) => {
    const targets = getActiveCustomSelections()
    if (targets.length < 2) return false
    const groupID = createEditorNodeID('custom-group')
    const memberKeys = targets.map((target) => getSelectionKey(target))
    updateScene(
      (current) => ({
        ...current,
        customImages: current.customImages.map((item) =>
          targets.some((target) => target.kind === 'custom-image' && target.id === item.id) ? { ...item, groupID } : item,
        ),
        customRects: current.customRects.map((item) =>
          targets.some((target) => target.kind === 'custom-rect' && target.id === item.id) ? { ...item, groupID } : item,
        ),
        customTexts: current.customTexts.map((item) =>
          targets.some((target) => target.kind === 'custom-text' && target.id === item.id) ? { ...item, groupID } : item,
        ),
        customGroups: [...current.customGroups.filter((group) => !memberKeys.some((key) => group.memberKeys.includes(key))), { id: groupID, memberKeys }],
      }),
      side,
    )
    return true
  }

  const ungroupSelectedCustomObjects = (side: MailSide = activeMailSide) => {
    const currentScene = getActiveScene(side)
    if (!currentScene) return false
    const selectedGroupIDs = new Set(
      getActiveCustomSelections()
        .map((target) => {
          if (target.kind === 'custom-image') return currentScene.customImages.find((item) => item.id === target.id)?.groupID
          if (target.kind === 'custom-rect') return currentScene.customRects.find((item) => item.id === target.id)?.groupID
          return currentScene.customTexts.find((item) => item.id === target.id)?.groupID
        })
        .filter((value): value is string => Boolean(value)),
    )
    if (!selectedGroupIDs.size) return false
    updateScene(
      (current) => ({
        ...current,
        customImages: current.customImages.map((item) => (item.groupID && selectedGroupIDs.has(item.groupID) ? { ...item, groupID: undefined } : item)),
        customRects: current.customRects.map((item) => (item.groupID && selectedGroupIDs.has(item.groupID) ? { ...item, groupID: undefined } : item)),
        customTexts: current.customTexts.map((item) => (item.groupID && selectedGroupIDs.has(item.groupID) ? { ...item, groupID: undefined } : item)),
        customGroups: current.customGroups.filter((group) => !selectedGroupIDs.has(group.id)),
      }),
      side,
    )
    return true
  }

  const duplicateSelectedCustomObject = (side: MailSide = activeMailSide) => {
    const currentScene = getActiveScene(side)
    const targets = getActiveCustomSelections()
    if (!currentScene || !targets.length) return false

    const duplicated: CustomSelection[] = []
    const nextGroupID = targets.length > 1 ? createEditorNodeID('custom-group') : undefined

    updateScene((draft) => {
      const nextRects = [...draft.customRects]
      const nextTexts = [...draft.customTexts]
      const nextImages = [...draft.customImages]
      const nextLayers: Omit<EditorLayerItem, 'order'>[] = []

      targets.forEach((target) => {
        if (target.kind === 'custom-rect') {
          const current = currentScene.customRects.find((item) => item.id === target.id)
          if (!current) return
          const nextRect = { ...duplicateRect(current), groupID: nextGroupID }
          nextRects.push(nextRect)
          nextLayers.push({ id: nextRect.id, kind: 'custom-rect', group: 'custom' })
          duplicated.push({ kind: 'custom-rect', id: nextRect.id })
          return
        }

        if (target.kind === 'custom-text') {
          const current = currentScene.customTexts.find((item) => item.id === target.id)
          if (!current) return
          const nextText = { ...duplicateText(current), groupID: nextGroupID }
          nextTexts.push(nextText)
          nextLayers.push({ id: nextText.id, kind: 'custom-text', group: 'custom' })
          duplicated.push({ kind: 'custom-text', id: nextText.id })
          return
        }

        const current = currentScene.customImages.find((item) => item.id === target.id)
        if (!current) return
        const nextImage = { ...duplicateImage(current), groupID: nextGroupID }
        nextImages.push(nextImage)
        nextLayers.push({ id: nextImage.id, kind: 'custom-image', group: 'custom' })
        duplicated.push({ kind: 'custom-image', id: nextImage.id })
      })

      return {
        ...draft,
        customRects: nextRects,
        customTexts: nextTexts,
        customImages: nextImages,
        customGroups:
          nextGroupID && duplicated.length > 1
            ? [...draft.customGroups, { id: nextGroupID, memberKeys: duplicated.map((item) => getSelectionKey(item)) }]
            : draft.customGroups,
        layers: appendEditorLayers(draft.layers, nextLayers),
      }
    }, side)

    if (duplicated.length) {
      const primary = duplicated[0]
      if (primary) setSelection(primary)
      setSelectedCustomTargets(duplicated)
      return true
    }
    return false
  }

  const deleteSelectedCustomObject = (side: MailSide = activeMailSide) => {
    const targets = getActiveCustomSelections()
    if (!targets.length) return false
    const targetKeys = new Set(targets.map((target) => getSelectionKey(target)))
    updateScene((current) => ({
      ...current,
      customRects: current.customRects.filter((item) => !targetKeys.has(`custom-rect:${item.id}`)),
      customTexts: current.customTexts.filter((item) => !targetKeys.has(`custom-text:${item.id}`)),
      customImages: current.customImages.filter((item) => !targetKeys.has(`custom-image:${item.id}`)),
      customGroups: current.customGroups.filter((group) => !group.memberKeys.some((key) => targetKeys.has(key))),
      layers: removeEditorLayers(current.layers, targets.map((target) => ({ id: target.id, kind: target.kind }))),
    }), side)
    setPrimarySelection(null)
    return true
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
      handleCustomSelection({ kind: 'custom-rect', id: nextRect.id })
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
      handleCustomSelection({ kind: 'custom-text', id: nextText.id })
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
      handleCustomSelection({ kind: 'custom-image', id: nextImage.id })
      return true
    }

    return false
  }

  const nudgeSelectedObject = (deltaX: number, deltaY: number, side: MailSide = activeMailSide) => {
    const targets = getActiveCustomSelections()
    if (!targets.length) return false
    if (targets.some((target) => isLayerLocked(target.kind, target.id))) return false
    updateScene((current) => ({
      ...current,
      customRects: current.customRects.map((item) =>
        targets.some((target) => target.kind === 'custom-rect' && target.id === item.id)
          ? { ...item, x: item.x + deltaX, y: item.y + deltaY }
          : item,
      ),
      customTexts: current.customTexts.map((item) =>
        targets.some((target) => target.kind === 'custom-text' && target.id === item.id)
          ? { ...item, x: item.x + deltaX, y: item.y + deltaY }
          : item,
      ),
      customImages: current.customImages.map((item) =>
        targets.some((target) => target.kind === 'custom-image' && target.id === item.id)
          ? { ...item, x: item.x + deltaX, y: item.y + deltaY }
          : item,
      ),
    }), side)
    return true
  }

  const openContextMenu = (
    event: { clientX: number; clientY: number; preventDefault: () => void; stopPropagation?: () => void },
    nextSelection?: Selection,
  ) => {
    event.preventDefault()
    event.stopPropagation?.()
    if (nextSelection) {
      if (nextSelection.kind === 'custom-image' || nextSelection.kind === 'custom-rect' || nextSelection.kind === 'custom-text') {
        if (!selectedCustomTargets.some((item) => isSameSelection(item, nextSelection))) {
          handleCustomSelection(nextSelection)
        }
      } else {
        setPrimarySelection(nextSelection)
      }
    }
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
    })
  }

  const beginCustomDrag = (target: CustomSelection) => {
    const targets = selectedCustomTargets.some((item) => isSameSelection(item, target)) ? selectedCustomTargets : [target]
    const currentScene = getActiveScene()
    if (!currentScene || targets.length <= 1) {
      dragSelectionSnapshotRef.current = null
      return
    }
    const snapshot: Record<string, { x: number; y: number }> = {}
    targets.forEach((item) => {
      if (item.kind === 'custom-image') {
        const current = currentScene.customImages.find((entry) => entry.id === item.id)
        if (current) snapshot[getSelectionKey(item)] = { x: current.x, y: current.y }
        return
      }
      if (item.kind === 'custom-rect') {
        const current = currentScene.customRects.find((entry) => entry.id === item.id)
        if (current) snapshot[getSelectionKey(item)] = { x: current.x, y: current.y }
        return
      }
      const current = currentScene.customTexts.find((entry) => entry.id === item.id)
      if (current) snapshot[getSelectionKey(item)] = { x: current.x, y: current.y }
    })
    dragSelectionSnapshotRef.current = snapshot
  }

  const finishCustomDrag = (target: CustomSelection, x: number, y: number, side: MailSide = activeMailSide) => {
    const snapshot = dragSelectionSnapshotRef.current
    dragSelectionSnapshotRef.current = null
    const currentScene = getActiveScene(side)
    if (!currentScene) return

    const currentSource =
      target.kind === 'custom-image'
        ? currentScene.customImages.find((item) => item.id === target.id)
        : target.kind === 'custom-rect'
          ? currentScene.customRects.find((item) => item.id === target.id)
          : currentScene.customTexts.find((item) => item.id === target.id)
    if (!currentSource) return

    if (!snapshot || selectedCustomTargets.length <= 1 || !selectedCustomTargets.some((item) => isSameSelection(item, target))) {
      if (target.kind === 'custom-image') updateCustomImage(target.id, { x, y })
      else if (target.kind === 'custom-rect') updateCustomRect(target.id, { x, y })
      else updateCustomText(target.id, { x, y })
      return
    }

    const sourcePosition = snapshot[getSelectionKey(target)]
    if (!sourcePosition) return
    const deltaX = x - sourcePosition.x
    const deltaY = y - sourcePosition.y
    updateScene((current) => ({
      ...current,
      customRects: current.customRects.map((item) => {
        const original = snapshot[`custom-rect:${item.id}`]
        return original ? { ...item, x: original.x + deltaX, y: original.y + deltaY } : item
      }),
      customTexts: current.customTexts.map((item) => {
        const original = snapshot[`custom-text:${item.id}`]
        return original ? { ...item, x: original.x + deltaX, y: original.y + deltaY } : item
      }),
      customImages: current.customImages.map((item) => {
        const original = snapshot[`custom-image:${item.id}`]
        return original ? { ...item, x: original.x + deltaX, y: original.y + deltaY } : item
      }),
    }), side)
  }

  const toggleSelectedImageGrayscale = () => {
    if (selection?.kind !== 'custom-image') return false
    const current = getActiveScene()?.customImages.find((item) => item.id === selection.id)
    if (!current) return false
    updateCustomImage(selection.id, { grayscale: !current.grayscale })
    return true
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
    const trimmedTitle = designTitle.trim()
    return {
      title: trimmedTitle || buildDesignTitle(townData?.tenant?.name || tenantName, 'Town Graphic'),
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
    if (!designID && !designTitle.trim()) throw new Error('Name the design before autosave can create it')
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

  const copyCurrentDesign = async () => {
    if (!scene) return
    const nextTitle = `Copy ${designTitle.trim() || buildDesignTitle(townData?.tenant?.name || tenantName, 'Town Graphic')}`
    setSavingDesign(true)
    setMessage(null)
    try {
      const previousDesignID = designID
      const previousTitle = designTitle
      setDesignID('')
      setDesignTitle(nextTitle)
      const response = await fetch('/api/graphic-designs?draft=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...buildDesignPayload(),
          title: nextTitle,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(getString(asRecord(data).message) || 'Failed to copy design')
      const savedDoc = sanitizeDesignDoc(((asRecord(data).doc || data) as DesignDoc) || null)
      if (savedDoc?.id) {
        setDesignID(savedDoc.id)
        setDesignTitle(savedDoc.title || nextTitle)
        setDesigns((current) => [savedDoc, ...current.filter((item) => item.id !== savedDoc.id)].slice(0, 50))
      } else {
        setDesignID(previousDesignID)
        setDesignTitle(previousTitle)
      }
      markSaved()
      setMessage('Design copied')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setSavingDesign(false)
    }
  }

  const { autosaveState, markSaved, resetAutosave } = useEditorAutosave({
    enabled: Boolean(scene && !loading && (Boolean(designID) || Boolean(designTitle.trim()))),
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

  const autosaveLabel = !designID && !designTitle.trim() ? 'Name design to start autosave' : formatAutosaveLabel(autosaveState)

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

      if (modifier && key === 's') event.preventDefault()

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

  const ensureActiveMailSideForExport = async (side: MailSide) => {
    if (activeMailSideRef.current === side) return
    flushSync(() => {
      setActiveMailSide(side)
    })
    await waitForStagePaint()
  }

  const downloadPrintPdf = async () => {
    const previousSide = activeMailSideRef.current
    setDownloadingPrintPdf(true)
    setMessage(null)

    try {
      const filenameBase = (designTitle || templateTitle || townData?.tenant?.slug || 'town-graphic')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')

      await ensureActiveMailSideForExport('front')
      const frontDataUrl = await exportStageDataUrl()
      await ensureActiveMailSideForExport('back')
      const backDataUrl = await exportStageDataUrl()

      if (!frontDataUrl || !backDataUrl) throw new Error('Failed to render print PDF')

      const pdf = await PDFDocument.create()
      const [frontImage, backImage] = await Promise.all([
        pdf.embedPng(frontDataUrl),
        pdf.embedPng(backDataUrl),
      ])
      const drawImposedPage = (image: Awaited<ReturnType<typeof pdf.embedPng>>) => {
        const page = pdf.addPage([LETTER_WIDTH, LETTER_HEIGHT])
        page.drawImage(image, {
          x: PRINT_MARGIN,
          y: PRINT_MARGIN + PRINT_SLOT_HEIGHT + PRINT_GAP,
          width: PRINT_SLOT_WIDTH,
          height: PRINT_SLOT_HEIGHT,
        })
        page.drawImage(image, {
          x: PRINT_MARGIN,
          y: PRINT_MARGIN,
          width: PRINT_SLOT_WIDTH,
          height: PRINT_SLOT_HEIGHT,
        })
      }

      drawImposedPage(frontImage)
      drawImposedPage(backImage)

      const pdfBytes = await pdf.save()
      const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' })
      const pdfUrl = URL.createObjectURL(pdfBlob)
      const link = document.createElement('a')
      link.href = pdfUrl
      link.download = `${filenameBase || 'town-graphic'}-print.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(pdfUrl)
      setMessage('Print PDF downloaded')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      if (activeMailSideRef.current !== previousSide) {
        flushSync(() => {
          setActiveMailSide(previousSide)
        })
        await waitForStagePaint()
      }
      setDownloadingPrintPdf(false)
    }
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
      if (designID || designTitle.trim()) {
        await saveDesign(mediaDoc.id)
        markSaved()
      }
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
      const bundle = getResolvedSceneBundle()
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
      const bundle = getResolvedSceneBundle()
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
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={fieldLabelStyle}>Opacity</span>
                        <input type="number" min={0} max={1} step={0.05} value={selectedCustomImage.opacity ?? 1} onChange={(event) => updateCustomImage(selectedCustomImage.id, { opacity: clamp(Number(event.target.value) || 0, 0, 1) })} style={controlStyle} />
                      </label>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={fieldLabelStyle}>Blur</span>
                        <input type="number" min={0} max={40} step={1} value={selectedCustomImage.blurRadius || 0} onChange={(event) => updateCustomImage(selectedCustomImage.id, { blurRadius: Math.max(0, Number(event.target.value) || 0) })} style={controlStyle} />
                      </label>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={fieldLabelStyle}>Brightness</span>
                        <input type="number" min={-1} max={1} step={0.05} value={selectedCustomImage.brightness || 0} onChange={(event) => updateCustomImage(selectedCustomImage.id, { brightness: clamp(Number(event.target.value) || 0, -1, 1) })} style={controlStyle} />
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="checkbox" checked={Boolean(selectedCustomImage.grayscale)} onChange={(event) => updateCustomImage(selectedCustomImage.id, { grayscale: event.target.checked })} />
                        <span style={fieldLabelStyle}>Grayscale</span>
                      </label>
                      {isSuperAdmin ? (
                        <>
                          <label style={{ display: 'grid', gap: 6 }}>
                            <span style={fieldLabelStyle}>Shadow color</span>
                            <input type="color" value={selectedCustomImage.shadowColor || '#000000'} onChange={(event) => updateCustomImage(selectedCustomImage.id, { shadowColor: event.target.value })} style={{ ...controlStyle, minHeight: 44, padding: 6 }} />
                          </label>
                          <label style={{ display: 'grid', gap: 6 }}>
                            <span style={fieldLabelStyle}>Shadow blur</span>
                            <input type="number" min={0} max={40} step={1} value={selectedCustomImage.shadowBlur || 0} onChange={(event) => updateCustomImage(selectedCustomImage.id, { shadowBlur: Math.max(0, Number(event.target.value) || 0) })} style={controlStyle} />
                          </label>
                        </>
                      ) : null}
                    </div>
                  )
                : selection?.kind === 'custom-rect' && selectedCustomRect
                ? (
                    <div style={slotCardStyle}>
                      <strong style={{ fontSize: 13 }}>Selected: Rectangle</strong>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={fieldLabelStyle}>Shape</span>
                        <select value={selectedCustomRect.shapeType || 'rect'} onChange={(event) => updateCustomRect(selectedCustomRect.id, { shapeType: event.target.value as 'rect' | 'circle' | 'line' })} style={controlStyle}>
                          <option value="rect">Rectangle</option>
                          <option value="circle">Circle</option>
                          <option value="line">Line</option>
                        </select>
                      </label>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={fieldLabelStyle}>Fill</span>
                        <input value={selectedCustomRect.fill} onChange={(event) => updateCustomRect(selectedCustomRect.id, { fill: event.target.value })} style={controlStyle} />
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="checkbox" checked={selectedCustomRect.fillEnabled !== false} onChange={(event) => updateCustomRect(selectedCustomRect.id, { fillEnabled: event.target.checked })} />
                        <span style={fieldLabelStyle}>Fill enabled</span>
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
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={fieldLabelStyle}>Opacity</span>
                        <input type="number" min={0} max={1} step={0.05} value={selectedCustomRect.opacity ?? 1} onChange={(event) => updateCustomRect(selectedCustomRect.id, { opacity: clamp(Number(event.target.value) || 0, 0, 1) })} style={controlStyle} />
                      </label>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={fieldLabelStyle}>Rotation</span>
                        <input type="number" step={0.1} value={selectedCustomRect.rotation || 0} onChange={(event) => updateCustomRect(selectedCustomRect.id, { rotation: Number(event.target.value) || 0 })} style={controlStyle} />
                      </label>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={fieldLabelStyle}>Stroke color</span>
                        <input type="color" value={selectedCustomRect.strokeColor || '#111827'} onChange={(event) => updateCustomRect(selectedCustomRect.id, { strokeColor: event.target.value })} style={{ ...controlStyle, minHeight: 44, padding: 6 }} />
                      </label>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={fieldLabelStyle}>Stroke width</span>
                        <input type="number" min={0} max={40} step={1} value={selectedCustomRect.strokeWidth || 0} onChange={(event) => updateCustomRect(selectedCustomRect.id, { strokeWidth: Math.max(0, Number(event.target.value) || 0) })} style={controlStyle} />
                      </label>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span style={fieldLabelStyle}>Dash</span>
                        <select value={selectedCustomRect.dashStyle || 'solid'} onChange={(event) => updateCustomRect(selectedCustomRect.id, { dashStyle: event.target.value as 'solid' | 'dashed' | 'dotted' })} style={controlStyle}>
                          <option value="solid">Solid</option>
                          <option value="dashed">Dashed</option>
                          <option value="dotted">Dotted</option>
                        </select>
                      </label>
                    </div>
                  )
                : selection?.kind === 'custom-text' && selectedCustomText
                  ? (
                    <div style={slotCardStyle}>
                      <strong style={{ fontSize: 13 }}>Selected: Text Box</strong>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <Button
                            onClick={() => beginInlineTextEdit({ kind: 'custom-text', id: selectedCustomText.id })}
                            buttonStyle="secondary"
                          >
                            Edit rich text
                          </Button>
                        </div>
                        <label style={{ display: 'grid', gap: 6 }}>
                          <span style={fieldLabelStyle}>Rotation</span>
                          <input type="number" step={0.1} value={selectedCustomText.rotation || 0} onChange={(event) => updateCustomText(selectedCustomText.id, { rotation: Number(event.target.value) || 0 })} style={controlStyle} />
                        </label>
                        <label style={{ display: 'grid', gap: 6 }}>
                          <span style={fieldLabelStyle}>Plain text fallback</span>
                          <textarea value={selectedCustomText.text} onChange={(event) => updateCustomText(selectedCustomText.id, { text: event.target.value, html: undefined })} style={{ ...controlStyle, resize: 'vertical', minHeight: 120 }} />
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
                        <input type="number" value={Math.round(selectedCustomText.height ?? measureCustomTextHeight(selectedCustomText))} onChange={(event) => updateCustomText(selectedCustomText.id, { height: Number(event.target.value) || selectedCustomText.height || 0 })} style={controlStyle} />
                      </label>
                        <label style={{ display: 'grid', gap: 6 }}>
                          <span style={fieldLabelStyle}>Font size</span>
                          <input type="number" value={Math.round(selectedCustomText.fontSize)} onChange={(event) => updateCustomText(selectedCustomText.id, { fontSize: Number(event.target.value) || selectedCustomText.fontSize })} style={controlStyle} />
                        </label>
                        <Button onClick={() => fitCustomTextToContent(selectedCustomText.id)} buttonStyle="secondary">
                          Fit box to text
                        </Button>
                        <label style={{ display: 'grid', gap: 6 }}>
                          <span style={fieldLabelStyle}>Opacity</span>
                          <input type="number" min={0} max={1} step={0.05} value={selectedCustomText.opacity ?? 1} onChange={(event) => updateCustomText(selectedCustomText.id, { opacity: clamp(Number(event.target.value) || 0, 0, 1) })} style={controlStyle} />
                        </label>
                        <label style={{ display: 'grid', gap: 6 }}>
                          <span style={fieldLabelStyle}>Outline color</span>
                          <input type="color" value={selectedCustomText.strokeColor || '#ffffff'} onChange={(event) => updateCustomText(selectedCustomText.id, { strokeColor: event.target.value })} style={{ ...controlStyle, minHeight: 44, padding: 6 }} />
                        </label>
                        <label style={{ display: 'grid', gap: 6 }}>
                          <span style={fieldLabelStyle}>Outline width</span>
                          <input type="number" min={0} max={12} step={0.5} value={selectedCustomText.strokeWidth || 0} onChange={(event) => updateCustomText(selectedCustomText.id, { strokeWidth: Math.max(0, Number(event.target.value) || 0) })} style={controlStyle} />
                        </label>
                        {isSuperAdmin ? (
                          <>
                            <label style={{ display: 'grid', gap: 6 }}>
                              <span style={fieldLabelStyle}>Shadow color</span>
                              <input type="color" value={selectedCustomText.shadowColor || '#000000'} onChange={(event) => updateCustomText(selectedCustomText.id, { shadowColor: event.target.value })} style={{ ...controlStyle, minHeight: 44, padding: 6 }} />
                            </label>
                            <label style={{ display: 'grid', gap: 6 }}>
                              <span style={fieldLabelStyle}>Shadow blur</span>
                              <input type="number" min={0} max={40} step={1} value={selectedCustomText.shadowBlur || 0} onChange={(event) => updateCustomText(selectedCustomText.id, { shadowBlur: Math.max(0, Number(event.target.value) || 0) })} style={controlStyle} />
                            </label>
                          </>
                        ) : null}
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
  const isRichTextEditing = Boolean(inlineTextEditor?.mode === 'rich' && inlineTextEditor.target.kind === 'custom-text')
  const isTextToolbarActive = Boolean(selectedTextTarget && selectedTextLayer && !selectedLayer?.locked && selectedCustomTargets.length <= 1)
  const selectedTextFontFlags = getFontStyleFlags(selectedTextLayer?.fontStyle)
  const saveRichTextSelection = () => {
    const selection = window.getSelection()
    if (!selection || !selection.rangeCount || !richTextEditorRef.current) return
    const range = selection.getRangeAt(0)
    if (!richTextEditorRef.current.contains(range.commonAncestorContainer)) return
    richTextSelectionRef.current = range.cloneRange()
  }
  const restoreRichTextSelection = () => {
    if (!richTextSelectionRef.current) return
    const selection = window.getSelection()
    if (!selection) return
    selection.removeAllRanges()
    selection.addRange(richTextSelectionRef.current)
  }
  const applyRichTextSelectionStyle = (styles: Record<string, string>) => {
    if (!isRichTextEditing || !richTextEditorRef.current) return
    restoreRichTextSelection()
    const selection = window.getSelection()
    if (!selection || !selection.rangeCount) return
    const range = selection.getRangeAt(0)
    if (!richTextEditorRef.current.contains(range.commonAncestorContainer)) return

    const root = richTextEditorRef.current
    if (range.collapsed) {
      const currentBlock = getClosestRichTextBlock(range.commonAncestorContainer, root)
      if (!currentBlock) return
      Object.assign(currentBlock.style, styles)
      richTextEditorRef.current.focus()
      saveRichTextSelection()
      return
    }
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
    selection.removeAllRanges()
    selection.addRange(nextRange)
    richTextSelectionRef.current = nextRange.cloneRange()
    richTextEditorRef.current.focus()
  }
  const applySelectedTextFormatting = (
    patch: Partial<SceneTextElement | SubheadElement | FooterElement | CustomTextElement>,
  ) => {
    if (!selectedTextTarget || !selectedTextLayer || selectedLayer?.locked) return
    updateSelectedTextLayer(selectedTextTarget, patch)
  }
  const toggleSelectedTextBold = () => {
    if (isRichTextEditing) {
      runRichTextCommand('bold')
      return
    }
    if (!selectedTextLayer) return
    applySelectedTextFormatting({
      fontStyle: buildFontStyle({
        bold: !selectedTextFontFlags.bold,
        italic: selectedTextFontFlags.italic,
      }),
    })
  }
  const toggleSelectedTextItalic = () => {
    if (isRichTextEditing) {
      runRichTextCommand('italic')
      return
    }
    if (!selectedTextLayer) return
    applySelectedTextFormatting({
      fontStyle: buildFontStyle({
        bold: selectedTextFontFlags.bold,
        italic: !selectedTextFontFlags.italic,
      }),
    })
  }
  const transformSelectedTextCase = (mode: 'upper' | 'lower' | 'title') => {
    if (isRichTextEditing && richTextEditorRef.current) {
      restoreRichTextSelection()
      const selection = window.getSelection()
      if (!selection || !selection.rangeCount) return
      const range = selection.getRangeAt(0)
      if (!richTextEditorRef.current.contains(range.commonAncestorContainer) || range.collapsed) return
      const text = range.toString()
      const nextText =
        mode === 'upper' ? text.toUpperCase() : mode === 'lower' ? text.toLowerCase() : toTitleCase(text)
      range.deleteContents()
      range.insertNode(document.createTextNode(nextText))
      saveRichTextSelection()
      return
    }
    if (!selectedTextLayer) return
    if (selectedTextTarget?.kind === 'custom-text' && selectedCustomText?.html) return
    const nextText =
      mode === 'upper'
        ? selectedTextLayer.text.toUpperCase()
        : mode === 'lower'
          ? selectedTextLayer.text.toLowerCase()
          : toTitleCase(selectedTextLayer.text)
    applySelectedTextFormatting({ text: nextText })
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
        <button type="button" style={toolbarButtonStyle} onClick={() => transformSelectedTextCase('upper')}>
          UPPER
        </button>
        <button type="button" style={toolbarButtonStyle} onClick={() => transformSelectedTextCase('lower')}>
          lower
        </button>
        <button type="button" style={toolbarButtonStyle} onClick={() => transformSelectedTextCase('title')}>
          Title
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
  const runRichTextCommand = (command: string, value?: string) => {
    if (!inlineTextEditor || inlineTextEditor.mode !== 'rich') return
    restoreRichTextSelection()
    document.execCommand(command, false, command === 'formatBlock' && value ? `<${value}>` : value)
    saveRichTextSelection()
    richTextEditorRef.current?.focus()
  }
  const stageContainerBox = stageContainerRef.current?.getBoundingClientRect()
  const stageCanvasBox = stageRef.current?.container().getBoundingClientRect()
  const stageOffsetX =
    stageContainerBox && stageCanvasBox
      ? stageCanvasBox.left - stageContainerBox.left
      : Math.max(0, (stageContainerWidth - previewWidth) / 2)
  const stageOffsetY =
    stageContainerBox && stageCanvasBox
      ? stageCanvasBox.top - stageContainerBox.top
      : 0
  const inlineEditorBox =
    inlineTextEditor
      ? (() => {
          const currentLayer = resolveTextLayer(scene, inlineTextEditor.target)
          if (!currentLayer) return null
          const safePreviewScale = Math.max(previewScale, 0.01)
          const inlineWidth =
            inlineTextEditor.target.kind === 'subhead'
              ? scene.subhead.dividerWidth
              : inlineTextEditor.target.kind === 'footer'
                ? scene.footer.width
                : (currentLayer as SceneTextElement).width
          const width =
            inlineTextEditor.target.kind === 'custom-text'
              ? Math.max(1, Math.round(inlineWidth * previewScale))
              : inlineTextEditor.target.kind === 'subhead' && activeMailSide === 'front'
                ? Math.max(220, scene.subhead.dividerWidth * previewScale)
                : Math.max(180, inlineWidth * previewScale)
          const rawHeight =
            inlineTextEditor.target.kind === 'headline'
              ? Math.max(180 / safePreviewScale, measureHeadlineHeight(scene.headline))
              : inlineTextEditor.target.kind === 'subhead'
                ? Math.max(88 / safePreviewScale, (scene.subhead.fontSize || 28) + 28)
                : inlineTextEditor.target.kind === 'custom-text'
                  ? Math.max(1, Math.round((currentLayer as CustomTextElement).height ?? measureCustomTextHeight(currentLayer as CustomTextElement)))
                : Math.max(96 / safePreviewScale, Math.max(72, (currentLayer.fontSize || 28) * (currentLayer.lineHeight || 1.12) * 2.4))
          const height = Math.max(1, Math.round(rawHeight * previewScale))
          const contentScale = inlineTextEditor.target.kind === 'custom-text' ? safePreviewScale : 1
          return {
            contentHeight: inlineTextEditor.target.kind === 'custom-text' ? rawHeight : height,
            contentScale,
            contentWidth: inlineTextEditor.target.kind === 'custom-text' ? Math.max(1, inlineWidth) : width,
            left: stageOffsetX + currentLayer.x * previewScale,
            top: stageOffsetY + currentLayer.y * previewScale,
            width,
            height,
            rotation: inlineTextEditor.target.kind === 'custom-text' ? ((currentLayer as CustomTextElement).rotation || 0) : 0,
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
      zIndex={stackSelection.kind === 'towns-right' ? rightTownStackOrder : townStackOrder}
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
    const filters = [
      ...(item.grayscale ? [Konva.Filters.Grayscale] : []),
      ...(item.blurRadius ? [Konva.Filters.Blur] : []),
      ...(typeof item.brightness === 'number' && item.brightness !== 0 ? [Konva.Filters.Brighten] : []),
    ]
    if (hidden) return null

    return (
      <Group
        key={item.id}
        ref={(node) => {
          customImageRefs.current[item.id] = node
        }}
        zIndex={getLayerOrder('custom-image', item.id)}
        x={item.x + item.width / 2}
        y={item.y + item.height / 2}
        offsetX={item.width / 2}
        offsetY={item.height / 2}
        rotation={rotation}
        opacity={item.opacity ?? 1}
        shadowBlur={item.shadowBlur || 0}
        shadowColor={item.shadowColor}
        shadowOffsetX={item.shadowOffsetX || 0}
        shadowOffsetY={item.shadowOffsetY || 0}
        shadowOpacity={item.shadowOpacity || 0}
        draggable={!locked}
        onDragStart={() => beginCustomDrag({ kind: 'custom-image', id: item.id })}
        onDragEnd={(event) => {
          if (locked) return
          const node = event.target
          handleCustomSelection({ kind: 'custom-image', id: item.id })
          finishCustomDrag({ kind: 'custom-image', id: item.id }, node.x() - item.width / 2, node.y() - item.height / 2)
        }}
        onMouseDown={(event) => {
          if (locked) return
          handleCustomSelection({ kind: 'custom-image', id: item.id }, event.evt.shiftKey || event.evt.metaKey || event.evt.ctrlKey)
        }}
        onContextMenu={(event) => openContextMenu(event.evt, { kind: 'custom-image', id: item.id })}
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
        {selectedCustomKeys.has(`custom-image:${item.id}`) ? (
          <Rect x={-8} y={-8} width={item.width + 16} height={item.height + 16} stroke="#0ea5e9" dash={[10, 6]} cornerRadius={10} />
        ) : null}
        {customImages[item.id] ? (
          <KonvaImage
            ref={(node) => {
              customImageNodeRefs.current[item.id] = node
            }}
            image={customImages[item.id] || undefined}
            width={item.width}
            height={item.height}
            filters={filters}
            blurRadius={item.blurRadius || 0}
            brightness={item.brightness || 0}
          />
        ) : (
          <Rect width={item.width} height={item.height} fill="#e2e8f0" stroke="#94a3b8" dash={[8, 4]} />
        )}
      </Group>
    )
  }

  const renderCustomTextNode = (item: CustomTextElement) => {
    const previewPatch = customTextTransformPreview[item.id] || null
    const displayItem = previewPatch ? ({ ...item, ...previewPatch } as CustomTextElement) : item
    const textHeight = Math.max(1, Math.round(displayItem.height ?? measureCustomTextHeight(displayItem)))
    const rotation = displayItem.rotation || 0
    const hidden = isLayerHidden('custom-text', item.id)
    const locked = isLayerLocked('custom-text', item.id)
    const isEditingThisText = inlineTextEditor?.mode === 'rich' && inlineTextEditor.target.kind === 'custom-text' && inlineTextEditor.target.id === item.id
    const resolvedHtml = resolveSceneHtml(getCustomTextHtml(displayItem))
    const fallbackText = stripHtml(resolvedHtml).replace(/\u00a0/g, ' ') || resolveSceneText(displayItem.text)
    if (hidden) return null

    return (
      <Group
        key={item.id}
        ref={(node) => {
          customTextRefs.current[item.id] = node
        }}
        zIndex={getLayerOrder('custom-text', item.id)}
        x={displayItem.x + displayItem.width / 2}
        y={displayItem.y + textHeight / 2}
        offsetX={displayItem.width / 2}
        offsetY={textHeight / 2}
        rotation={rotation}
        opacity={displayItem.opacity ?? 1}
        shadowBlur={displayItem.shadowBlur || 0}
        shadowColor={displayItem.shadowColor}
        shadowOffsetX={displayItem.shadowOffsetX || 0}
        shadowOffsetY={displayItem.shadowOffsetY || 0}
        shadowOpacity={displayItem.shadowOpacity || 0}
        draggable={!locked}
        onDragStart={() => {
          setCustomTextTransformPreviewPatch(item.id, null)
          beginCustomDrag({ kind: 'custom-text', id: item.id })
        }}
        onDragEnd={(event) => {
          if (locked) return
          const node = event.target
          handleCustomSelection({ kind: 'custom-text', id: item.id })
          finishCustomDrag({ kind: 'custom-text', id: item.id }, node.x() - displayItem.width / 2, node.y() - textHeight / 2)
        }}
        onMouseDown={(event) => {
          if (locked) return
          handleCustomSelection({ kind: 'custom-text', id: item.id }, event.evt.shiftKey || event.evt.metaKey || event.evt.ctrlKey)
        }}
        onContextMenu={(event) => openContextMenu(event.evt, { kind: 'custom-text', id: item.id })}
        onTransformStart={() => {
          setIsResizingHeadline(true)
          setCustomTextTransformPreviewPatch(item.id, {
            fontSize: item.fontSize,
            height: item.height ?? textHeight,
            rotation: item.rotation || 0,
            width: item.width,
            x: item.x,
            y: item.y,
          })
        }}
        onTransform={(event) => {
          if (locked) return
          const node = event.target
          const source = ({ ...item, ...customTextTransformPreviewRef.current[item.id] } as CustomTextElement)
          const sourceHeight = Math.max(1, Math.round(source.height ?? measureCustomTextHeight(source)))
          const activeAnchor = transformerRef.current?.getActiveAnchor() || ''
          const isHorizontalEdge = activeAnchor === 'middle-left' || activeAnchor === 'middle-right'
          const isVerticalEdge = activeAnchor === 'top-center' || activeAnchor === 'bottom-center'
          const isCorner = Boolean(activeAnchor && !isHorizontalEdge && !isVerticalEdge && activeAnchor !== 'rotater')
          const scaleX = Math.max(Math.abs(node.scaleX()), 0.1)
          const scaleY = Math.max(Math.abs(node.scaleY()), 0.1)
          const nextWidth = isVerticalEdge ? source.width : Math.max(24, Math.round(source.width * scaleX))
          const nextHeight = isHorizontalEdge ? sourceHeight : Math.max(8, Math.round(sourceHeight * scaleY))
          const fontScale = isCorner ? Math.sqrt(scaleX * scaleY) : 1
          const nextFontSize = isCorner ? clampNumber(Math.round(source.fontSize * fontScale), 8, 240) : source.fontSize
          const nextRotation = Number(node.rotation().toFixed(1))
          const normalized = normalizeCustomTextBox(source, {
            fontSize: nextFontSize,
            height: nextHeight,
            width: nextWidth,
          })
          const normalizedHeight = Math.max(8, Math.round(normalized.height ?? nextHeight))
          const nextX = Math.round(node.x() - normalized.width / 2)
          const nextY = Math.round(node.y() - normalizedHeight / 2)

          node.scaleX(1)
          node.scaleY(1)
          node.offsetX(normalized.width / 2)
          node.offsetY(normalizedHeight / 2)
          node.x(nextX + normalized.width / 2)
          node.y(nextY + normalizedHeight / 2)
          node.rotation(nextRotation)
          setCustomTextTransformPreviewPatch(item.id, {
            fontSize: normalized.fontSize,
            height: normalizedHeight,
            rotation: nextRotation,
            width: normalized.width,
            x: nextX,
            y: nextY,
          })
        }}
        onTransformEnd={(event) => {
          setIsResizingHeadline(false)
          if (locked) {
            setCustomTextTransformPreviewPatch(item.id, null)
            return
          }
          const preview = customTextTransformPreviewRef.current[item.id]
          const node = event.target
          node.scaleX(1)
          node.scaleY(1)
          if (!preview) return
          updateCustomText(item.id, {
            fontSize: preview.fontSize,
            height: preview.height,
            rotation: preview.rotation,
            width: preview.width,
            x: preview.x,
            y: preview.y,
          })
          setCustomTextTransformPreviewPatch(item.id, null)
        }}
      >
        {selectedCustomKeys.has(`custom-text:${item.id}`) ? (
          <Rect x={-8} y={-8} width={displayItem.width + 16} height={textHeight + 16} stroke="#0ea5e9" dash={[10, 6]} cornerRadius={10} />
        ) : null}
        {!isEditingThisText ? (
          <MailRichTextShape
            fallbackText={fallbackText}
            fontRenderTick={fontRenderTick}
            height={textHeight}
            html={resolvedHtml}
            item={displayItem}
            onDblClick={() => {
              if (locked) return
              beginInlineTextEdit({ kind: 'custom-text', id: item.id })
            }}
            width={displayItem.width}
          />
        ) : null}
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
          const dash = getDashPattern(customRect.dashStyle)
          const shapeType = customRect.shapeType || 'rect'
          return (
            <Group
              key={customRect.id}
              ref={(node) => {
                customRectRefs.current[customRect.id] = node
              }}
              zIndex={getLayerOrder('custom-rect', customRect.id)}
              x={customRect.x}
              y={customRect.y}
              rotation={customRect.rotation || 0}
              opacity={customRect.opacity ?? 1}
              shadowBlur={customRect.shadowBlur || 0}
              shadowColor={customRect.shadowColor}
              shadowOffsetX={customRect.shadowOffsetX || 0}
              shadowOffsetY={customRect.shadowOffsetY || 0}
              shadowOpacity={customRect.shadowOpacity || 0}
              draggable={!locked}
              onDragStart={() => beginCustomDrag({ kind: 'custom-rect', id: customRect.id })}
              onDragEnd={(event) => {
                if (locked) return
                handleCustomSelection({ kind: 'custom-rect', id: customRect.id })
                finishCustomDrag({ kind: 'custom-rect', id: customRect.id }, event.target.x(), event.target.y())
              }}
              onMouseDown={(event) => {
                if (locked) return
                handleCustomSelection({ kind: 'custom-rect', id: customRect.id }, event.evt.shiftKey || event.evt.metaKey || event.evt.ctrlKey)
              }}
              onContextMenu={(event) => openContextMenu(event.evt, { kind: 'custom-rect', id: customRect.id })}
              onTransformEnd={(event) => {
                if (locked) return
                const node = event.target
                const nextWidth = Math.max(40, Math.round(customRect.width * node.scaleX()))
                const nextHeight = shapeType === 'line' ? Math.round(customRect.height * node.scaleY()) : Math.max(20, Math.round(customRect.height * node.scaleY()))
                const nextRotation = Number(node.rotation().toFixed(1))
                node.scaleX(1)
                node.scaleY(1)
                updateCustomRect(customRect.id, { x: node.x(), y: node.y(), width: nextWidth, height: nextHeight, rotation: nextRotation })
              }}
            >
              {selectedCustomKeys.has(`custom-rect:${customRect.id}`) ? (
                <Rect x={-8} y={-8} width={customRect.width + 16} height={customRect.height + 16} stroke="#0ea5e9" dash={[10, 6]} cornerRadius={10} />
              ) : null}
              {shapeType === 'circle' ? (
                <Circle
                  x={customRect.width / 2}
                  y={customRect.height / 2}
                  radius={Math.max(4, Math.min(customRect.width, customRect.height) / 2)}
                  fill={customRect.fillEnabled === false ? undefined : customRect.fill}
                  stroke={customRect.strokeColor}
                  strokeWidth={customRect.strokeWidth || 0}
                  dash={dash}
                />
              ) : shapeType === 'line' ? (
                <Line
                  points={[0, 0, customRect.width, customRect.height]}
                  stroke={customRect.strokeColor || customRect.fill}
                  strokeWidth={customRect.strokeWidth || 8}
                  dash={dash}
                  lineCap="round"
                  lineJoin="round"
                />
              ) : (
                <Rect
                  width={customRect.width}
                  height={customRect.height}
                  fill={customRect.fillEnabled === false ? undefined : customRect.fill}
                  stroke={customRect.strokeColor}
                  strokeWidth={customRect.strokeWidth || 0}
                  dash={dash}
                  cornerRadius={8}
                />
              )}
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
              setPrimarySelection(null)
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
              setPrimarySelection(null)
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
              <button type="button" onClick={downloadPrintPdf} disabled={downloadingPrintPdf} style={menuActionButtonStyle}>
                {downloadingPrintPdf ? 'Building Print PDF…' : 'Download Print PDF'}
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
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => {
                const currentIndex = EDITOR_ZOOM_PRESETS.findIndex((value) => value === previewZoom)
                const nextIndex = currentIndex <= 0 ? 0 : currentIndex - 1
                const nextZoom = EDITOR_ZOOM_PRESETS[nextIndex] ?? EDITOR_ZOOM_PRESETS[0]
                setPreviewZoom(nextZoom)
              }}
              style={iconToolbarButtonStyle}
              title="Zoom out"
            >
              <Minus size={14} />
            </button>
            <button
              type="button"
              onClick={() => {
                const currentIndex = EDITOR_ZOOM_PRESETS.findIndex((value) => value === previewZoom)
                const nextIndex = currentIndex < 0 ? EDITOR_ZOOM_PRESETS.indexOf(1) : Math.min(EDITOR_ZOOM_PRESETS.length - 1, currentIndex + 1)
                const nextZoom = EDITOR_ZOOM_PRESETS[nextIndex] ?? EDITOR_ZOOM_PRESETS[EDITOR_ZOOM_PRESETS.length - 1] ?? 1
                setPreviewZoom(nextZoom)
              }}
              style={iconToolbarButtonStyle}
              title="Zoom in"
            >
              <Plus size={14} />
            </button>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569' }}>
            <span>Zoom</span>
            <select
              value={String(previewZoom)}
              onChange={(event) => setPreviewZoom(Number(event.target.value))}
              style={{ ...controlStyle, width: 88, padding: '6px 8px' }}
            >
              {EDITOR_ZOOM_PRESETS.map((preset) => (
                <option key={preset} value={String(preset)}>
                  {preset === 1 ? 'Fit' : `${Math.round(preset * 100)}%`}
                </option>
              ))}
            </select>
          </label>
          <div style={{ fontSize: 12, color: '#475569' }}>
            Autosave: <strong>{autosaveLabel}</strong>
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
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button onClick={() => void copyCurrentDesign()} disabled={savingDesign || !scene} buttonStyle="secondary">
                {savingDesign ? 'Copying…' : 'Copy design'}
              </Button>
            </div>
            <div style={hintStyle}>
              Enter a title once. After that, edits autosave automatically.
            </div>
          </div>
        </details>

        <details open={contentSectionOpen} onToggle={(event) => setContentSectionOpen((event.currentTarget as HTMLDetailsElement).open)} style={detailsStyle}>
          <summary style={detailsSummaryStyle}>Insert</summary>
          <div style={accordionBodyStyle}>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              <button type="button" onClick={() => { addCustomRect('rect'); setMessage('Added rectangle') }} style={secondaryButtonStyle}>Rectangle</button>
              <button type="button" onClick={() => { addCustomRect('circle'); setMessage('Added circle') }} style={secondaryButtonStyle}>Circle</button>
              <button type="button" onClick={() => { addCustomRect('line'); setMessage('Added line') }} style={secondaryButtonStyle}>Line</button>
              <button type="button" onClick={() => { addCustomText(); setMessage('Added text box') }} style={secondaryButtonStyle}>Text box</button>
            </div>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={fieldLabelStyle}>Add Image</span>
              <input type="file" accept="image/*" onChange={handleAddCustomImage} style={controlStyle} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={fieldLabelStyle}>QR destination</span>
              <div style={{ display: 'grid', gridTemplateColumns: '20px minmax(0, 1fr)', alignItems: 'center', gap: 8 }}>
                <QrCode size={14} />
                <input
                  value={scene.qrUrl || mergeTagContext.website}
                  onChange={(event) => updateScene((current) => ({ ...current, qrUrl: event.target.value }))}
                  style={controlStyle}
                  placeholder="https://cthousegop.com/tenant-slug"
                />
              </div>
            </label>
            <div style={hintStyle}>
              Use merge tags in any text box: <strong>{'{{website}}'}</strong>, <strong>{'{{qr_url}}'}</strong>, <strong>{'{{rep_name}}'}</strong>, <strong>{'{{office_title}}'}</strong>.
            </div>
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
          </div>
        </details>

        <details open={imagesSectionOpen} onToggle={(event) => setImagesSectionOpen((event.currentTarget as HTMLDetailsElement).open)} style={detailsStyle}>
          <summary style={detailsSummaryStyle}>Images</summary>
          <div style={accordionBodyStyle}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={fieldLabelStyle}>Search media</span>
              <div style={{ display: 'grid', gridTemplateColumns: '20px minmax(0, 1fr)', alignItems: 'center', gap: 8 }}>
                <Search size={14} />
                <input value={mediaQuery} onChange={(event) => setMediaQuery(event.target.value)} style={controlStyle} placeholder="Search gallery" />
              </div>
            </label>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              {filteredMediaOptions.slice(0, 24).map((media) => (
                <button
                  key={media.id}
                  type="button"
                  onClick={() => void addCustomImage(media)}
                  style={{ ...secondaryButtonStyle, display: 'grid', gap: 6, padding: 8, justifyItems: 'start' }}
                >
                  <div style={{ width: '100%', aspectRatio: '1 / 1', overflow: 'hidden', borderRadius: 8, background: '#e5e7eb' }}>
                    {proxiedUrl(media.thumbnailURL || media.url || null) ? (
                      <img
                        src={proxiedUrl(media.thumbnailURL || media.url || null)}
                        alt={media.alt || media.title || media.filename || 'Media'}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: '#64748b' }}>
                        <ImagePlus size={18} />
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: 12, color: '#0f172a', textAlign: 'left' }}>
                    {media.alt || media.title || media.filename || 'Untitled media'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </details>

        <details open={townsSectionOpen} onToggle={(event) => setTownsSectionOpen((event.currentTarget as HTMLDetailsElement).open)} style={detailsStyle}>
          <summary style={detailsSummaryStyle}>Towns</summary>
          <div style={accordionBodyStyle}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {activeMailSide === 'front' ? (
                <button type="button" onClick={() => setActiveMailSide('back')} style={secondaryButtonStyle}>
                  Go to back side
                </button>
              ) : (
                <button type="button" onClick={() => restoreTownRowsForSide('back')} style={secondaryButtonStyle}>
                  Reset towns on back
                </button>
              )}
            </div>
            {!scene.townRows.length ? (
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  {activeMailSide === 'front'
                    ? 'Town funding rows now live on the back side of the mailer.'
                    : 'This side does not currently have a town funding stack.'}
                </div>
              </div>
            ) : (
              <>
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
              </>
            )}
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
              const isSelected =
                item.kind === 'custom-image' || item.kind === 'custom-rect' || item.kind === 'custom-text'
                  ? selectedCustomKeys.has(`${item.kind}:${item.id}`)
                  : selection?.kind === item.kind && selection.id === item.id
              return (
                <div
                  key={`${item.kind}:${item.id}`}
                  draggable={reorderable}
                  onDragStart={() => {
                    if (!reorderable) return
                    setDraggedLayerKey(`${item.kind}:${item.id}`)
                  }}
                  onDragOver={(event) => {
                    if (!reorderable || !draggedLayerKey) return
                    event.preventDefault()
                  }}
                  onDrop={(event) => {
                    if (!reorderable || !draggedLayerKey) return
                    event.preventDefault()
                    const [dragKind, dragID] = draggedLayerKey.split(':')
                    const customItems = layerPanelItems.filter((entry) => entry.reorderable).map((entry) => entry.item)
                    const dropIndex = customItems.findIndex((entry) => entry.id === item.id && entry.kind === item.kind)
                    if (dragID && dragKind && dropIndex >= 0) {
                      moveLayerTargetToIndex({ id: dragID, kind: dragKind as EditorLayerItem['kind'] }, customItems.length - 1 - dropIndex)
                    }
                    setDraggedLayerKey(null)
                  }}
                  onDragEnd={() => setDraggedLayerKey(null)}
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
                    onClick={() => {
                      const nextSelection = { kind: item.kind, id: item.id } as Exclude<Selection, null>
                      if (nextSelection.kind === 'custom-image' || nextSelection.kind === 'custom-rect' || nextSelection.kind === 'custom-text') {
                        handleCustomSelection(nextSelection)
                      } else {
                        setPrimarySelection(nextSelection)
                      }
                    }}
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
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {reorderable ? <GripVertical size={12} color="#64748b" /> : null}
                      {label}
                    </span>
                  </button>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {reorderable ? (
                      <>
                        <button type="button" title="Send backward" onClick={() => reorderLayerTarget({ id: item.id, kind: item.kind }, 'backward')} style={iconToolbarButtonStyle}>
                          <ChevronDown size={12} />
                        </button>
                        <button type="button" title="Bring forward" onClick={() => reorderLayerTarget({ id: item.id, kind: item.kind }, 'forward')} style={iconToolbarButtonStyle}>
                          <ChevronUp size={12} />
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

        {isSuperAdmin ? (
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
                    {canGroupSelectedCustomTargets ? (
                      <Button onClick={() => groupSelectedCustomObjects()} buttonStyle="secondary">Group</Button>
                    ) : null}
                    {canUngroupSelectedCustomTargets ? (
                      <Button onClick={() => ungroupSelectedCustomObjects()} buttonStyle="secondary">Ungroup</Button>
                    ) : null}
                    {selection.kind === 'custom-image' ? (
                      <Button onClick={() => toggleSelectedImageGrayscale()} buttonStyle="secondary">
                        {selectedCustomImage?.grayscale ? 'Disable grayscale' : 'Make grayscale'}
                      </Button>
                    ) : null}
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
        ) : null}

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
              setPrimarySelection(null)
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
            title="Group selection"
            aria-label="Group selection"
            onClick={() => groupSelectedCustomObjects()}
            disabled={!canGroupSelectedCustomTargets}
            style={!canGroupSelectedCustomTargets ? disabledIconToolbarButtonStyle : iconToolbarButtonStyle}
          >
            <Layers size={14} strokeWidth={2.1} />
          </button>
          <button
            type="button"
            title="Ungroup selection"
            aria-label="Ungroup selection"
            onClick={() => ungroupSelectedCustomObjects()}
            disabled={!canUngroupSelectedCustomTargets}
            style={!canUngroupSelectedCustomTargets ? disabledIconToolbarButtonStyle : iconToolbarButtonStyle}
          >
            <Layers size={14} strokeWidth={2.1} />
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
            disabled={!selection || !getLayerTarget(selection)}
            style={!selection || !getLayerTarget(selection) ? disabledIconToolbarButtonStyle : iconToolbarButtonStyle}
          >
            <ChevronDown size={14} strokeWidth={2.1} />
          </button>
          <button
            type="button"
            title="Bring forward"
            aria-label="Bring forward"
            onClick={() => reorderSelectedLayer('forward')}
            disabled={!selection || !getLayerTarget(selection)}
            style={!selection || !getLayerTarget(selection) ? disabledIconToolbarButtonStyle : iconToolbarButtonStyle}
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
        <div ref={textToolbarRef} style={textToolbarStyle}>
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
              onMouseDown={(event) => {
                if (isRichTextEditing) event.preventDefault()
                toggleSelectedTextBold()
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
                if (isRichTextEditing) event.preventDefault()
                toggleSelectedTextItalic()
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
                  style={selectedTextLayer?.textAlign === option.value || (!selectedTextLayer?.textAlign && option.value === 'left') ? activeIconToolbarButtonStyle : iconToolbarButtonStyle}
                  onMouseDown={(event) => {
                    if (isRichTextEditing) {
                      event.preventDefault()
                      runRichTextCommand(option.value === 'left' ? 'justifyLeft' : option.value === 'center' ? 'justifyCenter' : 'justifyRight')
                      return
                    }
                    applySelectedTextFormatting({ textAlign: option.value })
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
                onChange={(event) => {
                  const nextValue = Number(event.target.value)
                  if (isRichTextEditing) {
                    applyRichTextSelectionStyle({ fontSize: `${nextValue}px` })
                    richTextEditorRef.current?.focus()
                    return
                  }
                  applySelectedTextFormatting({ fontSize: nextValue })
                }}
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
                onChange={(event) => {
                  const nextValue = Number(event.target.value) || 1
                  if (isRichTextEditing) {
                    applyRichTextSelectionStyle({ lineHeight: String(nextValue), display: 'inline-block' })
                    richTextEditorRef.current?.focus()
                    return
                  }
                  applySelectedTextFormatting({ lineHeight: nextValue })
                }}
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
                onChange={(event) => {
                  const nextValue = Number(event.target.value) || 0
                  if (isRichTextEditing) {
                    applyRichTextSelectionStyle({ letterSpacing: `${nextValue}px` })
                    richTextEditorRef.current?.focus()
                    return
                  }
                  applySelectedTextFormatting({ letterSpacing: nextValue })
                }}
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
              if (event.target === event.target.getStage()) setPrimarySelection(null)
            }}
            onContextMenu={(event) => {
              if (event.target === event.target.getStage()) {
                setPrimarySelection(null)
              }
              openContextMenu(event.evt)
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
                      zIndex={getLayerOrder('eyebrow', scene.eyebrow.id)}
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
                        text={resolveSceneText(scene.eyebrow.text)}
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
                      zIndex={getLayerOrder('headline', scene.headline.id)}
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
                        text={resolveSceneText(scene.headline.text)}
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
                      zIndex={getLayerOrder('subhead', scene.subhead.id)}
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
                        text={resolveSceneText(scene.subhead.text)}
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
                      zIndex={getLayerOrder('footer', scene.footer.id)}
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
                        text={resolveSceneText(scene.footer.text)}
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
                        zIndex={getLayerOrder('headshot', scene.headshot.id)}
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
                      x={STAGE_WIDTH - MAIL_PLACEHOLDER_WIDTH - 22}
                      y={STAGE_HEIGHT - MAIL_PLACEHOLDER_HEIGHT - 18}
                      width={MAIL_PLACEHOLDER_WIDTH + 34}
                      height={MAIL_PLACEHOLDER_HEIGHT + 30}
                      fill="#ffffff"
                      zIndex={999}
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
                        zIndex={getLayerOrder('headshot', scene.headshot.id)}
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
                      zIndex={getLayerOrder('subhead', scene.subhead.id)}
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
                        text={resolveSceneText(scene.subhead.text)}
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
                      zIndex={getLayerOrder('headline', scene.headline.id)}
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
                        text={resolveSceneText(scene.headline.text)}
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

                    {scene.townColumns === 2 ? (
                      <>
                        {renderTownStack(leftTownRows, leftTownBounds, { kind: 'towns-left', id: 'town-stack-left' }, leftTownStackRef)}
                        {renderTownStack(rightTownRows, rightTownBounds, { kind: 'towns-right', id: 'town-stack-right' }, rightTownStackRef)}
                      </>
                    ) : (
                      renderTownStack(includedTownRows, townStackBounds, { kind: 'towns', id: 'town-stack' }, townStackRef)
                    )}
                  </>
                )}

              <Transformer
                ref={transformerRef}
                rotateEnabled={
                  selectedCustomTargets.length > 1
                    ? false
                    : selection?.kind === 'custom-image' || selection?.kind === 'custom-text' || selection?.kind === 'custom-rect'
                }
                flipEnabled={false}
                keepRatio={
                  selectedCustomTargets.length > 1
                    ? false
                    : selection?.kind === 'headshot' || selection?.kind === 'custom-image' || (selection?.kind === 'custom-rect' && (selectedCustomRect?.shapeType || 'rect') === 'circle')
                }
                enabledAnchors={
                  selectedCustomTargets.length > 1
                    ? []
                    : selection?.kind === 'headline'
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
                    return { ...newBox, width: Math.max(24, newBox.width), height: Math.max(8, newBox.height) }
                  }

                  if (selection?.kind === 'custom-rect') {
                    const minHeight = (selectedCustomRect?.shapeType || 'rect') === 'line' ? -800 : 20
                    return { ...newBox, width: Math.max(40, newBox.width), height: Math.max(minHeight, newBox.height) }
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
                boxSizing: 'border-box',
                position: 'absolute',
                left: inlineEditorBox.left,
                top: inlineEditorBox.top,
                width: inlineEditorBox.width,
                height: inlineEditorBox.height,
                zIndex: 40,
                transform: inlineEditorBox.rotation ? `rotate(${inlineEditorBox.rotation}deg)` : undefined,
                transformOrigin:
                  inlineTextEditor.mode === 'rich' && inlineTextEditor.target.kind === 'custom-text'
                    ? 'center center'
                    : 'left top',
                overflow: 'hidden',
              }}
            >
              {inlineTextEditor.mode === 'rich' ? (
                <>
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
                      fontFamily: selectedTextLayer?.fontFamily || 'Arial',
                      fontSize: `${Math.max(1, (selectedTextLayer?.fontSize || 28) * (inlineEditorBox.contentScale === 1 ? previewScale : 1))}px`,
                      fontStyle: selectedTextLayer?.fontStyle?.includes('italic') ? 'italic' : 'normal',
                      fontWeight: getCssFontWeight(selectedTextLayer?.fontStyle),
                      textDecoration: selectedTextLayer?.textDecoration || 'none',
                      textAlign: selectedTextLayer?.textAlign || 'left',
                      lineHeight: `${selectedTextLayer?.lineHeight || 1.12}`,
                      letterSpacing: `${selectedTextLayer?.letterSpacing || 0}px`,
                      overflowY: 'auto',
                      overflowX: 'hidden',
                      overflowWrap: 'anywhere',
                      wordBreak: 'break-word',
                      whiteSpace: 'normal',
                      outline: 'none',
                      transform: inlineEditorBox.contentScale === 1 ? undefined : `scale(${inlineEditorBox.contentScale})`,
                      transformOrigin: 'left top',
                    }}
                  />
                </>
              ) : (
                <textarea
                  autoFocus
                  value={inlineTextEditor.text || ''}
                  onChange={(event) => setInlineTextEditor((current) => (current ? { ...current, text: event.target.value } : current))}
                  onBlur={commitInlineTextEdit}
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
              )}
            </div>
          ) : null}
          {contextMenu ? (
            <div
              onPointerDown={(event) => event.stopPropagation()}
              style={{
                position: 'fixed',
                left: contextMenu.x,
                top: contextMenu.y,
                zIndex: 90,
                minWidth: 190,
                borderRadius: 12,
                border: '1px solid rgba(15, 23, 42, 0.12)',
                background: 'rgba(255,255,255,0.98)',
                boxShadow: '0 18px 40px rgba(15, 23, 42, 0.18)',
                padding: 6,
                display: 'grid',
                gap: 4,
              }}
            >
              {selection && (selection.kind === 'custom-image' || selection.kind === 'custom-rect' || selection.kind === 'custom-text') ? (
                <>
                  <button type="button" style={menuActionButtonStyle} onClick={() => { copySelectedCustomObject(); setContextMenu(null) }}>Copy</button>
                  <button type="button" style={menuActionButtonStyle} onClick={() => { duplicateSelectedCustomObject(); setContextMenu(null) }}>Duplicate</button>
                  <button type="button" style={menuActionButtonStyle} onClick={() => { deleteSelectedCustomObject(); setContextMenu(null) }}>Delete</button>
                  {canGroupSelectedCustomTargets ? (
                    <button type="button" style={menuActionButtonStyle} onClick={() => { groupSelectedCustomObjects(); setContextMenu(null) }}>Group selected</button>
                  ) : null}
                  {canUngroupSelectedCustomTargets ? (
                    <button type="button" style={menuActionButtonStyle} onClick={() => { ungroupSelectedCustomObjects(); setContextMenu(null) }}>Ungroup</button>
                  ) : null}
                  <button type="button" style={menuActionButtonStyle} onClick={() => { reorderSelectedLayer('forward'); setContextMenu(null) }}>Bring forward</button>
                  <button type="button" style={menuActionButtonStyle} onClick={() => { reorderSelectedLayer('backward'); setContextMenu(null) }}>Send backward</button>
                  <button type="button" style={menuActionButtonStyle} onClick={() => { reorderSelectedLayer('front'); setContextMenu(null) }}>Bring to front</button>
                  <button type="button" style={menuActionButtonStyle} onClick={() => { reorderSelectedLayer('back'); setContextMenu(null) }}>Send to back</button>
                  {selection.kind === 'custom-image' ? (
                    <button type="button" style={menuActionButtonStyle} onClick={() => { toggleSelectedImageGrayscale(); setContextMenu(null) }}>
                      {selectedCustomImage?.grayscale ? 'Disable grayscale' : 'Make grayscale'}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    style={menuActionButtonStyle}
                    onClick={() => {
                      const target = getLayerTarget(selection)
                      if (target) updateLayerState(target, { hidden: !selectedLayer?.hidden })
                      setContextMenu(null)
                    }}
                  >
                    {selectedLayer?.hidden ? 'Show' : 'Hide'}
                  </button>
                  <button
                    type="button"
                    style={menuActionButtonStyle}
                    onClick={() => {
                      const target = getLayerTarget(selection)
                      if (target) updateLayerState(target, { locked: !selectedLayer?.locked })
                      setContextMenu(null)
                    }}
                  >
                    {selectedLayer?.locked ? 'Unlock' : 'Lock'}
                  </button>
                </>
              ) : null}
              {hasEditorClipboard() ? (
                <button type="button" style={menuActionButtonStyle} onClick={() => { pasteClipboardObject(); setContextMenu(null) }}>Paste</button>
              ) : null}
              <button type="button" style={menuActionButtonStyle} onClick={() => { addCustomRect('rect'); setContextMenu(null) }}>New rectangle</button>
              <button type="button" style={menuActionButtonStyle} onClick={() => { addCustomRect('circle'); setContextMenu(null) }}>New circle</button>
              <button type="button" style={menuActionButtonStyle} onClick={() => { addCustomRect('line'); setContextMenu(null) }}>New line</button>
              <button type="button" style={menuActionButtonStyle} onClick={() => { addCustomText(); setContextMenu(null) }}>New text box</button>
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
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: 'rgba(17, 24, 39, 0.12)',
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
  borderWidth: 1,
  borderStyle: 'solid',
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
