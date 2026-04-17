import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import { NextRequest, NextResponse } from 'next/server'
import { getPayload, type PayloadRequest } from 'payload'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import sharp from 'sharp'

import configPromise from '@payload-config'
import { createMailExportJob, updateMailExportJob } from '@/lib/graphics/mail-export-jobs'

export const runtime = 'nodejs'

const STAGE_WIDTH = 1600
const STAGE_HEIGHT = 1000
const BRAND_BLUE = '#6b7280'
const BRAND_RED = '#334155'
const WEBSITE_TEXT = 'CTHOUSEGOP.COM/BUDGET'
const MAIL_PLACEHOLDER_WIDTH = 560
const MAIL_PLACEHOLDER_HEIGHT = 364

type TenantSelectOption = {
  label: string
  value: string
}

type RequestBody = {
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
  text: string
  fontSize: number
  color: string
  fontFamily?: string
  fontStyle?: string
  lineHeight?: number
  textDecoration?: string
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
  kind: string
  backgroundMediaID: string | null
  eyebrow: EyebrowElement
  headline: SceneTextElement
  subhead: SubheadElement
  footer: FooterElement
  headshot: HeadshotElement
  customRects: CustomRectElement[]
  customTexts: CustomTextElement[]
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

const getRenderedTownLabelWidth = (row: TownSceneRow) => measureTownLabelWidth(row.town, row.townFontSize)

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

const createBackScene = () => {
  const scene = {
    kind: 'experimental-town-graphic/v1',
    backgroundMediaID: null,
    eyebrow: {
      id: 'eyebrow',
      x: 84,
      y: 72,
      width: 260,
      text: 'PATHWAY TO AFFORDABILITY',
      fontSize: 24,
      color: '#ffffff',
      fontFamily: 'Arial',
      fontStyle: '700',
      lineHeight: 1,
      barWidth: 470,
      barHeight: 52,
      paddingX: 18,
      paddingY: 12,
      backgroundColor: BRAND_RED,
    },
    headline: {
      id: 'headline',
      x: 84,
      y: 170,
      width: 760,
      text: 'A Better Budget\nfor Connecticut',
      fontSize: 56,
      color: BRAND_RED,
      fontFamily: 'Georgia, Times New Roman, serif',
      fontStyle: '700',
      lineHeight: 1.05,
    },
    subhead: {
      id: 'subhead',
      x: 86,
      y: 0,
      dividerWidth: 340,
      dividerHeight: 4,
      dividerColor: '#9ca3af',
      text: 'Direct town aid. Tax relief. Lower household costs.',
      fontSize: 30,
      color: BRAND_BLUE,
      fontFamily: 'Arial',
      fontStyle: '700',
    },
    footer: {
      id: 'footer',
      x: 0,
      y: 920,
      width: STAGE_WIDTH,
      height: 80,
      backgroundColor: BRAND_RED,
      text: WEBSITE_TEXT,
      textX: 80,
      textY: 940,
      fontSize: 34,
      color: '#ffffff',
      fontStyle: 'italic 700',
    },
    headshot: {
      id: 'headshot',
      x: STAGE_WIDTH + 120,
      y: STAGE_HEIGHT + 120,
      size: 0,
      crop: { zoom: 1, offsetX: 0, offsetY: 0 },
    },
    customRects: [
      {
        id: 'back-highlight-bar',
        x: 84,
        y: 598,
        width: 520,
        height: 18,
        fill: BRAND_RED,
      },
    ],
    customTexts: [
      {
        id: 'back-copy-left',
        x: 84,
        y: 348,
        width: 640,
        text:
          'STRAP sends direct aid to every Connecticut town.\n$365 million in additional town education funding.\nBuilt into the state budget so towns can count on it year after year.\nProperty tax relief starts by lowering the pressure on local budgets.',
        fontSize: 28,
        color: '#374151',
        fontFamily: 'Arial',
        fontStyle: '700',
        lineHeight: 1.22,
      },
      {
        id: 'back-copy-right',
        x: 860,
        y: 210,
        width: 620,
        text:
          "More than $400 million in tax relief.\nA larger property tax credit for more than 800,000 filers.\nNo tax on Social Security benefits.\nNo tax on tips.\nCut the tax on children's clothing.\nReduce healthcare cost pressure.\nSupport municipal early voting costs.",
        fontSize: 25,
        color: '#4b5563',
        fontFamily: 'Arial',
        fontStyle: '700',
        lineHeight: 1.22,
      },
      {
        id: 'back-summary',
        x: 84,
        y: 640,
        width: 1390,
        text: 'A balanced caucus budget that spends less, protects taxpayers, and delivers real relief to families and municipalities.',
        fontSize: 30,
        color: BRAND_RED,
        fontFamily: 'Georgia, Times New Roman, serif',
        fontStyle: '700',
        lineHeight: 1.15,
      },
    ],
    townColumns: 1 as const,
    townRows: [],
  } satisfies ExperimentalTownScene

  return alignSubheadToHeadline(scene)
}

const mergeSceneWithFreshData = (savedScene: ExperimentalTownScene | null | undefined, baseScene: ExperimentalTownScene) => {
  if (!savedScene || !isExperimentalScene(savedScene)) return baseScene
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
    customRects: Array.isArray(savedScene.customRects) ? savedScene.customRects : baseScene.customRects,
    customTexts: Array.isArray(savedScene.customTexts) ? savedScene.customTexts : baseScene.customTexts,
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

const colorToRgb = (value: string, fallback = '#000000') => {
  const normalized = (value || fallback).trim()
  const match = normalized.match(/^#?([0-9a-f]{6})$/i)
  if (!match?.[1]) return rgb(0, 0, 0)
  const hex = match[1]
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
  fontFamily,
  fontStyle,
  fontSize,
  color,
  lineHeight,
}: {
  doc: PDFDocument
  page: import('pdf-lib').PDFPage
  text: string
  x: number
  y: number
  width: number
  fontFamily?: string
  fontStyle?: string
  fontSize: number
  color: string
  lineHeight?: number
}) => {
  const font = await doc.embedFont(getPdfFontName(fontFamily, fontStyle))
  const lines = wrapTextToWidth(text || '', fontSize, width, fontFamily)
  const lineGap = fontSize * (lineHeight || 1.1)

  lines.forEach((line, index) => {
    page.drawText(line, {
      x,
      y: STAGE_HEIGHT - y - fontSize - index * lineGap,
      size: fontSize,
      font,
      color: colorToRgb(color),
    })
  })
}

const hexToRgbaObject = (value: string) => {
  const normalized = (value || '').replace(/^#/, '')
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return { r: 0, g: 0, b: 0, alpha: 1 }
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
    alpha: 1,
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
  headshotBytes,
}: {
  bundle: MailSceneBundle
  headshotBytes: Buffer | null
}) => {
  const pdf = await PDFDocument.create()

  const drawScenePage = async (scene: ExperimentalTownScene, options: { includePlaceholder: boolean }) => {
    const page = pdf.addPage([STAGE_WIDTH, STAGE_HEIGHT])

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

    for (const item of scene.customRects) {
      const rectBytes = await buildRectanglePngBuffer({ width: item.width, height: item.height, color: item.fill })
      await drawPdfImageBytes({ doc: pdf, page, assetBytes: rectBytes, x: item.x, y: item.y, width: item.width, height: item.height })
    }

    for (const item of scene.customTexts) {
      await drawWrappedPdfText({
        doc: pdf,
        page,
        text: item.text,
        x: item.x,
        y: item.y,
        width: item.width,
        fontFamily: item.fontFamily,
        fontStyle: item.fontStyle,
        fontSize: item.fontSize,
        color: item.color,
        lineHeight: item.lineHeight,
      })
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
      const renderedLabelWidth = getRenderedTownLabelWidth(row)
      const townBarBytes = await buildRectanglePngBuffer({
        width: renderedLabelWidth,
        height: row.labelHeight,
        color: row.labelColor,
      })
      await drawPdfImageBytes({
        doc: pdf,
        page,
        assetBytes: townBarBytes,
        x: row.labelX,
        y: row.labelY,
        width: renderedLabelWidth,
        height: row.labelHeight,
      })

      await drawWrappedPdfText({
        doc: pdf,
        page,
        text: row.town.toUpperCase(),
        x: row.labelX + 14,
        y: row.labelY + 7,
        width: Math.max(renderedLabelWidth - 14, 60),
        fontFamily: 'Arial',
        fontStyle: '700',
        fontSize: row.townFontSize,
        color: '#ffffff',
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

    const circularHeadshotBuffer = await buildCircularHeadshotBuffer({ imageBytes: headshotBytes, scene })
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

  await drawScenePage(bundle.frontScene, { includePlaceholder: true })
  await drawScenePage(bundle.backScene, { includePlaceholder: false })
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
  const backBaseScene = createBackScene()
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
  // @ts-expect-error jszip types are not exposed in this workspace
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
