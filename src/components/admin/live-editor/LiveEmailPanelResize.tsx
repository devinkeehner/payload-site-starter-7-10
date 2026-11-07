'use client'

import { useCallback, useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import styles from './live-editor-resize.module.css'

const MIN_WIDTH = 240
const MAX_WIDTH = 560
const DEFAULT_WIDTH = 310
const STORAGE_KEY = 'unsteady:panel-width:v1'
const PROPERTY = '--unsteady-panel-width'

/** A grid separator; resizing changes CSS only, so the canvas never remounts. */
export function LiveEmailPanelResize({ workspaceRef }: { workspaceRef: RefObject<HTMLDivElement | null> }) {
  const description = useId()
  const [size, setSize] = useState({ width: DEFAULT_WIDTH, max: MAX_WIDTH })
  const [dragging, setDragging] = useState(false)
  const preferred = useRef(DEFAULT_WIDTH)
  const current = useRef(DEFAULT_WIDTH)
  const mounted = useRef(false)
  const cleanup = useRef<((cancelled: boolean) => void) | null>(null)

  const apply = useCallback((requested: number) => {
    const workspace = workspaceRef.current
    if (!workspace) return current.current
    const available = Math.floor(workspace.getBoundingClientRect().width) - 6 - 320
    const max = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, available))
    const width = Math.round(Math.max(MIN_WIDTH, Math.min(max, requested)))
    current.current = width
    workspace.style.setProperty(PROPERTY, `${width}px`)
    if (mounted.current) setSize(previous => previous.width === width && previous.max === max ? previous : { width, max })
    return width
  }, [workspaceRef])

  const remember = useCallback((width: number) => {
    preferred.current = width
    try { workspaceRef.current?.ownerDocument.defaultView?.localStorage.setItem(STORAGE_KEY, String(width)) } catch { /* Storage is optional. */ }
  }, [workspaceRef])

  useEffect(() => {
    const workspace = workspaceRef.current
    const win = workspace?.ownerDocument.defaultView
    if (!workspace || !win) return
    mounted.current = true
    const previous = workspace.style.getPropertyValue(PROPERTY)
    const priority = workspace.style.getPropertyPriority(PROPERTY)
    try {
      const stored = Number(win.localStorage.getItem(STORAGE_KEY))
      if (Number.isFinite(stored) && stored >= MIN_WIDTH && stored <= MAX_WIDTH) preferred.current = stored
    } catch { /* Storage is optional. */ }
    const resize = () => {
      if (win.innerWidth <= 650 && cleanup.current) cleanup.current(true)
      apply(cleanup.current ? current.current : preferred.current)
    }
    resize()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)
    observer?.observe(workspace)
    win.addEventListener('resize', resize)
    return () => {
      mounted.current = false
      cleanup.current?.(true)
      observer?.disconnect()
      win.removeEventListener('resize', resize)
      if (previous) workspace.style.setProperty(PROPERTY, previous, priority)
      else workspace.style.removeProperty(PROPERTY)
    }
  }, [apply, workspaceRef])

  const start = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || cleanup.current) return
    const handle = event.currentTarget
    const doc = handle.ownerDocument
    const win = doc.defaultView
    if (!win || win.innerWidth <= 650) return
    event.preventDefault(); event.stopPropagation()
    handle.focus({ preventScroll: true })
    const pointer = event.pointerId
    const origin = event.clientX
    const initial = current.current
    try { handle.setPointerCapture(pointer) } catch { /* The shield and document listeners also retain the gesture. */ }
    setDragging(true)
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointer) return
      next.preventDefault()
      apply(initial + next.clientX - origin)
    }
    const finish = (cancelled: boolean) => {
      doc.removeEventListener('pointermove', move, true)
      doc.removeEventListener('pointerup', up, true)
      doc.removeEventListener('pointercancel', cancel, true)
      doc.removeEventListener('keydown', key, true)
      win.removeEventListener('blur', blur)
      handle.removeEventListener('lostpointercapture', lost)
      cleanup.current = null
      try { if (handle.hasPointerCapture(pointer)) handle.releasePointerCapture(pointer) } catch { /* The handle may have unmounted. */ }
      if (cancelled) apply(initial)
      else remember(current.current)
      if (mounted.current) setDragging(false)
    }
    const up = (next: PointerEvent) => { if (next.pointerId === pointer) { next.preventDefault(); next.stopPropagation(); finish(false) } }
    const cancel = (next: PointerEvent) => { if (next.pointerId === pointer) finish(true) }
    const key = (next: KeyboardEvent) => { if (next.key === 'Escape') { next.preventDefault(); next.stopPropagation(); finish(true) } }
    const blur = () => finish(true)
    const lost = (next: PointerEvent) => { if (next.pointerId === pointer) finish(true) }
    cleanup.current = finish
    doc.addEventListener('pointermove', move, true)
    doc.addEventListener('pointerup', up, true)
    doc.addEventListener('pointercancel', cancel, true)
    doc.addEventListener('keydown', key, true)
    win.addEventListener('blur', blur)
    handle.addEventListener('lostpointercapture', lost)
  }

  const host = workspaceRef.current?.ownerDocument.body
  return <>
    <div className={styles.separator} role="separator" aria-label="Resize left panel" aria-orientation="vertical" title="Drag to resize panel; double-click to reset"
      aria-valuemin={MIN_WIDTH} aria-valuemax={size.max} aria-valuenow={size.width} aria-valuetext={`${size.width} pixels wide`}
      aria-controls="unsteady-builder-panel" aria-describedby={description} tabIndex={0} data-resizing={dragging || undefined} onPointerDown={start}
      onDoubleClick={() => { if (!cleanup.current) { remember(DEFAULT_WIDTH); apply(DEFAULT_WIDTH) } }}
      onKeyDown={event => {
        if (cleanup.current || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        event.preventDefault(); event.stopPropagation()
        const step = event.shiftKey ? 50 : 10
        remember(apply(event.key === 'Home' ? MIN_WIDTH : event.key === 'End' ? size.max : current.current + (event.key === 'ArrowLeft' ? -step : step)))
      }}>
      <span className={styles.grip} aria-hidden="true" />
      <span className={styles.instructions} id={description}>Use Left and Right arrows to resize, Shift for larger steps, Home or End for limits. Double-click to reset. Escape cancels a drag.</span>
    </div>
    {dragging && host && createPortal(<div className={styles.shield} data-unsteady-resize-shield aria-hidden="true" />, host)}
  </>
}
