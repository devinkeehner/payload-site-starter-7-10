import { useEffect, useMemo, useRef, useState } from 'react'

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
  fill: string
  height: number
  id: string
  width: number
  x: number
  y: number
}

export type EditorCustomText = {
  color: string
  fontFamily?: string
  fontSize: number
  fontStyle?: string
  id: string
  lineHeight?: number
  rotation?: number
  text: string
  textDecoration?: string
  width: number
  x: number
  y: number
}

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

export const duplicateText = (text: EditorCustomText): EditorCustomText => ({
  ...text,
  id: createEditorNodeID('custom-text'),
  x: text.x + COMPONENT_INSERT_OFFSET,
  y: text.y + COMPONENT_INSERT_OFFSET,
})

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

  return useMemo(
    () => ({
      autosaveState: state,
      markSaved: () => {
        savedRevisionRef.current = latestRevisionRef.current
        setState({
          error: null,
          lastSavedAt: Date.now(),
          status: 'saved',
        })
      },
      resetAutosave: () => {
        savedRevisionRef.current = revision
        setState({
          error: null,
          lastSavedAt: null,
          status: 'idle',
        })
      },
      setDirty: () => {
        setState((current) => ({
          ...current,
          error: null,
          status: current.status === 'saving' ? current.status : 'dirty',
        }))
      },
    }),
    [revision, state],
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
