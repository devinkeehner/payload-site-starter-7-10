'use client'

import { useEffect, useRef, useState } from 'react'
import { createUnsteadyAgentTools, type UnsteadyAgentBinding, type UnsteadyModelContext, type UnsteadySiteTool } from '@/lib/live-editor/siteTools'
import type { PreviewScrollTarget } from './previewNavigation'

export type { UnsteadyAgentBinding, UnsteadyModelContext, UnsteadySiteTool } from '@/lib/live-editor/siteTools'

/** Register only on a supported browser API; do not add a window global backdoor. */
export async function registerUnsteadyAgentTools(context: UnsteadyModelContext, tools: UnsteadySiteTool[], controller: AbortController): Promise<() => void> {
  const registered: string[] = []
  const unregister = () => {
    for (const name of registered.splice(0)) {
      try { void Promise.resolve(context.unregisterTool?.(name)).catch(() => undefined) } catch { /* Legacy context may already be gone. */ }
    }
  }
  controller.signal.addEventListener('abort', unregister, { once: true })
  const cleanup = () => { controller.abort(); unregister() }
  try {
    for (const tool of tools) {
      if (controller.signal.aborted) break
      const pending = context.registerTool(tool, { signal: controller.signal })
      // Legacy registration is synchronous; record ownership before yielding so
      // StrictMode cleanup can unregister it before a new effect registers.
      if (pending && typeof pending.then === 'function') await pending
      registered.push(tool.name)
      if (controller.signal.aborted) { cleanup(); break }
    }
    return cleanup
  } catch (cause) { cleanup(); throw cause }
}

export function useUnsteadyAgentTools(binding: UnsteadyAgentBinding & { enabled?: boolean }) {
  const latest = useRef(binding)
  latest.current = binding
  const [status, setStatus] = useState<'unavailable' | 'ready' | 'error'>('unavailable')
  const enabled = binding.enabled !== false
  const hasUndo = Boolean(binding.undo)
  const hasRedo = Boolean(binding.redo)
  const hasPreview = Boolean(binding.preview)
  const hasSections = Boolean(binding.sections)
  const hasMedia = Boolean(binding.searchMedia)
  useEffect(() => {
    if (!enabled) { setStatus('unavailable'); return }
    // Current draft: document.modelContext + abortable registration.
    // Earlier shipped previews: navigator.modelContext + unregisterTool.
    // https://webmachinelearning.github.io/webmcp/#model-context
    const modern = (document as Document & { modelContext?: UnsteadyModelContext }).modelContext
    const legacy = (navigator as Navigator & { modelContext?: UnsteadyModelContext }).modelContext
    const context = typeof modern?.registerTool === 'function' ? modern : typeof legacy?.registerTool === 'function' && typeof legacy.unregisterTool === 'function' ? legacy : undefined
    if (!context) { setStatus('unavailable'); return }
    const controller = new AbortController()
    let disposed = false
    let cleanup: (() => void) | undefined
    const tools = createUnsteadyAgentTools({ getState: () => latest.current.getState(), commit: result => latest.current.commit(result),
      ...(hasUndo ? { undo: () => latest.current.undo?.() } : {}), ...(hasRedo ? { redo: () => latest.current.redo?.() } : {}),
      ...(hasMedia ? { searchMedia: (kind, query) => latest.current.searchMedia!(kind, query) } : {}),
      ...(hasSections ? { sections: { save: (name, section) => latest.current.sections!.save(name, section) } } : {}),
      ...(hasPreview ? { preview: { read: () => latest.current.preview!.read(), scroll: (target: PreviewScrollTarget) => latest.current.preview!.scroll(target) } } : {}),
    }, controller.signal)
    void registerUnsteadyAgentTools(context, tools, controller).then(remove => {
      cleanup = remove
      if (disposed) remove()
      else setStatus('ready')
    }).catch(() => { if (!disposed) setStatus('error') })
    return () => { disposed = true; controller.abort(); cleanup?.() }
  }, [enabled, hasUndo, hasRedo, hasPreview, hasSections, hasMedia])
  return { available: status === 'ready', status }
}
