export type GraphicTextAlign = 'left' | 'center'

export type GraphicRepRole = 'primary' | 'secondary'

export type GraphicHeadshotBinding =
  | {
      type: 'tenant-headshot'
      role: GraphicRepRole
    }
  | {
      type: 'media'
      mediaID: string | null
    }
  | {
      type: 'none'
    }

export type GraphicHeadshotLayer = {
  id: string
  x: number
  y: number
  size: number
  crop: {
    zoom: number
    offsetX: number
    offsetY: number
  }
  binding: GraphicHeadshotBinding
}

export type GraphicTextLayer = {
  x: number
  y: number
  width: number
  height?: number
  align: GraphicTextAlign
  text?: string
  color?: string
  fontSize?: number
  fontFamily?: string
  fontStyle?: string
  textDecoration?: string
  letterSpacing?: number
}

export type GraphicImageLayer = {
  id: string
  x: number
  y: number
  width: number
  height: number
  mediaID: string | null
  opacity?: number
}

export type GraphicScene = {
  version: number
  repNameLayers: Record<GraphicRepRole, GraphicTextLayer>
  headlineLayer: GraphicTextLayer
  headshots: GraphicHeadshotLayer[]
  imageLayers: GraphicImageLayer[]
}

export const defaultGraphicScene = (): GraphicScene => ({
  version: 5,
  repNameLayers: {
    primary: {
      x: 380,
      y: 512,
      width: 320,
      align: 'left',
      color: '#aa2426',
      fontFamily: 'Georgia, Times New Roman, serif',
      fontSize: 28,
    },
    secondary: {
      x: 268,
      y: 498,
      width: 260,
      align: 'left',
      color: '#aa2426',
      fontFamily: 'Georgia, Times New Roman, serif',
      fontSize: 26,
    },
  },
  headlineLayer: {
    x: 548,
    y: 244,
    width: 510,
    height: 190,
    align: 'center',
    color: '#a02626',
    fontFamily: 'Georgia, Times New Roman, serif',
    fontSize: 38,
  },
  headshots: [
    {
      id: 'headshot-primary',
      x: 56,
      y: 72,
      size: 436,
      crop: {
        zoom: 1,
        offsetX: 0,
        offsetY: 0,
      },
      binding: {
        type: 'tenant-headshot',
        role: 'primary',
      },
    },
  ],
  imageLayers: [],
})

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}

const asNumber = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)

const asTextLayer = (value: unknown, fallback: GraphicTextLayer): GraphicTextLayer => {
  const record = asRecord(value)

  return {
    x: asNumber(record.x, fallback.x),
    y: asNumber(record.y, fallback.y),
    width: asNumber(record.width, fallback.width),
    height: typeof record.height === 'number' && Number.isFinite(record.height) ? record.height : fallback.height,
    align: record.align === 'center' ? 'center' : 'left',
    text: typeof record.text === 'string' ? record.text : fallback.text,
    color: typeof record.color === 'string' ? record.color : fallback.color,
    fontSize: asNumber(record.fontSize, fallback.fontSize ?? 32),
    fontFamily: typeof record.fontFamily === 'string' ? record.fontFamily : fallback.fontFamily,
    fontStyle: typeof record.fontStyle === 'string' ? record.fontStyle : fallback.fontStyle,
    textDecoration: typeof record.textDecoration === 'string' ? record.textDecoration : fallback.textDecoration,
    letterSpacing: asNumber(record.letterSpacing, fallback.letterSpacing ?? 0),
  }
}

const asHeadshotBinding = (value: unknown, fallback: GraphicHeadshotBinding): GraphicHeadshotBinding => {
  const record = asRecord(value)

  if (record.type === 'media') {
    return {
      type: 'media',
      mediaID: typeof record.mediaID === 'string' ? record.mediaID : null,
    }
  }

  if (record.type === 'none') {
    return { type: 'none' }
  }

  if (record.type === 'tenant-headshot') {
    return {
      type: 'tenant-headshot',
      role: record.role === 'secondary' ? 'secondary' : 'primary',
    }
  }

  if (record.type === 'standard-media') {
    return {
      type: 'tenant-headshot',
      role: 'primary',
    }
  }

  return fallback
}

export const normalizeGraphicScene = (value: unknown): GraphicScene => {
  const fallback = defaultGraphicScene()
  const record = asRecord(value)

  const legacyRepNameLayer = asTextLayer(record.repNameLayer, fallback.repNameLayers.primary)
  const repNameLayersRecord = asRecord(record.repNameLayers)

  const repNameLayers: Record<GraphicRepRole, GraphicTextLayer> = {
    primary: asTextLayer(repNameLayersRecord.primary, legacyRepNameLayer),
    secondary: asTextLayer(repNameLayersRecord.secondary, fallback.repNameLayers.secondary),
  }

  const rawHeadshots = Array.isArray(record.headshots) ? record.headshots : fallback.headshots
  const headshots = rawHeadshots.map((item, index) => {
    const headshotRecord = asRecord(item)
    const baseHeadshot = fallback.headshots[0]
    if (!baseHeadshot) return null

    const fallbackHeadshot: GraphicHeadshotLayer =
      fallback.headshots[index] || {
        id: `headshot-${index + 1}`,
        x: baseHeadshot.x + 80 * index,
        y: baseHeadshot.y + 80 * index,
        size: baseHeadshot.size,
        crop: {
          zoom: baseHeadshot.crop.zoom,
          offsetX: baseHeadshot.crop.offsetX,
          offsetY: baseHeadshot.crop.offsetY,
        },
        binding: baseHeadshot.binding,
      }

    return {
      id: typeof headshotRecord.id === 'string' ? headshotRecord.id : fallbackHeadshot.id,
      x: asNumber(headshotRecord.x, fallbackHeadshot.x),
      y: asNumber(headshotRecord.y, fallbackHeadshot.y),
      size: asNumber(headshotRecord.size, fallbackHeadshot.size),
      crop: {
        zoom: asNumber(asRecord(headshotRecord.crop).zoom, fallbackHeadshot.crop.zoom),
        offsetX: asNumber(asRecord(headshotRecord.crop).offsetX, fallbackHeadshot.crop.offsetX),
        offsetY: asNumber(asRecord(headshotRecord.crop).offsetY, fallbackHeadshot.crop.offsetY),
      },
      binding: asHeadshotBinding(headshotRecord.binding, fallbackHeadshot.binding),
    }
  }).filter((item): item is GraphicHeadshotLayer => Boolean(item))

  const rawImageLayers = Array.isArray(record.imageLayers) ? record.imageLayers : fallback.imageLayers
  const imageLayers = rawImageLayers
    .map((item, index) => {
      const layerRecord = asRecord(item)
      return {
        id: typeof layerRecord.id === 'string' ? layerRecord.id : `image-${index + 1}`,
        x: asNumber(layerRecord.x, 120 + index * 36),
        y: asNumber(layerRecord.y, 120 + index * 24),
        width: asNumber(layerRecord.width, 280),
        height: asNumber(layerRecord.height, 180),
        mediaID: typeof layerRecord.mediaID === 'string' ? layerRecord.mediaID : null,
        opacity: asNumber(layerRecord.opacity, 1),
      }
    })
    .filter((item) => Boolean(item.id))

  return {
    version: 6,
    repNameLayers,
    headlineLayer: asTextLayer(record.headlineLayer, fallback.headlineLayer),
    headshots: headshots.length > 0 ? headshots : fallback.headshots,
    imageLayers,
  }
}
