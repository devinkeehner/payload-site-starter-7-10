import type { PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import { PAGE_LAYOUT_BLOCKS } from '@/lib/blocks/pageLayoutBlocks'
import { getPageBuilderSchema } from '@/lib/puck/schema'
import { applyEditorCommand } from './agent'
import { buildDesignedSection, buildPageSection, PAGE_SECTION } from './pageSections'
import { loadEditorPage, saveEditorPage, savePageSection } from './pageService'

const updatedAt = '2026-11-26T20:00:00Z'
const legacy = { id: 'old-form', blockType: 'formBlock', form: 'existing-form' }
const recipe = {
  blockType: PAGE_SECTION, title: 'Report', children: [
    { blockType: 'sectionHeading', text: 'Budget at a glance' },
    { blockType: 'sectionDocument', text: 'Open the report', file: 'report' },
  ],
}
const schemas = getPageBuilderSchema()
function request(pageTenant = 'site-a', fileTenant = 'site-a') {
  const original = { id: 'page', tenant: pageTenant, title: 'Page', layout: [legacy], updatedAt }
  const findByID = vi.fn(async ({ collection }: { collection: string }) =>
    collection === 'pages' ? original : { id: 'report', tenant: fileTenant })
  const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...original, ...data }))
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'template', ...data }))
  const req = {
    user: { roles: ['alphaTester'], tenants: [{ tenant: 'site-a' }] },
    payload: { findByID, update, create, config: { collections: [{ slug: 'pages', fields: [{ name: 'layout', type: 'blocks', blocks: PAGE_LAYOUT_BLOCKS }] }] } },
  } as unknown as PayloadRequest
  return { req, update, create }
}

describe('composable pages', () => {
  it('inserts the tree in one revision and rejects stale or invalid compositions', () => {
    const page = { collection: 'pages', layout: [legacy] }
    const options = { schemas, revision: 0, expectedRevision: 0 }
    const command = { type: 'insert_section', section: recipe }
    const result = applyEditorCommand(page, command, options)
    expect(result.revision).toBe(1)
    expect(result.document.layout?.[0]).toEqual(legacy)
    expect(result.document.layout?.[1]).toMatchObject({ id: result.selectedId, blockType: PAGE_SECTION })
    expect(() => applyEditorCommand(page, command, { ...options, expectedRevision: 1 })).toThrow(/draft changed/)
    expect(() => buildPageSection({ ...recipe, children: [legacy] }, schemas)).toThrow(/unavailable/)
    expect(() => buildPageSection({ ...recipe, children: [{ blockType: 'sectionLink', url: 'javascript:action' }] }, schemas)).toThrow(/site-relative/)
  })

  it('saves only page draft fields and normalizes populated template references', async () => {
    const { req, update, create } = request()
    const section = { blockType: PAGE_SECTION, children: [{ blockType: 'sectionDocument', file: { id: 'report', url: '/report.pdf' } }] }
    const stored = { ...section, children: [{ blockType: 'sectionDocument', file: 'report' }] }
    await saveEditorPage(req, 'page', { expectedUpdatedAt: updatedAt, page: { layout: [legacy, section], _status: 'published' } })
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      draft: true, overrideAccess: false, overrideLock: false, data: { layout: [legacy, stored] },
    }))
    await savePageSection(req, 'site-a', { name: ' Report ', section })
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'page-section-templates', data: { tenant: 'site-a', name: 'Report', layout: [stored] },
    }))
  })

  it('inserts a designed layout and editable media in one revision and preserves them on draft save', async () => {
    const { req, update } = request()
    const page = { collection: 'pages', layout: [legacy] }
    const options = { schemas, revision: 0, expectedRevision: 0 }
    const section = {
      title: 'Budget feature',
      layout: { tag: 'header', style: { display: 'grid', gridTemplateColumns: '2fr 1fr' }, children: [
        { field: 'Headline', style: { fontSize: '4rem' } }, { field: 'Photo' }, { field: 'Video' },
      ] },
      fields: [
        { name: 'Photo', element: { blockType: 'sectionImage', image: 'report' } },
        { name: 'Headline', element: { blockType: 'sectionHeading', text: 'Budget highlights' } },
        { name: 'Video', element: { blockType: 'sectionVideo', youtubeUrl: 'https://youtu.be/2Ex83c49EJ8' } },
      ],
    }
    const result = applyEditorCommand(page, { type: 'design_section', section }, options)
    expect(result.revision).toBe(1)
    const designed = result.document.layout?.[1]
    expect(designed).toMatchObject({ design: section.layout, children: [
      { blockName: 'Headline', text: 'Budget highlights' },
      { blockName: 'Photo', image: 'report' },
      { blockName: 'Video', youtubeUrl: 'https://youtu.be/2Ex83c49EJ8' },
    ] })
    const reorder = { type: 'reorder_design', blockId: result.selectedId, parentPath: [], from: 0, to: 2 }
    const reordered = applyEditorCommand(result.document, reorder, { schemas, revision: 1, expectedRevision: 1 })
    expect(reordered.revision).toBe(2)
    expect(reordered.document.layout?.[1]?.design).toEqual({ ...section.layout, children: [
      section.layout.children[1], section.layout.children[2], section.layout.children[0],
    ] })
    expect(reordered.document.layout?.[1]?.children).toEqual(designed?.children)
    expect(() => applyEditorCommand(result.document, { ...reorder, parentPath: [0] }, { schemas, revision: 1, expectedRevision: 1 })).toThrow(/same design container/)
    expect(() => applyEditorCommand(reordered.document, reorder, { schemas, revision: 2, expectedRevision: 1 })).toThrow(/draft changed/)
    const heading = (designed?.children as Array<{ id: string }>)[0]!
    expect(() => applyEditorCommand(result.document, { type: 'move_block', blockId: heading.id, destination: { ownerId: 'root', path: 'layout' } },
      { schemas, revision: 1, expectedRevision: 1 })).toThrow(/inside its design container/)
    const revised = applyEditorCommand(reordered.document, {
      type: 'set_field', blockId: heading.id, path: ['text'], value: 'Budget overview',
    }, { schemas, revision: 2, expectedRevision: 2 })
    await saveEditorPage(req, 'page', { expectedUpdatedAt: updatedAt, page: revised.document })
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ draft: true, data: expect.objectContaining({
      layout: [legacy, expect.objectContaining({ design: reordered.document.layout?.[1]?.design, children: expect.arrayContaining([
        expect.objectContaining({ blockName: 'Headline', text: 'Budget overview' }),
        expect.objectContaining({ blockName: 'Photo', image: 'report' }),
      ]) })],
    }) }))
    expect(() => buildDesignedSection({ ...section, fields: [] }, schemas)).toThrow(/every label/)
    expect(() => buildDesignedSection({ ...section, layout: {
      ...section.layout, style: { color: 'red;position:fixed' },
    } }, schemas)).toThrow(/Unsupported design style/)
    expect(() => buildPageSection({ blockType: PAGE_SECTION, children: [
      { blockType: 'sectionVideo', youtubeUrl: 'https://youtube.com.example.org/watch?v=2Ex83c49EJ8' },
    ] }, schemas)).toThrow(/valid YouTube/)
  })

  it('rejects another site’s page, file, and draft revision', async () => {
    await expect(loadEditorPage(request('site-b').req, 'page')).rejects.toMatchObject({ status: 403 })
    const { req, create, update } = request('site-a', 'site-b')
    const section = buildPageSection(recipe, schemas)
    await expect(savePageSection(req, 'site-a', { name: 'Report', section })).rejects.toMatchObject({ status: 403 })
    await expect(saveEditorPage(req, 'page', { expectedUpdatedAt: '2026-11-26T19:00:00Z', page: { layout: [section] } })).rejects.toMatchObject({ status: 409 })
    expect(create).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })
})
