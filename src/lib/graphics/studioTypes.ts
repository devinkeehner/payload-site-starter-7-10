export type GraphicCanvasPreset = 'square' | 'landscape' | 'story' | 'postcard'

export type GraphicLayerBase = {
  height: number
  hidden?: boolean
  id: string
  locked?: boolean
  name: string
  opacity?: number
  rotation?: number
  width: number
  x: number
  y: number
}

export type GraphicTextLayer = GraphicLayerBase & {
  color: string
  fontFamily: string
  fontSize: number
  html: string
  lineHeight: number
  textAlign: 'left' | 'center' | 'right'
  type: 'text'
}

export type GraphicImageLayer = GraphicLayerBase & {
  alt: string
  imagePositionX?: number
  imagePositionY?: number
  mediaId?: string
  objectFit: 'contain' | 'cover'
  type: 'image'
  url: string
}

export type GraphicShapeLayer = GraphicLayerBase & {
  borderColor: string
  borderRadius: number
  borderWidth: number
  fill: string
  shape: 'circle' | 'line' | 'rectangle'
  type: 'shape'
}

export type GraphicLayer = GraphicTextLayer | GraphicImageLayer | GraphicShapeLayer

export type GraphicScene = {
  background: string
  height: number
  layers: GraphicLayer[]
  preset: GraphicCanvasPreset
  version: 1
  width: number
}

export const GRAPHIC_CANVAS_PRESETS: Record<
  GraphicCanvasPreset,
  { height: number; label: string; width: number }
> = {
  square: { height: 1080, label: 'Social square', width: 1080 },
  landscape: { height: 628, label: 'Social landscape', width: 1200 },
  story: { height: 1920, label: 'Story / reel', width: 1080 },
  postcard: { height: 1200, label: 'Postcard', width: 1800 },
}

export const createGraphicLayerId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export const createDefaultGraphicScene = (): GraphicScene => ({
  background: '#ffffff',
  height: GRAPHIC_CANVAS_PRESETS.square.height,
  layers: [
    {
      color: '#111827',
      fontFamily: 'Arial, sans-serif',
      fontSize: 92,
      height: 220,
      html: '<h1>Your message</h1><p>Add campaign details here.</p>',
      id: 'welcome-text',
      lineHeight: 1.08,
      name: 'Headline',
      rotation: 0,
      textAlign: 'left',
      type: 'text',
      width: 780,
      x: 150,
      y: 390,
    },
  ],
  preset: 'square',
  version: 1,
  width: GRAPHIC_CANVAS_PRESETS.square.width,
})
