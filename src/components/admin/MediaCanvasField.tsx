'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, useField, useFormFields, useForm } from '@payloadcms/ui'

// Fixed OG dimensions
const CANVAS_W = 1200
const CANVAS_H = 630
const DEFAULT_TEXT_WIDTH = CANVAS_W - 36 * 2

type UnknownRecord = Record<string, unknown>
type FormFieldState = { value?: unknown; initialValue?: unknown }
type FormFieldsState = Record<string, FormFieldState | undefined>
type TextBlock = {
  text?: string
  x?: number
  y?: number
  width?: number
  font?: string
  color?: string
  lineHeight?: number
}
type LayoutLine = {
  key?: string
  x?: number
  y?: number
  width?: number
  lineHeight?: number
  font?: string
  color?: string
  align?: 'left' | 'center' | 'right'
}

const asRecord = (value: unknown): UnknownRecord =>
  typeof value === 'object' && value !== null ? (value as UnknownRecord) : {}

const asFormFields = (fields: unknown): FormFieldsState =>
  (typeof fields === 'object' && fields !== null ? (fields as FormFieldsState) : {})

const readFieldValue = (fields: unknown, name: string): unknown => {
  const map = asFormFields(fields)
  return map[name]?.value ?? map[name]?.initialValue
}

const getAlign = (value: unknown): 'left' | 'center' | 'right' =>
  value === 'center' || value === 'right' ? value : 'left'

const getTenantValue = (value: unknown): string | undefined => {
  if (!value) return undefined
  if (typeof value === 'string') return value
  const rec = asRecord(value)
  if (typeof rec.id === 'string') return rec.id
  if (typeof rec.value === 'string') return rec.value
  return undefined
}

// Utility to derive an absolute media URL from a media field value
const deriveMediaURL = async (val: unknown): Promise<string | null> => {
  try {
    if (!val) return null
    // If object-like doc with url
    if (typeof val === 'object' && val !== null) {
      const valRecord = asRecord(val)
      const imageRecord = asRecord(valRecord.image)
      const url = (typeof valRecord.url === 'string' ? valRecord.url : undefined) || (typeof imageRecord.url === 'string' ? imageRecord.url : undefined)
      if (typeof url === 'string' && url) return url
      const filename = (typeof valRecord.filename === 'string' ? valRecord.filename : undefined) || (typeof imageRecord.filename === 'string' ? imageRecord.filename : undefined)
      if (filename) {
        // Attempt to use public base (server populates url on afterRead in Media)
        const base = '' // server already sets doc.url; fallback only if necessary
        if (base) return `${base}/${filename}`
      }
      // Try nested value/id
      const id = getTenantValue(val)
      if (typeof id === 'string') {
        const res = await fetch(`/api/media/${id}?depth=0`, { credentials: 'include' })
        if (res.ok) {
          const doc = await res.json()
          const u = doc?.url || doc?.image?.url
          if (typeof u === 'string' && u) return u
        }
      }
    }
    // If it is just an ID string
    if (typeof val === 'string') {
      const res = await fetch(`/api/media/${val}?depth=0`, { credentials: 'include' })
      if (res.ok) {
        const doc = await res.json()
        const u = doc?.url || doc?.image?.url
        if (typeof u === 'string' && u) return u
      }
    }
  } catch {
    // ignore
  }
  return null
}

// Prefer same-origin image loads via local proxy to avoid CORS-tainted canvas
const buildProxiedURL = (raw: string): string => {
  try {
    const target = new URL(raw, window.location.origin)
    const sameOrigin = target.origin === window.location.origin
    if (sameOrigin) return target.toString()
    const allowed = ['media.cthousegop.com']
    if (allowed.includes(target.hostname)) {
      return `/api/media-proxy?url=${encodeURIComponent(target.toString())}`
    }
    // Fallback: still proxy to attempt avoiding CORS issues with other hosts
    return `/api/media-proxy?url=${encodeURIComponent(target.toString())}`
  } catch {
    return raw
  }
}

const useNumberField = (path: string, def = 0) => {
  const { value, setValue } = useField<number>({ path })
  const v = typeof value === 'number' && !Number.isNaN(value) ? value : def
  return { value: v, setValue }
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

const drawText = (ctx: CanvasRenderingContext2D, text: string, opts: { x: number; y: number; maxWidth: number; font: string; color: string; lineHeight: number }) => {
  const { x, y, maxWidth, font, color, lineHeight } = opts
  if (!text) return
  ctx.save()
  ctx.font = font
  ctx.fillStyle = color
  // Simple wrap
  const words = text.split(/\s+/)
  let line = ''
  let yy = y
  for (const w of words) {
    const test = line ? line + ' ' + w : w
    const { width } = ctx.measureText(test)
    if (width > maxWidth && line) {
      ctx.fillText(line, x, yy)
      line = w
      yy += lineHeight
    } else {
      line = test
    }
  }
  if (line) ctx.fillText(line, x, yy)
  ctx.restore()
}

// Draw wrapped text with optional decorations (underline/strikethrough)
const drawTextAlignedDecorated = (
  ctx: CanvasRenderingContext2D,
  text: string,
  opts: {
    x: number
    y: number
    maxWidth: number
    font: string
    color: string
    lineHeight: number
    align?: 'left' | 'center' | 'right'
    underline?: boolean
    strikethrough?: boolean
  },
) => {
  const { x, y, maxWidth, font, color, lineHeight, align = 'left', underline, strikethrough } = opts
  if (!text) return
  ctx.save()
  ctx.font = font
  ctx.fillStyle = color
  ctx.textAlign = align
  const words = text.split(/\s+/)
  let line = ''
  let yy = y
  const lines: string[] = []
  for (const w of words) {
    const test = line ? line + ' ' + w : w
    const { width } = ctx.measureText(test)
    if (width > maxWidth && line) {
      lines.push(line)
      ctx.fillText(line, x, yy)
      yy += lineHeight
      line = w
    } else {
      line = test
    }
  }
  if (line) {
    lines.push(line)
    ctx.fillText(line, x, yy)
  }

  // Decorations
  if (underline || strikethrough) {
    ctx.strokeStyle = color
    ctx.lineWidth = Math.max(1, Math.floor(lineHeight / 12))
    yy = y
    for (const ln of lines) {
      const metrics = ctx.measureText(ln)
      let startX = x
      if (align === 'center') startX = x - metrics.width / 2
      else if (align === 'right') startX = x - metrics.width
      const endX = startX + metrics.width
      const baseline = yy
      if (underline) {
        const uy = baseline + Math.max(2, Math.floor(lineHeight * 0.15))
        ctx.beginPath()
        ctx.moveTo(startX, uy)
        ctx.lineTo(endX, uy)
        ctx.stroke()
      }
      if (strikethrough) {
        const sy = baseline - Math.max(2, Math.floor(lineHeight * 0.35))
        ctx.beginPath()
        ctx.moveTo(startX, sy)
        ctx.lineTo(endX, sy)
        ctx.stroke()
      }
      yy += lineHeight
    }
  }
  ctx.restore()
}

// Compute default font string for an RTLine (honors heading level, bold, italic). Layout font, if provided, wins.
const fontFromLine = (line: RTLine, lay?: LayoutLine): string => {
  if (lay && typeof lay.font === 'string' && lay.font) return lay.font
  const italic = line.italic ? 'italic ' : ''
  const weight = line.bold || line.kind === 'heading' ? '700 ' : '600 '
  let size = 28
  if (line.kind === 'heading') {
    const lvl = line.headingLevel || 2
    size = lvl === 1 ? 56 : lvl === 2 ? 48 : lvl === 3 ? 40 : lvl === 4 ? 34 : lvl === 5 ? 28 : 24
  }
  return `${italic}${weight}${size}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`
}

// Measure wrapped text similarly to drawText to get bounding box for hit-testing
const measureWrappedText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  opts: { maxWidth: number; font: string; lineHeight: number },
): { width: number; height: number; lines: string[] } => {
  const { maxWidth, font, lineHeight } = opts
  const lines: string[] = []
  if (!text) return { width: 0, height: 0, lines }
  ctx.save()
  ctx.font = font
  const words = text.split(/\s+/)
  let line = ''
  let maxLineWidth = 0
  for (const w of words) {
    const test = line ? line + ' ' + w : w
    const { width } = ctx.measureText(test)
    if (width > maxWidth && line) {
      lines.push(line)
      maxLineWidth = Math.max(maxLineWidth, ctx.measureText(line).width)
      line = w
    } else {
      line = test
    }
  }
  if (line) {
    lines.push(line)
    maxLineWidth = Math.max(maxLineWidth, ctx.measureText(line).width)
  }
  ctx.restore()
  const height = lines.length * lineHeight
  const width = Math.min(maxLineWidth, maxWidth)
  return { width, height, lines }
}

type RTLine = {
  idx: number
  key: string
  text: string
  kind: 'paragraph' | 'heading'
  headingLevel?: number
  align?: 'left' | 'center' | 'right'
  color?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  listType?: 'bullet' | 'number'
  listIndex?: number
}

// Extract paragraphs from Payload Lexical JSON into simple lines, including lists and inline styles
const extractRTParagraphs = (lex: unknown): RTLine[] => {
  try {
    const root = asRecord(lex).root
    const rootRecord = asRecord(root)
    const rootChildren = rootRecord.children
    if (!Array.isArray(rootChildren)) return []
    const lines: RTLine[] = []
    const pushLine = (partial: Omit<RTLine, 'idx'>) => {
      lines.push({ idx: lines.length, ...partial })
    }
    for (const child of rootChildren) {
      const childRecord = asRecord(child)
      const type = childRecord.type
      if (!type) continue
      const nodeKey: string = String((childRecord.key ?? childRecord.id ?? 'idx-' + lines.length))
      const collectInline = (kids: unknown[]) => {
        const parts: string[] = []
        let inlineColor: string | undefined
        let bold = false
        let italic = false
        let underline = false
        let strikethrough = false
        for (const k of kids) {
          const kRec = asRecord(k)
          if (typeof kRec.text === 'string') parts.push(kRec.text)
          const styleStr = typeof kRec.style === 'string' ? kRec.style : ''
          if (styleStr && !inlineColor) {
            const m = /color\s*:\s*([^;]+)\s*;?/i.exec(styleStr)
            if (m && m[1]) inlineColor = m[1].trim()
          }
          const fmt = typeof kRec.format === 'number' ? kRec.format : 0
          // Bitmask heuristic: 1=bold, 2=italic, 4=underline, 8=strike
          if (fmt) {
            if ((fmt & 1) === 1) bold = true
            if ((fmt & 2) === 2) italic = true
            if ((fmt & 4) === 4) underline = true
            if ((fmt & 8) === 8) strikethrough = true
          }
          if (styleStr) {
            if (/font-weight\s*:\s*(bold|[7-9]00)/i.test(styleStr)) bold = true
            if (/font-style\s*:\s*italic/i.test(styleStr)) italic = true
            if (/text-decoration[^;]*underline/i.test(styleStr)) underline = true
            if (/text-decoration[^;]*(line-through|strikethrough)/i.test(styleStr)) strikethrough = true
          }
        }
        const text = parts.join(' ').replace(/\s+/g, ' ').trim()
        return { text, inlineColor, bold, italic, underline, strikethrough }
      }

      if (type === 'heading') {
        const kids = Array.isArray(childRecord.children) ? childRecord.children : []
        const { text, inlineColor, bold, italic, underline, strikethrough } = collectInline(kids)
        if (!text) continue
        const tag = String(childRecord.tag || '').toLowerCase()
        const level = tag.startsWith('h') ? Number(tag.slice(1)) || 2 : 2
        const align = getAlign(childRecord.format)
        pushLine({ key: nodeKey, text, kind: 'heading', headingLevel: level, align, color: inlineColor, bold: !!bold, italic: !!italic, underline: !!underline, strikethrough: !!strikethrough })
      } else if (type === 'paragraph') {
        const kids = Array.isArray(childRecord.children) ? childRecord.children : []
        const { text, inlineColor, bold, italic, underline, strikethrough } = collectInline(kids)
        if (!text) continue
        const align = getAlign(childRecord.format)
        pushLine({ key: nodeKey, text, kind: 'paragraph', align, color: inlineColor, bold: !!bold, italic: !!italic, underline: !!underline, strikethrough: !!strikethrough })
      } else if (type === 'list') {
        // Lexical list with children listitem -> paragraph/text
        const listType: 'bullet' | 'number' = (childRecord.listType === 'number') ? 'number' : 'bullet'
        const items = Array.isArray(childRecord.children) ? childRecord.children : []
        let ordinal = 1
        for (const li of items) {
          const liRecord = asRecord(li)
          if (liRecord.type !== 'listitem') continue
          const liKey = String(liRecord.key ?? liRecord.id ?? `${nodeKey}-${ordinal}`)
          const liKids = Array.isArray(liRecord.children) ? liRecord.children : []
          // Usually each list item contains one paragraph
          for (const p of liKids) {
            const pRecord = asRecord(p)
            if (pRecord.type !== 'paragraph') continue
            const { text, inlineColor, bold, italic, underline, strikethrough } = collectInline(Array.isArray(pRecord.children) ? pRecord.children : [])
            if (!text) continue
            const align = getAlign(pRecord.format)
            const prefix = listType === 'number' ? `${ordinal}. ` : '• '
            pushLine({ key: liKey, text: prefix + text, kind: 'paragraph', align, color: inlineColor, bold: !!bold, italic: !!italic, underline: !!underline, strikethrough: !!strikethrough, listType, listIndex: listType === 'number' ? ordinal : undefined })
          }
          ordinal++
        }
      }
    }
    return lines
  } catch {
    return []
  }
}

const MediaCanvasField: React.FC = () => {
  // Read sibling fields from the form
  const imageField = useFormFields(([fields]) => readFieldValue(fields, 'image'))
  const heading = useFormFields(([fields]) => (readFieldValue(fields, 'heading') as string | undefined) ?? '')
  const subheading = useFormFields(([fields]) => (readFieldValue(fields, 'subheading') as string | undefined) ?? '')
  const title = useFormFields(([fields]) => (readFieldValue(fields, 'title') as string | undefined) ?? '')
  const tenantField = useFormFields(([fields]) => readFieldValue(fields, 'tenant'))
  const richText = useFormFields(([fields]) => readFieldValue(fields, 'richText'))

  const { value: rtLayoutVal, setValue: setRtLayout } = useField<Record<string, LayoutLine>>({ path: 'rtLayout' })

  // Persistent numeric fields
  const { value: posX, setValue: setPosX } = useNumberField('posX', 0)
  const { value: posY, setValue: setPosY } = useNumberField('posY', 0)
  const { value: scale, setValue: setScale } = useNumberField('scale', 1)
  // Text positions
  const { value: headingX, setValue: setHeadingX } = useNumberField('headingX', 36)
  const { value: headingY, setValue: setHeadingY } = useNumberField('headingY', 630 - 36 - 120)
  const { value: subheadingX, setValue: setSubheadingX } = useNumberField('subheadingX', 36)
  const { value: subheadingY, setValue: setSubheadingY } = useNumberField('subheadingY', 630 - 36 - 48)
  const { value: headingWidth, setValue: setHeadingWidth } = useNumberField('headingWidth', DEFAULT_TEXT_WIDTH)
  const { value: subheadingWidth, setValue: setSubheadingWidth } = useNumberField('subheadingWidth', DEFAULT_TEXT_WIDTH)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [hoverTarget, setHoverTarget] = useState<string | null>(null)
  const [selectedRtIndex, setSelectedRtIndex] = useState<number | null>(null)

  // Dynamic additional text blocks array (robust live reconstruction from form field store)
  const fieldsState = useFormFields(([fields]) => asFormFields(fields))
  const { dispatchFields } = useForm()
  const { blocks: textBlocks, keys: textBlockKeys } = useMemo(() => {
    if (!fieldsState) return { blocks: [], keys: [] as string[] }
    // If Payload exposes whole-array value, prefer it
    const direct = fieldsState?.textBlocks?.value ?? fieldsState?.textBlocks?.initialValue
    if (Array.isArray(direct)) {
      // Keys assumed to be numeric indices 0..n-1
      return { blocks: direct, keys: direct.map((_, i) => String(i)) }
    }
    // Reconstruct from child paths: textBlocks.N.{text,x,y,width,font,color,lineHeight}
    const keys = Object.keys(fieldsState as Record<string, unknown>) as string[]
    const segSet = new Set<string>()
    for (const k of keys) {
      const m = /^textBlocks\.([^\.]+)\./.exec(k)
      if (m && m[1]) segSet.add(m[1])
    }
    const result: TextBlock[] = []
    const segs = Array.from(segSet).sort((a, b) => {
      const ai = Number.isFinite(Number(a)) ? Number(a) : Number.POSITIVE_INFINITY
      const bi = Number.isFinite(Number(b)) ? Number(b) : Number.POSITIVE_INFINITY
      if (ai !== bi) return ai - bi
      return a.localeCompare(b)
    })
    const getVal = (path: string, def: unknown) => {
      const node = fieldsState[path]
      const v = node?.value ?? node?.initialValue
      return v !== undefined ? v : def
    }
    const getStringVal = (path: string, def: string) => {
      const value = getVal(path, def)
      return typeof value === 'string' ? value : def
    }
    const getNumberVal = (path: string, def: number) => {
      const value = getVal(path, def)
      return typeof value === 'number' && !Number.isNaN(value) ? value : def
    }
    const pad = 36
    for (const seg of segs) {
      const blk: TextBlock = {}
      blk.text = getStringVal(`textBlocks.${seg}.text`, 'New text')
      blk.x = getNumberVal(`textBlocks.${seg}.x`, pad)
      blk.y = getNumberVal(`textBlocks.${seg}.y`, 630 - pad - 48)
      blk.width = getNumberVal(`textBlocks.${seg}.width`, DEFAULT_TEXT_WIDTH)
      blk.font = getStringVal(`textBlocks.${seg}.font`, '600 28px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial')
      blk.color = getStringVal(`textBlocks.${seg}.color`, '#f1f5f9')
      blk.lineHeight = getNumberVal(`textBlocks.${seg}.lineHeight`, 36)
      result.push(blk)
    }
    return { blocks: result, keys: segs }
  }, [fieldsState])
  const textBlocksRef = useRef<TextBlock[]>(textBlocks)
  const textBlockKeysRef = useRef<string[]>(textBlockKeys)
  useEffect(() => {
    textBlocksRef.current = textBlocks
    textBlockKeysRef.current = textBlockKeys
  }, [textBlocks, textBlockKeys])

  // Load image whenever field changes
  useEffect(() => {
    let ignore = false
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const url = await deriveMediaURL(imageField)
        if (!url) {
          if (!ignore) setImg(null)
          setLoading(false)
          return
        }
        const im = new Image()
        im.crossOrigin = 'anonymous'
        im.onload = () => {
          if (ignore) return
          setImg(im)
          setLoading(false)
          // If scale is uninitialized or too small, fit to cover
          const minScale = Math.max(CANVAS_W / im.width, CANVAS_H / im.height)
          if (!(typeof scale === 'number' && scale > 0)) {
            setScale(minScale)
          }
        }
        im.onerror = () => {
          if (!ignore) {
            setImg(null)
            setError('Failed to load image')
            setLoading(false)
          }
        }
        im.src = buildProxiedURL(url)
      } catch (e: unknown) {
        if (!ignore) {
          setImg(null)
          setError(typeof asRecord(e).message === 'string' ? String(asRecord(e).message) : 'Failed to resolve media URL')
          setLoading(false)
        }
      }
    }
    run()
    return () => {
      ignore = true
    }
  }, [imageField, scale, setScale])

  // Build list of Lexical paragraphs and a corresponding effective layout
  const rtLines = useMemo<RTLine[]>(() => extractRTParagraphs(richText), [richText])

  // Ensure rtLayout exists for each line; default to a stacked right-column layout (only for missing entries) keyed by Lexical node key.
  useEffect(() => {
    const padY = 12
    const baseX = 680
    const baseW = 480
    const startY = 300
    const current: Record<string, LayoutLine> = rtLayoutVal && typeof rtLayoutVal === 'object' ? { ...rtLayoutVal } : {}
    let changed = false
    let accY = startY
    for (let i = 0; i < rtLines.length; i++) {
      const line = rtLines[i] as RTLine
      const key = line.key
      const existing = current[key]
      const lh = line.kind === 'heading' ? 56 : 36
      if (!existing) {
        current[key] = { key, x: baseX, y: accY, width: baseW, lineHeight: lh }
        accY += lh + padY
        changed = true
      }
    }
    if (changed) setRtLayout(current)
  }, [rtLayoutVal, rtLines, setRtLayout])

  // Draw whenever deps change
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)

    // Background
    ctx.fillStyle = '#111'
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

    if (img) {
      // Clamp scale to at least cover the frame
      const minScale = Math.max(CANVAS_W / img.width, CANVAS_H / img.height)
      const s = Math.max(scale || 1, minScale)
      // Compute draw size and top-left based on posX/posY offsets from center
      const dw = img.width * s
      const dh = img.height * s
      const cx = CANVAS_W / 2
      const cy = CANVAS_H / 2
      const dx = cx + (posX || 0) - dw / 2
      const dy = cy + (posY || 0) - dh / 2
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, dx, dy, dw, dh)
    }

    // Text overlay (draggable)
    const pad = 36
    const fallbackMax = CANVAS_W - pad * 2
    // Heading
    if (heading) {
      drawText(ctx, heading, {
        x: headingX || pad,
        y: headingY || (CANVAS_H - pad - 120),
        maxWidth: headingWidth || fallbackMax,
        font: 'bold 48px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
        color: '#ffffff',
        lineHeight: 56,
      })
    }
    // Subheading
    if (subheading) {
      drawText(ctx, subheading, {
        x: subheadingX || pad,
        y: subheadingY || (CANVAS_H - pad - 48),
        maxWidth: subheadingWidth || fallbackMax,
        font: '600 28px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
        color: '#f1f5f9',
        lineHeight: 36,
      })
    }

    // Additional text blocks
    if (textBlocks && textBlocks.length) {
      for (let i = 0; i < textBlocks.length; i++) {
        const b = textBlocks[i] || {}
        const bx = typeof b.x === 'number' ? b.x : pad
        const by = typeof b.y === 'number' ? b.y : (CANVAS_H - pad - 48)
        const bWidth = typeof b.width === 'number' && b.width > 0 ? b.width : (DEFAULT_TEXT_WIDTH)
        const bFont = typeof b.font === 'string' && b.font ? b.font : '600 28px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
        const bColor = typeof b.color === 'string' && b.color ? b.color : '#f1f5f9'
        const bLine = typeof b.lineHeight === 'number' && b.lineHeight > 0 ? b.lineHeight : 36
        const bText = typeof b.text === 'string' && b.text !== undefined ? (b.text || 'New text') : 'New text'
        if (bText) {
          drawText(ctx, bText, {
            x: bx,
            y: by,
            maxWidth: bWidth,
            font: bFont,
            color: bColor,
            lineHeight: bLine,
          })
        }
      }
    }

    // Lexical-driven lines (draw in reverse so earlier paragraphs end up on top)
    if (rtLines.length) {
      const layout: Record<string, LayoutLine> = rtLayoutVal && typeof rtLayoutVal === 'object' ? rtLayoutVal : {}
      for (let i = rtLines.length - 1; i >= 0; i--) {
        const line = rtLines[i] as RTLine
        const lay = layout[line.key] || {}
        const x = typeof lay.x === 'number' ? lay.x : 680
        const y = typeof lay.y === 'number' ? lay.y : 340
        const w = typeof lay.width === 'number' && lay.width > 0 ? lay.width : DEFAULT_TEXT_WIDTH
        const lineHeight = typeof lay.lineHeight === 'number' && lay.lineHeight > 0 ? lay.lineHeight : (line.kind === 'heading' ? 56 : 36)
        const font = fontFromLine(line, lay)
        const color = typeof lay.color === 'string' && lay.color ? lay.color : (line.color || '#f1f5f9')
        const align = getAlign(lay.align || line.align)
        const anchorX = align === 'left' ? x : align === 'center' ? x + w / 2 : x + w
        drawTextAlignedDecorated(ctx, line.text, { x: anchorX, y, maxWidth: w, font, color, lineHeight, align, underline: !!line.underline, strikethrough: !!line.strikethrough })
      }
    }

    // Hover outline around clickable text boxes
    if (hoverTarget) {
      ctx.save()
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      const handleSize = 14
      const handleOffset = 8
      if ((hoverTarget === 'heading' || hoverTarget === 'heading-resize') && heading) {
        // Match hitTest bounds
        const hb = measureWrappedText(
          ctx,
          heading,
          { maxWidth: headingWidth || fallbackMax, font: 'bold 48px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial', lineHeight: 56 },
        )
        const hx = headingX || pad
        const hy = (headingY || (CANVAS_H - pad - 120))
        const hTop = hy - 0.8 * 56
        const hBottom = hy + hb.height
        const margin = 6
        ctx.strokeRect(hx - margin, hTop - margin, hb.width + margin * 2, (hBottom - hTop) + margin * 2)
        // Draw resize handle
        const centerY = (hTop + hBottom) / 2
        const handleX = hx + hb.width + handleOffset - handleSize / 2
        const handleY = centerY - handleSize / 2
        ctx.setLineDash([])
        ctx.fillStyle = 'rgba(255,255,255,0.95)'
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'
        ctx.fillRect(handleX, handleY, handleSize, handleSize)
        ctx.strokeRect(handleX, handleY, handleSize, handleSize)
      } else if ((hoverTarget === 'subheading' || hoverTarget === 'subheading-resize') && subheading) {
        const sb = measureWrappedText(
          ctx,
          subheading,
          { maxWidth: subheadingWidth || fallbackMax, font: '600 28px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial', lineHeight: 36 },
        )
        const sx = subheadingX || pad
        const sy = (subheadingY || (CANVAS_H - pad - 48))
        const sTop = sy - 0.8 * 36
        const sBottom = sy + sb.height
        const margin = 6
        ctx.strokeRect(sx - margin, sTop - margin, sb.width + margin * 2, (sBottom - sTop) + margin * 2)
        // Draw resize handle
        const centerY = (sTop + sBottom) / 2
        const handleX = sx + sb.width + handleOffset - handleSize / 2
        const handleY = centerY - handleSize / 2
        ctx.setLineDash([])
        ctx.fillStyle = 'rgba(255,255,255,0.95)'
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'
        ctx.fillRect(handleX, handleY, handleSize, handleSize)
        ctx.strokeRect(handleX, handleY, handleSize, handleSize)
      } else if (hoverTarget?.startsWith('block')) {
        const idx = parseInt(hoverTarget.split('-').pop() || '0', 10)
        const b = (textBlocks && textBlocks[idx]) ? textBlocks[idx] : {}
        const bText = typeof b.text === 'string' && b.text !== undefined ? (b.text || 'New text') : ''
        if (bText) {
          const bx = typeof b.x === 'number' ? b.x : pad
          const by = typeof b.y === 'number' ? b.y : (CANVAS_H - pad - 48)
          const bWidth = typeof b.width === 'number' && b.width > 0 ? b.width : (DEFAULT_TEXT_WIDTH)
          const bFont = typeof b.font === 'string' && b.font ? b.font : '600 28px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
          const bLine = typeof b.lineHeight === 'number' && b.lineHeight > 0 ? b.lineHeight : 36
          const mb = measureWrappedText(ctx, bText, { maxWidth: bWidth, font: bFont, lineHeight: bLine })
          const bTop = by - 0.8 * bLine
          const bBottom = by + mb.height
          const margin = 6
          ctx.strokeRect(bx - margin, bTop - margin, mb.width + margin * 2, (bBottom - bTop) + margin * 2)
          const centerY = (bTop + bBottom) / 2
          const handleX = bx + mb.width + handleOffset - handleSize / 2
          const handleY = centerY - handleSize / 2
          ctx.setLineDash([])
          ctx.fillStyle = 'rgba(255,255,255,0.95)'
          ctx.strokeStyle = 'rgba(0,0,0,0.6)'
          ctx.fillRect(handleX, handleY, handleSize, handleSize)
          ctx.strokeRect(handleX, handleY, handleSize, handleSize)
        }
      } else if (hoverTarget?.startsWith('rt')) {
        const idx = parseInt(hoverTarget.split('-').pop() || '0', 10)
        const layout: Record<string, LayoutLine> = rtLayoutVal && typeof rtLayoutVal === 'object' ? rtLayoutVal : {}
        const line = rtLines[idx] as RTLine
        if (line) {
          const lay = layout[line.key] || {}
          const x = typeof lay.x === 'number' ? lay.x : 680
          const y = typeof lay.y === 'number' ? lay.y : 340
          const w = typeof lay.width === 'number' && lay.width > 0 ? lay.width : DEFAULT_TEXT_WIDTH
          const lineHeight = typeof lay.lineHeight === 'number' && lay.lineHeight > 0 ? lay.lineHeight : (line.kind === 'heading' ? 56 : 36)
          const font = fontFromLine(line, lay)
          const mb = measureWrappedText(ctx, line.text, { maxWidth: w, font, lineHeight })
          const top = y - 0.8 * lineHeight
          const bottom = y + mb.height
          const align = getAlign(lay.align || line.align)
          const anchorX = align === 'left' ? x : align === 'center' ? x + w / 2 : x + w
          const left = align === 'left' ? anchorX : align === 'center' ? anchorX - mb.width / 2 : anchorX - mb.width
          const margin = 6
          ctx.strokeRect(left - margin, top - margin, mb.width + margin * 2, (bottom - top) + margin * 2)
          const centerY = (top + bottom) / 2
          const handleX = left + mb.width + handleOffset - handleSize / 2
          const handleY = centerY - handleSize / 2
          ctx.setLineDash([])
          ctx.fillStyle = 'rgba(255,255,255,0.95)'
          ctx.strokeStyle = 'rgba(0,0,0,0.6)'
          ctx.fillRect(handleX, handleY, handleSize, handleSize)
          ctx.strokeRect(handleX, handleY, handleSize, handleSize)
        }
      }
    }
  }, [
    heading,
    headingWidth,
    headingX,
    headingY,
    hoverTarget,
    img,
    posX,
    posY,
    rtLayoutVal,
    rtLines,
    scale,
    subheading,
    subheadingWidth,
    subheadingX,
    subheadingY,
    textBlocks,
  ])

  // Pointer interactions
  const dragState = useRef<
    | { mode: 'image'; startX: number; startY: number; baseX: number; baseY: number }
    | { mode: 'heading'; startX: number; startY: number; baseX: number; baseY: number }
    | { mode: 'subheading'; startX: number; startY: number; baseX: number; baseY: number }
    | { mode: 'heading-resize'; startX: number; baseWidth: number }
    | { mode: 'subheading-resize'; startX: number; baseWidth: number }
    | { mode: 'block'; index: number; startX: number; startY: number; baseX: number; baseY: number }
    | { mode: 'block-resize'; index: number; startX: number; baseWidth: number }
    | { mode: 'rt'; index: number; startX: number; startY: number; baseX: number; baseY: number }
    | { mode: 'rt-resize'; index: number; startX: number; baseWidth: number }
    | null
  >(null)

  const hitTest = (e: React.PointerEvent<HTMLCanvasElement>): string | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const scaleX = CANVAS_W / rect.width
    const scaleY = CANVAS_H / rect.height
    const px = (e.clientX - rect.left) * scaleX
    const py = (e.clientY - rect.top) * scaleY

    const pad = 36
    const fallbackMax = CANVAS_W - pad * 2
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    // Heading
    if (heading) {
      const hb = measureWrappedText(ctx, heading, { maxWidth: headingWidth || fallbackMax, font: 'bold 48px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial', lineHeight: 56 })
      const hx = headingX || pad
      const hy = (headingY || (CANVAS_H - pad - 120))
      const hTop = hy - 0.8 * 56
      const hBottom = hy + hb.height
      const handleSize = 14
      const handleOffset = 8
      const centerY = (hTop + hBottom) / 2
      const handleX = hx + hb.width + handleOffset - handleSize / 2
      const handleY = centerY - handleSize / 2
      if (px >= handleX && px <= handleX + handleSize && py >= handleY && py <= handleY + handleSize) return 'heading-resize'
      if (px >= hx && px <= hx + hb.width && py >= hTop && py <= hBottom) return 'heading'
    }

    // Subheading
    if (subheading) {
      const sb = measureWrappedText(ctx, subheading, { maxWidth: subheadingWidth || fallbackMax, font: '600 28px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial', lineHeight: 36 })
      const sx = subheadingX || pad
      const sy = (subheadingY || (CANVAS_H - pad - 48))
      const sTop = sy - 0.8 * 36
      const sBottom = sy + sb.height
      const handleSize = 14
      const handleOffset = 8
      const centerY = (sTop + sBottom) / 2
      const handleX = sx + sb.width + handleOffset - handleSize / 2
      const handleY = centerY - handleSize / 2
      if (px >= handleX && px <= handleX + handleSize && py >= handleY && py <= handleY + handleSize) return 'subheading-resize'
      if (px >= sx && px <= sx + sb.width && py >= sTop && py <= sBottom) return 'subheading'
    }

    // Additional text blocks (iterate last to first for topmost last-added)
    if (textBlocks && textBlocks.length) {
      for (let i = textBlocks.length - 1; i >= 0; i--) {
        const b = textBlocks[i] || {}
        const bText = typeof b.text === 'string' && b.text !== undefined ? (b.text || 'New text') : 'New text'
        if (!bText) continue
        const bFont = typeof b.font === 'string' && b.font ? b.font : '600 28px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
        const bLine = typeof b.lineHeight === 'number' && b.lineHeight > 0 ? b.lineHeight : 36
        const bx = typeof b.x === 'number' ? b.x : pad
        const by = typeof b.y === 'number' ? b.y : (CANVAS_H - pad - 48)
        const bWidth = typeof b.width === 'number' && b.width > 0 ? b.width : (DEFAULT_TEXT_WIDTH)
        const mb = measureWrappedText(ctx, bText, { maxWidth: bWidth, font: bFont, lineHeight: bLine })
        const bTop = by - 0.8 * bLine
        const bBottom = by + mb.height
        const handleSize = 14
        const handleOffset = 8
        const centerY = (bTop + bBottom) / 2
        const handleX = bx + mb.width + handleOffset - handleSize / 2
        const handleY = centerY - handleSize / 2
        if (px >= handleX && px <= handleX + handleSize && py >= handleY && py <= handleY + handleSize) return `block-resize-${i}`
        if (px >= bx && px <= bx + mb.width && py >= bTop && py <= bBottom) return `block-${i}`
      }
    }

    // RT lines (document order so earlier paragraphs are treated as topmost)
    if (rtLines && rtLines.length) {
      const layout: Record<string, LayoutLine> = rtLayoutVal && typeof rtLayoutVal === 'object' ? rtLayoutVal : {}
      for (let i = 0; i < rtLines.length; i++) {
        const line = rtLines[i] as RTLine
        const lay = layout[line.key] || {}
        const x = typeof lay.x === 'number' ? lay.x : 680
        const y = typeof lay.y === 'number' ? lay.y : 340
        const w = typeof lay.width === 'number' && lay.width > 0 ? lay.width : DEFAULT_TEXT_WIDTH
        const lineHeight = typeof lay.lineHeight === 'number' && lay.lineHeight > 0 ? lay.lineHeight : (line.kind === 'heading' ? 56 : 36)
        const font = fontFromLine(line, lay)
        const mb = measureWrappedText(ctx, line.text, { maxWidth: w, font, lineHeight })
        const top = y - 0.8 * lineHeight
        const bottom = y + mb.height
        const align = getAlign(lay.align || line.align)
        const anchorX = align === 'left' ? x : align === 'center' ? x + w / 2 : x + w
        const left = align === 'left' ? anchorX : align === 'center' ? anchorX - mb.width / 2 : anchorX - mb.width
        const handleSize = 14
        const handleOffset = 8
        const centerY = (top + bottom) / 2
        const handleX = left + mb.width + handleOffset - handleSize / 2
        const handleY = centerY - handleSize / 2
        if (px >= handleX && px <= handleX + handleSize && py >= handleY && py <= handleY + handleSize) return `rt-resize-${i}`
        if (px >= left && px <= left + mb.width && py >= top && py <= bottom) return `rt-${i}`
      }
    }
    return null
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    const hit = hitTest(e)
    setHoverTarget(hit)
    if (hit === 'heading') {
      dragState.current = { mode: 'heading', startX: e.clientX, startY: e.clientY, baseX: headingX || 0, baseY: headingY || 0 }
      setSelectedRtIndex(null)
    } else if (hit === 'subheading') {
      dragState.current = { mode: 'subheading', startX: e.clientX, startY: e.clientY, baseX: subheadingX || 0, baseY: subheadingY || 0 }
      setSelectedRtIndex(null)
    } else if (hit === 'heading-resize') {
      dragState.current = { mode: 'heading-resize', startX: e.clientX, baseWidth: headingWidth || DEFAULT_TEXT_WIDTH }
      setSelectedRtIndex(null)
    } else if (hit === 'subheading-resize') {
      dragState.current = { mode: 'subheading-resize', startX: e.clientX, baseWidth: subheadingWidth || DEFAULT_TEXT_WIDTH }
      setSelectedRtIndex(null)
    } else if (hit?.startsWith('block-resize-')) {
      const idx = parseInt(hit.split('-').pop() || '0', 10)
      const curr = textBlocksRef.current[idx] || {}
      const baseWidth = typeof curr.width === 'number' ? curr.width : DEFAULT_TEXT_WIDTH
      dragState.current = { mode: 'block-resize', index: idx, startX: e.clientX, baseWidth }
      setSelectedRtIndex(null)
    } else if (hit?.startsWith('block-')) {
      const idx = parseInt(hit.split('-').pop() || '0', 10)
      const curr = textBlocksRef.current[idx] || {}
      const baseX = typeof curr.x === 'number' ? curr.x : 0
      const baseY = typeof curr.y === 'number' ? curr.y : 0
      dragState.current = { mode: 'block', index: idx, startX: e.clientX, startY: e.clientY, baseX, baseY }
      setSelectedRtIndex(null)
    } else if (hit?.startsWith('rt-resize-')) {
      const idx = parseInt(hit.split('-').pop() || '0', 10)
      const layout: Record<string, LayoutLine> = rtLayoutVal && typeof rtLayoutVal === 'object' ? { ...rtLayoutVal } : {}
      const line = rtLines[idx] as RTLine
      const lay = layout[line.key] || {}
      const baseWidth = typeof lay.width === 'number' ? lay.width : DEFAULT_TEXT_WIDTH
      dragState.current = { mode: 'rt-resize', index: idx, startX: e.clientX, baseWidth }
      setSelectedRtIndex(idx)
    } else if (hit?.startsWith('rt-')) {
      const idx = parseInt(hit.split('-').pop() || '0', 10)
      const layout: Record<string, LayoutLine> = rtLayoutVal && typeof rtLayoutVal === 'object' ? rtLayoutVal : {}
      const line = rtLines[idx] as RTLine
      const lay = layout[line.key] || {}
      const baseX = typeof lay.x === 'number' ? lay.x : 0
      const baseY = typeof lay.y === 'number' ? lay.y : 0
      dragState.current = { mode: 'rt', index: idx, startX: e.clientX, startY: e.clientY, baseX, baseY }
      setSelectedRtIndex(idx)
    } else {
      dragState.current = { mode: 'image', startX: e.clientX, startY: e.clientY, baseX: posX || 0, baseY: posY || 0 }
      setSelectedRtIndex(null)
    }
  }
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Update hover when not dragging
    if (!dragState.current) {
      const hit = hitTest(e)
      setHoverTarget(prev => (prev === hit ? prev : hit))
      return
    }
    const dx = e.clientX - dragState.current.startX
    const dy = 'startY' in dragState.current ? (e.clientY - dragState.current.startY) : 0
    if (dragState.current.mode === 'image') {
      setPosX(dragState.current.baseX + dx)
      setPosY(dragState.current.baseY + dy)
    } else if (dragState.current.mode === 'heading') {
      setHeadingX(dragState.current.baseX + dx)
      setHeadingY(dragState.current.baseY + dy)
    } else if (dragState.current.mode === 'subheading') {
      setSubheadingX(dragState.current.baseX + dx)
      setSubheadingY(dragState.current.baseY + dy)
    } else if (dragState.current.mode === 'heading-resize') {
      const minW = 100
      const maxW = DEFAULT_TEXT_WIDTH
      setHeadingWidth(clamp(dragState.current.baseWidth + dx, minW, maxW))
    } else if (dragState.current.mode === 'subheading-resize') {
      const minW = 100
      const maxW = DEFAULT_TEXT_WIDTH
      setSubheadingWidth(clamp(dragState.current.baseWidth + dx, minW, maxW))
    } else if (dragState.current.mode === 'block') {
      const i = dragState.current.index
      const baseX = dragState.current.baseX
      const baseY = dragState.current.baseY
      const newX = baseX + dx
      const newY = baseY + dy
      const seg = textBlockKeysRef.current[i] ?? String(i)
      dispatchFields({ type: 'UPDATE', path: `textBlocks.${seg}.x`, value: newX })
      dispatchFields({ type: 'UPDATE', path: `textBlocks.${seg}.y`, value: newY })
    } else if (dragState.current.mode === 'block-resize') {
      const i = dragState.current.index
      const minW = 100
      const maxW = DEFAULT_TEXT_WIDTH
      const newW = clamp(dragState.current.baseWidth + dx, minW, maxW)
      const seg = textBlockKeysRef.current[i] ?? String(i)
      dispatchFields({ type: 'UPDATE', path: `textBlocks.${seg}.width`, value: newW })
    } else if (dragState.current.mode === 'rt') {
      const i = dragState.current.index
      const layout: Record<string, LayoutLine> = rtLayoutVal && typeof rtLayoutVal === 'object' ? { ...rtLayoutVal } : {}
      const newX = dragState.current.baseX + dx
      const newY = dragState.current.baseY + dy
      const line = rtLines[i] as RTLine
      const prev = layout[line.key] || {}
      layout[line.key] = { ...prev, key: line.key, x: newX, y: newY, width: prev.width ?? 480 }
      setRtLayout(layout)
    } else if (dragState.current.mode === 'rt-resize') {
      const i = dragState.current.index
      const layout: Record<string, LayoutLine> = rtLayoutVal && typeof rtLayoutVal === 'object' ? { ...rtLayoutVal } : {}
      const minW = 100
      const maxW = DEFAULT_TEXT_WIDTH
      const newW = clamp(dragState.current.baseWidth + dx, minW, maxW)
      const line = rtLines[i] as RTLine
      const prev = layout[line.key] || { x: 680, y: 340 }
      layout[line.key] = { ...prev, key: line.key, width: newW }
      setRtLayout(layout)
    }
  }
  const onPointerUp = (_e: React.PointerEvent<HTMLCanvasElement>) => {
    dragState.current = null
  }

  const onPointerLeave = () => {
    setHoverTarget(null)
  }

  // Wheel to zoom (around center)
  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (!img) return
    e.preventDefault()
    const minScale = Math.max(CANVAS_W / img.width, CANVAS_H / img.height)
    const next = clamp((scale || minScale) * (1 + -e.deltaY * 0.001), minScale, 10)
    setScale(next)
  }

  const fitToCover = useCallback(() => {
    if (!img) return
    const minScale = Math.max(CANVAS_W / img.width, CANVAS_H / img.height)
    setScale(minScale)
    setPosX(0)
    setPosY(0)
  }, [img, setPosX, setPosY, setScale])

  const downloadPNG = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const triggerDownload = (href: string) => {
      const a = document.createElement('a')
      a.href = href
      a.download = 'media-canvas.png'
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      // Cleanup
      if (href.startsWith('blob:')) {
        // Allow the navigation stack/download to settle before revoking
        setTimeout(() => {
          URL.revokeObjectURL(href)
          a.remove()
        }, 0)
      } else {
        a.remove()
      }
    }

    if (canvas.toBlob) {
      canvas.toBlob((blob: Blob | null) => {
        if (!blob) {
          // Fallback to data URL if toBlob not supported/failed
          const dataUrl = canvas.toDataURL('image/png')
          triggerDownload(dataUrl)
          return
        }
        const url = URL.createObjectURL(blob)
        triggerDownload(url)
      }, 'image/png')
    } else {
      const dataUrl = canvas.toDataURL('image/png')
      triggerDownload(dataUrl)
    }
  }

  const uploadToMedia = async () => {
    const canvas = canvasRef.current
    if (!canvas || saving) return
    setSaving(true)
    setSaveMsg(null)

    const doUpload = async (blob: Blob) => {
      try {
        const sanitize = (s: string) => (s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'media-canvas'
        const filename = `${sanitize(title || heading || 'media-canvas')}.png`
        const file = new File([blob], filename, { type: 'image/png' })

        const fd = new FormData()
        fd.append('file', file)
        const altText = title || heading || 'Media Canvas'
        // Build a minimal Lexical JSON for caption
        const captionText = `${title || heading || ''}${(title || heading) && subheading ? ' — ' : ''}${subheading || ''}`.trim() || altText
        const captionLexical = {
          root: {
            type: 'root',
            format: '',
            indent: 0,
            version: 1,
            children: [
              {
                type: 'paragraph',
                version: 1,
                format: '',
                indent: 0,
                direction: 'ltr',
                children: [
                  {
                    type: 'text',
                    version: 1,
                    text: captionText,
                    format: 0,
                    mode: 'normal',
                    detail: 0,
                  },
                ],
              },
            ],
          },
        }
        // Some adapters expect additional fields inside a `data` JSON string
        const dataPayload: Record<string, unknown> = { alt: altText, caption: captionLexical }
        // Pass current tenant for multi-tenant scoping
        try {
          const tenantVal = getTenantValue(tenantField) || (typeof tenantField === 'string' ? tenantField : undefined)
          if (tenantVal) {
            dataPayload.tenant = String(tenantVal)
          }
        } catch {}
        fd.append('data', JSON.stringify(dataPayload))
        // Bracket notation fallbacks for older/newer parsers
        try {
          fd.append('data[alt]', altText)
          fd.append('data[caption]', JSON.stringify(captionLexical))
          if (dataPayload.tenant) {
            fd.append('data[tenant]', String(dataPayload.tenant))
          }
        } catch {}
        // Also append flat field for compatibility with certain REST parsers
        fd.append('alt', altText)
        // Pass current tenant for multi-tenant scoping
        try {
          const tenantVal = getTenantValue(tenantField) || (typeof tenantField === 'string' ? tenantField : undefined)
          if (tenantVal) fd.append('tenant', String(tenantVal))
        } catch {}

        const headers: Record<string, string> = {}
        try {
          const tenantVal = getTenantValue(tenantField) || (typeof tenantField === 'string' ? tenantField : undefined)
          if (tenantVal) headers['X-Payload-Tenant'] = String(tenantVal)
        } catch {}

        const res = await fetch('/api/media-canvas/upload', {
          method: 'POST',
          body: fd,
          credentials: 'include',
          headers,
        })
        if (!res.ok) {
          let detail = ''
          try {
            const t = await res.text()
            detail = t
          } catch {}
          throw new Error(`Upload failed (${res.status})${detail ? `: ${detail}` : ''}`)
        }
        await res.json()
        // Do not auto-link to this Media Canvas entry; just inform the user
        setSaveMsg('Saved to Media')
      } catch (e: unknown) {
        const message = asRecord(e).message
        setSaveMsg(typeof message === 'string' ? message : 'Failed to save to Media')
      } finally {
        setSaving(false)
      }
    }

    if (canvas.toBlob) {
      canvas.toBlob((blob: Blob | null) => {
        if (!blob) {
          try {
            const dataUrl = canvas.toDataURL('image/png')
            const bin = atob(dataUrl.split(',')[1] || '')
            const arr = new Uint8Array(bin.length)
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
            doUpload(new Blob([arr], { type: 'image/png' }))
          } catch {
            setSaving(false)
            setSaveMsg('Failed to generate image data')
          }
          return
        }
        doUpload(blob)
      }, 'image/png')
    } else {
      try {
        const dataUrl = canvas.toDataURL('image/png')
        const bin = atob(dataUrl.split(',')[1] || '')
        const arr = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
        doUpload(new Blob([arr], { type: 'image/png' }))
      } catch {
        setSaving(false)
        setSaveMsg('Failed to generate image data')
      }
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
        <Button size="small" buttonStyle="secondary" onClick={fitToCover}>
          Fit to cover
        </Button>
        <Button size="small" buttonStyle="secondary" onClick={() => { setPosX(0); setPosY(0) }}>
          Center
        </Button>
        <Button size="small" buttonStyle="secondary" onClick={() => setScale((scale || 1) * 0.9)}>
          - Zoom
        </Button>
        <Button size="small" buttonStyle="secondary" onClick={() => setScale((scale || 1) * 1.1)}>
          + Zoom
        </Button>
        <div style={{ marginLeft: 'auto', color: 'var(--theme-elevation-600)', fontSize: 12 }}>
          {img ? `Scale: ${(scale || 1).toFixed(2)} — X: ${Math.round(posX || 0)} Y: ${Math.round(posY || 0)}` : 'Select an image to begin'}
        </div>
        <Button size="small" buttonStyle="primary" onClick={downloadPNG} disabled={!img}>
          Download PNG (1200×630)
        </Button>
        <Button size="small" buttonStyle="primary" onClick={uploadToMedia} disabled={!img || saving}>
          {saving ? 'Saving…' : 'Save to Media'}
        </Button>
      </div>

      {/* Lexical line style controls (appear when a Lexical line is selected) */}
      {selectedRtIndex !== null && rtLines[selectedRtIndex] ? (
        (() => {
          const i = selectedRtIndex as number
          const layout: Record<string, LayoutLine> = rtLayoutVal && typeof rtLayoutVal === 'object' ? rtLayoutVal : {}
          const line = rtLines[i] as RTLine
          const lay = layout[line.key] || {}
          const currentColor = typeof lay.color === 'string' && lay.color ? lay.color : (line.color || '#f1f5f9')
          const currentAlign = getAlign(lay.align || line.align)
          return (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
              <small style={{ opacity: 0.8 }}>Selected line:</small>
              <small style={{ maxWidth: 360, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{line.text}</small>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.8 }}>Color</span>
                <input
                  type="color"
                  value={/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(currentColor) ? currentColor : '#f1f5f9'}
                  onChange={(ev) => {
                    const color = ev.target.value
                    const next: Record<string, LayoutLine> = { ...layout }
                    const prev = next[line.key] || {}
                    next[line.key] = { ...prev, key: line.key, color }
                    setRtLayout(next)
                  }}
                  style={{ width: 28, height: 28, padding: 0, border: '1px solid var(--theme-elevation-150)', borderRadius: 4 }}
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.8 }}>Align</span>
                <select
                  value={currentAlign}
                  onChange={(ev) => {
                    const align = ev.target.value as 'left' | 'center' | 'right'
                    const next: Record<string, LayoutLine> = { ...layout }
                    const prev = next[line.key] || {}
                    next[line.key] = { ...prev, key: line.key, align }
                    setRtLayout(next)
                  }}
                  style={{ height: 28, border: '1px solid var(--theme-elevation-150)', borderRadius: 4, background: 'var(--theme-elevation-50)' }}
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </label>
            </div>
          )
        })()
      ) : null}

      <div style={{ border: '1px solid var(--theme-elevation-100)', borderRadius: 8, overflow: 'hidden', width: '100%', maxWidth: 900 }}>
        <div style={{ background: '#0b0b0b', display: 'flex', justifyContent: 'center' }}>
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            style={{ width: '100%', height: 'auto', cursor: img ? (hoverTarget ? ((hoverTarget.includes('resize')) ? 'ew-resize' : 'move') : 'grab') : 'default' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerLeave}
            onWheel={onWheel}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ marginTop: 8 }}><small>Loading image…</small></div>
      ) : null}
      {error ? (
        <div style={{ marginTop: 8, color: 'var(--theme-error-500)' }}><small>{error}</small></div>
      ) : null}
      {saveMsg ? (
        <div style={{ marginTop: 8, color: 'var(--theme-success-500)' }}><small>{saveMsg}</small></div>
      ) : null}
    </div>
  )
}

export { MediaCanvasField }
