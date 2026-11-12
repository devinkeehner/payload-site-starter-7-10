import { describe, expect, it } from 'vitest'
import { defaultGraphicScene } from './defaultScene'
import { instantiateGraphicTemplate, RETIRED_TOWN_TEMPLATE_ID } from './templates'
import { createDefaultGraphicScene, type GraphicTextLayer } from './studioTypes'
import { graphicSceneSchema } from './studioSchema'

describe('reusable graphic templates', () => {
  it('retains legacy geometry while personalizing both representative slots', () => {
    const original = structuredClone(defaultGraphicScene())
    const scene = instantiateGraphicTemplate(
      { id: 'legacy', scene: original },
      {
        headlineText: 'Budget update',
        primaryRepName: 'First Rep',
        secondaryRepName: 'Second Rep',
        primaryHeadshot: { id: 'primary', url: 'https://media.cthousegop.com/primary.png' },
        secondaryHeadshot: { id: 'secondary', url: 'https://media.cthousegop.com/secondary.png' },
      },
    )
    expect(scene.width).toBe(1200)
    expect(scene.height).toBe(630)
    expect(original).toEqual(defaultGraphicScene())
    expect(scene.layers.find((layer) => layer.id === 'legacy-post-headline')).toMatchObject({
      x: original.headlineLayer.x,
      y: original.headlineLayer.y,
      width: original.headlineLayer.width,
      html: '<p>Budget update</p>',
      binding: 'post-title',
    })
    expect(
      scene.layers.filter((layer) => layer.type === 'text').map((layer) => layer.binding),
    ).toEqual(['primary-rep-name', 'secondary-rep-name', 'post-title'])
  })
  it('round trips an editable canvas and binds only explicitly marked content', () => {
    const original = createDefaultGraphicScene()
    const headline = original.layers[0] as GraphicTextLayer
    headline.binding = 'post-title'
    original.layers.push({
      ...headline,
      id: 'static',
      binding: undefined,
      html: '<p>Public Safety</p>',
    })
    const result = instantiateGraphicTemplate(
      { id: 'public-safety', studioScene: original },
      { headlineText: 'Schools & <safety>' },
    )
    expect(result.layers[0]).toMatchObject({
      html: '<p>Schools &amp; &lt;safety&gt;</p>',
      fontSize: headline.fontSize,
      x: headline.x,
      y: headline.y,
    })
    expect(result.layers[1]).toMatchObject({ html: '<p>Public Safety</p>' })
    expect(original.layers[0]).toMatchObject({ html: headline.html })
    expect(graphicSceneSchema.parse(result)).toEqual(result)
  })
  it('rejects the retired Town Numbers template and malformed saved canvases', () => {
    expect(() =>
      instantiateGraphicTemplate(
        { id: RETIRED_TOWN_TEMPLATE_ID, scene: defaultGraphicScene() },
        { headlineText: 'Title' },
      ),
    ).toThrow('retired')
    expect(() =>
      instantiateGraphicTemplate(
        { id: 'broken', studioScene: { layers: [] } },
        { headlineText: 'Title' },
      ),
    ).toThrow()
    const duplicate = createDefaultGraphicScene()
    duplicate.layers.push({ ...duplicate.layers[0]! })
    expect(graphicSceneSchema.safeParse(duplicate).success).toBe(false)
  })
})
