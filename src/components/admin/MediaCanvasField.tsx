'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, useField, useForm, useFormFields } from '@payloadcms/ui'

const CANVAS_W = 1200
const CANVAS_H = 630
const SAFE_MARGIN = 36
const DEFAULT_TEXT_WIDTH = 480
const TEXT_PLACEHOLDER = 'Text here'
const MIN_TEXT_WIDTH = 120
const HANDLE_SIZE = 14
const HANDLE_OFFSET = 8

type UnknownRecord = Record<string, unknown>
type FormFieldState = { value?: unknown; initialValue?: unknown }
type FormFieldsState = Record<string, FormFieldState | undefined>
type TextAlign = 'left' | 'center' | 'right'
type TextSource = 'manual' | 'postTitle'
type StylePresetId = 'headline-lg' | 'headline-md' | 'kicker' | 'byline' | 'badge'

type TextBlock = {
  id?: string
  label?: string
  source?: TextSource
  text?: string
  x?: number
  y?: number
  width?: number
  font?: string
  color?: string
  lineHeight?: number
  align?: TextAlign
  stylePreset?: StylePresetId
  locked?: boolean
}

type EditorState = {
  selectedId?: string | null
}

type DragState =
  | { mode: 'image'; startX: number; startY: number; baseX: number; baseY: number }
  | { mode: 'image-resize'; startX: number; startScale: number }
  | { mode: 'block'; id: string; startX: number; startY: number; baseX: number; baseY: number }
  | { mode: 'block-resize'; id: string; startX: number; baseWidth: number }
  | null

type RenderedBlock = TextBlock & {
  id: string
  label: string
  source: TextSource
  text: string
  displayText: string
  x: number
  y: number
  width: number
  font: string
  color: string
  lineHeight: number
  align: TextAlign
  stylePreset: StylePresetId
  locked: boolean
}

type BlockMetrics = {
  left: number
  top: number
  width: number
  height: number
}

type StylePreset = {
  font: string
  lineHeight: number
  color: string
  align: TextAlign
}

const STYLE_PRESETS: Record<StylePresetId, StylePreset> = {
  'headline-lg': {
    font: '700 54px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
    lineHeight: 66,
    color: '#111111',
    align: 'center',
  },
  'headline-md': {
    font: '700 40px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
    lineHeight: 50,
    color: '#111111',
    align: 'center',
  },
  kicker: {
    font: '700 22px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
    lineHeight: 30,
    color: '#111111',
    align: 'left',
  },
  byline: {
    font: '600 24px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
    lineHeight: 38,
    color: '#111111',
    align: 'left',
  },
  badge: {
    font: '700 18px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
    lineHeight: 26,
    color: '#111111',
    align: 'center',
  },
}

const asRecord = (value: unknown): UnknownRecord =>
  typeof value === 'object' && value !== null ? (value as UnknownRecord) : {}

const asFormFields = (fields: unknown): FormFieldsState =>
  (typeof fields === 'object' && fields !== null ? (fields as FormFieldsState) : {})

const readFieldValue = (fields: unknown, name: string): unknown => {
  const map = asFormFields(fields)
  return map[name]?.value ?? map[name]?.initialValue
}

const getAlign = (value: unknown): TextAlign =>
  value === 'center' || value === 'right' ? value : 'left'

const getTenantValue = (value: unknown): string | undefined => {
  if (!value) return undefined
  if (typeof value === 'string') return value
  const rec = asRecord(value)
  if (typeof rec.id === 'string') return rec.id
  if (typeof rec.value === 'string') return rec.value
  const nested = asRecord(rec.value)
  if (typeof nested.id === 'string') return nested.id
  return undefined
}

const getPostTitleFromValue = (value: unknown): string | undefined => {
  if (!value) return undefined
  if (typeof value === 'object' && value !== null) {
    const rec = asRecord(value)
    if (typeof rec.title === 'string' && rec.title.trim()) return rec.title.trim()
    if (typeof rec.label === 'string' && rec.label.trim()) return rec.label.trim()
    const nested = asRecord(rec.value)
    if (typeof nested.title === 'string' && nested.title.trim()) return nested.title.trim()
  }
  return undefined
}

const getRelationshipId = (value: unknown): string | undefined => {
  if (!value) return undefined
  if (typeof value === 'string') return value
  const rec = asRecord(value)
  if (typeof rec.id === 'string') return rec.id
  if (typeof rec.value === 'string') return rec.value
  const nested = asRecord(rec.value)
  if (typeof nested.id === 'string') return nested.id
  return undefined
}

const parseFontSize = (font: string, fallback: number): number => {
  const match = /(\d+)px/.exec(font)
  return match?.[1] ? Number(match[1]) : fallback
}

const makeId = () => {
  const c = globalThis.crypto
  return c && typeof c.randomUUID === 'function'
    ? c.randomUUID()
    : `text_${Math.random().toString(36).slice(2, 10)}`
}

const useNumberField = (path: string, def = 0) => {
  const { value, setValue } = useField<number>({ path })
  const v = typeof value === 'number' && !Number.isNaN(value) ? value : def
  return { value: v, setValue }
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

const deriveMediaURL = async (val: unknown): Promise<string | null> => {
  try {
    if (!val) return null
    if (typeof val === 'object' && val !== null) {
      const valRecord = asRecord(val)
      const imageRecord = asRecord(valRecord.image)
      const url =
        (typeof valRecord.url === 'string' ? valRecord.url : undefined) ||
        (typeof imageRecord.url === 'string' ? imageRecord.url : undefined)
      if (typeof url === 'string' && url) return url
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

const buildProxiedURL = (raw: string): string => {
  try {
    const target = new URL(raw, window.location.origin)
    if (target.origin === window.location.origin) return target.toString()
    return `/api/media-proxy?url=${encodeURIComponent(target.toString())}`
  } catch {
    return raw
  }
}

const drawTextAligned = (
  ctx: CanvasRenderingContext2D,
  text: string,
  opts: { x: number; y: number; maxWidth: number; font: string; color: string; lineHeight: number; align: TextAlign },
) => {
  const { x, y, maxWidth, font, color, lineHeight, align } = opts
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
    const test = line ? `${line} ${w}` : w
    const width = ctx.measureText(test).width
    if (width > maxWidth && line) {
      lines.push(line)
      line = w
      yy += lineHeight
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  yy = y
  for (const value of lines) {
    ctx.fillText(value, x, yy)
    yy += lineHeight
  }
  ctx.restore()
}

const measureWrappedText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  opts: { maxWidth: number; font: string; lineHeight: number },
): { width: number; height: number } => {
  const { maxWidth, font, lineHeight } = opts
  if (!text) return { width: 0, height: 0 }
  ctx.save()
  ctx.font = font
  const words = text.split(/\s+/)
  let line = ''
  let maxLineWidth = 0
  let lineCount = 0
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    const width = ctx.measureText(test).width
    if (width > maxWidth && line) {
      maxLineWidth = Math.max(maxLineWidth, ctx.measureText(line).width)
      line = w
      lineCount += 1
    } else {
      line = test
    }
  }
  if (line) {
    maxLineWidth = Math.max(maxLineWidth, ctx.measureText(line).width)
    lineCount += 1
  }
  ctx.restore()
  return { width: Math.min(maxLineWidth, maxWidth), height: Math.max(lineCount, 1) * lineHeight }
}

const MediaCanvasField: React.FC = () => {
  const imageField = useFormFields(([fields]) => readFieldValue(fields, 'image'))
  const sourcePost = useFormFields(([fields]) => readFieldValue(fields, 'sourcePost'))
  const title = useFormFields(([fields]) => (readFieldValue(fields, 'title') as string | undefined) ?? '')
  const tenantField = useFormFields(([fields]) => readFieldValue(fields, 'tenant'))
  const fieldsState = useFormFields(([fields]) => asFormFields(fields))
  const { dispatchFields } = useForm()
  const { value: editorStateVal, setValue: setEditorState } = useField<EditorState>({ path: 'editorState' })
  const { value: posX, setValue: setPosX } = useNumberField('posX', 0)
  const { value: posY, setValue: setPosY } = useNumberField('posY', 0)
  const { value: scale, setValue: setScale } = useNumberField('scale', 1)

  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [sourcePostTitle, setSourcePostTitle] = useState('')
  const [hoverId, setHoverId] = useState<string | null>(null)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const dragState = useRef<DragState>(null)
  const selectedId = editorStateVal?.selectedId || null

  const rawTextBlocks = useMemo(() => {
    const direct = fieldsState?.textBlocks?.value ?? fieldsState?.textBlocks?.initialValue
    if (Array.isArray(direct)) return direct as TextBlock[]
    return []
  }, [fieldsState])

  const renderedBlocks = useMemo<RenderedBlock[]>(() => {
    return rawTextBlocks.map((block, index) => {
      const stylePreset = block.stylePreset && STYLE_PRESETS[block.stylePreset] ? block.stylePreset : 'byline'
      const preset = STYLE_PRESETS[stylePreset]
      const source = block.source === 'postTitle' ? 'postTitle' : 'manual'
      const fallbackText = block.text?.trim() || TEXT_PLACEHOLDER
      const displayText = source === 'postTitle' ? sourcePostTitle.trim() || fallbackText : fallbackText
      return {
        ...block,
        id: block.id || `block-${index}`,
        label: block.label?.trim() || (source === 'postTitle' ? 'Main Headline' : `Text Box ${index + 1}`),
        source,
        text: block.text || TEXT_PLACEHOLDER,
        displayText,
        x: typeof block.x === 'number' ? block.x : SAFE_MARGIN,
        y: typeof block.y === 'number' ? block.y : 320,
        width: typeof block.width === 'number' && block.width > 0 ? block.width : DEFAULT_TEXT_WIDTH,
        font: typeof block.font === 'string' && block.font ? block.font : preset.font,
        color: typeof block.color === 'string' && block.color ? block.color : preset.color,
        lineHeight: typeof block.lineHeight === 'number' && block.lineHeight > 0 ? block.lineHeight : preset.lineHeight,
        align: getAlign(block.align || preset.align),
        stylePreset,
        locked: Boolean(block.locked),
      }
    })
  }, [rawTextBlocks, sourcePostTitle])

  const selectedBlock = useMemo(
    () => renderedBlocks.find((block) => block.id === selectedId) || null,
    [renderedBlocks, selectedId],
  )

  const updateEditorState = useCallback(
    (patch: Partial<EditorState>) => {
      const current = editorStateVal && typeof editorStateVal === 'object' ? editorStateVal : {}
      setEditorState({ ...current, ...patch })
    },
    [editorStateVal, setEditorState],
  )

  const setSelectedElement = useCallback(
    (id: string | null) => {
      updateEditorState({ selectedId: id })
    },
    [updateEditorState],
  )

  const setTextBlocks = useCallback(
    (next: TextBlock[]) => {
      dispatchFields({ type: 'UPDATE', path: 'textBlocks', value: next })
    },
    [dispatchFields],
  )

  const updateTextBlock = useCallback(
    (id: string, patch: Partial<TextBlock>) => {
      setTextBlocks(
        renderedBlocks.map((block) =>
          block.id === id ? { ...block, ...patch } : block,
        ),
      )
    },
    [renderedBlocks, setTextBlocks],
  )

  const addTextBlock = useCallback(() => {
    const id = makeId()
    setTextBlocks([
      ...renderedBlocks,
      {
        id,
        label: `Text Box ${renderedBlocks.filter((block) => block.source === 'manual').length + 1}`,
        source: 'manual',
        text: TEXT_PLACEHOLDER,
        x: SAFE_MARGIN,
        y: 320,
        width: 420,
        stylePreset: 'byline',
        font: STYLE_PRESETS.byline.font,
        color: '#111111',
        lineHeight: STYLE_PRESETS.byline.lineHeight,
        align: 'left',
        locked: false,
      },
    ])
    setSelectedElement(id)
  }, [renderedBlocks, setSelectedElement, setTextBlocks])

  const removeSelectedBlock = useCallback(() => {
    if (!selectedBlock || selectedBlock.source === 'postTitle') return
    setTextBlocks(renderedBlocks.filter((block) => block.id !== selectedBlock.id))
    setSelectedElement(null)
  }, [renderedBlocks, selectedBlock, setSelectedElement, setTextBlocks])

  const getBlockMetrics = useCallback(
    (ctx: CanvasRenderingContext2D, block: RenderedBlock): BlockMetrics => {
      const measured = measureWrappedText(ctx, block.displayText, {
        maxWidth: block.width,
        font: block.font,
        lineHeight: block.lineHeight,
      })
      const isPlaceholder = block.displayText.trim() === TEXT_PLACEHOLDER
      const width = isPlaceholder ? block.width : Math.max(measured.width, 120)
      const height = isPlaceholder ? block.lineHeight * 2 : Math.max(measured.height, block.lineHeight)
      const anchorX = block.align === 'left' ? block.x : block.align === 'center' ? block.x + block.width / 2 : block.x + block.width
      const left = isPlaceholder
        ? block.x
        : block.align === 'left'
        ? anchorX
        : block.align === 'center'
        ? anchorX - width / 2
        : anchorX - width
      const top = isPlaceholder ? block.y - block.lineHeight : block.y - 0.8 * block.lineHeight
      return { left, top, width, height }
    },
    [],
  )

  useEffect(() => {
    let ignore = false
    const directTitle = getPostTitleFromValue(sourcePost)
    if (directTitle) {
      setSourcePostTitle(directTitle)
      return () => {
        ignore = true
      }
    }
    const sourcePostId = getRelationshipId(sourcePost)
    if (!sourcePostId) {
      setSourcePostTitle('')
      return () => {
        ignore = true
      }
    }
    const run = async () => {
      try {
        const response = await fetch(`/api/posts/${sourcePostId}?depth=0&draft=true`, {
          credentials: 'include',
        })
        if (!response.ok) return
        const doc = (await response.json()) as { title?: string }
        if (!ignore) setSourcePostTitle(typeof doc?.title === 'string' ? doc.title : '')
      } catch {
        if (!ignore) setSourcePostTitle('')
      }
    }
    void run()
    return () => {
      ignore = true
    }
  }, [sourcePost])

  useEffect(() => {
    const hasHeadline = renderedBlocks.some((block) => block.source === 'postTitle')
    if (!sourcePostTitle.trim() || hasHeadline) return
    const id = makeId()
    setTextBlocks([
      ...renderedBlocks,
      {
        id,
        label: 'Main Headline',
        source: 'postTitle',
        text: TEXT_PLACEHOLDER,
        x: 520,
        y: 340,
        width: 520,
        stylePreset: 'headline-md',
        font: STYLE_PRESETS['headline-md'].font,
        color: '#111111',
        lineHeight: STYLE_PRESETS['headline-md'].lineHeight,
        align: 'center',
        locked: false,
      },
    ])
    setSelectedElement(id)
  }, [renderedBlocks, setSelectedElement, setTextBlocks, sourcePostTitle])

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
        const nextImg = new Image()
        nextImg.crossOrigin = 'anonymous'
        nextImg.onload = () => {
          if (ignore) return
          setImg(nextImg)
          setLoading(false)
          const minScale = Math.max(CANVAS_W / nextImg.width, CANVAS_H / nextImg.height)
          if (!(typeof scale === 'number' && scale > 0)) setScale(minScale)
        }
        nextImg.onerror = () => {
          if (!ignore) {
            setImg(null)
            setError('Failed to load image')
            setLoading(false)
          }
        }
        nextImg.src = buildProxiedURL(url)
      } catch (e: unknown) {
        if (!ignore) {
          setImg(null)
          setError(typeof asRecord(e).message === 'string' ? String(asRecord(e).message) : 'Failed to resolve media URL')
          setLoading(false)
        }
      }
    }
    void run()
    return () => {
      ignore = true
    }
  }, [imageField, scale, setScale])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
    ctx.fillStyle = '#f3f4f6'
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

    if (img) {
      const minScale = Math.max(CANVAS_W / img.width, CANVAS_H / img.height)
      const s = Math.max(scale || 1, minScale)
      const dw = img.width * s
      const dh = img.height * s
      const dx = CANVAS_W / 2 + (posX || 0) - dw / 2
      const dy = CANVAS_H / 2 + (posY || 0) - dh / 2
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, dx, dy, dw, dh)
    }

    ctx.save()
    ctx.strokeStyle = 'rgba(17,17,17,0.12)'
    ctx.lineWidth = 1
    ctx.setLineDash([8, 6])
    ctx.strokeRect(SAFE_MARGIN, SAFE_MARGIN, CANVAS_W - SAFE_MARGIN * 2, CANVAS_H - SAFE_MARGIN * 2)
    ctx.restore()

    for (const block of renderedBlocks) {
      const metrics = getBlockMetrics(ctx, block)
      const isPlaceholder = block.displayText.trim() === TEXT_PLACEHOLDER
      if (isPlaceholder) {
        ctx.save()
        ctx.fillStyle = 'rgba(255,255,255,0.6)'
        ctx.strokeStyle = 'rgba(17,17,17,0.35)'
        ctx.lineWidth = 1.5
        ctx.setLineDash([8, 6])
        ctx.fillRect(block.x, block.y - block.lineHeight, block.width, block.lineHeight * 2)
        ctx.strokeRect(block.x, block.y - block.lineHeight, block.width, block.lineHeight * 2)
        ctx.restore()
      }
      const anchorX = block.align === 'left' ? block.x : block.align === 'center' ? block.x + block.width / 2 : block.x + block.width
      drawTextAligned(ctx, block.displayText, {
        x: anchorX,
        y: block.y,
        maxWidth: block.width,
        font: block.font,
        color: isPlaceholder ? 'rgba(17,17,17,0.72)' : block.color,
        lineHeight: block.lineHeight,
        align: block.align,
      })

      if (selectedId === block.id || hoverId === block.id) {
        ctx.save()
        ctx.strokeStyle = selectedId === block.id ? 'rgba(56,189,248,0.95)' : 'rgba(17,17,17,0.7)'
        ctx.lineWidth = 2
        ctx.setLineDash([6, 4])
        ctx.strokeRect(metrics.left - 6, metrics.top - 6, metrics.width + 12, metrics.height + 12)
        ctx.setLineDash([])
        const handleX = metrics.left + metrics.width + HANDLE_OFFSET - HANDLE_SIZE / 2
        const handleY = metrics.top + metrics.height / 2 - HANDLE_SIZE / 2
        ctx.fillStyle = '#ffffff'
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'
        ctx.fillRect(handleX, handleY, HANDLE_SIZE, HANDLE_SIZE)
        ctx.strokeRect(handleX, handleY, HANDLE_SIZE, HANDLE_SIZE)
        ctx.restore()
      }
    }
  }, [getBlockMetrics, hoverId, img, posX, posY, renderedBlocks, scale, selectedId])

  const hitTest = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>): { id: string; resize: boolean } | null => {
      const canvas = canvasRef.current
      if (!canvas) return null
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      const rect = canvas.getBoundingClientRect()
      const px = ((e.clientX - rect.left) / rect.width) * CANVAS_W
      const py = ((e.clientY - rect.top) / rect.height) * CANVAS_H

      for (let i = renderedBlocks.length - 1; i >= 0; i -= 1) {
        const block = renderedBlocks[i]
        if (!block) continue
        const metrics = getBlockMetrics(ctx, block)
        const handleX = metrics.left + metrics.width + HANDLE_OFFSET - HANDLE_SIZE / 2
        const handleY = metrics.top + metrics.height / 2 - HANDLE_SIZE / 2
        if (px >= handleX && px <= handleX + HANDLE_SIZE && py >= handleY && py <= handleY + HANDLE_SIZE) {
          return { id: block.id, resize: true }
        }
        if (
          px >= metrics.left &&
          px <= metrics.left + metrics.width &&
          py >= metrics.top &&
          py <= metrics.top + metrics.height
        ) {
          return { id: block.id, resize: false }
        }
      }

      if (img) {
        const minScale = Math.max(CANVAS_W / img.width, CANVAS_H / img.height)
        const s = Math.max(scale || 1, minScale)
        const width = img.width * s
        const height = img.height * s
        const left = CANVAS_W / 2 + (posX || 0) - width / 2
        const top = CANVAS_H / 2 + (posY || 0) - height / 2
        if (px >= left && px <= left + width && py >= top && py <= top + height) {
          return { id: 'image', resize: false }
        }
      }

      return null
    },
    [getBlockMetrics, img, posX, posY, renderedBlocks, scale],
  )

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    const hit = hitTest(e)
    setHoverId(hit?.id || null)
    setSelectedElement(hit?.id || null)
    if (!hit) {
      dragState.current = null
      return
    }
    if (hit.id === 'image') {
      dragState.current = { mode: 'image', startX: e.clientX, startY: e.clientY, baseX: posX || 0, baseY: posY || 0 }
      return
    }
    const block = renderedBlocks.find((item) => item.id === hit.id)
    if (!block || block.locked) {
      dragState.current = null
      return
    }
    if (hit.resize) {
      dragState.current = { mode: 'block-resize', id: block.id, startX: e.clientX, baseWidth: block.width }
    } else {
      dragState.current = { mode: 'block', id: block.id, startX: e.clientX, startY: e.clientY, baseX: block.x, baseY: block.y }
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragState.current) {
      const hit = hitTest(e)
      setHoverId(hit?.id || null)
      return
    }
    const dx = e.clientX - dragState.current.startX
    const dy = 'startY' in dragState.current ? e.clientY - dragState.current.startY : 0
    if (dragState.current.mode === 'image') {
      setPosX(dragState.current.baseX + dx)
      setPosY(dragState.current.baseY + dy)
      return
    }
    if (dragState.current.mode === 'image-resize') return
    const activeDrag = dragState.current
    const block = renderedBlocks.find((item) => item.id === activeDrag.id)
    if (!block) return
    if (activeDrag.mode === 'block') {
      updateTextBlock(block.id, { x: activeDrag.baseX + dx, y: activeDrag.baseY + dy })
      return
    }
    if (activeDrag.mode === 'block-resize') {
      updateTextBlock(block.id, { width: clamp(activeDrag.baseWidth + dx, MIN_TEXT_WIDTH, CANVAS_W - SAFE_MARGIN * 2) })
    }
  }

  const onPointerUp = () => {
    dragState.current = null
  }

  const fitToCover = useCallback(() => {
    if (!img) return
    const minScale = Math.max(CANVAS_W / img.width, CANVAS_H / img.height)
    setScale(minScale)
    setPosX(0)
    setPosY(0)
  }, [img, setPosX, setPosY, setScale])

  const uploadToMedia = async () => {
    const canvas = canvasRef.current
    if (!canvas || saving) return
    setSaving(true)
    setSaveMsg(null)

    const doUpload = async (blob: Blob) => {
      try {
        const sanitize = (s: string) =>
          (s || '')
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '') || 'media-canvas'
        const filename = `${sanitize(title || 'media-canvas')}.png`
        const file = new File([blob], filename, { type: 'image/png' })
        const fd = new FormData()
        fd.append('file', file)
        fd.append('alt', title || 'Media Canvas')
        const tenantVal = getTenantValue(tenantField)
        if (tenantVal) fd.append('tenant', tenantVal)

        const res = await fetch('/api/media-canvas/upload', {
          method: 'POST',
          body: fd,
          credentials: 'include',
          headers: tenantVal ? { 'X-Payload-Tenant': tenantVal } : undefined,
        })
        if (!res.ok) throw new Error(`Upload failed (${res.status})`)
        setSaveMsg('Saved to Media')
      } catch (e: unknown) {
        setSaveMsg(typeof asRecord(e).message === 'string' ? String(asRecord(e).message) : 'Failed to save to Media')
      } finally {
        setSaving(false)
      }
    }

    canvas.toBlob((blob) => {
      if (!blob) {
        setSaving(false)
        setSaveMsg('Failed to generate image data')
        return
      }
      void doUpload(blob)
    }, 'image/png')
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button size="small" buttonStyle="secondary" onClick={addTextBlock}>
          Add text box
        </Button>
        <Button size="small" buttonStyle="primary" onClick={uploadToMedia} disabled={!img || saving}>
          {saving ? 'Saving…' : 'Save to Media'}
        </Button>
        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--theme-elevation-600)' }}>
          {sourcePostTitle ? `Source post: ${sourcePostTitle}` : 'Select an image and optional source post'}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr) 320px', gap: 16, alignItems: 'start' }}>
        <div style={{ border: '1px solid var(--theme-elevation-150)', borderRadius: 8, padding: 12 }}>
          <strong style={{ display: 'block', marginBottom: 10, fontSize: 13 }}>Layers</strong>
          <div style={{ display: 'grid', gap: 8 }}>
            <button
              type="button"
              onClick={() => setSelectedElement('image')}
              style={{
                textAlign: 'left',
                padding: '8px 10px',
                borderRadius: 6,
                border: selectedId === 'image' ? '1px solid #38bdf8' : '1px solid var(--theme-elevation-150)',
                background: selectedId === 'image' ? 'rgba(56,189,248,0.08)' : 'transparent',
              }}
            >
              Background Image
            </button>
            {renderedBlocks.map((block) => (
              <button
                key={block.id}
                type="button"
                onClick={() => setSelectedElement(block.id)}
                style={{
                  textAlign: 'left',
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: selectedId === block.id ? '1px solid #38bdf8' : '1px solid var(--theme-elevation-150)',
                  background: selectedId === block.id ? 'rgba(56,189,248,0.08)' : 'transparent',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13 }}>{block.label}</div>
                <div style={{ fontSize: 11, color: 'var(--theme-elevation-600)' }}>
                  {block.source === 'postTitle' ? 'Source: Post Title' : 'Manual text'}{block.locked ? ' • Locked' : ''}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ border: '1px solid var(--theme-elevation-150)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ background: '#d9d9d9', display: 'flex', justifyContent: 'center' }}>
            <canvas
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              style={{ width: '100%', height: 'auto', cursor: hoverId ? 'move' : 'default' }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={() => {
                dragState.current = null
                setHoverId(null)
              }}
            />
          </div>
        </div>

        <div style={{ border: '1px solid var(--theme-elevation-150)', borderRadius: 8, padding: 12, display: 'grid', gap: 10 }}>
          <strong style={{ fontSize: 13 }}>Inspector</strong>
          {selectedId === 'image' ? (
            <>
              <div style={{ fontSize: 12, color: 'var(--theme-elevation-700)' }}>
                Drag the image to reposition it.
              </div>
              <Button size="small" buttonStyle="secondary" onClick={fitToCover}>
                Fit image
              </Button>
            </>
          ) : selectedBlock ? (
            <>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 12 }}>Layer label</span>
                <input
                  value={selectedBlock.label}
                  onChange={(event) => updateTextBlock(selectedBlock.id, { label: event.target.value })}
                  style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--theme-elevation-150)' }}
                />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 12 }}>Text source</span>
                <select
                  value={selectedBlock.source}
                  onChange={(event) => updateTextBlock(selectedBlock.id, { source: event.target.value as TextSource })}
                  style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--theme-elevation-150)' }}
                >
                  <option value="manual">Manual</option>
                  <option value="postTitle">Post Title</option>
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 12 }}>{selectedBlock.source === 'postTitle' ? 'Fallback text' : 'Text'}</span>
                <textarea
                  value={selectedBlock.text}
                  onChange={(event) => updateTextBlock(selectedBlock.id, { text: event.target.value })}
                  rows={5}
                  style={{ padding: 10, borderRadius: 6, border: '1px solid var(--theme-elevation-150)', resize: 'vertical' }}
                />
              </label>
              {selectedBlock.source === 'postTitle' ? (
                <div style={{ fontSize: 12, color: 'var(--theme-elevation-600)' }}>
                  Live text: {sourcePostTitle || 'No source post title available yet'}
                </div>
              ) : null}
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 12 }}>Style preset</span>
                <select
                  value={selectedBlock.stylePreset}
                  onChange={(event) => {
                    const presetId = event.target.value as StylePresetId
                    const preset = STYLE_PRESETS[presetId]
                    updateTextBlock(selectedBlock.id, {
                      stylePreset: presetId,
                      font: preset.font,
                      lineHeight: preset.lineHeight,
                      color: preset.color,
                      align: preset.align,
                    })
                  }}
                  style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--theme-elevation-150)' }}
                >
                  {(Object.keys(STYLE_PRESETS) as StylePresetId[]).map((presetId) => (
                    <option key={presetId} value={presetId}>{presetId}</option>
                  ))}
                </select>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label style={{ display: 'grid', gap: 4 }}>
                  <span style={{ fontSize: 12 }}>Color</span>
                  <input
                    type="color"
                    value={selectedBlock.color}
                    onChange={(event) => updateTextBlock(selectedBlock.id, { color: event.target.value })}
                  />
                </label>
                <label style={{ display: 'grid', gap: 4 }}>
                  <span style={{ fontSize: 12 }}>Align</span>
                  <select
                    value={selectedBlock.align}
                    onChange={(event) => updateTextBlock(selectedBlock.id, { align: event.target.value as TextAlign })}
                    style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--theme-elevation-150)' }}
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label style={{ display: 'grid', gap: 4 }}>
                  <span style={{ fontSize: 12 }}>Width</span>
                  <input
                    type="number"
                    min={MIN_TEXT_WIDTH}
                    max={CANVAS_W - SAFE_MARGIN * 2}
                    value={selectedBlock.width}
                    onChange={(event) => updateTextBlock(selectedBlock.id, { width: clamp(Number(event.target.value) || selectedBlock.width, MIN_TEXT_WIDTH, CANVAS_W - SAFE_MARGIN * 2) })}
                    style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--theme-elevation-150)' }}
                  />
                </label>
                <label style={{ display: 'grid', gap: 4 }}>
                  <span style={{ fontSize: 12 }}>Line height</span>
                  <input
                    type="number"
                    min={20}
                    max={100}
                    value={selectedBlock.lineHeight}
                    onChange={(event) => updateTextBlock(selectedBlock.id, { lineHeight: clamp(Number(event.target.value) || selectedBlock.lineHeight, 20, 100) })}
                    style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--theme-elevation-150)' }}
                  />
                </label>
              </div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={selectedBlock.locked}
                  onChange={(event) => updateTextBlock(selectedBlock.id, { locked: event.target.checked })}
                />
                Lock layer position
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button size="small" buttonStyle="secondary" onClick={removeSelectedBlock} disabled={selectedBlock.source === 'postTitle'}>
                  Delete layer
                </Button>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--theme-elevation-600)' }}>
              Select a layer to edit its content and styling.
            </div>
          )}
        </div>
      </div>

      {loading ? <div style={{ marginTop: 8 }}><small>Loading image…</small></div> : null}
      {error ? <div style={{ marginTop: 8, color: 'var(--theme-error-500)' }}><small>{error}</small></div> : null}
      {saveMsg ? <div style={{ marginTop: 8, color: 'var(--theme-success-500)' }}><small>{saveMsg}</small></div> : null}
    </div>
  )
}

export { MediaCanvasField }
