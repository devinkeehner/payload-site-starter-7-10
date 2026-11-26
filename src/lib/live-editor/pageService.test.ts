import type { PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import { PAGE_LAYOUT_BLOCKS } from '@/lib/blocks/pageLayoutBlocks'
import { getPageBuilderSchema } from '@/lib/puck/schema'
import { applyEditorCommand } from './agent'
import { buildPageSection, PAGE_SECTION } from './pageSections'
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
