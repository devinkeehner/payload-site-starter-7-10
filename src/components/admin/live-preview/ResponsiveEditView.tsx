'use client'

import type { DocumentViewClientProps } from 'payload'
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import {
  DefaultEditView,
  DragHandleIcon,
  LivePreviewWindow,
  useDocumentInfo,
  useLivePreviewContext,
  usePreferences,
} from '@payloadcms/ui'

import { cn } from '@/lib/utils'

const DEFAULT_EDITOR_WIDTH_PERCENT = 40
const MIN_EDITOR_WIDTH_PX = 420
const MIN_PREVIEW_WIDTH_PX = 360
const MIN_RESIZABLE_WIDTH_PX = MIN_EDITOR_WIDTH_PX + MIN_PREVIEW_WIDTH_PX
const PREFERENCE_FIELD = 'responsiveLivePreviewSplit'

type ResponsiveLivePreviewPreference = {
  editorWidthPercent?: number
}

type ResponsiveLivePreviewPreferences = {
  [PREFERENCE_FIELD]?: ResponsiveLivePreviewPreference
}

type ResponsiveSplitContextValue = {
  canResize: boolean
  editorWidthPercent: number
  isDragging: boolean
  previewWindowType: 'iframe' | 'popup'
  resizeToClientX: (clientX: number) => void
  startDragging: (clientX: number, pointerId?: number) => void
  stopDragging: () => void
}

const ResponsiveSplitContext = createContext<ResponsiveSplitContextValue | null>(null)

const clamp = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return min
  if (min > max) return min
  return Math.min(Math.max(value, min), max)
}

const useResponsiveSplit = () => {
  const context = useContext(ResponsiveSplitContext)

  if (!context) {
    throw new Error('ResponsiveSplitContext is missing')
  }

  return context
}

const ResponsiveLivePreviewPane: React.FC = () => {
  const {
    canResize,
    editorWidthPercent,
    isDragging,
    previewWindowType,
    resizeToClientX,
    startDragging,
    stopDragging,
  } = useResponsiveSplit()

  const isInteractive = canResize && previewWindowType === 'iframe'

  return (
    <div className="responsive-live-preview-edit__shell">
      <LivePreviewWindow />

      {isInteractive ? (
        <button
          aria-label="Resize live preview"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={Math.round(editorWidthPercent)}
          aria-orientation="vertical"
          className={cn(
            'responsive-live-preview-edit__handle',
            isDragging && 'responsive-live-preview-edit__handle--dragging',
            'inline-flex h-9 w-9 items-center justify-center whitespace-nowrap rounded-md border bg-background/95 text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background hover:bg-card',
          )}
          data-dragging={isDragging ? 'true' : 'false'}
          onClick={(event: React.MouseEvent<Element>) => event.preventDefault()}
          onKeyDown={(event: React.KeyboardEvent<Element>) => {
            const step = event.shiftKey ? 5 : 1
            if (event.key === 'ArrowLeft') {
              event.preventDefault()
              resizeToClientX((editorWidthPercent - step) / 100)
            }
            if (event.key === 'ArrowRight') {
              event.preventDefault()
              resizeToClientX((editorWidthPercent + step) / 100)
            }
            if (event.key === 'Home') {
              event.preventDefault()
              resizeToClientX(0)
            }
            if (event.key === 'End') {
              event.preventDefault()
              resizeToClientX(1)
            }
          }}
          onPointerDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
            try {
              event.currentTarget.setPointerCapture(event.pointerId)
            } catch {}
            startDragging(event.clientX, event.pointerId)
          }}
          onPointerUp={(event) => {
            try {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId)
              }
            } catch {}
            stopDragging()
          }}
          onPointerCancel={(event) => {
            try {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId)
              }
            } catch {}
            stopDragging()
          }}
          onLostPointerCapture={() => {
            stopDragging()
          }}
          role="separator"
          type="button"
        >
          <DragHandleIcon className="size-4" />
          <span className="sr-only">Resize live preview</span>
        </button>
      ) : null}
    </div>
  )
}

const ResponsiveEditView: React.FC<DocumentViewClientProps> = (props) => {
  const { collectionSlug } = useDocumentInfo()
  const { breakpoint, isLivePreviewing, previewWindowType } = useLivePreviewContext()
  const { getPreference, setPreference } = usePreferences()

  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLElement | null>(null)
  const mainWrapperRef = useRef<HTMLElement | null>(null)
  const splitRef = useRef(DEFAULT_EDITOR_WIDTH_PERCENT)
  const isDraggingRef = useRef(false)
  const dragPointerIdRef = useRef<number | null>(null)

  const [editorWidthPercent, setEditorWidthPercent] = useState(DEFAULT_EDITOR_WIDTH_PERCENT)
  const [containerWidth, setContainerWidth] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [hasLoadedPreference, setHasLoadedPreference] = useState(false)

  const preferencesKey = useMemo(
    () => (collectionSlug ? `collection-${collectionSlug}` : undefined),
    [collectionSlug],
  )

  const isResizable =
    Boolean(preferencesKey) &&
    isLivePreviewing &&
    previewWindowType === 'iframe' &&
    breakpoint === 'responsive' &&
    containerWidth >= MIN_RESIZABLE_WIDTH_PX

  const clampToContainer = useCallback(
    (nextPercent: number) => {
      if (!containerWidth || containerWidth < MIN_RESIZABLE_WIDTH_PX) {
        return clamp(nextPercent, 0, 100)
      }

      const minEditorWidthPercent = (MIN_EDITOR_WIDTH_PX / containerWidth) * 100
      const maxEditorWidthPercent = 100 - (MIN_PREVIEW_WIDTH_PX / containerWidth) * 100

      if (minEditorWidthPercent >= maxEditorWidthPercent) {
        return DEFAULT_EDITOR_WIDTH_PERCENT
      }

      return clamp(nextPercent, minEditorWidthPercent, maxEditorWidthPercent)
    },
    [containerWidth],
  )

  const updateSplit = useCallback(
    (nextPercent: number) => {
      const clamped = clampToContainer(nextPercent)
      splitRef.current = clamped
      const root = rootRef.current
      const mainWrapper = mainWrapperRef.current
      if (root && mainWrapper) {
        const rect = mainWrapper.getBoundingClientRect()
        const boundaryLeft = rect.left + (rect.width * clamped) / 100
        root.style.setProperty('--responsive-live-preview-editor-width', `${clamped}%`)
        root.style.setProperty('--responsive-live-preview-handle-left', `${boundaryLeft}px`)
      }
      setEditorWidthPercent(clamped)
    },
    [clampToContainer],
  )

  const resizeToClientX = useCallback(
    (clientXOrRatio: number) => {
      const target = mainWrapperRef.current
      if (!target) return

      const rect = target.getBoundingClientRect()
      if (!rect.width) return

      const nextPercent =
        clientXOrRatio <= 1
          ? clientXOrRatio * 100
          : ((clientXOrRatio - rect.left) / rect.width) * 100

      updateSplit(nextPercent)
    },
    [updateSplit],
  )

  const startDragging = useCallback(
    (clientX: number, pointerId?: number) => {
      if (!isResizable || isDraggingRef.current) return

      isDraggingRef.current = true
      dragPointerIdRef.current = pointerId ?? null
      rootRef.current?.classList.add('responsive-live-preview-edit--dragging')
      setIsDragging(true)
      resizeToClientX(clientX)
    },
    [isResizable, resizeToClientX],
  )

  const stopDragging = useCallback(() => {
    if (!isDraggingRef.current) return

    isDraggingRef.current = false
    dragPointerIdRef.current = null
    rootRef.current?.classList.remove('responsive-live-preview-edit--dragging')
    setIsDragging(false)

    if (preferencesKey) {
      void setPreference(
        preferencesKey,
        {
          [PREFERENCE_FIELD]: {
            editorWidthPercent: splitRef.current,
          },
        } satisfies ResponsiveLivePreviewPreferences,
        true,
      )
    }
  }, [preferencesKey, setPreference])

  useEffect(() => {
    if (!wrapperRef.current) return

    const root = wrapperRef.current.querySelector<HTMLElement>('.collection-edit')
    const mainWrapper = root?.querySelector<HTMLElement>('.collection-edit__main-wrapper')

    if (!root || !mainWrapper) return

    rootRef.current = root
    mainWrapperRef.current = mainWrapper

    const update = () => {
      setContainerWidth(mainWrapper.getBoundingClientRect().width)
    }

    update()

    const observer = new ResizeObserver(update)
    observer.observe(mainWrapper)

    return () => {
      observer.disconnect()
      root.classList.remove('responsive-live-preview-edit--resizable', 'responsive-live-preview-edit--dragging')
      root.style.removeProperty('--responsive-live-preview-editor-width')
      root.style.removeProperty('--responsive-live-preview-handle-left')
      if (rootRef.current === root) {
        rootRef.current = null
      }
      if (mainWrapperRef.current === mainWrapper) {
        mainWrapperRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const root = rootRef.current
    const mainWrapper = mainWrapperRef.current

    if (!root || !mainWrapper) return

    const rect = mainWrapper.getBoundingClientRect()
    const boundaryLeft = rect.left + (rect.width * editorWidthPercent) / 100

    root.classList.toggle('responsive-live-preview-edit--resizable', isResizable)
    root.classList.toggle('responsive-live-preview-edit--dragging', isDragging)
    root.style.setProperty('--responsive-live-preview-editor-width', `${editorWidthPercent}%`)
    root.style.setProperty('--responsive-live-preview-handle-left', `${boundaryLeft}px`)
  }, [editorWidthPercent, isDragging, isResizable])

  useEffect(() => {
    if (!preferencesKey) return

    let cancelled = false

    const loadPreference = async () => {
      try {
        const current = await getPreference<ResponsiveLivePreviewPreferences>(preferencesKey)
        if (cancelled) return

        const storedPercent = current?.[PREFERENCE_FIELD]?.editorWidthPercent
        if (typeof storedPercent === 'number') {
          updateSplit(storedPercent)
        }
      } catch (error) {
        console.error('Failed to load responsive live preview split', error)
      } finally {
        if (!cancelled) {
          setHasLoadedPreference(true)
        }
      }
    }

    void loadPreference()

    return () => {
      cancelled = true
    }
  }, [getPreference, preferencesKey, updateSplit])

  useEffect(() => {
    if (!hasLoadedPreference) return
    if (!isResizable) return

    updateSplit(splitRef.current)
  }, [hasLoadedPreference, isResizable, updateSplit])

  useEffect(() => {
    if (!isDragging) return

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.documentElement.style.cursor = 'col-resize'
    document.documentElement.style.userSelect = 'none'

    const handlePointerMove = (event: PointerEvent) => {
      if (!mainWrapperRef.current) return
      if (dragPointerIdRef.current !== null && event.pointerId !== dragPointerIdRef.current) return

      event.preventDefault()
      resizeToClientX(event.clientX)
    }

    const handlePointerUp = () => {
      stopDragging()
    }

    const handleWindowBlur = () => {
      stopDragging()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        stopDragging()
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        stopDragging()
      }
    }

    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', handlePointerUp)
    document.addEventListener('pointercancel', handlePointerUp)
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('blur', handleWindowBlur)

    return () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.documentElement.style.cursor = ''
      document.documentElement.style.userSelect = ''
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerUp)
      document.removeEventListener('pointercancel', handlePointerUp)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [isDragging, resizeToClientX, stopDragging])

  useEffect(() => {
    if (!isResizable) return

    updateSplit(splitRef.current)
  }, [isResizable, updateSplit])

  const splitContext = useMemo<ResponsiveSplitContextValue>(
    () => ({
      canResize: Boolean(isResizable),
      editorWidthPercent,
      isDragging,
      previewWindowType,
      resizeToClientX,
      startDragging,
      stopDragging,
    }),
    [
      editorWidthPercent,
      isDragging,
      isResizable,
      previewWindowType,
      resizeToClientX,
      startDragging,
      stopDragging,
    ],
  )

  return (
    <ResponsiveSplitContext.Provider value={splitContext}>
      <div
        ref={wrapperRef}
        className={cn(
          'responsive-live-preview-edit',
          isResizable && 'responsive-live-preview-edit--resizable',
          isDragging && 'responsive-live-preview-edit--dragging',
        )}
        style={
          {
            '--responsive-live-preview-editor-width': `${editorWidthPercent}%`,
          } as React.CSSProperties
        }
      >
        <DefaultEditView {...props} LivePreview={<ResponsiveLivePreviewPane />} />
      </div>
    </ResponsiveSplitContext.Provider>
  )
}

export default ResponsiveEditView
