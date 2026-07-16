import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import { NextRequest, NextResponse } from 'next/server'
import { getPayload, type PayloadRequest } from 'payload'
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib'
import sharp from 'sharp'

import configPromise from '@payload-config'
import { createMailExportJob, updateMailExportJob } from '@/lib/graphics/mail-export-jobs'

export const runtime = 'nodejs'

const STAGE_WIDTH = 1600
const STAGE_HEIGHT = 1000
const LETTER_WIDTH = 8.5 * 72
const LETTER_HEIGHT = 11 * 72
const PRINT_MARGIN = 0.25 * 72
const PRINT_GAP = 0.5 * 72
const PRINT_SLOT_WIDTH = LETTER_WIDTH - PRINT_MARGIN * 2
const PRINT_SLOT_HEIGHT = (LETTER_HEIGHT - PRINT_MARGIN * 2 - PRINT_GAP) / 2
const BRAND_BLUE = '#6b7280'
const BRAND_RED = '#334155'
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
const TOWN_LABEL_PADDING_X = 16
const TOWN_LABEL_MIN_WIDTH = 90
const TOWN_LABEL_TEXT_Y_ADJUST = 2

type TenantSelectOption = {
  label: string
  value: string
}

type RequestBody = {
  bundle?: unknown
  downloadName?: string
  filenameBase?: string
  imageDataUrls?: Record<string, string | null | undefined>
  frontCircularHeadshotDataUrl?: string | null
  backCircularHeadshotDataUrl?: string | null
  headshotUrl?: string | null
  mode?: 'export-all' | 'single-print-pdf'
  tenantOptions?: TenantSelectOption[]
  requestedDesignID?: string
  requestedTemplateID?: string
}

type MediaDoc = {
  id: string
  url?: string | null
  thumbnailURL?: string | null
}

type StandardMediaDoc = {
  mobileHeadshot?: string | MediaDoc | null
}

type CsvTownFundingRow = {
  town: string
  townKey: string
  currentEcsEntitlement: number
  strapAid: number
  enhancedEducationFunding: number
  needsReview: boolean
}

type TownFundingRow = {
  id: string
  town: string
  strapAid: number
}

type TownFundingResponse = {
  tenant: { id: string; name?: string | null; slug?: string | null } | null
  repInfo: { name?: string | null } | null
  standardMedia: StandardMediaDoc | null
  townRows: TownFundingRow[]
}

type RepTown = {
  town?: string | null
  currentEcsEntitlement?: number | null
  houseGopStrapAid?: number | null
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
  rotation?: number
  shapeType?: 'rect' | 'circle' | 'line'
  strokeColor?: string
  strokeWidth?: number
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

type SceneLayerItem = {
  group?: 'built-in' | 'custom'
  hidden?: boolean
  id: string
  kind: 'custom-image' | 'custom-rect' | 'custom-text' | string
  order: number
}

type ExperimentalTownScene = {
  kind: string
  backgroundMediaID: string | null
  eyebrow: EyebrowElement
  headline: SceneTextElement
  subhead: SubheadElement
  footer: FooterElement
  headshot: HeadshotElement
  customImages: CustomImageElement[]
  customRects: CustomRectElement[]
  customTexts: CustomTextElement[]
  layers?: SceneLayerItem[]
  townColumns: 1 | 2
  townRows: TownSceneRow[]
}

type MailSceneBundle = {
  kind: 'graphics-editor-mail-bundle/v1'
  frontScene: ExperimentalTownScene
  backScene: ExperimentalTownScene
  activeMailSide?: 'front' | 'back'
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const asRecord = (value: unknown): Record<string, unknown> => (typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {})
const getString = (value: unknown) => (typeof value === 'string' ? value : undefined)

const isExperimentalScene = (value: unknown): value is ExperimentalTownScene => asRecord(value).kind === 'experimental-town-graphic/v1'

const isMailSceneBundle = (value: unknown): value is MailSceneBundle => {
  const record = asRecord(value)
  return record.kind === 'graphics-editor-mail-bundle/v1' && isExperimentalScene(record.frontScene) && isExperimentalScene(record.backScene)
}

const parseMailEditorNotes = (value: string | null | undefined) => {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    if (parsed.mode !== 'graphics-editor-mail') return null
    return { selectedTenantID: typeof parsed.selectedTenantID === 'string' ? parsed.selectedTenantID : null }
  } catch {
    return null
  }
}

const normalizeTownKey = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
const parseNumber = (value: string) => {
  const numeric = Number((value || '').replace(/[$,%]/g, '').replace(/,/g, '').trim())
  return Number.isFinite(numeric) ? numeric : 0
}

const getNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (!inQuotes && char === ',') {
      row.push(cell)
      cell = ''
      continue
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') index += 1
      if (cell.length || row.length) {
        row.push(cell)
        rows.push(row)
        row = []
        cell = ''
      }
      continue
    }

    cell += char
  }

  if (cell.length || row.length) {
    row.push(cell)
    rows.push(row)
  }

  return rows
}

const findHeaderIndex = (headers: string[], aliases: string[]) => {
  const normalizedHeaders = headers.map((header) => normalizeTownKey(header))
  for (const alias of aliases) {
    const index = normalizedHeaders.indexOf(normalizeTownKey(alias))
    if (index >= 0) return index
  }
  return -1
}

const getCell = (row: string[], index: number) => (index >= 0 ? (row[index] || '').trim() : '')

async function readTownFundingCsv(): Promise<Map<string, CsvTownFundingRow>> {
  const filePath = path.resolve(process.cwd(), 'tmp/budget-plan-town-runs-comprehensive.csv')
  const raw = (await fs.readFile(filePath, 'utf8')).replace(/^\uFEFF/, '')
  const parsed = parseCsv(raw)
  if (parsed.length < 2) return new Map()

  const headers = parsed[0] || []
  const townIndex = findHeaderIndex(headers, ['Town'])
  const townKeyIndex = findHeaderIndex(headers, ['Town Key'])
  const currentEcsIndex = findHeaderIndex(headers, ['Current ECS Entitlement'])
  const strapAidIndex = findHeaderIndex(headers, ['House GOP STRAP Aid', 'STRAP Aid', 'STRAP', 'Enhanced Education Funding'])
  const enhancedEducationFundingIndex = findHeaderIndex(headers, ['Enhanced Education Funding'])
  const needsReviewIndex = findHeaderIndex(headers, ['Needs Review'])

  const rows = new Map<string, CsvTownFundingRow>()

  for (const row of parsed.slice(1)) {
    const town = getCell(row, townIndex)
    if (!town) continue

    const townKey = getCell(row, townKeyIndex) || normalizeTownKey(town)
    rows.set(townKey, {
      town,
      townKey,
      currentEcsEntitlement: parseNumber(getCell(row, currentEcsIndex)),
      strapAid: parseNumber(getCell(row, strapAidIndex)),
      enhancedEducationFunding: parseNumber(getCell(row, enhancedEducationFundingIndex)),
      needsReview: getCell(row, needsReviewIndex).toLowerCase() === 'yes',
    })
  }

  return rows
}

const measureTextApprox = (text: string, fontSize: number, fontFamily?: string) => {
  const family = (fontFamily || '').toLowerCase()
  const serif = family.includes('georgia') || family.includes('times')
  let units = 0
  for (const char of String(text || '')) {
    if (char === ' ') units += 0.34
    else if ('IJijl'.includes(char)) units += serif ? 0.32 : 0.3
    else if ('MW@%'.includes(char)) units += serif ? 0.95 : 0.88
    else units += serif ? 0.62 : 0.58
  }
  return units * fontSize
}

const measureTownLabelWidth = (town: string, fontSize = 36) =>
  clamp(Math.ceil(measureTextApprox(String(town || '').toUpperCase(), fontSize, 'Arial')) + 32, 90, 760)

const wrapTextToWidth = (text: string, fontSize: number, maxWidth: number, fontFamily?: string) => {
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
      if (measureTextApprox(next, fontSize, fontFamily) <= maxWidth) current = next
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
  const fontSize = headline.fontSize || 66
  const lineHeight = headline.lineHeight || 1.05
  const lines = wrapTextToWidth(headline.text || '', fontSize, headline.width, headline.fontFamily)
  return Math.max(120, Math.ceil(lines.length * fontSize * lineHeight))
}

const alignSubheadToHeadline = (scene: ExperimentalTownScene) => ({
  ...scene,
  subhead: {
    ...scene.subhead,
    x: scene.headline.x + 2,
    y: scene.headline.y + measureHeadlineHeight(scene.headline) + 26,
  },
})

const scaleBaseScene = (scene: ExperimentalTownScene) => {
  const scaleX = STAGE_WIDTH / 1200
  const scaleY = STAGE_HEIGHT / 1600

  return {
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

const createBaseScene = (data: TownFundingResponse) => {
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
    kind: 'experimental-town-graphic/v1',
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
      crop: { zoom: 1, offsetX: 0, offsetY: 0 },
    },
    customImages: [],
    customRects: [],
    customTexts: [],
    townColumns: 1 as const,
    townRows,
  } satisfies ExperimentalTownScene

  const scaledScene = scaleBaseScene(scene)

  return alignSubheadToHeadline({
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
    kind: 'experimental-town-graphic/v1',
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
      crop: { zoom: 1, offsetX: 0, offsetY: 0 },
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
    townColumns: backTownColumns as 1 | 2,
    townRows: backTownRows,
  } satisfies ExperimentalTownScene

  return alignSubheadToHeadline(scene)
}

const mergeSceneWithFreshData = (savedScene: ExperimentalTownScene | null | undefined, baseScene: ExperimentalTownScene) => {
  if (!savedScene || !isExperimentalScene(savedScene)) return baseScene

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
    townColumns: savedScene.townColumns === 2 ? 2 : 1,
    townRows: baseScene.townRows.map((baseRow) => {
      const match = (savedScene.townRows || []).find((row) => (row.townKey || normalizeTownKey(row.town)) === baseRow.townKey)
      return match
        ? {
            ...baseRow,
            ...match,
            town: baseRow.town,
            strapAid: baseRow.strapAid,
            townKey: baseRow.townKey,
          }
        : baseRow
    }),
  })
}

const normalizeHexColor = (value: string | null | undefined, fallback = '#000000'): string => {
  const raw = (value || fallback).trim()
  if (raw.toLowerCase() === 'transparent') return '00000000'
  const match = raw.match(/^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i)
  if (!match?.[1]) return fallback === '#000000' ? '000000' : normalizeHexColor(fallback, '#000000')
  const hex = match[1]
  if (hex.length === 3) return hex.split('').map((char) => `${char}${char}`).join('')
  return hex
}

const colorToRgb = (value: string, fallback = '#000000') => {
  const hex = normalizeHexColor(value, fallback).slice(0, 6)
  return rgb(
    Number.parseInt(hex.slice(0, 2), 16) / 255,
    Number.parseInt(hex.slice(2, 4), 16) / 255,
    Number.parseInt(hex.slice(4, 6), 16) / 255,
  )
}

const getPdfFontName = (fontFamily?: string, fontStyle?: string) => {
  const family = (fontFamily || '').toLowerCase()
  const style = (fontStyle || '').toLowerCase()
  const isBold = style.includes('700') || style.includes('bold')
  const isItalic = style.includes('italic') || style.includes('oblique')
  const prefersSerif = family.includes('georgia') || family.includes('times')

  if (prefersSerif) {
    if (isBold && isItalic) return StandardFonts.TimesRomanBoldItalic
    if (isBold) return StandardFonts.TimesRomanBold
    if (isItalic) return StandardFonts.TimesRomanItalic
    return StandardFonts.TimesRoman
  }

  if (isBold && isItalic) return StandardFonts.HelveticaBoldOblique
  if (isBold) return StandardFonts.HelveticaBold
  if (isItalic) return StandardFonts.HelveticaOblique
  return StandardFonts.Helvetica
}

const drawWrappedPdfText = async ({
  doc,
  page,
  text,
  x,
  y,
  width,
  height,
  fontFamily,
  fontStyle,
  fontSize,
  color,
  lineHeight,
  rotation,
  textAlign,
}: {
  doc: PDFDocument
  page: import('pdf-lib').PDFPage
  text: string
  x: number
  y: number
  width: number
  height?: number
  fontFamily?: string
  fontStyle?: string
  fontSize: number
  color: string
  lineHeight?: number
  rotation?: number
  textAlign?: 'left' | 'center' | 'right'
}) => {
  const font = await doc.embedFont(getPdfFontName(fontFamily, fontStyle))
  const lines = wrapTextToWidth(text || '', fontSize, width, fontFamily)
  const lineGap = fontSize * (lineHeight || 1.1)
  const rotationDegrees = rotation || 0
  const boxHeight = height || Math.max(fontSize, lines.length * lineGap)
  const centerX = x + width / 2
  const centerY = y + boxHeight / 2
  const radians = (rotationDegrees * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)

  lines.forEach((line, index) => {
    const lineWidth = font.widthOfTextAtSize(line, fontSize)
    const lineX = textAlign === 'center' ? x + (width - lineWidth) / 2 : textAlign === 'right' ? x + width - lineWidth : x
    const lineBaselineY = y + fontSize + index * lineGap
    const rotatedX = rotationDegrees ? centerX + (lineX - centerX) * cos - (lineBaselineY - centerY) * sin : lineX
    const rotatedY = rotationDegrees ? centerY + (lineX - centerX) * sin + (lineBaselineY - centerY) * cos : lineBaselineY

    page.drawText(line, {
      x: rotatedX,
      y: STAGE_HEIGHT - rotatedY,
      size: fontSize,
      font,
      color: colorToRgb(color),
      rotate: rotationDegrees ? degrees(-rotationDegrees) : undefined,
    })
  })
}

const hexToRgbaObject = (value: string) => {
  const normalized = normalizeHexColor(value)
  const alpha = normalized.length === 8 ? Number.parseInt(normalized.slice(6, 8), 16) / 255 : 1
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
    alpha,
  }
}

const buildRectanglePngBuffer = async ({ width, height, color }: { width: number; height: number; color: string }) =>
  sharp({
    create: {
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
      channels: 4,
      background: hexToRgbaObject(color),
    },
  })
    .png()
    .toBuffer()

const drawPdfImageBytes = async ({
  doc,
  page,
  assetBytes,
  x,
  y,
  width,
  height,
}: {
  doc: PDFDocument
  page: import('pdf-lib').PDFPage
  assetBytes: Uint8Array
  x: number
  y: number
  width: number
  height: number
}) => {
  const hex = Buffer.from(assetBytes.slice(0, 8)).toString('hex')
  const image =
    hex.startsWith('89504e470d0a1a0a') ? await doc.embedPng(assetBytes) : hex.startsWith('ffd8ff') ? await doc.embedJpg(assetBytes) : null
  if (!image) throw new Error('Unsupported image format for PDF export')
  page.drawImage(image, {
    x,
    y: STAGE_HEIGHT - y - height,
    width,
    height,
  })
}

const dataUrlToBuffer = (value: string | null | undefined) => {
  if (!value) return null
  const match = value.match(/^data:[^;]+;base64,(.+)$/)
  if (!match?.[1]) return null
  return Buffer.from(match[1], 'base64')
}

const buildTransformedImageBuffer = async ({
  assetBytes,
  width,
  height,
  rotation = 0,
}: {
  assetBytes: Uint8Array
  width: number
  height: number
  rotation?: number
}) => {
  const resized = await sharp(assetBytes)
    .resize(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)), { fit: 'fill' })
    .png()
    .toBuffer()

  if (Math.abs(rotation) < 0.05) {
    return {
      buffer: resized,
      width,
      height,
      offsetX: 0,
      offsetY: 0,
    }
  }

  const rotated = await sharp(resized)
    .rotate(rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  const rotatedMeta = await sharp(rotated).metadata()
  const rotatedWidth = rotatedMeta.width || Math.round(width)
  const rotatedHeight = rotatedMeta.height || Math.round(height)

  return {
    buffer: rotated,
    width: rotatedWidth,
    height: rotatedHeight,
    offsetX: (width - rotatedWidth) / 2,
    offsetY: (height - rotatedHeight) / 2,
  }
}

const resolveAbsoluteUrl = (url: string, origin: string) => {
  try {
    return new URL(url, origin).toString()
  } catch {
    return null
  }
}

const computeCoverPlacement = (
  imageWidth: number,
  imageHeight: number,
  frameWidth: number,
  frameHeight: number,
  crop?: { zoom: number; offsetX: number; offsetY: number },
) => {
  const zoom = crop?.zoom || 1
  const baseScale = Math.max(frameWidth / imageWidth, frameHeight / imageHeight)
  const scale = baseScale * zoom
  const width = imageWidth * scale
  const height = imageHeight * scale
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

const buildCircularHeadshotBuffer = async ({
  imageBytes,
  scene,
}: {
  imageBytes: Buffer | null
  scene: ExperimentalTownScene
}) => {
  if (!imageBytes || scene.headshot.size <= 0) return null
  const metadata = await sharp(imageBytes).metadata()
  if (!metadata.width || !metadata.height) return null

  const placement = computeCoverPlacement(
    metadata.width,
    metadata.height,
    scene.headshot.size,
    scene.headshot.size,
    scene.headshot.crop,
  )

  const diameter = Math.max(1, Math.round(scene.headshot.size * 2))
  const scale = diameter / scene.headshot.size
  const resized = await sharp(imageBytes)
    .resize(Math.max(1, Math.round(placement.width * scale)), Math.max(1, Math.round(placement.height * scale)))
    .png()
    .toBuffer()
  const mask = Buffer.from(
    `<svg width="${diameter}" height="${diameter}"><circle cx="${diameter / 2}" cy="${diameter / 2}" r="${diameter / 2}" fill="white"/></svg>`,
  )

  return sharp({
    create: {
      width: diameter,
      height: diameter,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: resized, left: Math.round(placement.x * scale), top: Math.round(placement.y * scale) },
      { input: mask, blend: 'dest-in' },
    ])
    .png()
    .toBuffer()
}

const buildPdfBufferFromSceneBundle = async ({
  bundle,
  circularHeadshotDataUrls,
  headshotBytes,
  imageDataUrls,
  origin,
}: {
  bundle: MailSceneBundle
  circularHeadshotDataUrls?: { back?: string | null; front?: string | null }
  headshotBytes: Buffer | null
  imageDataUrls?: Record<string, string | null | undefined>
  origin: string
}) => {
  const pdf = await PDFDocument.create()

  const drawScenePage = async (scene: ExperimentalTownScene, options: { includePlaceholder: boolean; side: 'front' | 'back' }) => {
    const page = pdf.addPage([STAGE_WIDTH, STAGE_HEIGHT])
    const townLabelFont = await pdf.embedFont(StandardFonts.HelveticaBold)

    page.drawRectangle({
      x: 0,
      y: 0,
      width: STAGE_WIDTH,
      height: STAGE_HEIGHT,
      color: colorToRgb('#f7f4ef'),
    })
    page.drawRectangle({
      x: 0,
      y: 0,
      width: STAGE_WIDTH,
      height: STAGE_HEIGHT,
      color: rgb(1, 1, 1),
      opacity: 0.66,
    })

    const customImagesByID = new Map(scene.customImages.map((item) => [item.id, item] as const))
    const customRectsByID = new Map(scene.customRects.map((item) => [item.id, item] as const))
    const customTextsByID = new Map(scene.customTexts.map((item) => [item.id, item] as const))
    const drawnCustomKeys = new Set<string>()
    const hiddenCustomKeys = new Set(
      Array.isArray(scene.layers)
        ? scene.layers
            .filter((item) => item.group === 'custom' && item.hidden)
            .map((item) => `${item.kind}:${item.id}`)
        : [],
    )

    const drawCustomImage = async (item: CustomImageElement) => {
      drawnCustomKeys.add(`custom-image:${item.id}`)
      let assetBytes = dataUrlToBuffer(imageDataUrls?.[`${options.side}:${item.id}`] || imageDataUrls?.[item.id])
      if (!assetBytes) {
        const absoluteUrl = resolveAbsoluteUrl(item.sourceUrl, origin)
        if (!absoluteUrl) return
        assetBytes = await fetchBuffer(absoluteUrl)
      }
      if (!assetBytes) return
      const transformed = await buildTransformedImageBuffer({
        assetBytes,
        width: item.width,
        height: item.height,
        rotation: item.rotation,
      })
      await drawPdfImageBytes({
        doc: pdf,
        page,
        assetBytes: transformed.buffer,
        x: item.x + transformed.offsetX,
        y: item.y + transformed.offsetY,
        width: transformed.width,
        height: transformed.height,
      })
    }

    const drawCustomRect = async (item: CustomRectElement) => {
      drawnCustomKeys.add(`custom-rect:${item.id}`)
      const shapeType = item.shapeType || 'rect'
      const strokeWidth = item.strokeWidth || 0
      const strokeColor = colorToRgb(item.strokeColor || item.fill || '#111827')
      const dashArray = item.dashStyle === 'dashed' ? [16, 10] : item.dashStyle === 'dotted' ? [2, 9] : undefined
      if (shapeType === 'line') {
        const angle = ((item.rotation || 0) * Math.PI) / 180
        const deltaX = item.width * Math.cos(angle) - item.height * Math.sin(angle)
        const deltaY = item.width * Math.sin(angle) + item.height * Math.cos(angle)
        page.drawLine({
          start: { x: item.x, y: STAGE_HEIGHT - item.y },
          end: { x: item.x + deltaX, y: STAGE_HEIGHT - (item.y + deltaY) },
          thickness: Math.max(1, strokeWidth || 8),
          color: strokeColor,
          dashArray,
        })
        return
      }

      if (shapeType === 'circle') {
        page.drawEllipse({
          x: item.x + item.width / 2,
          y: STAGE_HEIGHT - item.y - item.height / 2,
          xScale: Math.max(1, Math.abs(item.width) / 2),
          yScale: Math.max(1, Math.abs(item.height) / 2),
          color: item.fillEnabled === false ? undefined : colorToRgb(item.fill),
          borderColor: strokeWidth ? strokeColor : undefined,
          borderWidth: strokeWidth || undefined,
        })
        return
      }

      if (item.fillEnabled !== false) {
        const rectBytes = await buildRectanglePngBuffer({ width: item.width, height: item.height, color: item.fill })
        await drawPdfImageBytes({ doc: pdf, page, assetBytes: rectBytes, x: item.x, y: item.y, width: item.width, height: item.height })
      }
      if (strokeWidth) {
        page.drawRectangle({
          x: item.x,
          y: STAGE_HEIGHT - item.y - item.height,
          width: item.width,
          height: item.height,
          borderColor: strokeColor,
          borderWidth: strokeWidth,
        })
      }
    }

    const drawCustomText = async (item: CustomTextElement) => {
      drawnCustomKeys.add(`custom-text:${item.id}`)
      await drawWrappedPdfText({
        doc: pdf,
        page,
        text: item.text,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        fontFamily: item.fontFamily,
        fontStyle: item.fontStyle,
        fontSize: item.fontSize,
        color: item.color,
        lineHeight: item.lineHeight,
        rotation: item.rotation,
        textAlign: item.textAlign,
      })
    }

    const orderedCustomLayers = Array.isArray(scene.layers)
      ? scene.layers
          .filter((item) => item.group === 'custom' && !item.hidden)
          .sort((left, right) => left.order - right.order)
      : []

    if (orderedCustomLayers.length) {
      for (const layer of orderedCustomLayers) {
        if (layer.kind === 'custom-image') {
          const item = customImagesByID.get(layer.id)
          if (item) await drawCustomImage(item)
        } else if (layer.kind === 'custom-rect') {
          const item = customRectsByID.get(layer.id)
          if (item) await drawCustomRect(item)
        } else if (layer.kind === 'custom-text') {
          const item = customTextsByID.get(layer.id)
          if (item) await drawCustomText(item)
        }
      }
    }

    for (const item of scene.customImages) {
      const key = `custom-image:${item.id}`
      if (!drawnCustomKeys.has(key) && !hiddenCustomKeys.has(key)) await drawCustomImage(item)
    }
    for (const item of scene.customRects) {
      const key = `custom-rect:${item.id}`
      if (!drawnCustomKeys.has(key) && !hiddenCustomKeys.has(key)) await drawCustomRect(item)
    }
    for (const item of scene.customTexts) {
      const key = `custom-text:${item.id}`
      if (!drawnCustomKeys.has(key) && !hiddenCustomKeys.has(key)) await drawCustomText(item)
    }

    const eyebrowBarBytes = await buildRectanglePngBuffer({
      width: scene.eyebrow.barWidth,
      height: scene.eyebrow.barHeight,
      color: scene.eyebrow.backgroundColor,
    })
    await drawPdfImageBytes({
      doc: pdf,
      page,
      assetBytes: eyebrowBarBytes,
      x: scene.eyebrow.x,
      y: scene.eyebrow.y,
      width: scene.eyebrow.barWidth,
      height: scene.eyebrow.barHeight,
    })

    await drawWrappedPdfText({
      doc: pdf,
      page,
      text: scene.eyebrow.text,
      x: scene.eyebrow.x + scene.eyebrow.paddingX,
      y: scene.eyebrow.y + scene.eyebrow.paddingY,
      width: scene.eyebrow.barWidth - scene.eyebrow.paddingX * 2,
      fontFamily: scene.eyebrow.fontFamily,
      fontStyle: scene.eyebrow.fontStyle,
      fontSize: scene.eyebrow.fontSize,
      color: scene.eyebrow.color,
      lineHeight: scene.eyebrow.lineHeight,
    })

    await drawWrappedPdfText({
      doc: pdf,
      page,
      text: scene.headline.text,
      x: scene.headline.x,
      y: scene.headline.y,
      width: scene.headline.width,
      fontFamily: scene.headline.fontFamily,
      fontStyle: scene.headline.fontStyle,
      fontSize: scene.headline.fontSize,
      color: scene.headline.color,
      lineHeight: scene.headline.lineHeight,
    })

    page.drawRectangle({
      x: scene.subhead.x,
      y: STAGE_HEIGHT - scene.subhead.y - scene.subhead.dividerHeight,
      width: scene.subhead.dividerWidth,
      height: scene.subhead.dividerHeight,
      color: colorToRgb(scene.subhead.dividerColor),
    })

    await drawWrappedPdfText({
      doc: pdf,
      page,
      text: scene.subhead.text,
      x: scene.subhead.x,
      y: scene.subhead.y + 14,
      width: Math.max(scene.subhead.dividerWidth + 120, 320),
      fontFamily: scene.subhead.fontFamily,
      fontStyle: scene.subhead.fontStyle,
      fontSize: scene.subhead.fontSize,
      color: scene.subhead.color,
    })

    for (const row of scene.townRows.filter((nextRow) => nextRow.included)) {
      const labelText = row.town.toUpperCase()
      const labelTextWidth = townLabelFont.widthOfTextAtSize(labelText, row.townFontSize)
      const renderedLabelWidth = Math.max(TOWN_LABEL_MIN_WIDTH, Math.ceil(labelTextWidth + TOWN_LABEL_PADDING_X * 2))
      const labelTextHeight = townLabelFont.heightAtSize(row.townFontSize)
      const labelTextY =
        STAGE_HEIGHT - row.labelY - row.labelHeight + (row.labelHeight - labelTextHeight) / 2 + TOWN_LABEL_TEXT_Y_ADJUST

      page.drawRectangle({
        x: row.labelX,
        y: STAGE_HEIGHT - row.labelY - row.labelHeight,
        width: renderedLabelWidth,
        height: row.labelHeight,
        color: colorToRgb(row.labelColor),
      })

      page.drawText(labelText, {
        x: row.labelX + TOWN_LABEL_PADDING_X,
        y: labelTextY,
        size: row.townFontSize,
        font: townLabelFont,
        color: colorToRgb('#ffffff'),
      })

      await drawWrappedPdfText({
        doc: pdf,
        page,
        text: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(row.strapAid),
        x: row.amountX,
        y: row.amountY,
        width: 420,
        fontFamily: 'Arial',
        fontStyle: '700',
        fontSize: row.amountFontSize,
        color: row.textColor,
      })
    }

    const footerBarBytes = await buildRectanglePngBuffer({
      width: scene.footer.width,
      height: scene.footer.height,
      color: scene.footer.backgroundColor,
    })
    await drawPdfImageBytes({
      doc: pdf,
      page,
      assetBytes: footerBarBytes,
      x: scene.footer.x,
      y: scene.footer.y,
      width: scene.footer.width,
      height: scene.footer.height,
    })

    await drawWrappedPdfText({
      doc: pdf,
      page,
      text: scene.footer.text,
      x: scene.footer.textX,
      y: scene.footer.textY,
      width: scene.footer.width - scene.footer.textX - 32,
      fontFamily: scene.footer.fontFamily || 'Arial',
      fontStyle: scene.footer.fontStyle,
      fontSize: scene.footer.fontSize,
      color: scene.footer.color,
    })

    const circularHeadshotBuffer =
      dataUrlToBuffer(options.side === 'front' ? circularHeadshotDataUrls?.front : circularHeadshotDataUrls?.back) ||
      await buildCircularHeadshotBuffer({ imageBytes: headshotBytes, scene })
    if (circularHeadshotBuffer) {
      await drawPdfImageBytes({
        doc: pdf,
        page,
        assetBytes: circularHeadshotBuffer,
        x: scene.headshot.x,
        y: scene.headshot.y,
        width: scene.headshot.size,
        height: scene.headshot.size,
      })
    }

    if (options.includePlaceholder) {
      page.drawRectangle({
        x: STAGE_WIDTH - MAIL_PLACEHOLDER_WIDTH,
        y: 0,
        width: MAIL_PLACEHOLDER_WIDTH,
        height: MAIL_PLACEHOLDER_HEIGHT,
        color: colorToRgb('#ffffff'),
        borderColor: colorToRgb('#94a3b8'),
        borderWidth: 2,
      })
    }
  }

  await drawScenePage(bundle.frontScene, { includePlaceholder: true, side: 'front' })
  await drawScenePage(bundle.backScene, { includePlaceholder: false, side: 'back' })
  return Buffer.from(await pdf.save())
}

const buildPrintPdfBufferFromSceneBundle = async ({
  bundle,
  circularHeadshotDataUrls,
  headshotBytes,
  imageDataUrls,
  origin,
}: {
  bundle: MailSceneBundle
  circularHeadshotDataUrls?: { back?: string | null; front?: string | null }
  headshotBytes: Buffer | null
  imageDataUrls?: Record<string, string | null | undefined>
  origin: string
}) => {
  const scenePdfBuffer = await buildPdfBufferFromSceneBundle({ bundle, circularHeadshotDataUrls, headshotBytes, imageDataUrls, origin })
  const pdf = await PDFDocument.create()
  const [frontPage, backPage] = await pdf.embedPdf(scenePdfBuffer, [0, 1])
  if (!frontPage || !backPage) throw new Error('Failed to render front/back mailer pages')

  const drawImposedPage = (sourcePage: NonNullable<Awaited<ReturnType<typeof pdf.embedPdf>>[number]>) => {
    const page = pdf.addPage([LETTER_WIDTH, LETTER_HEIGHT])
    page.drawPage(sourcePage, {
      x: PRINT_MARGIN,
      y: PRINT_MARGIN + PRINT_SLOT_HEIGHT + PRINT_GAP,
      width: PRINT_SLOT_WIDTH,
      height: PRINT_SLOT_HEIGHT,
    })
    page.drawPage(sourcePage, {
      x: PRINT_MARGIN,
      y: PRINT_MARGIN,
      width: PRINT_SLOT_WIDTH,
      height: PRINT_SLOT_HEIGHT,
    })
  }

  drawImposedPage(frontPage)
  drawImposedPage(backPage)
  return Buffer.from(await pdf.save())
}

const readMediaUrl = (value: unknown, origin: string) => {
  const record = asRecord(value)
  const rawUrl = getString(record.url) || getString(record.thumbnailURL)
  if (!rawUrl) return null
  try {
    return new URL(rawUrl, origin).toString()
  } catch {
    return null
  }
}

const fetchBuffer = async (url: string) => {
  const response = await fetch(url, {
    cache: 'no-store',
  })
  if (!response.ok) return null
  return Buffer.from(await response.arrayBuffer())
}

const buildServerBundleForTenant = async ({
  payload,
  origin,
  tenantID,
  requestedDesignID,
  requestedTemplateID,
}: {
  payload: Awaited<ReturnType<typeof getPayload>>
  origin: string
  tenantID: string
  requestedDesignID?: string
  requestedTemplateID?: string
}) => {
  const [tenantDoc, repResponse, standardMediaResponse, csvRows, templateResponse, designResponse] = await Promise.all([
    payload.findByID({
      collection: 'tenants',
      id: tenantID,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'rep-info',
      where: { tenant: { equals: tenantID } },
      limit: 1,
      depth: 1,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'standard-media',
      where: { tenant: { equals: tenantID } },
      limit: 1,
      depth: 1,
      overrideAccess: true,
    }),
    readTownFundingCsv(),
    payload.find({
      collection: 'graphic-templates',
      limit: 50,
      depth: 1,
      sort: '-updatedAt',
      overrideAccess: true,
    }),
    payload.find({
      collection: 'graphic-designs',
      where: { primaryTenant: { equals: tenantID } },
      limit: 50,
      depth: 1,
      sort: '-updatedAt',
      overrideAccess: true,
    }),
  ])

  const repInfo = repResponse.docs[0]
  if (!repInfo) throw new Error(`No rep-info found for tenant ${tenantID}`)

  const standardMedia = (standardMediaResponse.docs[0] || null) as StandardMediaDoc | null
  const repInfoRecord = asRecord(repInfo as unknown) || {}
  const towns = Array.isArray(repInfoRecord.towns) ? ((repInfoRecord.towns as RepTown[]) || []) : []

  const townData: TownFundingResponse = {
    tenant: {
      id: getString(asRecord(tenantDoc)?.id) || tenantID,
      name: getString(asRecord(tenantDoc)?.name) || '',
      slug: getString(asRecord(tenantDoc)?.slug) || '',
    },
    repInfo: {
      name: getString(repInfoRecord.name) || '',
    },
    standardMedia,
    townRows: towns.map((townEntry, index) => {
      const townName = getString(townEntry?.town)?.trim() || `Town ${index + 1}`
      const csvMatch = csvRows.get(normalizeTownKey(townName))
      const strapAid = csvMatch?.strapAid ?? getNumber(townEntry?.houseGopStrapAid) ?? csvMatch?.enhancedEducationFunding ?? 0

      return {
        id: `${normalizeTownKey(townName) || 'town'}-${index}`,
        town: townName,
        strapAid,
      }
    }),
  }

  const nextTemplates = Array.isArray(templateResponse.docs)
    ? templateResponse.docs.filter((doc) => isMailSceneBundle(doc.scene) || (isExperimentalScene(doc.scene) && Boolean(parseMailEditorNotes(doc.notes))))
    : []
  const nextDesigns = Array.isArray(designResponse.docs)
    ? designResponse.docs.filter((doc) => isMailSceneBundle(doc.scene) || (isExperimentalScene(doc.scene) && Boolean(parseMailEditorNotes(doc.notes))))
    : []
  const selectedDesign = requestedDesignID
    ? nextDesigns.find((item) => item.id === requestedDesignID)
    : nextDesigns.find((item) => parseMailEditorNotes(item.notes)?.selectedTenantID === tenantID) || nextDesigns[0]
  const selectedTemplate = !selectedDesign && requestedTemplateID ? nextTemplates.find((item) => item.id === requestedTemplateID) : undefined

  const frontBaseScene = createBaseScene(townData)
  const backBaseScene = createBackScene(townData, townData.tenant?.name || undefined)
  const selectedDesignBundle = isMailSceneBundle(selectedDesign?.scene) ? selectedDesign.scene : null
  const selectedTemplateBundle = isMailSceneBundle(selectedTemplate?.scene) ? selectedTemplate.scene : null
  const selectedDesignScene = isExperimentalScene(selectedDesign?.scene) ? selectedDesign.scene : null
  const selectedTemplateScene = isExperimentalScene(selectedTemplate?.scene) ? selectedTemplate.scene : null

  const bundle: MailSceneBundle = {
    kind: 'graphics-editor-mail-bundle/v1',
    frontScene: selectedDesign
      ? mergeSceneWithFreshData(selectedDesignBundle?.frontScene || selectedDesignScene, frontBaseScene)
      : selectedTemplate
        ? mergeSceneWithFreshData(selectedTemplateBundle?.frontScene || selectedTemplateScene, frontBaseScene)
        : frontBaseScene,
    backScene: selectedDesign
      ? mergeSceneWithFreshData(selectedDesignBundle?.backScene || selectedDesignScene, backBaseScene)
      : selectedTemplate
        ? mergeSceneWithFreshData(selectedTemplateBundle?.backScene || selectedTemplateScene, backBaseScene)
        : backBaseScene,
    activeMailSide: selectedDesignBundle?.activeMailSide || selectedTemplateBundle?.activeMailSide || 'front',
  }

  const headshotUrl = readMediaUrl(asRecord(townData.standardMedia || {}).mobileHeadshot, origin)
  const headshotBytes = headshotUrl ? await fetchBuffer(headshotUrl) : null

  return {
    label: townData.tenant?.name || tenantID,
    slug: townData.tenant?.slug || tenantID,
    bundle,
    headshotBytes,
  }
}

const runMailExportJob = async ({
  jobID,
  payload,
  origin,
  tenantOptions,
  requestedDesignID,
  requestedTemplateID,
}: {
  jobID: string
  payload: Awaited<ReturnType<typeof getPayload>>
  origin: string
  tenantOptions: TenantSelectOption[]
  requestedDesignID?: string
  requestedTemplateID?: string
}) => {
  updateMailExportJob(jobID, { status: 'running' })
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const skipped: Array<{ label: string; id: string; reason: string }> = []
  let completed = 0

  for (const option of tenantOptions) {
    updateMailExportJob(jobID, { currentTenantLabel: option.label, completed })
    try {
      const { slug, bundle, headshotBytes } = await buildServerBundleForTenant({
        payload,
        origin,
        tenantID: option.value,
        requestedDesignID,
        requestedTemplateID,
      })
      const pdfBuffer = await buildPdfBufferFromSceneBundle({
        bundle,
        headshotBytes,
        imageDataUrls: undefined,
        origin,
      })
      const folderName = (slug || option.label || option.value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || option.value
      zip.file(`${folderName}.pdf`, pdfBuffer)
      completed += 1
      updateMailExportJob(jobID, { completed })
    } catch (error) {
      skipped.push({
        label: option.label,
        id: option.value,
        reason: error instanceof Error ? error.message : String(error),
      })
      updateMailExportJob(jobID, { skippedCount: skipped.length })
    }
  }

  if (skipped.length) {
    zip.file(
      'skipped-tenants.txt',
      skipped.map((item) => `${item.label} (${item.id})\n${item.reason}`).join('\n\n'),
    )
  }

  const result = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  updateMailExportJob(jobID, {
    status: 'complete',
    completed,
    skippedCount: skipped.length,
    currentTenantLabel: null,
    result,
  })
  setTimeout(() => {
    updateMailExportJob(jobID, { result: null })
  }, 60 * 60 * 1000)
}

export async function POST(req: NextRequest) {
  const payload = await getPayload({ config: configPromise })
  const user = await payload.auth({ req: req as unknown as PayloadRequest, headers: req.headers }).catch(() => null)
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const body = (await req.json()) as RequestBody

  if (body.mode === 'single-print-pdf') {
    if (!isMailSceneBundle(body.bundle)) {
      return NextResponse.json({ message: 'Missing or invalid mail scene bundle' }, { status: 400 })
    }

    const origin = req.nextUrl.origin
    const headshotUrl = typeof body.headshotUrl === 'string' ? resolveAbsoluteUrl(body.headshotUrl, origin) : null
    const headshotBytes = headshotUrl ? await fetchBuffer(headshotUrl) : null
    const pdfBuffer = await buildPrintPdfBufferFromSceneBundle({
      bundle: body.bundle,
      circularHeadshotDataUrls: {
        front: body.frontCircularHeadshotDataUrl || null,
        back: body.backCircularHeadshotDataUrl || null,
      },
      headshotBytes,
      imageDataUrls: body.imageDataUrls,
      origin,
    })
    const filenameBase =
      (body.filenameBase || body.downloadName || 'town-graphic')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'town-graphic'

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${filenameBase}-print.pdf"`,
      },
    })
  }

  const tenantOptions = Array.isArray(body.tenantOptions)
    ? body.tenantOptions.filter((item): item is TenantSelectOption => Boolean(item?.value))
    : []

  if (!tenantOptions.length) {
    return NextResponse.json({ message: 'No tenants provided' }, { status: 400 })
  }

  const origin = new URL(req.url).origin
  const jobID = randomUUID()
  const downloadName = `graphics-editor-mail-all-reps-${Date.now()}.zip`
  createMailExportJob(jobID, tenantOptions.length, downloadName)

  void runMailExportJob({
    jobID,
    payload,
    origin,
    tenantOptions,
    requestedDesignID: body.requestedDesignID,
    requestedTemplateID: body.requestedTemplateID,
  }).catch((error) => {
    updateMailExportJob(jobID, {
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      currentTenantLabel: null,
    })
  })

  return NextResponse.json({ jobID })
}

export async function GET(req: NextRequest) {
  const payload = await getPayload({ config: configPromise })
  const user = await payload.auth({ req: req as unknown as PayloadRequest, headers: req.headers }).catch(() => null)
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const jobID = req.nextUrl.searchParams.get('jobId')
  if (!jobID) return NextResponse.json({ message: 'Missing jobId' }, { status: 400 })

  const { getMailExportJob } = await import('@/lib/graphics/mail-export-jobs')
  const job = getMailExportJob(jobID)
  if (!job) return NextResponse.json({ message: 'Job not found' }, { status: 404 })

  return NextResponse.json({
    id: job.id,
    status: job.status,
    total: job.total,
    completed: job.completed,
    currentTenantLabel: job.currentTenantLabel,
    skippedCount: job.skippedCount,
    error: job.error,
    downloadName: job.downloadName,
    downloadUrl: job.status === 'complete' && job.result ? `/api/graphics-editor-mail/export-all/${job.id}` : null,
  })
}
