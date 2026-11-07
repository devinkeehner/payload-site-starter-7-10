import { getLiveEmailCanvasMount } from './LiveEmailViewport'

export type PreviewScrollTarget = { blockId: string | number; direction?: never } | {
  direction: 'up' | 'down' | 'top' | 'bottom'; blockId?: never
}

function previewCanvas(container: HTMLElement | null) {
  const frame = container?.querySelector<HTMLIFrameElement>('iframe[data-unsteady-viewport]')
  const mount = frame && getLiveEmailCanvasMount(frame)
  const doc = mount?.ownerDocument
  const win = doc?.defaultView
  const scroll = doc?.scrollingElement
  if (!mount || !win || !scroll) throw new Error('The email canvas is not ready. Wait for it to load, then try again.')
  return { mount, win, scroll }
}

/** Only inspect the dedicated hydrated canvas, never the admin or sidebar scroll. */
export function readUnsteadyPreview(container: HTMLElement | null) {
  const { mount, win, scroll } = previewCanvas(container)
  const top = scroll.scrollTop
  const height = win.innerHeight
  const maxTop = Math.max(0, scroll.scrollHeight - height)
  const blocks = Array.from(mount.querySelectorAll<HTMLElement>('[data-unsteady-block]'))
  return {
    viewport: { width: win.innerWidth, height },
    scroll: { top, height: scroll.scrollHeight, maxTop, atTop: top <= 1, atBottom: top >= maxTop - 1 },
    visibleBlocks: blocks.flatMap(block => {
      const rect = block.getBoundingClientRect()
      return rect.height > 0 && rect.width > 0 && rect.bottom > 0 && rect.top < height && rect.right > 0 && rect.left < win.innerWidth
        ? [{ id: block.dataset.unsteadyBlock!, blockType: block.dataset.unsteadyBlockType, top: Math.round(rect.top), bottom: Math.round(rect.bottom) }]
        : []
    }).slice(0, 100),
  }
}

export function scrollUnsteadyPreview(container: HTMLElement | null, target: PreviewScrollTarget) {
  const { mount, win, scroll } = previewCanvas(container)
  let top: number
  if (target.blockId !== undefined) {
    const block = Array.from(mount.querySelectorAll<HTMLElement>('[data-unsteady-block]')).find(element => element.dataset.unsteadyBlock === String(target.blockId))
    const rect = block?.getBoundingClientRect()
    if (!rect || rect.width <= 0 || rect.height <= 0) throw new Error('This block is not rendered in the canvas. It may have been removed or be inside an inactive grid column; choose its column layout first.')
    top = scroll.scrollTop + rect.top - 16
  } else {
    const step = Math.max(1, win.innerHeight * 0.8)
    switch (target.direction) {
      case 'top': top = 0; break
      case 'bottom': top = scroll.scrollHeight; break
      case 'up': top = scroll.scrollTop - step; break
      case 'down': top = scroll.scrollTop + step; break
      default: throw new Error('Choose a blockId or a preview scroll direction.')
    }
  }
  // Instant positioning means the returned geometry and the next screenshot agree,
  // including when the site enables smooth scrolling. Do not focus text or select a block.
  win.scrollTo({ top: Math.max(0, Math.min(top, scroll.scrollHeight - win.innerHeight)), behavior: 'instant' })
  return readUnsteadyPreview(container)
}
