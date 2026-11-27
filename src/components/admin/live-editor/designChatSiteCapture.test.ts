import { afterEach, expect, it, vi } from 'vitest'
import type { UnsteadyAgentBinding } from '@/lib/live-editor/siteTools'
import { captureDesignSite } from './designChatSiteCapture'

const origin = 'https://www.example.test'

function setup() {
  const window = new EventTarget()
  const frame = { style: { cssText: '' }, inert: false, setAttribute: vi.fn(), remove: vi.fn(), contentWindow: { postMessage: vi.fn() } }
  let signalStaged!: () => void
  const staged = new Promise<void>(resolve => { signalStaged = resolve })
  const deadline = new AbortController()
  vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ url: origin + '/preview' })))
  vi.stubGlobal('window', window)
  vi.stubGlobal('document', { createElement: () => frame, body: { appendChild: signalStaged } })
  const binding = { getState: () => ({ revision: 1, document: { layout: [] } }) } as unknown as UnsteadyAgentBinding
  const result = captureDesignSite({
    apiURL: '/api/test', binding, call: { id: 'call', name: 'capture', arguments: { viewport: 'mobile' } },
    signal: new AbortController().signal,
  })
  const receive = (data: unknown, site = origin) => {
    window.dispatchEvent(Object.assign(new Event('message'), { data, origin: site, source: frame.contentWindow }))
  }
  return { staged, deadline, frame, receive, result }
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('keeps the invisible cross-origin frame in the viewport so its JPEG renderer can receive animation frames', async () => {
  const { staged, frame, receive, result } = setup()
  await staged
  expect(frame.style.cssText).toContain('left:0;top:0;')
  expect(frame.style.cssText).toContain('opacity:0;')
  expect(frame.style.cssText).toContain('width:390px;')
  expect(frame.inert).toBe(true)
  receive({ type: 'design-preview-ready' }, 'https://other.example.test')
  expect(frame.contentWindow.postMessage).not.toHaveBeenCalled()
  receive({ type: 'design-preview-ready' })
  expect(frame.contentWindow.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'design-preview-capture' }), origin)
  const image = { screenshot: 'data:image/jpeg;base64,abc', info: { revision: 1 } }
  receive({ type: 'design-preview-result', ...image })
  await expect(result).resolves.toEqual(image)
  expect(frame.remove).toHaveBeenCalledOnce()
})

it.each([
  { ready: false, error: /before it was ready/ },
  { ready: true, error: /while drawing its screenshot/ },
])('reports the timeout phase and removes the preview when ready=$ready', async ({ ready, error }) => {
  const { staged, frame, receive, result, deadline } = setup()
  await staged
  if (ready) receive({ type: 'design-preview-ready' })
  deadline.abort()
  await expect(result).rejects.toThrow(error)
  expect(frame.remove).toHaveBeenCalledOnce()
})
