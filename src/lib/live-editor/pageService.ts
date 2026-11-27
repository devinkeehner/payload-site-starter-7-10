import type { PageSectionTemplate } from '@/payload-types'
import type { PayloadRequest } from 'payload'
import { canUseBuilders, isSuperUser } from '@/lib/access/isSuperUser'
import { getPageBuilderSchema } from '@/lib/puck/schema'
import { assertDraftReferences } from './emailService'
import { LiveEditorAccessError, relationshipID } from './emailAccess'
import { assertCurrentDraftRevision, buildNativeEmailDraftPatch, NativeDraftError, readExpectedUpdatedAt, type DraftField } from './emailDraft'
import { PAGE_SECTION } from './pageSections'

export async function loadEditorPage(req: PayloadRequest, id: string, depth = 0) {
  if (!canUseBuilders(req.user)) throw new LiveEditorAccessError('Your account does not have access to Live Editor.', 403)
  const page = await req.payload.findByID({ collection: 'pages', id, draft: true, depth, overrideAccess: false, req })
  const tenant = relationshipID(page.tenant)
  const user = req.user as { tenants?: { tenant?: unknown }[] }
  if (!isSuperUser(user) && (!tenant || !user.tenants?.some(entry => relationshipID(entry.tenant) === tenant))) {
    throw new LiveEditorAccessError('This page is outside your assigned sites.', 403)
  }
  return page
}

function toDraft(page: Awaited<ReturnType<typeof loadEditorPage>>) {
  return {
    collection: 'pages', id: page.id, title: page.title, layout: page.layout,
    updatedAt: page.updatedAt, tenantName: typeof page.tenant === 'object' ? page.tenant?.name : undefined,
  }
}

export async function prepareEditorPagePatch(req: PayloadRequest, current: Awaited<ReturnType<typeof loadEditorPage>>, incoming: unknown) {
  const collection = req.payload.config.collections.find(item => item.slug === 'pages')
  if (!collection) throw new Error('Page schema is unavailable.')
  const fields = collection.fields as unknown as DraftField[]
  const patch = buildNativeEmailDraftPatch(incoming, fields, [], 'page')
  await assertDraftReferences(req, patch, current, fields, relationshipID(current.tenant), 'page')
  return { patch, collection }
}

export async function getEditorPage(req: PayloadRequest, id: string) {
  const page = await loadEditorPage(req, id, 1)
  return { page: toDraft(page), schemas: getPageBuilderSchema() }
}

export async function saveEditorPage(req: PayloadRequest, id: string, body: unknown) {
  if (!body || typeof body !== 'object' || !('page' in body) || Object.keys(body).some(key => !['page', 'expectedUpdatedAt'].includes(key))) {
    throw new NativeDraftError('Send only page content and expectedUpdatedAt.')
  }
  const expected = readExpectedUpdatedAt('expectedUpdatedAt' in body ? body.expectedUpdatedAt : undefined)
  const current = await loadEditorPage(req, id)
  assertCurrentDraftRevision(current, expected, 'page')
  const { patch } = await prepareEditorPagePatch(req, current, body.page)
  const page = await req.payload.update({ collection: 'pages', id, data: patch, draft: true, depth: 0, overrideAccess: false, overrideLock: false, req })
  return { page: toDraft(page) }
}

export async function listPageSections(req: PayloadRequest, tenant: string | null) {
  if (!tenant) return { sections: [] }
  const result = await req.payload.find({
    collection: 'page-section-templates', where: { tenant: { equals: tenant } }, limit: 100, depth: 0,
    sort: '-createdAt', overrideAccess: true, req,
  })
  return { sections: result.docs.flatMap(doc => doc.layout[0] ? [{ id: doc.id, name: doc.name, section: doc.layout[0] }] : []) }
}

export async function savePageSection(req: PayloadRequest, tenant: string | null, body: unknown) {
  if (!tenant) throw new NativeDraftError('Assign this page to a site before saving a reusable section.')
  if (!body || typeof body !== 'object' || !('section' in body) || !('name' in body)
    || typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 100
    || !body.section || typeof body.section !== 'object' || !('blockType' in body.section) || body.section.blockType !== PAGE_SECTION) {
    throw new NativeDraftError('Provide a section and a name of up to 100 characters.')
  }
  const section = body.section
  if (!('children' in section) || !Array.isArray(section.children) || !section.children.length) {
    throw new NativeDraftError('Add an element before saving this section for reuse.')
  }
  const fields = req.payload.config.collections.find(collection => collection.slug === 'pages')?.fields as unknown as DraftField[]
  if (!fields) throw new Error('Page schema is unavailable.')
  const patch = buildNativeEmailDraftPatch({ layout: [section] }, fields, [], 'page')
  await assertDraftReferences(req, patch, {}, fields, tenant, 'page')
  const layout = patch.layout as PageSectionTemplate['layout']
  const doc = await req.payload.create({
    collection: 'page-section-templates', data: { tenant, name: body.name.trim(), layout },
    depth: 0, overrideAccess: true, req,
  })
  return { template: { id: doc.id, name: doc.name, section: doc.layout[0] } }
}
