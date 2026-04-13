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
}

export type GraphicScene = {
  version: number
  repNameLayers: Record<GraphicRepRole, GraphicTextLayer>
  headlineLayer: GraphicTextLayer
  masthead: {
    show: boolean
    fromThe: {
      x: number
      y: number
      width: number
    }
    houseGop: {
      x: number
      y: number
      width: number
    }
    newsroom: {
      x: number
      y: number
      width: number
      fontSize: number
    }
    line: {
      x: number
      y: number
      width: number
      height: number
    }
  }
  handle: {
    show: boolean
  }
  headshots: GraphicHeadshotLayer[]
}

export const defaultGraphicScene = (): GraphicScene => ({
  version: 3,
  repNameLayers: {
    primary: {
      x: 380,
      y: 512,
      width: 320,
      align: 'left',
    },
    secondary: {
      x: 268,
      y: 498,
      width: 260,
      align: 'left',
    },
  },
  headlineLayer: {
    x: 548,
    y: 244,
    width: 510,
    height: 190,
    align: 'center',
  },
  masthead: {
    show: true,
    fromThe: {
      x: 676,
      y: 60,
      width: 300,
    },
    houseGop: {
      x: 592,
      y: 86,
      width: 542,
    },
    newsroom: {
      x: 592,
      y: 128,
      width: 542,
      fontSize: 74,
    },
    line: {
      x: 700,
      y: 220,
      width: 382,
      height: 4,
    },
  },
  handle: {
    show: true,
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

  const mastheadRecord = asRecord(record.masthead)
  const legacyMastheadX = asNumber(mastheadRecord.x, fallback.masthead.houseGop.x)
  const legacyMastheadY = asNumber(mastheadRecord.y, fallback.masthead.houseGop.y - 26)

  return {
    version: 3,
    repNameLayers,
    headlineLayer: asTextLayer(record.headlineLayer, fallback.headlineLayer),
    masthead: {
      show: mastheadRecord.show !== false,
      fromThe: {
        x: asNumber(asRecord(mastheadRecord.fromThe).x, legacyMastheadX + 84),
        y: asNumber(asRecord(mastheadRecord.fromThe).y, legacyMastheadY),
        width: asNumber(asRecord(mastheadRecord.fromThe).width, fallback.masthead.fromThe.width),
      },
      houseGop: {
        x: asNumber(asRecord(mastheadRecord.houseGop).x, legacyMastheadX),
        y: asNumber(asRecord(mastheadRecord.houseGop).y, legacyMastheadY + 26),
        width: asNumber(asRecord(mastheadRecord.houseGop).width, fallback.masthead.houseGop.width),
      },
      newsroom: {
        x: asNumber(asRecord(mastheadRecord.newsroom).x, legacyMastheadX),
        y: asNumber(asRecord(mastheadRecord.newsroom).y, legacyMastheadY + 68),
        width: asNumber(asRecord(mastheadRecord.newsroom).width, fallback.masthead.newsroom.width),
        fontSize: asNumber(asRecord(mastheadRecord.newsroom).fontSize, fallback.masthead.newsroom.fontSize),
      },
      line: {
        x: asNumber(asRecord(mastheadRecord.line).x, legacyMastheadX + 108),
        y: asNumber(asRecord(mastheadRecord.line).y, legacyMastheadY + 160),
        width: asNumber(asRecord(mastheadRecord.line).width, fallback.masthead.line.width),
        height: asNumber(asRecord(mastheadRecord.line).height, fallback.masthead.line.height),
      },
    },
    handle: {
      show: asRecord(record.handle).show !== false,
    },
    headshots: headshots.length > 0 ? headshots : fallback.headshots,
  }
}
