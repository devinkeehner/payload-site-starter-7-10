import { NextRequest, NextResponse } from 'next/server'
import PptxGenJS from 'pptxgenjs'

export const runtime = 'nodejs'

const STAGE_WIDTH = 1200
const STAGE_HEIGHT = 1600
const PPTX_LAYOUT_NAME = 'TOWN_GRAPHIC_EDITOR'
const PPTX_WIDTH_IN = 7.5
const PPTX_HEIGHT_IN = 10

const toPptxX = (value: number) => (value / STAGE_WIDTH) * PPTX_WIDTH_IN
const toPptxY = (value: number) => (value / STAGE_HEIGHT) * PPTX_HEIGHT_IN
const toPptxW = (value: number) => (value / STAGE_WIDTH) * PPTX_WIDTH_IN
const toPptxH = (value: number) => (value / STAGE_HEIGHT) * PPTX_HEIGHT_IN
const toPptxFontSize = (value: number) => Math.max(6, (value / STAGE_WIDTH) * (PPTX_WIDTH_IN * 72))

const normalizeHexColor = (value: string | null | undefined, fallback = '000000') => {
  const trimmed = (value || '').trim()
  if (!trimmed) return fallback
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.slice(1).toUpperCase()
  if (/^[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toUpperCase()
  return fallback
}

const measureHeadlineHeight = (headline: { text: string; width: number; fontSize: number; lineHeight?: number }) => {
  const sanitized = headline.text.replace(/\r/g, '')
  const lines = sanitized.split('\n')
  const approximateCharsPerLine = Math.max(1, Math.floor(headline.width / Math.max(headline.fontSize * 0.56, 1)))
  let lineCount = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      lineCount += 1
      continue
    }
    lineCount += Math.max(1, Math.ceil(trimmed.length / approximateCharsPerLine))
  }

  return lineCount * headline.fontSize * (headline.lineHeight || 1.04)
}

type ExportRequest = {
  filenameBase?: string
  title?: string
  scene?: any
  backgroundDataUrl?: string
  circularHeadshotDataUrl?: string | null
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ExportRequest
    const scene = body.scene

    if (!scene || !body.backgroundDataUrl) {
      return new NextResponse('Missing export payload', { status: 400 })
    }

    const filenameBase = (body.filenameBase || 'town-graphic')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')

    const pptx = new PptxGenJS()
    pptx.defineLayout({ name: PPTX_LAYOUT_NAME, width: PPTX_WIDTH_IN, height: PPTX_HEIGHT_IN })
    pptx.layout = PPTX_LAYOUT_NAME
    pptx.author = 'Codex'
    pptx.company = 'CT House GOP'
    pptx.subject = 'Experimental town graphic export'
    pptx.title = body.title || 'Town Graphic'
    pptx.theme = {
      headFontFace: 'Georgia',
      bodyFontFace: 'Arial',
    }

    const slide = pptx.addSlide()

    slide.addImage({
      data: body.backgroundDataUrl,
      x: 0,
      y: 0,
      w: PPTX_WIDTH_IN,
      h: PPTX_HEIGHT_IN,
    })

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
      y: toPptxY(scene.eyebrow.y + scene.eyebrow.paddingY),
      w: toPptxW(scene.eyebrow.barWidth - scene.eyebrow.paddingX * 2),
      h: toPptxH(scene.eyebrow.barHeight),
      fontFace: scene.eyebrow.fontFamily || 'Arial',
      fontSize: toPptxFontSize(scene.eyebrow.fontSize),
      bold: (scene.eyebrow.fontStyle || '').includes('700') || (scene.eyebrow.fontStyle || '').toLowerCase().includes('bold'),
      italic: (scene.eyebrow.fontStyle || '').toLowerCase().includes('italic'),
      underline: scene.eyebrow.textDecoration === 'underline' ? { color: normalizeHexColor(scene.eyebrow.color, 'FFFFFF') } : undefined,
      color: normalizeHexColor(scene.eyebrow.color, 'FFFFFF'),
      margin: 0,
      fit: 'shrink',
      breakLine: false,
    })

    slide.addText(scene.headline.text, {
      x: toPptxX(scene.headline.x),
      y: toPptxY(scene.headline.y),
      w: toPptxW(scene.headline.width),
      h: toPptxH(measureHeadlineHeight(scene.headline)),
      fontFace: scene.headline.fontFamily || 'Georgia',
      fontSize: toPptxFontSize(scene.headline.fontSize),
      bold: (scene.headline.fontStyle || '').includes('700') || (scene.headline.fontStyle || '').toLowerCase().includes('bold'),
      italic: (scene.headline.fontStyle || '').toLowerCase().includes('italic'),
      underline: scene.headline.textDecoration === 'underline' ? { color: normalizeHexColor(scene.headline.color) } : undefined,
      color: normalizeHexColor(scene.headline.color),
      margin: 0,
      fit: 'shrink',
      breakLine: false,
    })

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
      h: toPptxH(scene.subhead.fontSize * 1.5),
      fontFace: scene.subhead.fontFamily || 'Arial',
      fontSize: toPptxFontSize(scene.subhead.fontSize),
      bold: (scene.subhead.fontStyle || '').includes('700') || (scene.subhead.fontStyle || '').toLowerCase().includes('bold'),
      italic: (scene.subhead.fontStyle || '').toLowerCase().includes('italic'),
      underline: scene.subhead.textDecoration === 'underline' ? { color: normalizeHexColor(scene.subhead.color) } : undefined,
      color: normalizeHexColor(scene.subhead.color),
      margin: 0,
      fit: 'shrink',
      breakLine: false,
    })

    scene.townRows.filter((row: any) => row.included).forEach((row: any) => {
      slide.addShape(pptx.ShapeType.rect, {
        x: toPptxX(row.labelX),
        y: toPptxY(row.labelY),
        w: toPptxW(row.labelWidth),
        h: toPptxH(row.labelHeight),
        line: { color: normalizeHexColor(row.labelColor), transparency: 100 },
        fill: { color: normalizeHexColor(row.labelColor) },
      })
      slide.addText(String(row.town || '').toUpperCase(), {
        x: toPptxX(row.labelX + 14),
        y: toPptxY(row.labelY + 8),
        w: toPptxW(row.labelWidth - 22),
        h: toPptxH(row.labelHeight),
        fontFace: 'Arial',
        fontSize: toPptxFontSize(row.townFontSize),
        bold: true,
        color: 'FFFFFF',
        margin: 0,
        fit: 'shrink',
        breakLine: false,
      })
      slide.addText(String(row.strapAidFormatted || row.amountText || row.strapAid || ''), {
        x: toPptxX(row.amountX),
        y: toPptxY(row.amountY),
        w: toPptxW(420),
        h: toPptxH(row.amountFontSize * 1.2),
        fontFace: 'Arial',
        fontSize: toPptxFontSize(row.amountFontSize),
        bold: true,
        color: normalizeHexColor(row.textColor),
        margin: 0,
        fit: 'shrink',
        breakLine: false,
      })
    })

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
      y: toPptxY(scene.footer.textY),
      w: toPptxW(scene.footer.width - scene.footer.textX - 32),
      h: toPptxH(scene.footer.fontSize * 1.4),
      fontFace: 'Arial',
      fontSize: toPptxFontSize(scene.footer.fontSize),
      bold: (scene.footer.fontStyle || '').includes('700') || (scene.footer.fontStyle || '').toLowerCase().includes('bold'),
      italic: (scene.footer.fontStyle || '').toLowerCase().includes('italic'),
      underline: scene.footer.textDecoration === 'underline' ? { color: normalizeHexColor(scene.footer.color, 'FFFFFF') } : undefined,
      color: normalizeHexColor(scene.footer.color, 'FFFFFF'),
      margin: 0,
      fit: 'shrink',
      breakLine: false,
    })

    if (body.circularHeadshotDataUrl) {
      slide.addImage({
        data: body.circularHeadshotDataUrl,
        x: toPptxX(scene.headshot.x),
        y: toPptxY(scene.headshot.y),
        w: toPptxW(scene.headshot.size),
        h: toPptxH(scene.headshot.size),
      })
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
