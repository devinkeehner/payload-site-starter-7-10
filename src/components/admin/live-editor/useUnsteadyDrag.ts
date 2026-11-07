'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'

export type DragItem = { kind: 'block'; id: string; label: string } | { kind: 'palette'; type: string; label: string }
export type DropTarget = { slotId: string; index: number }
export type DragState = { item: DragItem; x: number; y: number; target: DropTarget | null }
type Point = { x: number; y: number }
const FRAME_SELECTOR = 'iframe[data-unsteady-viewport]'

function frameDocument(frame: HTMLIFrameElement): Document | null {
  try { return frame.contentDocument } catch { return null }
}

function canvasDocuments(container: HTMLElement | null): Document[] {
  if (!container) return []
  const documents = [container.ownerDocument]
  const visit = (parent: ParentNode) => {
    for (const frame of Array.from(parent.querySelectorAll<HTMLIFrameElement>(FRAME_SELECTOR))) {
      const child = frameDocument(frame)
      if (!child || documents.includes(child)) continue
      documents.push(child)
      visit(child)
    }
  }
  visit(container)
  return documents
}

export function findUnsteadyCanvasElement(container: HTMLElement | null, selector: string): HTMLElement | null {
  const direct = container?.querySelector<HTMLElement>(selector)
  if (direct) return direct
  for (const doc of canvasDocuments(container).slice(1)) {
    const match = doc.querySelector<HTMLElement>(selector)
    if (match) return match
  }
  return null
}

function canvasElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return []
  return [
    ...Array.from(container.querySelectorAll<HTMLElement>('[data-unsteady-block]')),
    ...canvasDocuments(container).slice(1).flatMap(doc => Array.from(doc.querySelectorAll<HTMLElement>('[data-unsteady-block]'))),
  ]
}

/** Coordinates stay in the outer viewport even when pointer capture delivers
 * events in the mobile frame. Inverse transforms also support scaled previews. */
export function pointToUnsteadyRoot(point: Point, source: Document, root: Document): Point {
  let current = source
  let translated = point
  while (current !== root) {
    const frame = current.defaultView?.frameElement as HTMLIFrameElement | null
    if (!frame) break
    const rect = frame.getBoundingClientRect()
    const scaleX = frame.offsetWidth ? rect.width / frame.offsetWidth : 1
    const scaleY = frame.offsetHeight ? rect.height / frame.offsetHeight : 1
    translated = { x: rect.left + (translated.x + frame.clientLeft) * scaleX, y: rect.top + (translated.y + frame.clientTop) * scaleY }
    current = frame.ownerDocument
  }
  return translated
}

function pointInsideFrame(point: Point, frame: HTMLIFrameElement): Point {
  const rect = frame.getBoundingClientRect()
  const scaleX = frame.offsetWidth ? rect.width / frame.offsetWidth : 1
  const scaleY = frame.offsetHeight ? rect.height / frame.offsetHeight : 1
  return { x: (point.x - rect.left) / scaleX - frame.clientLeft, y: (point.y - rect.top) / scaleY - frame.clientTop }
}

type Hit = { element: Element; document: Document; point: Point }
function hitElements(document: Document, point: Point): Hit[] {
  const hits: Hit[] = []
  for (const element of document.elementsFromPoint(point.x, point.y)) {
    if (element.matches(FRAME_SELECTOR)) {
      const frame = element as HTMLIFrameElement
      const child = frameDocument(frame)
      if (child) hits.push(...hitElements(child, pointInsideFrame(point, frame)))
    }
    hits.push({ element, document, point })
  }
  return hits
}

function scrollNearEdge(scroll: Element, point: Point, bounds: { left: number; right: number; top: number; bottom: number }): boolean {
  if (point.x < bounds.left || point.x > bounds.right || point.y < bounds.top - 64 || point.y > bounds.bottom + 64) return false
  const delta = point.y < bounds.top + 64 ? -Math.min(20, (bounds.top + 64 - point.y) / 3)
    : point.y > bounds.bottom - 64 ? Math.min(20, (point.y - bounds.bottom + 64) / 3) : 0
  const previous = scroll.scrollTop
  scroll.scrollTop += delta
  return scroll.scrollTop !== previous
}

/** One pointer transaction spans the outer editor and its same-origin viewport. */
export function useUnsteadyDrag({ canDrop, onDrop, onCancel, scroller, revision }: {
  canDrop: (item: DragItem, target: DropTarget) => boolean
  onDrop: (item: DragItem, target: DropTarget) => void
  onCancel: () => void
  scroller: RefObject<HTMLElement | null>
  revision: number
}) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const latest = useRef({ canDrop, onDrop, onCancel })
  latest.current = { canDrop, onDrop, onCancel }
  const cleanup = useRef<(() => void) | null>(null)
  const positions = useRef(new Map<string, Point>())
  const suppressClickUntil = useRef(0)

  const measure = useCallback(() => {
    const root = scroller.current?.ownerDocument
    if (!root) return
    positions.current = new Map(canvasElements(scroller.current).map(element => {
      const rect = element.getBoundingClientRect()
      return [element.dataset.unsteadyBlock!, pointToUnsteadyRoot({ x: rect.left, y: rect.top }, element.ownerDocument, root)]
    }))
  }, [scroller])

  useLayoutEffect(() => {
    if (!positions.current.size) return
    const root = scroller.current?.ownerDocument
    if (root && !root.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const element of canvasElements(scroller.current)) {
        const previous = positions.current.get(element.dataset.unsteadyBlock!)
        const rect = element.getBoundingClientRect()
        const point = pointToUnsteadyRoot({ x: rect.left, y: rect.top }, element.ownerDocument, root)
        if (previous) {
          const dx = previous.x - point.x
          const dy = previous.y - point.y
          if (Math.abs(dx) + Math.abs(dy) > 2) element.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration: 230, easing: 'cubic-bezier(.2,.7,.2,1)' })
        } else element.animate([{ opacity: .35, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 240 })
      }
    }
    positions.current.clear()
  }, [revision, scroller])

  useEffect(() => () => cleanup.current?.(), [])

  const start = useCallback((event: ReactPointerEvent<HTMLElement>, item: DragItem) => {
    // A second touch must not take over an existing pointer transaction.
    if (event.button !== 0 || cleanup.current) return
    event.stopPropagation()
    event.preventDefault()
    const handle = event.currentTarget
    const root = scroller.current?.ownerDocument || handle.ownerDocument
    const win = root.defaultView
    if (!win) return
    const documents = canvasDocuments(scroller.current)
    if (!documents.includes(root)) documents.push(root)
    if (!documents.includes(handle.ownerDocument)) documents.push(handle.ownerDocument)
    const pointerId = event.pointerId
    const origin = pointToUnsteadyRoot({ x: event.clientX, y: event.clientY }, handle.ownerDocument, root)
    let point = origin
    let active = false
    let cancelled = false
    let frame = 0
    handle.focus({ preventScroll: true })
    try { handle.setPointerCapture(pointerId) } catch { /* Document listeners remain available. */ }

    const markDragging = (value: boolean) => documents.forEach(doc => {
      if (value) doc.documentElement.setAttribute('data-unsteady-dragging', 'true')
      else doc.documentElement.removeAttribute('data-unsteady-dragging')
    })
    const hitTarget = (): DropTarget | null => {
      const seen = new Set<string>()
      for (const { element, point: local } of hitElements(root, point)) {
        const zone = element.closest<HTMLElement>('[data-unsteady-zone]')
        if (!zone) continue
        const slotId = zone.dataset.unsteadyZone!
        if (seen.has(slotId)) continue
        seen.add(slotId)
        const items = Array.from(zone.children).filter(child => child.hasAttribute('data-unsteady-drop-item'))
        const index = items.findIndex(child => { const rect = child.getBoundingClientRect(); return local.y < rect.top + rect.height / 2 })
        const target = { slotId, index: index < 0 ? items.length : index }
        try { if (latest.current.canDrop(item, target)) return target } catch { /* A concurrent edit invalidated this destination. */ }
      }
      return null
    }
    const tick = () => {
      if (!active || cancelled) return
      const hits = hitElements(root, point)
      const inside = hits.find(hit => hit.document !== root)
      if (inside?.document.scrollingElement && inside.document.defaultView) {
        const childWindow = inside.document.defaultView
        scrollNearEdge(inside.document.scrollingElement, inside.point, { left: 0, top: 0, right: childWindow.innerWidth, bottom: childWindow.innerHeight })
      } else if (scroller.current) scrollNearEdge(scroller.current, point, scroller.current.getBoundingClientRect())
      const target = hitTarget()
      setDrag(previous => previous && previous.x === point.x && previous.y === point.y && previous.target?.slotId === target?.slotId && previous.target?.index === target?.index
        ? previous : { item, ...point, target })
      frame = win.requestAnimationFrame(tick)
    }
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId || cancelled) return
      point = pointToUnsteadyRoot({ x: next.clientX, y: next.clientY }, (next.currentTarget as Document), root)
      if (!active && Math.hypot(point.x - origin.x, point.y - origin.y) >= 5) {
        active = true
        markDragging(true)
        documents.forEach(doc => doc.getSelection()?.removeAllRanges())
        tick()
      }
    }
    const clear = () => {
      win.cancelAnimationFrame(frame)
      for (const doc of documents) {
        doc.removeEventListener('pointermove', move, true)
        doc.removeEventListener('pointerup', up, true)
        doc.removeEventListener('pointercancel', cancel, true)
        doc.removeEventListener('keydown', key, true)
      }
      win.removeEventListener('blur', blur)
      markDragging(false)
      try { if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId) } catch { /* Frame may have unmounted. */ }
      setDrag(null)
      cleanup.current = null
    }
    const suppressTrailingClick = () => {
      suppressClickUntil.current = Date.now() + 350
      const release = () => documents.forEach(doc => doc.removeEventListener('click', stop, true))
      const stop = (click: MouseEvent) => {
        // Keyboard activation is independent of the pointer gesture.
        if (click.detail === 0) return
        click.preventDefault(); click.stopImmediatePropagation(); release()
      }
      documents.forEach(doc => doc.addEventListener('click', stop, true))
      win.setTimeout(release, 400)
    }
    const up = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return
      if (active || cancelled) {
        point = pointToUnsteadyRoot({ x: next.clientX, y: next.clientY }, (next.currentTarget as Document), root)
        next.preventDefault(); next.stopPropagation()
        suppressTrailingClick()
        const target = cancelled ? null : hitTarget()
        const wasCancelled = cancelled
        if (!wasCancelled) measure()
        clear()
        if (target) latest.current.onDrop(item, target)
        else if (!wasCancelled) latest.current.onCancel()
      } else clear()
    }
    const cancel = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return
      const notify = active && !cancelled
      clear()
      if (notify) latest.current.onCancel()
    }
    const key = (next: KeyboardEvent) => {
      if (next.key !== 'Escape' || cancelled) return
      next.preventDefault(); next.stopPropagation()
      cancelled = true
      win.cancelAnimationFrame(frame)
      markDragging(false)
      setDrag(null)
      latest.current.onCancel()
      // Retain capture/listeners until this pointer is physically released.
      // Otherwise its delayed click can insert a block after Escape cancelled it.
    }
    const blur = () => { const notify = active && !cancelled; clear(); if (notify) latest.current.onCancel() }
    for (const doc of documents) {
      doc.addEventListener('pointermove', move, true)
      doc.addEventListener('pointerup', up, true)
      doc.addEventListener('pointercancel', cancel, true)
      doc.addEventListener('keydown', key, true)
    }
    win.addEventListener('blur', blur)
    cleanup.current = clear
  }, [measure, scroller])

  const skipClick = useCallback(() => Date.now() < suppressClickUntil.current, [])
  return { drag, start, measure, skipClick }
}
