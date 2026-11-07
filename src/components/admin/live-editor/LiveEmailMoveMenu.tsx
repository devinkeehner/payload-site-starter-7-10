'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import styles from './live-editor.module.css'

export function LiveEmailMoveMenu({ id, label, onClose, children }: { id: string; label: string; onClose: () => void; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const dialog = root.current
    const trigger = dialog?.ownerDocument.querySelector<HTMLElement>(`[data-unsteady-move="${CSS.escape(id)}"]`)
    dialog?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
    return () => { if (trigger?.isConnected) trigger.focus({ preventScroll: true }) }
  }, [id])
  return <div ref={root} id={`move-menu-${id}`} className={styles.moveMenu} role="dialog" aria-label={`Move ${label} to`}
    onClick={event => event.stopPropagation()} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose() }
    }}>
    <div><strong>Move to</strong><button type="button" aria-label="Close move menu" onClick={onClose}><X size={14} /></button></div>
    {children}
  </div>
}
