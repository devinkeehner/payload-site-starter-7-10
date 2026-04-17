import { NextRequest, NextResponse } from 'next/server'
import PptxGenJS from 'pptxgenjs'

export const runtime = 'nodejs'

const STAGE_WIDTH = 1600
const STAGE_HEIGHT = 1000
const PPTX_LAYOUT_NAME = 'MAILER_8X5'
const PPTX_WIDTH_IN = 8
const PPTX_HEIGHT_IN = 5
const BAR_TEXT_Y_ADJUST = -4
const PLACEHOLDER_WIDTH = 560
const PLACEHOLDER_HEIGHT = 364

const toPptxX = (value: number) => (value / STAGE_WIDTH) * PPTX_WIDTH_IN
const toPptxY = (value: number) => (value / STAGE_HEIGHT) * PPTX_HEIGHT_IN
const toPptxW = (value: number) => (value / STAGE_WIDTH) * PPTX_WIDTH_IN
const toPptxH = (value: number) => (value / STAGE_HEIGHT) * PPTX_HEIGHT_IN
const toPptxFontSize = (value: number) => Math.max(6, (value / STAGE_WIDTH) * (PPTX_WIDTH_IN * 72))

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

type CustomImageElement = {
  id: string
  x: number
  y: number
  width: number
  height: number
  mediaID: string
  sourceUrl: string
  alt?: string
}

type TownSceneRow = {
  id: string
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
  eyebrow: EyebrowElement
  headline: SceneTextElement
  subhead: SubheadElement
  footer: FooterElement
  headshot: HeadshotElement
  customImages: CustomImageElement[]
  customRects: CustomRectElement[]
  customTexts: CustomTextElement[]
  townRows: TownSceneRow[]
}

type ExportRequest = {
  filenameBase?: string
  title?: string
  frontScene?: ExperimentalTownScene
  backScene?: ExperimentalTownScene
  frontCircularHeadshotDataUrl?: string | null
  backCircularHeadshotDataUrl?: string | null
  frontDataUrl?: string
  backDataUrl?: string
}

const normalizeHexColor = (value: string | null | undefined, fallback = '000000') => {
  const trimmed = (value || '').trim()
  if (!trimmed) return fallback
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.slice(1).toUpperCase()
  if (/^[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toUpperCase()
  return fallback
}

const isBold = (fontStyle?: string) =>
  (fontStyle || '').includes('700') || (fontStyle || '').toLowerCase().includes('bold')

const isItalic = (fontStyle?: string) => (fontStyle || '').toLowerCase().includes('italic')

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value || 0)

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const measureTownLabelWidth = (town: string, fontSize = 36) => {
  const text = String(town || '').toUpperCase()
  let units = 0
  for (const char of text) {
    if (char === ' ') units += 0.38
    else if ('IJ'.includes(char)) units += 0.42
    else if ('MW'.includes(char)) units += 0.92
    else units += 0.66
  }
  return clamp(Math.ceil(units * fontSize) + 44, 90, 760)
}

const measureWrappedTextHeight = ({
  text,
  width,
  fontSize,
  lineHeight = 1.1,
}: {
  text: string
  width: number
  fontSize: number
  lineHeight?: number
}) => {
  const lines = String(text || '').replace(/\r/g, '').split('\n')
  const approximateCharsPerLine = Math.max(1, Math.floor(width / Math.max(fontSize * 0.56, 1)))
  let lineCount = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      lineCount += 1
      continue
    }
    lineCount += Math.max(1, Math.ceil(trimmed.length / approximateCharsPerLine))
  }

  return Math.max(fontSize * lineHeight, lineCount * fontSize * lineHeight)
}

const resolveAbsoluteUrl = (url: string, origin: string) => {
  try {
    return new URL(url, origin).toString()
  } catch {
    return null
  }
}

const fetchImageAsDataUrl = async (url: string, origin: string) => {
  const absoluteUrl = resolveAbsoluteUrl(url, origin)
  if (!absoluteUrl) return null
  const response = await fetch(absoluteUrl, { cache: 'no-store' })
  if (!response.ok) return null
  const contentType = response.headers.get('content-type') || 'image/png'
  const buffer = Buffer.from(await response.arrayBuffer())
  return `data:${contentType};base64,${buffer.toString('base64')}`
}

const addTextBlock = (
  slide: PptxGenJS.Slide,
  block: {
    text: string
    x: number
    y: number
    width: number
    fontSize: number
    color: string
    fontFamily?: string
    fontStyle?: string
    lineHeight?: number
    textDecoration?: string
  },
) => {
  slide.addText(block.text, {
    x: toPptxX(block.x),
    y: toPptxY(block.y),
    w: toPptxW(block.width),
    h: toPptxH(measureWrappedTextHeight(block)),
    fontFace: block.fontFamily || 'Arial',
    fontSize: toPptxFontSize(block.fontSize),
    bold: isBold(block.fontStyle),
    italic: isItalic(block.fontStyle),
    underline: block.textDecoration === 'underline' ? { color: normalizeHexColor(block.color) } : undefined,
    color: normalizeHexColor(block.color),
    margin: 0,
    fit: 'shrink',
    breakLine: false,
  })
}

const renderSceneToSlide = ({
  pptx,
  slide,
  scene,
  headshotDataUrl,
  customImageDataUrls,
  includePlaceholder,
}: {
  pptx: PptxGenJS
  slide: PptxGenJS.Slide
  scene: ExperimentalTownScene
  headshotDataUrl?: string | null
  customImageDataUrls?: Record<string, string | null>
  includePlaceholder: boolean
}) => {
  slide.background = { color: 'F7F4EF' }

  for (const item of scene.customImages || []) {
    const dataUrl = customImageDataUrls?.[item.id]
    if (!dataUrl) continue
    slide.addImage({
      data: dataUrl,
      x: toPptxX(item.x),
      y: toPptxY(item.y),
      w: toPptxW(item.width),
      h: toPptxH(item.height),
    })
  }

  for (const item of scene.customRects || []) {
    slide.addShape(pptx.ShapeType.rect, {
      x: toPptxX(item.x),
      y: toPptxY(item.y),
      w: toPptxW(item.width),
      h: toPptxH(item.height),
      line: { color: normalizeHexColor(item.fill), transparency: 100 },
      fill: { color: normalizeHexColor(item.fill) },
    })
  }

  for (const item of scene.customTexts || []) {
    addTextBlock(slide, item)
  }

  slide.addShape(pptx.ShapeType.rect, {
    x: toPptxX(scene.eyebrow.x),
    y: toPptxY(scene.eyebrow.y),
    w: toPptxW(scene.eyebrow.barWidth),
    h: toPptxH(scene.eyebrow.barHeight),
    line: { color: normalizeHexColor(scene.eyebrow.backgroundColor), transparency: 100 },
    fill: { color: normalizeHexColor(scene.eyebrow.backgroundColor) },
  })

  slide.addText(scene.eyebrow.text, {
    x: toPptxX(scene.eyebrow.x + scene.eyebrow.paddingX),
    y: toPptxY(scene.eyebrow.y + scene.eyebrow.paddingY + BAR_TEXT_Y_ADJUST),
    w: toPptxW(scene.eyebrow.barWidth - scene.eyebrow.paddingX * 2),
    h: toPptxH(scene.eyebrow.barHeight),
    fontFace: scene.eyebrow.fontFamily || 'Arial',
    fontSize: toPptxFontSize(scene.eyebrow.fontSize),
    bold: isBold(scene.eyebrow.fontStyle),
    italic: isItalic(scene.eyebrow.fontStyle),
    underline:
      scene.eyebrow.textDecoration === 'underline'
        ? { color: normalizeHexColor(scene.eyebrow.color, 'FFFFFF') }
        : undefined,
    color: normalizeHexColor(scene.eyebrow.color, 'FFFFFF'),
    margin: 0,
    fit: 'shrink',
    breakLine: false,
  })

  addTextBlock(slide, scene.headline)

  slide.addShape(pptx.ShapeType.rect, {
    x: toPptxX(scene.subhead.x),
    y: toPptxY(scene.subhead.y),
    w: toPptxW(scene.subhead.dividerWidth),
    h: toPptxH(scene.subhead.dividerHeight),
    line: { color: normalizeHexColor(scene.subhead.dividerColor), transparency: 100 },
    fill: { color: normalizeHexColor(scene.subhead.dividerColor) },
  })

  slide.addText(scene.subhead.text, {
    x: toPptxX(scene.subhead.x),
    y: toPptxY(scene.subhead.y + 14),
    w: toPptxW(Math.max(scene.subhead.dividerWidth + 120, 320)),
    h: toPptxH(Math.max(scene.subhead.fontSize * 1.5, 40)),
    fontFace: scene.subhead.fontFamily || 'Arial',
    fontSize: toPptxFontSize(scene.subhead.fontSize),
    bold: isBold(scene.subhead.fontStyle),
    italic: isItalic(scene.subhead.fontStyle),
    underline:
      scene.subhead.textDecoration === 'underline'
        ? { color: normalizeHexColor(scene.subhead.color) }
        : undefined,
    color: normalizeHexColor(scene.subhead.color),
    margin: 0,
    fit: 'shrink',
    breakLine: false,
  })

  for (const row of (scene.townRows || []).filter((item) => item.included)) {
    const renderedLabelWidth = measureTownLabelWidth(row.town, row.townFontSize)
    slide.addShape(pptx.ShapeType.rect, {
      x: toPptxX(row.labelX),
      y: toPptxY(row.labelY),
      w: toPptxW(renderedLabelWidth),
      h: toPptxH(row.labelHeight),
      line: { color: normalizeHexColor(row.labelColor), transparency: 100 },
      fill: { color: normalizeHexColor(row.labelColor) },
    })

    slide.addText(String(row.town || '').toUpperCase(), {
      x: toPptxX(row.labelX + 14),
      y: toPptxY(row.labelY + 9 + BAR_TEXT_Y_ADJUST),
      w: toPptxW(Math.max(renderedLabelWidth - 14, 60)),
      h: toPptxH(row.labelHeight),
      fontFace: 'Arial',
      fontSize: toPptxFontSize(row.townFontSize),
      bold: true,
      color: 'FFFFFF',
      margin: 0,
      fit: 'shrink',
      breakLine: false,
    })

    slide.addText(formatCurrency(Number(row.strapAid) || 0), {
      x: toPptxX(row.amountX),
      y: toPptxY(row.amountY),
      w: toPptxW(420),
      h: toPptxH(Math.max(row.amountFontSize * 1.2, 44)),
      fontFace: 'Arial',
      fontSize: toPptxFontSize(row.amountFontSize),
      bold: true,
      color: normalizeHexColor(row.textColor),
      margin: 0,
      fit: 'shrink',
      breakLine: false,
    })
  }

  slide.addShape(pptx.ShapeType.rect, {
    x: toPptxX(scene.footer.x),
    y: toPptxY(scene.footer.y),
    w: toPptxW(scene.footer.width),
    h: toPptxH(scene.footer.height),
    line: { color: normalizeHexColor(scene.footer.backgroundColor), transparency: 100 },
    fill: { color: normalizeHexColor(scene.footer.backgroundColor) },
  })

  slide.addText(scene.footer.text, {
    x: toPptxX(scene.footer.textX),
    y: toPptxY(scene.footer.textY + BAR_TEXT_Y_ADJUST),
    w: toPptxW(Math.max(scene.footer.width - (scene.footer.textX - scene.footer.x) - 32, 120)),
    h: toPptxH(Math.max(scene.footer.fontSize * 1.4, 40)),
    fontFace: scene.footer.fontFamily || 'Arial',
    fontSize: toPptxFontSize(scene.footer.fontSize),
    bold: isBold(scene.footer.fontStyle),
    italic: isItalic(scene.footer.fontStyle),
    underline:
      scene.footer.textDecoration === 'underline'
        ? { color: normalizeHexColor(scene.footer.color, 'FFFFFF') }
        : undefined,
    color: normalizeHexColor(scene.footer.color, 'FFFFFF'),
    margin: 0,
    fit: 'shrink',
    breakLine: false,
  })

  if (headshotDataUrl && scene.headshot.size > 0) {
    slide.addImage({
      data: headshotDataUrl,
      x: toPptxX(scene.headshot.x),
      y: toPptxY(scene.headshot.y),
      w: toPptxW(scene.headshot.size),
      h: toPptxH(scene.headshot.size),
    })
  }

  if (includePlaceholder) {
    slide.addShape(pptx.ShapeType.roundRect, {
      x: toPptxX(STAGE_WIDTH - PLACEHOLDER_WIDTH),
      y: toPptxY(STAGE_HEIGHT - PLACEHOLDER_HEIGHT),
      w: toPptxW(PLACEHOLDER_WIDTH),
      h: toPptxH(PLACEHOLDER_HEIGHT),
      rectRadius: 0.08,
      line: { color: '94A3B8', pt: 1.5 },
      fill: { color: 'FFFFFF' },
    })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ExportRequest
    const frontScene = body.frontScene
    const backScene = body.backScene
    const origin = new URL(req.url).origin

    const filenameBase = (body.filenameBase || 'town-graphic')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')

    const pptx = new PptxGenJS()
    pptx.defineLayout({ name: PPTX_LAYOUT_NAME, width: PPTX_WIDTH_IN, height: PPTX_HEIGHT_IN })
    pptx.layout = PPTX_LAYOUT_NAME
    pptx.author = 'Codex'
    pptx.company = 'CT House GOP'
    pptx.subject = 'Graphics editor mail export'
    pptx.title = body.title || 'Mailer Graphic'
    pptx.theme = {
      headFontFace: 'Georgia',
      bodyFontFace: 'Arial',
    }

    if (frontScene && backScene) {
      const [frontCustomImageDataUrls, backCustomImageDataUrls] = await Promise.all([
        Promise.all((frontScene.customImages || []).map(async (item) => [item.id, await fetchImageAsDataUrl(item.sourceUrl, origin)] as const)).then(Object.fromEntries),
        Promise.all((backScene.customImages || []).map(async (item) => [item.id, await fetchImageAsDataUrl(item.sourceUrl, origin)] as const)).then(Object.fromEntries),
      ])
      const frontSlide = pptx.addSlide()
      renderSceneToSlide({
        pptx,
        slide: frontSlide,
        scene: frontScene,
        headshotDataUrl: body.frontCircularHeadshotDataUrl,
        customImageDataUrls: frontCustomImageDataUrls,
        includePlaceholder: true,
      })

      const backSlide = pptx.addSlide()
      renderSceneToSlide({
        pptx,
        slide: backSlide,
        scene: backScene,
        headshotDataUrl: body.backCircularHeadshotDataUrl,
        customImageDataUrls: backCustomImageDataUrls,
        includePlaceholder: false,
      })
    } else if (body.frontDataUrl && body.backDataUrl) {
      ;[
        { data: body.frontDataUrl },
        { data: body.backDataUrl },
      ].forEach((side) => {
        const slide = pptx.addSlide()
        slide.background = { color: 'F3F4F6' }
        slide.addImage({
          data: side.data,
          x: 0,
          y: 0,
          w: PPTX_WIDTH_IN,
          h: PPTX_HEIGHT_IN,
        })
      })
    } else {
      const receivedKeys = Object.keys(body || {}).join(', ')
      return new NextResponse(`Missing PPTX export payload. Received keys: ${receivedKeys || 'none'}`, { status: 400 })
    }

    const output = (await pptx.write({
      outputType: 'nodebuffer',
      compression: true,
    })) as Buffer

    return new NextResponse(output, {
      status: 200,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'content-disposition': `attachment; filename="${filenameBase || 'town-graphic'}.pptx"`,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PPTX export failed'
    return new NextResponse(message, { status: 500 })
  }
}
