import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type AutosaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

export type AutosaveState = {
  error: string | null
  lastSavedAt: number | null
  status: AutosaveStatus
}

type AutosaveOptions = {
  debounceMs?: number
  enabled: boolean
  onError?: (message: string) => void
  onSave: () => Promise<void>
  revision: number
}

export type EditorCustomRect = {
  dashStyle?: 'solid' | 'dashed' | 'dotted'
  fill: string
  fillEnabled?: boolean
  height: number
  id: string
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
  width: number
  x: number
  y: number
}

export type EditorCustomImage = {
  blurRadius?: number
  brightness?: number
  grayscale?: boolean
  height: number
  id: string
  opacity?: number
  rotation?: number
  shadowBlur?: number
  shadowColor?: string
  shadowOffsetX?: number
  shadowOffsetY?: number
  shadowOpacity?: number
  width: number
  x: number
  y: number
}

export type EditorCustomText = {
  color: string
  fontFamily?: string
  fontSize: number
  fontStyle?: string
  height?: number
  id: string
  letterSpacing?: number
  lineHeight?: number
  opacity?: number
  rotation?: number
  shadowBlur?: number
  shadowColor?: string
  shadowOffsetX?: number
  shadowOffsetY?: number
  shadowOpacity?: number
  strokeColor?: string
  strokeWidth?: number
  text: string
  textAlign?: 'left' | 'center' | 'right'
  textDecoration?: string
  width: number
  x: number
  y: number
}

export type EditorLayerKind =
  | 'eyebrow'
  | 'headline'
  | 'subhead'
  | 'footer'
  | 'headshot'
  | 'town'
  | 'custom-image'
  | 'custom-rect'
  | 'custom-text'

export type EditorLayerGroup = 'built-in' | 'custom'

export type EditorLayerItem = {
  group: EditorLayerGroup
  hidden?: boolean
  id: string
  kind: EditorLayerKind
  locked?: boolean
  order: number
}

export type EditorLayerTarget = Pick<EditorLayerItem, 'id' | 'kind'>

type EditorLayerSceneSnapshot = {
  customImages: Pick<EditorCustomImage, 'id'>[]
  customRects: Pick<EditorCustomRect, 'id'>[]
  customTexts: Pick<EditorCustomText, 'id'>[]
  eyebrow: { id: string }
  footer: { id: string }
  headline: { id: string }
  headshot: { id: string }
  subhead: { id: string }
  townRows: { id: string }[]
}

type EditorClipboardItem =
  | { kind: 'custom-image'; payload: EditorCustomImage }
  | { kind: 'custom-rect'; payload: EditorCustomRect }
  | { kind: 'custom-text'; payload: EditorCustomText }

type EditorLayerReorderDirection = 'backward' | 'forward' | 'front' | 'back'

export type EditorComponentDefinition = {
  build: (context: {
    brandBlue: string
    brandRed: string
    stageHeight: number
    stageWidth: number
    websiteText: string
  }) => {
    rects: EditorCustomRect[]
    texts: EditorCustomText[]
  }
  description: string
  id: string
  label: string
}

const COMPONENT_INSERT_OFFSET = 28
let sessionClipboard: EditorClipboardItem | null = null

export const TEXT_FONT_OPTIONS = [
  { label: 'Arial', value: 'Arial' },
  { label: 'Georgia', value: 'Georgia, Times New Roman, serif' },
  { label: 'Arial Narrow', value: '"Arial Narrow", Arial, sans-serif' },
  { label: 'Marker', value: '"Comic Sans MS", "Marker Felt", cursive' },
] as const

export const TEXT_ALIGNMENT_OPTIONS = [
  { label: 'Left', value: 'left' },
  { label: 'Center', value: 'center' },
  { label: 'Right', value: 'right' },
] as const

export const isEditableTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    Boolean(element?.isContentEditable)
  )
}

export const createEditorNodeID = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export const getShortcutNudgeDistance = (event: KeyboardEvent) => (event.shiftKey ? 10 : 1)

export const getDashPattern = (dashStyle?: 'solid' | 'dashed' | 'dotted') => {
  if (dashStyle === 'dashed') return [16, 10]
  if (dashStyle === 'dotted') return [3, 8]
  return undefined
}

export const formatAutosaveLabel = (state: AutosaveState) => {
  if (state.status === 'saving') return 'Saving…'
  if (state.status === 'saved') return 'Saved'
  if (state.status === 'error') return state.error || 'Autosave failed'
  if (state.status === 'dirty') return 'Unsaved changes'
  return 'Draft not saved yet'
}

export const duplicateRect = (rect: EditorCustomRect): EditorCustomRect => ({
  ...rect,
  id: createEditorNodeID('custom-rect'),
  x: rect.x + COMPONENT_INSERT_OFFSET,
  y: rect.y + COMPONENT_INSERT_OFFSET,
})

export const duplicateImage = <T extends EditorCustomImage>(image: T): T => ({
  ...image,
  id: createEditorNodeID('custom-image'),
  x: image.x + COMPONENT_INSERT_OFFSET,
  y: image.y + COMPONENT_INSERT_OFFSET,
}) as T

export const duplicateText = (text: EditorCustomText): EditorCustomText => ({
  ...text,
  id: createEditorNodeID('custom-text'),
  x: text.x + COMPONENT_INSERT_OFFSET,
  y: text.y + COMPONENT_INSERT_OFFSET,
})

const CUSTOM_LAYER_KINDS = new Set<EditorLayerKind>(['custom-image', 'custom-rect', 'custom-text'])
const layerKey = (target: EditorLayerTarget) => `${target.kind}:${target.id}`
const cloneClipboardPayload = <T,>(payload: T): T => JSON.parse(JSON.stringify(payload)) as T

export const isCustomLayerKind = (kind: string) => CUSTOM_LAYER_KINDS.has(kind as EditorLayerKind)

export const buildEditorLayers = (scene: EditorLayerSceneSnapshot): EditorLayerItem[] => {
  const builtins: EditorLayerItem[] = [
    { id: scene.eyebrow.id, kind: 'eyebrow', group: 'built-in', order: 0 },
    { id: scene.headline.id, kind: 'headline', group: 'built-in', order: 1 },
    { id: scene.subhead.id, kind: 'subhead', group: 'built-in', order: 2 },
    { id: scene.footer.id, kind: 'footer', group: 'built-in', order: 3 },
    { id: scene.headshot.id, kind: 'headshot', group: 'built-in', order: 4 },
    ...scene.townRows.map((row, index) => ({
      id: row.id,
      kind: 'town' as const,
      group: 'built-in' as const,
      order: 5 + index,
    })),
  ]

  const customStartOrder = builtins.length
  const customItems: EditorLayerItem[] = [
    ...scene.customImages.map((item, index) => ({
      id: item.id,
      kind: 'custom-image' as const,
      group: 'custom' as const,
      order: customStartOrder + index,
    })),
    ...scene.customRects.map((item, index) => ({
      id: item.id,
      kind: 'custom-rect' as const,
      group: 'custom' as const,
      order: customStartOrder + scene.customImages.length + index,
    })),
    ...scene.customTexts.map((item, index) => ({
      id: item.id,
      kind: 'custom-text' as const,
      group: 'custom' as const,
      order: customStartOrder + scene.customImages.length + scene.customRects.length + index,
    })),
  ]

  return [...builtins, ...customItems]
}

export const hydrateEditorLayers = ({
  baseLayers,
  savedLayers,
}: {
  baseLayers: EditorLayerItem[]
  savedLayers?: EditorLayerItem[] | null
}) => {
  if (!Array.isArray(savedLayers) || savedLayers.length === 0) return baseLayers

  const baseByKey = new Map(baseLayers.map((item) => [layerKey(item), item] as const))
  const savedByKey = new Map(savedLayers.map((item) => [layerKey(item), item] as const))

  const builtins = baseLayers
    .filter((item) => item.group === 'built-in')
    .map((item, index) => {
      const saved = savedByKey.get(layerKey(item))
      return {
        ...item,
        hidden: saved?.hidden ?? item.hidden ?? false,
        locked: saved?.locked ?? item.locked ?? false,
        order: index,
      }
    })

  const baseCustom = baseLayers.filter((item) => item.group === 'custom')
  const resolvedCustom: EditorLayerItem[] = []
  const used = new Set<string>()

  savedLayers
    .filter((item) => item.group === 'custom')
    .sort((left, right) => left.order - right.order)
    .forEach((saved) => {
      const key = layerKey(saved)
      const base = baseByKey.get(key)
      if (!base || base.group !== 'custom' || used.has(key)) return
      used.add(key)
      resolvedCustom.push({
        ...base,
        hidden: saved.hidden ?? base.hidden ?? false,
        locked: saved.locked ?? base.locked ?? false,
        order: 0,
      })
    })

  baseCustom.forEach((item) => {
    const key = layerKey(item)
    if (used.has(key)) return
    resolvedCustom.push(item)
  })

  const orderOffset = builtins.length
  return [
    ...builtins,
    ...resolvedCustom.map((item, index) => ({
      ...item,
      hidden: item.hidden ?? false,
      locked: item.locked ?? false,
      order: orderOffset + index,
    })),
  ]
}

export const getEditorLayerItem = (layers: EditorLayerItem[] | undefined | null, target: EditorLayerTarget | null) => {
  if (!target || !Array.isArray(layers)) return null
  return layers.find((item) => item.id === target.id && item.kind === target.kind) || null
}

export const patchEditorLayer = (
  layers: EditorLayerItem[] | undefined | null,
  target: EditorLayerTarget,
  patch: Partial<Pick<EditorLayerItem, 'hidden' | 'locked'>>,
) =>
  (layers || []).map((item) =>
    item.id === target.id && item.kind === target.kind
      ? {
          ...item,
          ...patch,
        }
      : item,
  )

export const appendEditorLayers = (
  layers: EditorLayerItem[] | undefined | null,
  items: Omit<EditorLayerItem, 'order'>[],
) => {
  const currentLayers = [...(layers || [])]
  const nextOrder = currentLayers.length
  return [
    ...currentLayers,
    ...items.map((item, index) => ({
      ...item,
      hidden: item.hidden ?? false,
      locked: item.locked ?? false,
      order: nextOrder + index,
    })),
  ]
}

export const removeEditorLayers = (layers: EditorLayerItem[] | undefined | null, targets: EditorLayerTarget[]) => {
  const targetKeys = new Set(targets.map((target) => layerKey(target)))
  const remaining = (layers || []).filter((item) => !targetKeys.has(layerKey(item)))
  return remaining.map((item, index) => ({ ...item, order: index }))
}

export const reorderCustomEditorLayer = (
  layers: EditorLayerItem[] | undefined | null,
  target: EditorLayerTarget,
  direction: EditorLayerReorderDirection,
) => {
  const currentLayers = [...(layers || [])]
  const builtins = currentLayers.filter((item) => item.group === 'built-in').sort((left, right) => left.order - right.order)
  const customs = currentLayers.filter((item) => item.group === 'custom').sort((left, right) => left.order - right.order)
  const index = customs.findIndex((item) => item.id === target.id && item.kind === target.kind)
  if (index < 0) return currentLayers

  const reordered = [...customs]
  const [item] = reordered.splice(index, 1)
  if (!item) return currentLayers
  const nextIndex =
    direction === 'front'
      ? reordered.length
      : direction === 'back'
        ? 0
        : direction === 'forward'
          ? Math.min(index + 1, reordered.length)
          : Math.max(index - 1, 0)
  reordered.splice(nextIndex, 0, item)

  const orderOffset = builtins.length
  return [
    ...builtins.map((layer, index) => ({ ...layer, order: index })),
    ...reordered.map((layer, index) => ({ ...layer, order: orderOffset + index })),
  ]
}

export const setEditorClipboard = (item: EditorClipboardItem | null) => {
  if (!item) {
    sessionClipboard = null
    return
  }

  if (item.kind === 'custom-image') {
    sessionClipboard = { kind: 'custom-image', payload: cloneClipboardPayload(item.payload) }
    return
  }

  if (item.kind === 'custom-rect') {
    sessionClipboard = { kind: 'custom-rect', payload: cloneClipboardPayload(item.payload) }
    return
  }

  sessionClipboard = { kind: 'custom-text', payload: cloneClipboardPayload(item.payload) }
}

export const hasEditorClipboard = () => Boolean(sessionClipboard)

export const readEditorClipboard = () => {
  if (!sessionClipboard) return null
  if (sessionClipboard.kind === 'custom-image') {
    return { kind: 'custom-image' as const, payload: cloneClipboardPayload(sessionClipboard.payload) }
  }
  if (sessionClipboard.kind === 'custom-rect') {
    return { kind: 'custom-rect' as const, payload: cloneClipboardPayload(sessionClipboard.payload) }
  }
  return { kind: 'custom-text' as const, payload: cloneClipboardPayload(sessionClipboard.payload) }
}

export const getFontStyleFlags = (fontStyle?: string) => {
  const normalized = (fontStyle || '').toLowerCase()
  return {
    bold: /\bbold\b/.test(normalized) || /\b700\b/.test(normalized) || /\b800\b/.test(normalized) || /\b900\b/.test(normalized),
    italic: normalized.includes('italic'),
  }
}

export const buildFontStyle = ({ bold, italic }: { bold: boolean; italic: boolean }) => {
  if (bold && italic) return 'italic bold'
  if (italic) return 'italic'
  if (bold) return 'bold'
  return 'normal'
}

export const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const getResizedTextTransform = ({
  fontSize,
  maxFontSize = 240,
  minFontSize = 12,
  minWidth = 80,
  scaleX,
  scaleY,
  width,
}: {
  fontSize: number
  maxFontSize?: number
  minFontSize?: number
  minWidth?: number
  scaleX: number
  scaleY: number
  width: number
}) => {
  const safeScaleX = Math.max(Math.abs(scaleX), 0.1)
  const safeScaleY = Math.max(Math.abs(scaleY), 0.1)
  const nextWidth = Math.max(minWidth, Math.round(width * safeScaleX))
  const fontScale = Math.max(safeScaleX, safeScaleY)
  const nextFontSize = clampNumber(Math.round(fontSize * fontScale), minFontSize, maxFontSize)

  return { nextFontSize, nextWidth }
}

export const getCssFontWeight = (fontStyle?: string) => {
  const normalized = (fontStyle || '').toLowerCase()
  return normalized.includes('800') || normalized.includes('900') || normalized.includes('700') || normalized.includes('bold') ? 700 : 400
}

export function useEditorAutosave({ debounceMs = 1200, enabled, onError, onSave, revision }: AutosaveOptions) {
  const [state, setState] = useState<AutosaveState>({
    error: null,
    lastSavedAt: null,
    status: 'idle',
  })
  const saveRef = useRef(onSave)
  const latestRevisionRef = useRef(revision)
  const savedRevisionRef = useRef(0)
  const isSavingRef = useRef(false)

  useEffect(() => {
    saveRef.current = onSave
  }, [onSave])

  useEffect(() => {
    latestRevisionRef.current = revision
  }, [revision])

  useEffect(() => {
    if (!enabled || revision <= 0) return
    if (revision <= savedRevisionRef.current) return

    setState((current) => ({
      ...current,
      error: null,
      status: current.status === 'saving' ? current.status : 'dirty',
    }))

    const timer = window.setTimeout(async () => {
      if (isSavingRef.current || latestRevisionRef.current <= savedRevisionRef.current) return

      isSavingRef.current = true
      setState((current) => ({ ...current, error: null, status: 'saving' }))

      try {
        await saveRef.current()
        savedRevisionRef.current = latestRevisionRef.current
        setState({
          error: null,
          lastSavedAt: Date.now(),
          status: 'saved',
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setState((current) => ({
          ...current,
          error: message,
          status: 'error',
        }))
        onError?.(message)
      } finally {
        isSavingRef.current = false
      }
    }, debounceMs)

    return () => window.clearTimeout(timer)
  }, [debounceMs, enabled, onError, revision])

  const markSaved = useCallback(() => {
    savedRevisionRef.current = latestRevisionRef.current
    setState({
      error: null,
      lastSavedAt: Date.now(),
      status: 'saved',
    })
  }, [])

  const resetAutosave = useCallback(() => {
    savedRevisionRef.current = latestRevisionRef.current
    setState({
      error: null,
      lastSavedAt: null,
      status: 'idle',
    })
  }, [])

  const setDirty = useCallback(() => {
    setState((current) => ({
      ...current,
      error: null,
      status: current.status === 'saving' ? current.status : 'dirty',
    }))
  }, [])

  return useMemo(
    () => ({
      autosaveState: state,
      markSaved,
      resetAutosave,
      setDirty,
    }),
    [markSaved, resetAutosave, setDirty, state],
  )
}

export const EDITOR_COMPONENTS: EditorComponentDefinition[] = [
  {
    id: 'cta-ribbon',
    label: 'CTA Ribbon',
    description: 'Full-width action ribbon with a strong CTA.',
    build: ({ brandBlue, stageWidth, websiteText }) => {
      const width = Math.min(760, stageWidth - 120)
      const x = Math.round((stageWidth - width) / 2)
      return {
        rects: [
          {
            id: createEditorNodeID('custom-rect'),
            x,
            y: 120,
            width,
            height: 124,
            fill: brandBlue,
          },
        ],
        texts: [
          {
            id: createEditorNodeID('custom-text'),
            x: x + 36,
            y: 148,
            width: width - 72,
            text: `Read the plan at ${websiteText}`,
            fontSize: 36,
            color: '#ffffff',
            fontFamily: 'Arial',
            fontStyle: '700',
            lineHeight: 1.05,
          },
        ],
      }
    },
  },
  {
    id: 'stat-callout',
    label: 'Stat Callout',
    description: 'Large-number callout with supporting explanation.',
    build: ({ brandBlue, brandRed, stageWidth }) => {
      const width = 420
      const x = Math.round(stageWidth - width - 90)
      return {
        rects: [
          {
            id: createEditorNodeID('custom-rect'),
            x,
            y: 160,
            width,
            height: 260,
            fill: '#ffffff',
          },
          {
            id: createEditorNodeID('custom-rect'),
            x,
            y: 160,
            width: 14,
            height: 260,
            fill: brandRed,
          },
        ],
        texts: [
          {
            id: createEditorNodeID('custom-text'),
            x: x + 40,
            y: 194,
            width: width - 60,
            text: '$400M',
            fontSize: 70,
            color: brandBlue,
            fontFamily: 'Georgia, Times New Roman, serif',
            fontStyle: '700',
            lineHeight: 1,
          },
          {
            id: createEditorNodeID('custom-text'),
            x: x + 40,
            y: 278,
            width: width - 70,
            text: 'Tax and fee relief for Connecticut residents.',
            fontSize: 28,
            color: '#111827',
            fontFamily: 'Arial',
            fontStyle: '700',
            lineHeight: 1.15,
          },
        ],
      }
    },
  },
  {
    id: 'quote-card',
    label: 'Quote Card',
    description: 'Framed quote block with attribution.',
    build: ({ brandBlue, stageWidth }) => {
      const width = Math.min(560, stageWidth - 160)
      const x = 80
      return {
        rects: [
          {
            id: createEditorNodeID('custom-rect'),
            x,
            y: 240,
            width,
            height: 254,
            fill: '#f8fafc',
          },
          {
            id: createEditorNodeID('custom-rect'),
            x: x + 24,
            y: 264,
            width: 52,
            height: 6,
            fill: brandBlue,
          },
        ],
        texts: [
          {
            id: createEditorNodeID('custom-text'),
            x: x + 24,
            y: 294,
            width: width - 48,
            text: '"Real relief should show up in everyday family budgets."',
            fontSize: 34,
            color: '#0f172a',
            fontFamily: 'Georgia, Times New Roman, serif',
            fontStyle: '700',
            lineHeight: 1.12,
          },
          {
            id: createEditorNodeID('custom-text'),
            x: x + 24,
            y: 420,
            width: width - 48,
            text: 'State Representative',
            fontSize: 22,
            color: '#475569',
            fontFamily: 'Arial',
            fontStyle: '700',
            lineHeight: 1.05,
          },
        ],
      }
    },
  },
  {
    id: 'badge-pill',
    label: 'Badge Pill',
    description: 'Small category badge for highlighting one idea.',
    build: ({ brandRed }) => ({
      rects: [
        {
          id: createEditorNodeID('custom-rect'),
          x: 90,
          y: 90,
          width: 250,
          height: 60,
          fill: brandRed,
        },
      ],
      texts: [
        {
          id: createEditorNodeID('custom-text'),
          x: 120,
          y: 104,
          width: 190,
          text: 'AFFORDABILITY',
          fontSize: 24,
          color: '#ffffff',
          fontFamily: 'Arial',
          fontStyle: '700',
          lineHeight: 1,
        },
      ],
    }),
  },
  {
    id: 'info-card',
    label: 'Info Card',
    description: 'Compact info block for web or QR follow-up.',
    build: ({ brandBlue, stageHeight, stageWidth, websiteText }) => {
      const width = 360
      const x = Math.round(stageWidth - width - 72)
      const y = Math.round(stageHeight - 232)
      return {
        rects: [
          {
            id: createEditorNodeID('custom-rect'),
            x,
            y,
            width,
            height: 176,
            fill: '#ffffff',
          },
          {
            id: createEditorNodeID('custom-rect'),
            x: x + 24,
            y: y + 28,
            width: 88,
            height: 88,
            fill: '#e2e8f0',
          },
          {
            id: createEditorNodeID('custom-rect'),
            x: x + 132,
            y: y + 28,
            width: 180,
            height: 8,
            fill: brandBlue,
          },
        ],
        texts: [
          {
            id: createEditorNodeID('custom-text'),
            x: x + 132,
            y: y + 48,
            width: 180,
            text: 'Scan for details',
            fontSize: 28,
            color: '#0f172a',
            fontFamily: 'Arial',
            fontStyle: '700',
            lineHeight: 1.05,
          },
          {
            id: createEditorNodeID('custom-text'),
            x: x + 132,
            y: y + 94,
            width: 188,
            text: websiteText,
            fontSize: 18,
            color: '#475569',
            fontFamily: 'Arial',
            fontStyle: '700',
            lineHeight: 1.05,
          },
        ],
      }
    },
  },
]
