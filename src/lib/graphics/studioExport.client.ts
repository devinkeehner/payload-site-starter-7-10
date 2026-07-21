import type { GraphicImageLayer, GraphicScene, GraphicTextLayer } from './studioTypes'

export const GRAPHIC_EXPORT_DPI = 300

export function sanitizeGraphicRichHtml(html: string) {
  if (typeof window === 'undefined') return html
  const parsedDocument = new DOMParser().parseFromString(html, 'text/html')
  parsedDocument.querySelectorAll('script,style,iframe,object,embed').forEach((node) => node.remove())
  parsedDocument.querySelectorAll('*').forEach((node) => {
    for (const attribute of Array.from(node.attributes)) {
      if (attribute.name.toLowerCase().startsWith('on')) node.removeAttribute(attribute.name)
      if ((attribute.name === 'href' || attribute.name === 'src') && /^javascript:/i.test(attribute.value)) {
        node.removeAttribute(attribute.name)
      }
    }
  })
  // HTML serializers preserve `&nbsp;`, but standalone SVG is parsed as XML and
  // does not define that named entity. Use the numeric form so rich text can be
  // decoded reliably when the SVG is rendered into a PNG.
  return parsedDocument.body.innerHTML.replace(/&nbsp;/gi, '&#160;')
}
function escapeXml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

type SvgTextStyle = {
  color: string
  fontStyle: 'italic' | 'normal'
  fontWeight: number
  strike: boolean
  underline: boolean
}

type SvgTextRun = {
  style: SvgTextStyle
  text: string
}

type SvgTextBlock = {
  align: GraphicTextLayer['textAlign']
  fontScale: number
  indent: number
  lineHeight: number
  marginBottom: number
  marginTop: number
  runs: SvgTextRun[]
}

const BLOCK_TEXT_METRICS: Record<
  string,
  Pick<SvgTextBlock, 'fontScale' | 'lineHeight' | 'marginBottom' | 'marginTop'> & { fontWeight: number }
> = {
  h1: { fontScale: 2, fontWeight: 800, lineHeight: 0.95, marginBottom: 0.22, marginTop: 0 },
  h2: { fontScale: 1.6, fontWeight: 800, lineHeight: 1, marginBottom: 0.22, marginTop: 0 },
  h3: { fontScale: 1.3, fontWeight: 750, lineHeight: 1.05, marginBottom: 0.24, marginTop: 0 },
  h4: { fontScale: 1.1, fontWeight: 700, lineHeight: 1.1, marginBottom: 0.25, marginTop: 0 },
  p: { fontScale: 1, fontWeight: 400, lineHeight: 1, marginBottom: 0.25, marginTop: 0 },
}

function sameTextStyle(left: SvgTextStyle, right: SvgTextStyle) {
  return (
    left.color === right.color &&
    left.fontStyle === right.fontStyle &&
    left.fontWeight === right.fontWeight &&
    left.strike === right.strike &&
    left.underline === right.underline
  )
}

function appendTextRun(runs: SvgTextRun[], text: string, style: SvgTextStyle) {
  if (!text) return
  const previous = runs[runs.length - 1]
  if (previous && sameTextStyle(previous.style, style)) {
    previous.text += text
  } else {
    runs.push({ style: { ...style }, text })
  }
}

function inlineTextStyle(element: HTMLElement, inherited: SvgTextStyle): SvgTextStyle {
  const tag = element.tagName.toLowerCase()
  const fontWeight = element.style.fontWeight
  const decoration = element.style.textDecoration
  return {
    color: element.style.color || inherited.color,
    fontStyle:
      tag === 'em' || tag === 'i' || element.style.fontStyle === 'italic' ? 'italic' : inherited.fontStyle,
    fontWeight:
      tag === 'b' || tag === 'strong' || fontWeight === 'bold'
        ? 700
        : /^\d+$/.test(fontWeight)
          ? Number(fontWeight)
          : inherited.fontWeight,
    strike:
      inherited.strike ||
      tag === 'del' ||
      tag === 's' ||
      tag === 'strike' ||
      decoration.includes('line-through'),
    underline: inherited.underline || tag === 'u' || decoration.includes('underline'),
  }
}

function collectInlineText(node: Node, style: SvgTextStyle, runs: SvgTextRun[]) {
  if (node.nodeType === Node.TEXT_NODE) {
    appendTextRun(runs, node.textContent || '', style)
    return
  }
  if (!(node instanceof HTMLElement)) return
  if (node.tagName.toLowerCase() === 'br') {
    appendTextRun(runs, '\n', style)
    return
  }
  const nextStyle = inlineTextStyle(node, style)
  node.childNodes.forEach((child) => collectInlineText(child, nextStyle, runs))
}

function richTextBlocks(layer: GraphicTextLayer): SvgTextBlock[] {
  const parsed = new DOMParser().parseFromString(sanitizeGraphicRichHtml(layer.html), 'text/html')
  const blocks: SvgTextBlock[] = []

  const addBlock = (element: HTMLElement, marker = '', indent = 0, listMargin?: { bottom: number; top: number }) => {
    const tag = BLOCK_TEXT_METRICS[element.tagName.toLowerCase()] ? element.tagName.toLowerCase() : 'p'
    const metrics = BLOCK_TEXT_METRICS[tag] ?? BLOCK_TEXT_METRICS.p!
    const baseStyle: SvgTextStyle = {
      color: element.style.color || layer.color,
      fontStyle: 'normal',
      fontWeight: metrics.fontWeight,
      strike: false,
      underline: false,
    }
    const runs: SvgTextRun[] = []
    if (marker) appendTextRun(runs, marker, baseStyle)
    element.childNodes.forEach((child) => collectInlineText(child, baseStyle, runs))
    blocks.push({
      align: (element.style.textAlign as GraphicTextLayer['textAlign']) || layer.textAlign,
      fontScale: metrics.fontScale,
      indent,
      lineHeight: tag === 'p' ? layer.lineHeight : metrics.lineHeight,
      marginBottom: listMargin?.bottom ?? metrics.marginBottom,
      marginTop: listMargin?.top ?? metrics.marginTop,
      runs,
    })
  }

  parsed.body.childNodes.forEach((node) => {
    if (node instanceof HTMLUListElement || node instanceof HTMLOListElement) {
      const items = Array.from(node.children).filter((child): child is HTMLLIElement => child instanceof HTMLLIElement)
      items.forEach((item, index) => {
        addBlock(item, node instanceof HTMLOListElement ? `${index + 1}. ` : '• ', 1.25, {
          bottom: index === items.length - 1 ? 0.3 : 0,
          top: index === 0 ? 0.2 : 0,
        })
      })
    } else if (node instanceof HTMLElement) {
      addBlock(node)
    } else if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
      const paragraph = parsed.createElement('p')
      paragraph.textContent = node.textContent
      addBlock(paragraph)
    }
  })

  return blocks
}

function measuredTextWidth(
  context: CanvasRenderingContext2D,
  fontFamily: string,
  fontSize: number,
  run: SvgTextRun,
) {
  context.font = `${run.style.fontStyle} ${run.style.fontWeight} ${fontSize}px ${fontFamily}`
  return context.measureText(run.text).width
}

function wrapTextRuns(
  context: CanvasRenderingContext2D,
  fontFamily: string,
  fontSize: number,
  maxWidth: number,
  runs: SvgTextRun[],
) {
  const lines: SvgTextRun[][] = [[]]
  let lineWidth = 0

  const pushLine = () => {
    lines.push([])
    lineWidth = 0
  }

  runs.forEach((run) => {
    const parts = run.text.replace(/\r/g, '').split(/(\n|\s+)/)
    parts.forEach((part) => {
      if (!part) return
      if (part === '\n') {
        pushLine()
        return
      }
      const isWhitespace = /^\s+$/.test(part)
      const text = isWhitespace ? ' ' : part
      const currentLine = lines[lines.length - 1]!
      if (isWhitespace && currentLine.length === 0) return
      const nextRun = { style: run.style, text }
      const width = measuredTextWidth(context, fontFamily, fontSize, nextRun)
      if (!isWhitespace && lineWidth > 0 && lineWidth + width > maxWidth) pushLine()
      const targetLine = lines[lines.length - 1]!
      if (targetLine.length === 0 && isWhitespace) return
      appendTextRun(targetLine, text, run.style)
      lineWidth += width
    })
  })

  return lines
}

function svgTextLayer(layer: GraphicTextLayer, opacity: number, transform: string) {
  const measureCanvas = document.createElement('canvas')
  const context = measureCanvas.getContext('2d')
  if (!context) throw new Error('Text measurement canvas is unavailable')
  const clipID = `graphic-text-${layer.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
  const textNodes: string[] = []
  let cursorY = layer.y

  richTextBlocks(layer).forEach((block) => {
    const fontSize = layer.fontSize * block.fontScale
    const indent = block.indent * fontSize
    const availableWidth = Math.max(1, layer.width - indent)
    cursorY += block.marginTop * fontSize
    const lines = wrapTextRuns(context, layer.fontFamily, fontSize, availableWidth, block.runs)
    lines.forEach((line) => {
      const x =
        block.align === 'center'
          ? layer.x + indent + availableWidth / 2
          : block.align === 'right'
            ? layer.x + indent + availableWidth
            : layer.x + indent
      const anchor = block.align === 'center' ? 'middle' : block.align === 'right' ? 'end' : 'start'
      const spans = line
        .map((run) => {
          const decorations = [run.style.underline ? 'underline' : '', run.style.strike ? 'line-through' : '']
            .filter(Boolean)
            .join(' ')
          return `<tspan fill="${escapeXml(run.style.color)}" font-style="${run.style.fontStyle}" font-weight="${run.style.fontWeight}"${decorations ? ` text-decoration="${decorations}"` : ''}>${escapeXml(run.text)}</tspan>`
        })
        .join('')
      textNodes.push(
        `<text x="${x}" y="${cursorY}" dominant-baseline="text-before-edge" font-family="${escapeXml(layer.fontFamily)}" font-size="${fontSize}" text-anchor="${anchor}" xml:space="preserve">${spans}</text>`,
      )
      cursorY += fontSize * block.lineHeight
    })
    cursorY += block.marginBottom * fontSize
  })

  return `<defs><clipPath id="${clipID}"><rect x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" /></clipPath></defs><g opacity="${opacity}" transform="${transform}" clip-path="url(#${clipID})">${textNodes.join('')}</g>`
}

function setCanvasTextStyle(
  context: CanvasRenderingContext2D,
  fontFamily: string,
  fontSize: number,
  style: SvgTextStyle,
) {
  context.fillStyle = style.color
  context.font = `${style.fontStyle} ${style.fontWeight} ${fontSize}px ${fontFamily}`
}

function renderCanvasTextLayer(context: CanvasRenderingContext2D, layer: GraphicTextLayer) {
  context.save()
  const centerX = layer.x + layer.width / 2
  const centerY = layer.y + layer.height / 2
  context.translate(centerX, centerY)
  context.rotate(((layer.rotation || 0) * Math.PI) / 180)
  context.translate(-centerX, -centerY)
  context.globalAlpha = layer.opacity ?? 1
  context.beginPath()
  context.rect(layer.x, layer.y, layer.width, layer.height)
  context.clip()
  context.textBaseline = 'top'

  let cursorY = layer.y
  richTextBlocks(layer).forEach((block) => {
    const fontSize = layer.fontSize * block.fontScale
    const indent = block.indent * fontSize
    const availableWidth = Math.max(1, layer.width - indent)
    cursorY += block.marginTop * fontSize
    const lines = wrapTextRuns(context, layer.fontFamily, fontSize, availableWidth, block.runs)
    lines.forEach((line) => {
      const widths = line.map((run) => measuredTextWidth(context, layer.fontFamily, fontSize, run))
      const lineWidth = widths.reduce((total, width) => total + width, 0)
      let cursorX =
        block.align === 'center'
          ? layer.x + indent + (availableWidth - lineWidth) / 2
          : block.align === 'right'
            ? layer.x + indent + availableWidth - lineWidth
            : layer.x + indent

      line.forEach((run, index) => {
        const width = widths[index] ?? 0
        setCanvasTextStyle(context, layer.fontFamily, fontSize, run.style)
        context.fillText(run.text, cursorX, cursorY)
        if (run.style.underline || run.style.strike) {
          context.save()
          context.strokeStyle = run.style.color
          context.lineWidth = Math.max(1, fontSize / 18)
          if (run.style.underline) {
            context.beginPath()
            context.moveTo(cursorX, cursorY + fontSize * 0.92)
            context.lineTo(cursorX + width, cursorY + fontSize * 0.92)
            context.stroke()
          }
          if (run.style.strike) {
            context.beginPath()
            context.moveTo(cursorX, cursorY + fontSize * 0.5)
            context.lineTo(cursorX + width, cursorY + fontSize * 0.5)
            context.stroke()
          }
          context.restore()
        }
        cursorX += width
      })
      cursorY += fontSize * block.lineHeight
    })
    cursorY += block.marginBottom * fontSize
  })
  context.restore()
}

function roundedRectanglePath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2))
  context.beginPath()
  context.moveTo(x + safeRadius, y)
  context.lineTo(x + width - safeRadius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius)
  context.lineTo(x + width, y + height - safeRadius)
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height)
  context.lineTo(x + safeRadius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius)
  context.lineTo(x, y + safeRadius)
  context.quadraticCurveTo(x, y, x + safeRadius, y)
  context.closePath()
}

async function loadCanvasImage(url: string) {
  const image = new window.Image()
  image.src = await inlineImageUrl(url)
  await image.decode()
  return image
}

function renderCanvasImageLayer(
  context: CanvasRenderingContext2D,
  layer: GraphicImageLayer,
  image: HTMLImageElement,
) {
  if (!image.naturalWidth || !image.naturalHeight) return
  if (layer.objectFit === 'contain') {
    const scale = Math.min(layer.width / image.naturalWidth, layer.height / image.naturalHeight)
    const width = image.naturalWidth * scale
    const height = image.naturalHeight * scale
    context.drawImage(image, layer.x + (layer.width - width) / 2, layer.y + (layer.height - height) / 2, width, height)
    return
  }

  const sourceRatio = image.naturalWidth / image.naturalHeight
  const destinationRatio = layer.width / layer.height
  let sourceX = 0
  let sourceY = 0
  let sourceWidth = image.naturalWidth
  let sourceHeight = image.naturalHeight
  if (sourceRatio > destinationRatio) {
    sourceWidth = image.naturalHeight * destinationRatio
    sourceX = (image.naturalWidth - sourceWidth) * clampImagePosition(layer.imagePositionX)
  } else {
    sourceHeight = image.naturalWidth / destinationRatio
    sourceY = (image.naturalHeight - sourceHeight) * clampImagePosition(layer.imagePositionY)
  }
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    layer.x,
    layer.y,
    layer.width,
    layer.height,
  )
}

function clampImagePosition(value: number | undefined) {
  return Math.min(100, Math.max(0, value ?? 50)) / 100
}

function getSvgCoverPlacement(layer: GraphicImageLayer, naturalWidth: number, naturalHeight: number) {
  const scale = Math.max(layer.width / naturalWidth, layer.height / naturalHeight)
  const width = naturalWidth * scale
  const height = naturalHeight * scale
  return {
    height,
    width,
    x: layer.x - (width - layer.width) * clampImagePosition(layer.imagePositionX),
    y: layer.y - (height - layer.height) * clampImagePosition(layer.imagePositionY),
  }
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error || new Error('Unable to read image'))
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsDataURL(blob)
  })
}

async function inlineImageUrl(url: string) {
  if (url.startsWith('data:')) return url
  const response = await fetch(url, { credentials: 'include' })
  if (!response.ok) throw new Error(`Unable to include image in export (${response.status})`)
  return blobToDataUrl(await response.blob())
}

export async function buildSelfContainedGraphicSvg(scene: GraphicScene) {
  const imageEntries = await Promise.all(
    scene.layers
      .filter((layer): layer is GraphicImageLayer => layer.type === 'image' && !layer.hidden)
      .map(async (layer) => {
        const url = await inlineImageUrl(layer.url)
        const image = new window.Image()
        image.src = url
        await image.decode()
        return [layer.id, { height: image.naturalHeight, url, width: image.naturalWidth }] as const
      }),
  )
  const imageData = new Map(imageEntries)

  const nodes = scene.layers.map((layer, index) => {
    if (layer.hidden) return ''
    const opacity = layer.opacity ?? 1
    const transform = `rotate(${layer.rotation || 0} ${layer.x + layer.width / 2} ${layer.y + layer.height / 2})`
    if (layer.type === 'image') {
      const data = imageData.get(layer.id)
      const url = data?.url || layer.url
      if (layer.objectFit === 'cover' && data?.width && data.height) {
        const placement = getSvgCoverPlacement(layer, data.width, data.height)
        const clipId = `graphic-image-clip-${index}`
        return `<g opacity="${opacity}" transform="${transform}" clip-path="url(#${clipId})"><clipPath id="${clipId}" clipPathUnits="userSpaceOnUse"><rect x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" /></clipPath><image href="${escapeXml(url)}" x="${placement.x}" y="${placement.y}" width="${placement.width}" height="${placement.height}" preserveAspectRatio="none" /></g>`
      }
      return `<image href="${escapeXml(url)}" x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" preserveAspectRatio="xMidYMid meet" opacity="${opacity}" transform="${transform}" />`
    }
    if (layer.type === 'shape') {
      if (layer.shape === 'line') {
        return `<line x1="${layer.x}" y1="${layer.y}" x2="${layer.x + layer.width}" y2="${layer.y + layer.height}" stroke="${escapeXml(layer.borderColor)}" stroke-width="${Math.max(1, layer.borderWidth)}" stroke-linecap="butt" opacity="${opacity}" />`
      }
      const radius = layer.shape === 'circle' ? Math.min(layer.width, layer.height) / 2 : layer.borderRadius
      return `<rect x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" rx="${radius}" fill="${escapeXml(layer.fill)}" stroke="${escapeXml(layer.borderColor)}" stroke-width="${layer.borderWidth}" opacity="${opacity}" transform="${transform}" />`
    }
    return svgTextLayer(layer, opacity, transform)
  })

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}" viewBox="0 0 ${scene.width} ${scene.height}"><rect width="100%" height="100%" fill="${escapeXml(scene.background)}"/>${nodes.join('')}</svg>`
}

export async function renderGraphicSceneToPngBlob(
  scene: GraphicScene,
  options?: { maxDimension?: number },
) {
  await document.fonts?.ready
  const imageEntries = await Promise.all(
    scene.layers
      .filter((layer): layer is GraphicImageLayer => layer.type === 'image' && !layer.hidden)
      .map(async (layer) => [layer.id, await loadCanvasImage(layer.url)] as const),
  )
  const images = new Map(imageEntries)
  const scale = options?.maxDimension
    ? Math.min(1, options.maxDimension / Math.max(scene.width, scene.height))
    : 1
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(scene.width * scale))
  canvas.height = Math.max(1, Math.round(scene.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Export canvas is unavailable')
  context.scale(scale, scale)
  context.fillStyle = scene.background
  context.fillRect(0, 0, scene.width, scene.height)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'

  scene.layers.forEach((layer) => {
    if (layer.hidden) return
    if (layer.type === 'text') {
      renderCanvasTextLayer(context, layer)
      return
    }
    context.save()
    const centerX = layer.x + layer.width / 2
    const centerY = layer.y + layer.height / 2
    context.translate(centerX, centerY)
    context.rotate(((layer.rotation || 0) * Math.PI) / 180)
    context.translate(-centerX, -centerY)
    context.globalAlpha = layer.opacity ?? 1
    if (layer.type === 'image') {
      const image = images.get(layer.id)
      if (image) renderCanvasImageLayer(context, layer, image)
    } else if (layer.shape === 'line') {
      context.beginPath()
      context.moveTo(layer.x, layer.y)
      context.lineTo(layer.x + layer.width, layer.y + layer.height)
      context.strokeStyle = layer.borderColor
      context.lineWidth = Math.max(1, layer.borderWidth)
      context.lineCap = 'butt'
      context.stroke()
    } else {
      if (layer.shape === 'circle') {
        context.beginPath()
        context.ellipse(
          layer.x + layer.width / 2,
          layer.y + layer.height / 2,
          layer.width / 2,
          layer.height / 2,
          0,
          0,
          Math.PI * 2,
        )
      } else {
        roundedRectanglePath(context, layer.x, layer.y, layer.width, layer.height, layer.borderRadius)
      }
      context.fillStyle = layer.fill
      context.fill()
      if (layer.borderWidth > 0) {
        context.strokeStyle = layer.borderColor
        context.lineWidth = layer.borderWidth
        context.stroke()
      }
    }
    context.restore()
  })

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error('PNG encoding failed')), 'image/png')
  })
}

export async function createGraphicScenePdfBlob(scene: GraphicScene, title: string) {
  const [{ PDFDocument }, pngBlob] = await Promise.all([
    import('pdf-lib'),
    renderGraphicSceneToPngBlob(scene),
  ])
  const pdfDocument = await PDFDocument.create()
  pdfDocument.setTitle(title)
  pdfDocument.setCreator('Bowman Graphic Design Studio')
  pdfDocument.setProducer('Bowman Graphic Design Studio')
  const pointsPerPixel = 72 / GRAPHIC_EXPORT_DPI
  const pageWidth = scene.width * pointsPerPixel
  const pageHeight = scene.height * pointsPerPixel
  const page = pdfDocument.addPage([pageWidth, pageHeight])
  const image = await pdfDocument.embedPng(await pngBlob.arrayBuffer())
  page.drawImage(image, { height: pageHeight, width: pageWidth, x: 0, y: 0 })
  const bytes = await pdfDocument.save()
  return new Blob([bytes], { type: 'application/pdf' })
}

export function downloadGraphicBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
