import {
  normalizeGraphicScene,
  type GraphicHeadshotBinding,
  type GraphicTextLayer as LegacyGraphicTextLayer,
} from './defaultScene'
import type {
  GraphicImageLayer,
  GraphicScene,
  GraphicTextLayer,
} from './studioTypes'

export type LegacyTemplateMedia = {
  alt?: string | null
  id?: number | string | null
  url?: string | null
}

type ConvertLegacyTemplateOptions = {
  backgroundImage?: LegacyTemplateMedia | null
  headlineText: string
  mediaById?: Record<string, LegacyTemplateMedia | undefined>
  primaryHeadshot?: LegacyTemplateMedia | null
  primaryRepName?: string | null
  scene: unknown
  secondaryHeadshot?: LegacyTemplateMedia | null
  secondaryRepName?: string | null
}

const LEGACY_STAGE_HEIGHT = 630
const LEGACY_STAGE_WIDTH = 1200

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

const plainTextToHtml = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => `<p>${escapeHtml(line) || '<br>'}</p>`)
    .join('')

const textLayerHtml = (layer: LegacyGraphicTextLayer, fallbackText: string) => {
  const html = layer.html?.trim()
  if (html) return html
  return plainTextToHtml(layer.text?.trim() || fallbackText)
}

const toTextLayer = (
  id: string,
  name: string,
  layer: LegacyGraphicTextLayer,
  fallbackText: string,
): GraphicTextLayer => ({
  color: layer.color || '#111827',
  fontFamily: layer.fontFamily || 'Arial, sans-serif',
  fontSize: layer.fontSize || 32,
  height: layer.height || Math.max(72, Math.round((layer.fontSize || 32) * (layer.lineHeight || 1.1) * 2.4)),
  html: textLayerHtml(layer, fallbackText),
  id,
  lineHeight: layer.lineHeight || 1.1,
  name,
  rotation: 0,
  textAlign: layer.align,
  type: 'text',
  width: layer.width,
  x: layer.x,
  y: layer.y,
})

const toImageLayer = (
  id: string,
  name: string,
  media: LegacyTemplateMedia | null | undefined,
  frame: { height: number; width: number; x: number; y: number },
  objectFit: GraphicImageLayer['objectFit'],
  opacity = 1,
): GraphicImageLayer | null => {
  if (!media?.url) return null

  return {
    alt: media.alt?.trim() || name,
    height: frame.height,
    id,
    mediaId: media.id == null ? undefined : String(media.id),
    name,
    objectFit,
    opacity,
    rotation: 0,
    type: 'image',
    url: media.url,
    width: frame.width,
    x: frame.x,
    y: frame.y,
  }
}

const resolveHeadshotMedia = (
  binding: GraphicHeadshotBinding,
  options: ConvertLegacyTemplateOptions,
) => {
  if (binding.type === 'none') return null
  if (binding.type === 'media') {
    return binding.mediaID ? options.mediaById?.[binding.mediaID] || null : null
  }
  return binding.role === 'secondary' ? options.secondaryHeadshot : options.primaryHeadshot
}

/**
 * Creates a new-studio scene from a retained legacy Post graphic template.
 * The source scene is normalized but never mutated, allowing the relationship
 * and original JSON to remain available for old render paths and recovery.
 */
export const convertLegacyTemplateToStudioScene = (
  options: ConvertLegacyTemplateOptions,
): GraphicScene => {
  const legacyScene = normalizeGraphicScene(options.scene)
  const layers: GraphicScene['layers'] = []

  const backgroundLayer = toImageLayer(
    'legacy-template-background',
    'Template background',
    options.backgroundImage,
    { height: LEGACY_STAGE_HEIGHT, width: LEGACY_STAGE_WIDTH, x: 0, y: 0 },
    'cover',
  )
  if (backgroundLayer) layers.push(backgroundLayer)

  legacyScene.imageLayers.forEach((layer, index) => {
    const media = layer.mediaID ? options.mediaById?.[layer.mediaID] : null
    const converted = toImageLayer(
      `legacy-image-${layer.id || index + 1}`,
      `Template image ${index + 1}`,
      media,
      { height: layer.height, width: layer.width, x: layer.x, y: layer.y },
      'contain',
      layer.opacity,
    )
    if (converted) layers.push(converted)
  })

  legacyScene.headshots.forEach((layer, index) => {
    const role = layer.binding.type === 'tenant-headshot' ? layer.binding.role : null
    const converted = toImageLayer(
      `legacy-headshot-${layer.id || index + 1}`,
      role === 'secondary' ? 'Secondary representative photo' : 'Representative photo',
      resolveHeadshotMedia(layer.binding, options),
      { height: layer.size, width: layer.size, x: layer.x, y: layer.y },
      'cover',
    )
    if (converted) layers.push(converted)
  })

  if (options.primaryRepName?.trim()) {
    layers.push(
      toTextLayer(
        'legacy-primary-representative-name',
        'Primary representative',
        legacyScene.repNameLayers.primary,
        options.primaryRepName.trim(),
      ),
    )
  }

  if (options.secondaryRepName?.trim()) {
    layers.push(
      toTextLayer(
        'legacy-secondary-representative-name',
        'Secondary representative',
        legacyScene.repNameLayers.secondary,
        options.secondaryRepName.trim(),
      ),
    )
  }

  layers.push(
    toTextLayer(
      'legacy-post-headline',
      'Post headline',
      legacyScene.headlineLayer,
      options.headlineText.trim() || 'Headline',
    ),
  )

  return {
    background: '#ffffff',
    height: LEGACY_STAGE_HEIGHT,
    layers,
    preset: 'landscape',
    version: 1,
    width: LEGACY_STAGE_WIDTH,
  }
}

