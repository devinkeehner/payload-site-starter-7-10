'use client'

import { useEffect, useRef } from 'react'
import './live-editor.module.css'
import './live-editor-lexical.module.css'

/** Signal readiness only after this empty route hydrates. The parent owns all
 * portal children, so Next never receives private page content as route props. */
export function LiveEmailCanvasMount({ fontClassName = '' }: { fontClassName?: string }) {
  const mount = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = mount.current
    if (!element) return
    const doc = element.ownerDocument
    const fonts = fontClassName.split(/\s+/).filter(Boolean)
    doc.documentElement.classList.add(...fonts)
    element.dataset.liveEditorCanvasReady = 'true'
    doc.dispatchEvent(new Event('live-editor-canvas-ready'))
    return () => {
      delete element.dataset.liveEditorCanvasReady
      doc.documentElement.classList.remove(...fonts)
    }
  }, [fontClassName])
  return <div ref={mount} data-live-editor-canvas-mount />
}
