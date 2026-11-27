import { captureCanvasTool } from '@/lib/live-editor/designChatTools'
import { MAX_CHAT_IMAGE } from '@/lib/live-editor/designChatProtocol'
import { getLiveEmailCanvasMount } from './LiveEmailViewport'
import { readUnsteadyPreview, scrollUnsteadyPreview } from './previewNavigation'

const transparentPixel = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='

const afterLayout = async (signal: AbortSignal) => {
  await new Promise<void>(resolve => {
    const timer = window.setTimeout(resolve, 150)
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => { window.clearTimeout(timer); resolve() }))
  })
  signal.throwIfAborted()
}

async function waitForVisibleMedia(page: HTMLElement, viewportHeight: number, signal: AbortSignal) {
  const selector = '[data-unsteady-block-type="sectionImage"], [data-unsteady-block-type="sectionGallery"]'
  const deadline = performance.now() + 900
  while (performance.now() < deadline) {
    const waiting = Array.from(page.querySelectorAll<HTMLElement>(selector)).some(block => {
      const bounds = block.getBoundingClientRect()
      if (bounds.top >= viewportHeight || bounds.bottom < 0) return false
      const images = Array.from(block.querySelectorAll('img'))
      return !images.length || images.some(image => !image.complete)
    })
    if (!waiting) return
    await afterLayout(signal)
  }
}

export async function captureDesignCanvas({
  container, input, setWidth, readRevision, signal,
}: {
  container: HTMLElement | null
  input: unknown
  setWidth: (width: 'desktop' | 'mobile') => void
  readRevision: () => number
  signal: AbortSignal
}) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
    Object.keys(input).some(key => !Object.hasOwn(captureCanvasTool.inputSchema.properties, key))) throw new Error('Choose a block or preview size.')
  const { blockId, viewport } = input as { blockId?: unknown; viewport?: unknown }
  if (blockId !== undefined && (typeof blockId !== 'string' || !blockId)) throw new Error('Choose an existing block ID.')
  if (viewport !== undefined && viewport !== 'current' && viewport !== 'desktop' && viewport !== 'mobile') throw new Error('Choose the desktop or mobile canvas.')
  signal.throwIfAborted()
  const revision = readRevision()
  const frame = container?.querySelector<HTMLIFrameElement>('iframe[data-unsteady-viewport]')
  const mount = frame && getLiveEmailCanvasMount(frame)
  const page = mount?.querySelector<HTMLElement>('[data-unsteady-frame-root]')
  if (!frame || !page) throw new Error('The editor canvas is still loading.')
  const original = frame.dataset.unsteadyViewport
  const size = viewport === 'desktop' || viewport === 'mobile' ? viewport : undefined
  if (size) setWidth(size)
  try {
    await afterLayout(signal)
    if (size && frame.dataset.unsteadyViewport !== size) throw new Error('The requested canvas size is still loading.')
    if (blockId) scrollUnsteadyPreview(container, { blockId })
    await afterLayout(signal)
    await waitForVisibleMedia(page, frame.clientHeight, signal)
    const geometry = readUnsteadyPreview(container)
    const { width, height } = geometry.viewport
    if (!width || !height) throw new Error('Open the canvas before taking a screenshot.')
    const scale = Math.min(1, 1280 / width, 900 / height)
    const { toJpeg } = await import('html-to-image')
    let omittedImages = 0
    const screenshot = await toJpeg(page, {
      width, height,
      canvasWidth: Math.round(width * scale), canvasHeight: Math.round(height * scale),
      pixelRatio: 1, quality: .8, backgroundColor: '#ffffff', skipFonts: true,
      fetchRequestInit: { signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]) },
      style: { transform: `translateY(-${geometry.scroll.top}px)`, minHeight: '0', height: 'auto' },
      filter: node => !node.matches?.('[data-design-chat-chrome], iframe, video'),
      imagePlaceholder: transparentPixel,
      onImageErrorHandler(event) {
        omittedImages++
        const image = typeof event === 'object' ? event.target as HTMLImageElement | null : null
        if (image?.tagName === 'IMG') { image.onerror = null; image.src = transparentPixel }
      },
    }).catch(cause => {
      if (cause instanceof Error) throw cause
      throw new Error('The browser could not draw this canvas. Use the layout measurements to review it.')
    })
    signal.throwIfAborted()
    if (readRevision() !== revision) throw new Error('The draft changed during capture. Inspect the latest revision and try again.')
    if (screenshot.length > MAX_CHAT_IMAGE) throw new Error('This canvas image is too large. Try a narrower preview.')
    return { screenshot, info: { revision, size: frame.dataset.unsteadyViewport, originalSize: original, omittedImages, ...geometry } }
  } finally {
    if (size && original && original !== size && frame.dataset.unsteadyViewport === size) {
      setWidth(original === 'mobile' ? 'mobile' : 'desktop')
    }
  }
}
