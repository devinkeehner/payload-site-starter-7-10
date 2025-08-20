'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, useField, useFormFields, useForm } from '@payloadcms/ui'

// Fixed OG dimensions
const CANVAS_W = 1200
const CANVAS_H = 630
const DEFAULT_TEXT_WIDTH = CANVAS_W - 36 * 2

// Utility to derive an absolute media URL from a media field value
const deriveMediaURL = async (val: any): Promise<string | null> => {
  try {
    if (!val) return null
    // If object-like doc with url
    if (typeof val === 'object' && val !== null) {
      const url = (val as any)?.url || (val as any)?.image?.url
      if (typeof url === 'string' && url) return url
      const filename = (val as any)?.filename || (val as any)?.image?.filename
      if (filename) {
        // Attempt to use public base (server populates url on afterRead in Media)
        const base = '' // server already sets doc.url; fallback only if necessary
        if (base) return `${base}/${filename}`
      }
      // Try nested value/id
      const id = (val as any)?.id || (val as any)?.value
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

const MediaCanvasField: React.FC = () => {
  // Read sibling fields from the form
  const imageField = useFormFields(([fields]) => (fields as any)?.image?.value ?? (fields as any)?.image?.initialValue)
  const heading = useFormFields(([fields]) => (fields as any)?.heading?.value ?? (fields as any)?.heading?.initialValue ?? '') as string
  const subheading = useFormFields(([fields]) => (fields as any)?.subheading?.value ?? (fields as any)?.subheading?.initialValue ?? '') as string
  const title = useFormFields(([fields]) => (fields as any)?.title?.value ?? (fields as any)?.title?.initialValue ?? '') as string
  const tenantField = useFormFields(([fields]) => (fields as any)?.tenant?.value ?? (fields as any)?.tenant?.initialValue)

  // Setter for relationship field to media
  const { setValue: setImageRelation } = useField<any>({ path: 'image' })

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

  // Dynamic additional text blocks array (robust live reconstruction from form field store)
  const fieldsState = useFormFields(([fields]) => fields) as any
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
    const result: any[] = []
    const segs = Array.from(segSet).sort((a, b) => {
      const ai = Number.isFinite(Number(a)) ? Number(a) : Number.POSITIVE_INFINITY
      const bi = Number.isFinite(Number(b)) ? Number(b) : Number.POSITIVE_INFINITY
      if (ai !== bi) return ai - bi
      return a.localeCompare(b)
    })
    const getVal = (path: string, def: any) => {
      const node = (fieldsState as any)[path]
      const v = node?.value ?? node?.initialValue
      return v !== undefined ? v : def
    }
    const pad = 36
    for (const seg of segs) {
      const blk: any = {}
      blk.text = getVal(`textBlocks.${seg}.text`, 'New text') || 'New text'
      blk.x = getVal(`textBlocks.${seg}.x`, pad)
      blk.y = getVal(`textBlocks.${seg}.y`, 630 - pad - 48)
      blk.width = getVal(`textBlocks.${seg}.width`, DEFAULT_TEXT_WIDTH)
      blk.font = getVal(`textBlocks.${seg}.font`, '600 28px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial')
      blk.color = getVal(`textBlocks.${seg}.color`, '#f1f5f9')
      blk.lineHeight = getVal(`textBlocks.${seg}.lineHeight`, 36)
      result.push(blk)
    }
    return { blocks: result, keys: segs }
  }, [fieldsState])
  const textBlocksRef = useRef<any[]>(textBlocks)
  const textBlockKeysRef = useRef<string[]>(textBlockKeys)
  useEffect(() => {
    textBlocksRef.current = textBlocks
    textBlockKeysRef.current = textBlockKeys
  }, [JSON.stringify(textBlocks), JSON.stringify(textBlockKeys)])

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
          if (!(scale > 0)) setScale(minScale)
        }
        im.onerror = () => {
          if (!ignore) {
            setImg(null)
            setError('Failed to load image')
            setLoading(false)
          }
        }
        im.src = buildProxiedURL(url)
      } catch (e: any) {
        if (!ignore) {
          setImg(null)
          setError(e?.message || 'Failed to resolve media URL')
          setLoading(false)
        }
      }
    }
    run()
    return () => {
      ignore = true
    }
  }, [JSON.stringify(imageField)])

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
      } else if (hoverTarget?.startsWith('block') && textBlocks && textBlocks.length) {
        const isResize = hoverTarget.startsWith('block-resize-')
        const idxStr = hoverTarget.split('-').pop() || '0'
        const i = parseInt(idxStr, 10)
        const b = textBlocks[i] || {}
        const bText = typeof b.text === 'string' && b.text !== undefined ? (b.text || 'New text') : 'New text'
        const bx = typeof b.x === 'number' ? b.x : pad
        const by = typeof b.y === 'number' ? b.y : (CANVAS_H - pad - 48)
        const bWidth = typeof b.width === 'number' && b.width > 0 ? b.width : (DEFAULT_TEXT_WIDTH)
        const bFont = typeof b.font === 'string' && b.font ? b.font : '600 28px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
        const bLine = typeof b.lineHeight === 'number' && b.lineHeight > 0 ? b.lineHeight : 36
        if (bText) {
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
      }
      ctx.restore()
    }
  }, [img, posX, posY, scale, heading, subheading, headingX, headingY, subheadingX, subheadingY, headingWidth, subheadingWidth, JSON.stringify(textBlocks), hoverTarget])

  // Pointer interactions
  const dragState = useRef<
    | { mode: 'image'; startX: number; startY: number; baseX: number; baseY: number }
    | { mode: 'heading'; startX: number; startY: number; baseX: number; baseY: number }
    | { mode: 'subheading'; startX: number; startY: number; baseX: number; baseY: number }
    | { mode: 'heading-resize'; startX: number; baseWidth: number }
    | { mode: 'subheading-resize'; startX: number; baseWidth: number }
    | { mode: 'block'; index: number; startX: number; startY: number; baseX: number; baseY: number }
    | { mode: 'block-resize'; index: number; startX: number; baseWidth: number }
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

    // Heading bounds
    if (heading) {
      const hb = measureWrappedText(ctx, heading, {
        maxWidth: headingWidth || fallbackMax,
        font: 'bold 48px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
        lineHeight: 56,
      })
      const hx = headingX || pad
      const hy = (headingY || (CANVAS_H - pad - 120))
      const hTop = hy - 0.8 * 56
      const hBottom = hy + hb.height
      // Resize handle hit (right-center)
      const handleSize = 14
      const handleOffset = 8
      const centerY = (hTop + hBottom) / 2
      const handleX = hx + hb.width + handleOffset - handleSize / 2
      const handleY = centerY - handleSize / 2
      if (px >= handleX && px <= handleX + handleSize && py >= handleY && py <= handleY + handleSize) return 'heading-resize'
      // Body hit
      if (px >= hx && px <= hx + hb.width && py >= hTop && py <= hBottom) return 'heading'
    }
    // Subheading bounds
    if (subheading) {
      const sb = measureWrappedText(ctx, subheading, {
        maxWidth: subheadingWidth || fallbackMax,
        font: '600 28px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
        lineHeight: 36,
      })
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

    // Blocks bounds (iterate from last to first so later blocks get priority)
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
    return null
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    const hit = hitTest(e)
    setHoverTarget(hit)
    if (hit === 'heading') {
      dragState.current = { mode: 'heading', startX: e.clientX, startY: e.clientY, baseX: headingX || 0, baseY: headingY || 0 }
    } else if (hit === 'subheading') {
      dragState.current = { mode: 'subheading', startX: e.clientX, startY: e.clientY, baseX: subheadingX || 0, baseY: subheadingY || 0 }
    } else if (hit === 'heading-resize') {
      dragState.current = { mode: 'heading-resize', startX: e.clientX, baseWidth: headingWidth || DEFAULT_TEXT_WIDTH }
    } else if (hit === 'subheading-resize') {
      dragState.current = { mode: 'subheading-resize', startX: e.clientX, baseWidth: subheadingWidth || DEFAULT_TEXT_WIDTH }
    } else if (hit?.startsWith('block-resize-')) {
      const idx = parseInt(hit.split('-').pop() || '0', 10)
      const curr = textBlocksRef.current[idx] || {}
      const baseWidth = typeof curr.width === 'number' ? curr.width : DEFAULT_TEXT_WIDTH
      dragState.current = { mode: 'block-resize', index: idx, startX: e.clientX, baseWidth }
    } else if (hit?.startsWith('block-')) {
      const idx = parseInt(hit.split('-').pop() || '0', 10)
      const curr = textBlocksRef.current[idx] || {}
      const baseX = typeof curr.x === 'number' ? curr.x : 0
      const baseY = typeof curr.y === 'number' ? curr.y : 0
      dragState.current = { mode: 'block', index: idx, startX: e.clientX, startY: e.clientY, baseX, baseY }
    } else {
      dragState.current = { mode: 'image', startX: e.clientX, startY: e.clientY, baseX: posX || 0, baseY: posY || 0 }
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
    }
  }
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
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
  }, [img])

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
          const tenantVal = typeof tenantField === 'object' && tenantField !== null
            ? ((tenantField as any).id || (tenantField as any).value || (tenantField as any))
            : tenantField
          if (tenantVal) {
            dataPayload.tenant = String(tenantVal)
          }
        } catch {}
        fd.append('data', JSON.stringify(dataPayload))
        // Bracket notation fallbacks for older/newer parsers
        try {
          fd.append('data[alt]', altText)
          fd.append('data[caption]', JSON.stringify(captionLexical))
          if ((dataPayload as any).tenant) {
            fd.append('data[tenant]', String((dataPayload as any).tenant))
          }
        } catch {}
        // Also append flat field for compatibility with certain REST parsers
        fd.append('alt', altText)
        // Pass current tenant for multi-tenant scoping
        try {
          const tenantVal = typeof tenantField === 'object' && tenantField !== null
            ? ((tenantField as any).id || (tenantField as any).value || (tenantField as any))
            : tenantField
          if (tenantVal) fd.append('tenant', String(tenantVal))
        } catch {}

        const headers: Record<string, string> = {}
        try {
          const tenantVal = typeof tenantField === 'object' && tenantField !== null
            ? ((tenantField as any).id || (tenantField as any).value || (tenantField as any))
            : tenantField
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
        const doc = await res.json()
        // Do not auto-link to this Media Canvas entry; just inform the user
        setSaveMsg('Saved to Media')
      } catch (e: any) {
        setSaveMsg(e?.message || 'Failed to save to Media')
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
