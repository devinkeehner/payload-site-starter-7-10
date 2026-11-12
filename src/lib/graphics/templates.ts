import type { Where } from 'payload'
import {
  convertLegacyTemplateToStudioScene,
  type LegacyTemplateMedia,
} from './legacyTemplateToStudioScene'
import { graphicSceneSchema } from './studioSchema'
import type { GraphicScene } from './studioTypes'

// Retire only the old Town Numbers Post template. Existing records remain intact.
export const RETIRED_TOWN_TEMPLATE_ID = '69dfcbf8c118310bb9264035'
export const POST_GRAPHIC_TEMPLATE_FILTER: Where = {
  and: [
    { sourceCollection: { equals: 'posts' } },
    { id: { not_equals: RETIRED_TOWN_TEMPLATE_ID } },
  ],
}
export type StudioTemplate = {
  id: string
  title?: string | null
  backgroundImage?: LegacyTemplateMedia | null
  studioScene?: unknown
  scene?: unknown
}
export type TemplateContent = {
  headlineText: string
  primaryRepName?: string | null
  secondaryRepName?: string | null
  primaryHeadshot?: LegacyTemplateMedia | null
  secondaryHeadshot?: LegacyTemplateMedia | null
  mediaById?: Record<string, LegacyTemplateMedia | undefined>
}
const paragraph = (text: string) =>
  `<p>${text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;').replaceAll('\n', '<br>')}</p>`
export function instantiateGraphicTemplate(
  template: StudioTemplate,
  content: TemplateContent,
): GraphicScene {
  if (template.id === RETIRED_TOWN_TEMPLATE_ID)
    throw new Error('The Town Numbers template has been retired. Choose another template.')
  if (!template.studioScene) {
    const scene = convertLegacyTemplateToStudioScene({
      ...content,
      backgroundImage: template.backgroundImage,
      scene: template.scene,
    })
    return {
      ...scene,
      layers: scene.layers.map((layer) => {
        if (layer.type === 'text')
          return {
            ...layer,
            binding:
              layer.id === 'legacy-post-headline'
                ? 'post-title'
                : layer.id === 'legacy-primary-representative-name'
                  ? 'primary-rep-name'
                  : 'secondary-rep-name',
          }
        if (layer.type === 'image' && layer.id.startsWith('legacy-headshot'))
          return {
            ...layer,
            binding: layer.name.startsWith('Secondary') ? 'secondary-headshot' : 'primary-headshot',
          }
        return layer
      }),
    }
  }
  const scene = graphicSceneSchema.parse(template.studioScene)
  return {
    ...scene,
    layers: scene.layers.map((layer) => {
      if (layer.type === 'text' && layer.binding) {
        const text =
          layer.binding === 'post-title'
            ? content.headlineText
            : layer.binding === 'primary-rep-name'
              ? content.primaryRepName
              : content.secondaryRepName
        return text ? { ...layer, html: paragraph(text) } : { ...layer }
      }
      if (layer.type === 'image' && layer.binding) {
        const media =
          layer.binding === 'primary-headshot' ? content.primaryHeadshot : content.secondaryHeadshot
        return media?.url
          ? {
              ...layer,
              url: media.url,
              mediaId: media.id == null ? undefined : String(media.id),
              alt: media.alt || layer.alt,
            }
          : { ...layer }
      }
      return { ...layer }
    }),
  }
}
