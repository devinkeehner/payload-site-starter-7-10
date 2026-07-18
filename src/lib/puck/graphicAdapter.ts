import type { GraphicLayer, GraphicScene } from '@/lib/graphics/studioTypes'

import type { PuckPageData } from './types'

const GRAPHIC_COMPONENT_TYPES: Record<GraphicLayer['type'], string> = {
  image: 'graphicImage',
  shape: 'graphicShape',
  text: 'graphicText',
}

/**
 * Mirrors the durable GraphicScene model into Puck's document shape.
 *
 * GraphicScene remains the source of truth while the fixed-position canvas is
 * transitioned onto the shared Puck builder platform. Storing this mirror lets
 * future Puck components open existing designs without another data migration.
 */
export function graphicSceneToPuckData(scene: GraphicScene): PuckPageData {
  return {
    content: scene.layers.map((layer) => ({
      type: GRAPHIC_COMPONENT_TYPES[layer.type],
      props: {
        ...layer,
        id: layer.id,
      },
    })),
    root: {
      props: {
        background: scene.background,
        height: scene.height,
        preset: scene.preset,
        version: scene.version,
        width: scene.width,
      },
    },
    zones: {},
  } as PuckPageData
}
