import type { UnsteadyAgentBinding } from '@/lib/live-editor/siteTools'
import { MAX_CHAT_IMAGE, type DesignToolCall } from '@/lib/live-editor/designChatProtocol'

export async function captureDesignSite({ apiURL, binding, call, signal }: {
  apiURL: string
  binding: UnsteadyAgentBinding
  call: DesignToolCall
  signal: AbortSignal
}): Promise<{ screenshot: string; info: unknown }> {
  const { revision, document: draft } = binding.getState()
  const args = call.arguments as { viewport?: unknown; heading?: unknown; position?: unknown } | null
  const mobile = args?.viewport === 'mobile'
  const response = await fetch(`${apiURL}/design-chat/preview`, {
    method: 'POST', credentials: 'same-origin', signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callId: call.id, layout: draft.layout ?? [], title: typeof draft.title === 'string' ? draft.title : undefined, revision }),
  })
  const result = await response.json().catch(() => null)
  if (!response.ok || typeof result?.url !== 'string') throw new Error(result?.error || 'The website preview could not start.')
  signal.throwIfAborted()
  const url = new URL(result.url)
  const frame = document.createElement('iframe')
  frame.title = 'Design assistant website preview'
  frame.setAttribute('aria-hidden', 'true')
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin')
  frame.tabIndex = -1
  frame.referrerPolicy = 'no-referrer'
  frame.style.cssText = `position:fixed;left:-1600px;top:0;width:${mobile ? 390 : 1440}px;height:900px;border:0;pointer-events:none;`
  const captureSignal = AbortSignal.any([signal, AbortSignal.timeout(24_000)])
  try {
    const preview = await new Promise<{ screenshot: string; info: unknown }>((resolve, reject) => {
      captureSignal.throwIfAborted()
      const receive = (event: MessageEvent) => {
        if (event.origin !== url.origin || event.source !== frame.contentWindow) return
        if (event.data?.type === 'design-preview-ready') {
          frame.contentWindow?.postMessage({
            type: 'design-preview-capture',
            heading: typeof args?.heading === 'string' ? args.heading.slice(0, 180) : undefined,
            position: args?.position,
          }, url.origin)
          return
        }
        if (event.data?.type !== 'design-preview-result') return
        dispose()
        if (typeof event.data.screenshot !== 'string' || event.data.screenshot.length > MAX_CHAT_IMAGE || event.data.info?.revision !== revision) {
          reject(new Error(typeof event.data.error === 'string' ? event.data.error : 'Unable to draw the website preview.'))
        } else resolve({ screenshot: event.data.screenshot, info: event.data.info })
      }
      const stop = () => {
        dispose()
        reject(new Error('The website preview did not respond. Use the editor canvas and report that the site preview was unavailable.'))
      }
      const dispose = () => {
        window.removeEventListener('message', receive)
        captureSignal.removeEventListener('abort', stop)
      }
      window.addEventListener('message', receive)
      captureSignal.addEventListener('abort', stop, { once: true })
      frame.src = url.href
      document.body.appendChild(frame)
    })
    if (binding.getState().revision !== revision) throw new Error('The draft changed during capture. Inspect the latest revision.')
    return preview
  } finally {
    frame.remove()
  }
}
