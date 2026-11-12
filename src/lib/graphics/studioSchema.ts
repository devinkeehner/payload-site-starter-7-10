import { z } from 'zod'

const number = z.number().finite()
const size = number.positive().max(16000)
const color = z.string().min(1).max(100)
const base = {
  id: z.string().min(1).max(150),
  name: z.string().max(500),
  x: number.min(-32000).max(32000),
  y: number.min(-32000).max(32000),
  width: number.min(-16000).max(16000),
  height: number.min(-16000).max(16000),
  rotation: number.optional(),
  opacity: number.min(0).max(1).optional(),
  hidden: z.boolean().optional(),
  locked: z.boolean().optional(),
}
export const graphicTextSchema = z
  .object({
    ...base,
    type: z.literal('text'),
    width: size,
    height: size,
    html: z.string().max(100000),
    color,
    fontFamily: z.string().min(1).max(500),
    fontSize: number.min(1).max(1024),
    lineHeight: number.min(0.1).max(10),
    textAlign: z.enum(['left', 'center', 'right']),
    binding: z.enum(['post-title', 'primary-rep-name', 'secondary-rep-name']).optional(),
  })
  .strict()
export const graphicImageSchema = z
  .object({
    ...base,
    type: z.literal('image'),
    width: size,
    height: size,
    url: z
      .string()
      .max(14000000)
      .refine(
        (value) => /^(https?:\/\/|\/(?!\/)|data:image\/|blob:)/i.test(value),
        'Use an image URL from the Media Gallery.',
      ),
    alt: z.string().max(1000),
    mediaId: z.string().optional(),
    objectFit: z.enum(['cover', 'contain']),
    imagePositionX: number.min(0).max(100).optional(),
    imagePositionY: number.min(0).max(100).optional(),
    binding: z.enum(['primary-headshot', 'secondary-headshot']).optional(),
  })
  .strict()
export const graphicShapeSchema = z
  .object({
    ...base,
    type: z.literal('shape'),
    shape: z.enum(['circle', 'line', 'rectangle']),
    fill: color,
    borderColor: color,
    borderWidth: number.min(0).max(1000),
    borderRadius: number.min(0).max(8000),
  })
  .strict()
  .superRefine((layer, ctx) => {
    if (layer.shape !== 'line' && (layer.width <= 0 || layer.height <= 0))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Shapes need positive width and height.',
      })
  })
export const graphicLayerSchema = z.union([
  graphicTextSchema,
  graphicImageSchema,
  graphicShapeSchema,
])
export const graphicSceneSchema = z
  .object({
    background: color,
    width: size,
    height: size,
    preset: z.enum(['square', 'landscape', 'story', 'postcard']),
    version: z.literal(1),
    layers: z.array(graphicLayerSchema).max(500),
  })
  .strict()
  .refine(
    (scene) => new Set(scene.layers.map((layer) => layer.id)).size === scene.layers.length,
    'Layer IDs must be unique.',
  )
