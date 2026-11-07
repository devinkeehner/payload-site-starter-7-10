'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import styles from './live-editor.module.css'

export const UNSTEADY_CANVAS_URL = '/live-editor/canvas'

/** Only the dedicated, hydrated frame may receive private editor content. */
export function getLiveEmailCanvasMount(frame: HTMLIFrameElement): HTMLElement | null {
  try {
    const doc = frame.contentDocument
    if (!doc || new URL(doc.URL).origin !== new URL(frame.ownerDocument.URL).origin || new URL(doc.URL).pathname !== UNSTEADY_CANVAS_URL) return null
    return doc.querySelector<HTMLElement>('[data-live-editor-canvas-mount][data-live-editor-canvas-ready="true"]')
  } catch { return null }
}

/** The same frontend stylesheet document serves both sizes. Resizing preserves
 * its portal, text selection, and document state; Payload styles never enter it. */
export function LiveEmailViewport({ children, mobile, theme }: {
  children: ReactNode
  mobile: boolean
  theme: 'light' | 'dark'
}) {
  const [frame, setFrame] = useState<HTMLIFrameElement | null>(null)
  const [frameDocument, setFrameDocument] = useState<Document | null>(null)
  const [mount, setMount] = useState<HTMLElement | null>(null)
  const [failed, setFailed] = useState(false)
  const [load, setLoad] = useState(0)

  useEffect(() => {
    if (!frame || failed || mount && getLiveEmailCanvasMount(frame) === mount) return
    const win = frame.ownerDocument.defaultView
    if (!win) return
    const timers: { interval?: number; timeout?: number } = {}
    const stop = () => { win.clearInterval(timers.interval); win.clearTimeout(timers.timeout) }
    const scan = () => {
      const target = getLiveEmailCanvasMount(frame)
      if (!target) return false
      stop()
      setFrameDocument(target.ownerDocument)
      setMount(target)
      return true
    }
    // Hydration can finish before load (for example, while dev assets are still
    // pending). Discover only the guarded mount without waiting for that event.
    if (scan()) return
    timers.interval = win.setInterval(scan, 100)
    timers.timeout = win.setTimeout(() => {
      if (!scan()) { stop(); setFailed(true) }
    }, 30_000)
    return stop
  }, [frame, failed, mount])

  useEffect(() => {
    if (!frame || !frameDocument || failed) return
    const ready = () => {
      const target = getLiveEmailCanvasMount(frame)
      if (target) setMount(target)
    }
    ready()
    frameDocument.addEventListener('live-editor-canvas-ready', ready)
    // Native listeners in the host do not receive iframe key events. Forward
    // document shortcuts while leaving the text editor's own undo untouched.
    const shortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      const key = event.key.toLowerCase()
      if (key !== 'escape' && (!(event.ctrlKey || event.metaKey) || !['s', 'z', 'y'].includes(key))) return
      const target = event.target as Element | null
      if (!['s', 'escape'].includes(key) && target?.closest?.('input,textarea,select,[contenteditable="true"]')) return
      const forwarded = new KeyboardEvent('keydown', {
        key: event.key, code: event.code, ctrlKey: event.ctrlKey, metaKey: event.metaKey,
        shiftKey: event.shiftKey, altKey: event.altKey, bubbles: true, cancelable: true,
      })
      if (!frame.dispatchEvent(forwarded)) event.preventDefault()
    }
    frameDocument.addEventListener('keydown', shortcut)
    return () => {
      frameDocument.removeEventListener('live-editor-canvas-ready', ready)
      frameDocument.removeEventListener('keydown', shortcut)
    }
  }, [frame, frameDocument, failed])

  useEffect(() => {
    mount?.ownerDocument.documentElement.setAttribute('data-unsteady-theme', theme)
  }, [mount, theme])

  const readyMount = frame && mount && getLiveEmailCanvasMount(frame) === mount ? mount : null
  return <>
    {!readyMount && !failed && <div role="status">Loading email canvas…</div>}
    {failed && <div role="alert">The email canvas could not load. Your edits remain in the editor. <button type="button" onClick={() => {
      setFailed(false); setMount(null); setFrameDocument(null); setLoad(value => value + 1)
    }}>Retry canvas</button></div>}
    <iframe
      key={load}
      ref={setFrame}
      data-unsteady-viewport={mobile ? 'mobile' : 'desktop'}
      title={mobile ? 'Mobile email canvas' : 'Desktop email canvas'}
      src={UNSTEADY_CANVAS_URL}
      onLoad={event => {
        const doc = event.currentTarget.contentDocument
        // A late load must not tear down an already hydrated portal.
        setMount(getLiveEmailCanvasMount(event.currentTarget)); setFrameDocument(doc)
        setFailed(!doc?.querySelector('[data-live-editor-canvas-mount]'))
      }}
      onError={() => setFailed(true)}
      style={{ display: failed ? 'none' : 'block', width: mobile ? 390 : 640, maxWidth: '100%', height: '100%', minHeight: 0, flex: '1 1 0', margin: '0 auto', border: 0, background: 'transparent' }}
    />
    {readyMount && createPortal(
      <div className={styles.editor} data-unsteady-frame-root data-unsteady-theme={theme} data-theme={theme}
        style={{ height: 'auto', minHeight: '100vh', overflow: 'visible', display: 'block', background: 'transparent' }}>{children}</div>,
      readyMount,
    )}
  </>
}
