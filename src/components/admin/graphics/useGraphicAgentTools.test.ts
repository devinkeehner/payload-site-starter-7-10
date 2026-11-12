import { describe, expect, it } from 'vitest'
import { createDefaultGraphicScene, type GraphicScene } from '@/lib/graphics/studioTypes'
import { createGraphicAgentTools } from './useGraphicAgentTools'

function fixture(signal?: AbortSignal) {
  let scene = createDefaultGraphicScene(),
    revision = 0
  const past: GraphicScene[] = [],
    future: GraphicScene[] = []
  const tools = createGraphicAgentTools(
    {
      read: () => ({ scene, revision, title: 'QA', designId: 'qa', selectedId: null }),
      commit: (next) => {
        past.push(scene)
        scene = next
        revision++
      },
      select: () => {},
      undo: () => {
        const before = past.pop()
        if (before) {
          future.push(scene)
          scene = before
          revision++
        }
      },
      redo: () => {
        const next = future.pop()
        if (next) {
          past.push(scene)
          scene = next
          revision++
        }
      },
    },
    signal,
  )
  const run = (name: string, args: unknown) =>
    tools.find((tool) => tool.name === `graphic_editor_${name}`)!.execute(args)
  return { run, read: () => ({ scene, revision }) }
}
describe('graphic WebMCP tools', () => {
  it('applies sequential edits with revision checks and reversible history', async () => {
    const { run, read } = fixture()
    expect(
      (
        await run('update_layer', {
          expectedRevision: 0,
          layerId: 'welcome-text',
          patch: { color: '#dc2626' },
        })
      ).isError,
    ).toBeUndefined()
    expect(read().revision).toBe(1)
    expect(
      (
        await run('update_layer', {
          expectedRevision: 0,
          layerId: 'welcome-text',
          patch: { color: '#000000' },
        })
      ).isError,
    ).toBe(true)
    expect((await run('undo', { expectedRevision: 1 })).isError).toBeUndefined()
    expect(read().scene.layers[0]).toMatchObject({ color: '#111827' })
    await run('redo', { expectedRevision: 2 })
    expect(read().scene.layers[0]).toMatchObject({ color: '#dc2626' })
  })
  it('rejects malformed fields, impossible dimensions, locked changes and duplicate IDs', async () => {
    const { run, read } = fixture()
    for (const patch of [{ type: 'image' }, { width: -1 }, { fontSize: NaN }, { unexpected: true }])
      expect(
        (await run('update_layer', { expectedRevision: 0, layerId: 'welcome-text', patch }))
          .isError,
      ).toBe(true)
    expect(read().revision).toBe(0)
    expect(
      (await run('add_layer', { expectedRevision: 0, layer: read().scene.layers[0] })).isError,
    ).toBe(true)
    await run('update_layer', {
      expectedRevision: 0,
      layerId: 'welcome-text',
      patch: { locked: true },
    })
    expect(
      (await run('remove_layer', { expectedRevision: 1, layerId: 'welcome-text' })).isError,
    ).toBe(true)
    expect(
      (
        await run('update_layer', {
          expectedRevision: 1,
          layerId: 'welcome-text',
          patch: { html: 'changed' },
        })
      ).isError,
    ).toBe(true)
    expect(
      (
        await run('update_layer', {
          expectedRevision: 1,
          layerId: 'welcome-text',
          patch: { locked: false },
        })
      ).isError,
    ).toBeUndefined()
  })
  it('stops tool execution after unmount and advertises that edits autosave', async () => {
    const controller = new AbortController(),
      { run } = fixture(controller.signal)
    controller.abort()
    expect((await run('read_document', {})).isError).toBe(true)
    const tools = createGraphicAgentTools({
      read: () => ({
        scene: createDefaultGraphicScene(),
        revision: 0,
        title: '',
        designId: null,
        selectedId: null,
      }),
      commit: () => {},
      select: () => {},
      undo: () => {},
      redo: () => {},
    })
    expect(
      tools.find((tool) => tool.name === 'graphic_editor_update_layer')?.annotations
        .consequentialHint,
    ).toBe(true)
  })
})
