import type { PayloadRequest, Where } from 'payload'
import { getEmailCampaignStatus, isEmailContentLocked } from '@/lib/email/lifecycle'
import { getEmailPuckBlockSchema } from '@/lib/puck/schema'
import { assertEditorUser, assertEmailTenantAccess, LiveEditorAccessError, relationshipID } from './emailAccess'
import { assertCurrentDraftRevision, buildNativeEmailDraftPatch, NativeDraftError, readNativeDraftRequest, type DraftField } from './emailDraft'

type EmailRecord = Record<string, unknown> & { id: string | number; updatedAt: string; tenant?: unknown }
const exposed = ['id', 'title', 'subject', 'preheader', 'replyTo', 'layout', 'status', 'updatedAt', 'tenant'] as const
export function editorEmail(email: EmailRecord) {
  return { ...Object.fromEntries(exposed.map(key => [key, email[key]])),
    title: typeof email.title === 'string' ? email.title : 'Untitled email',
    subject: typeof email.subject === 'string' ? email.subject : '',
    preheader: typeof email.preheader === 'string' ? email.preheader : '',
    replyTo: typeof email.replyTo === 'string' ? email.replyTo : '',
    tenant: relationshipID(email.tenant), tenantId: relationshipID(email.tenant) }
}

export async function loadEditorEmail(req: PayloadRequest, id: string, depth = 2) {
  assertEditorUser(req.user)
  const email = await req.payload.findByID({ collection: 'emails', id, draft: true, depth, overrideAccess: false, req }) as unknown as EmailRecord
  assertEmailTenantAccess(req.user, email)
  return email
}

export async function getEditorEmail(req: PayloadRequest, id: string) {
  const email = await loadEditorEmail(req, id)
  return { email: editorEmail(email), schemas: getEmailPuckBlockSchema() }
}

function referenceKeys(value: unknown, fields: readonly DraftField[], refs = new Map<string, { collection: string; id: string }>()) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return refs
  const row = value as Record<string, unknown>
  const add = (collection: string, value: unknown) => {
    const id = relationshipID(value)
    if (id) refs.set(`${collection}:${id}`, { collection, id })
  }
  const lexical = (value: unknown) => {
    if (!value || typeof value !== 'object') return
    const node = value as Record<string, unknown>
    if ((node.type === 'upload' || node.type === 'relationship') && typeof node.relationTo === 'string') add(node.relationTo, node.value)
    const link = node.fields as Record<string, unknown> | undefined
    const doc = link?.doc as Record<string, unknown> | undefined
    if (doc && typeof doc.relationTo === 'string') add(doc.relationTo, doc.value)
    if (Array.isArray(node.children)) node.children.forEach(lexical)
    if (node.root) lexical(node.root)
  }
  for (const field of fields) {
    if (field.type === 'tabs') { for (const tab of field.tabs || []) referenceKeys(tab.name ? row[tab.name] : row, tab.fields, refs); continue }
    if (['row', 'collapsible'].includes(field.type)) { referenceKeys(row, field.fields || [], refs); continue }
    if (!field.name) continue
    const stored = row[field.name]
    if (field.type === 'richText') lexical(stored)
    if (field.type === 'relationship' || field.type === 'upload') {
      const values = field.hasMany && Array.isArray(stored) ? stored : [stored]
      for (const item of values) {
        if (typeof field.relationTo === 'string') add(field.relationTo, item)
        else if (item && typeof item === 'object') {
          const relation = item as Record<string, unknown>
          if (typeof relation.relationTo === 'string') add(relation.relationTo, relation.value)
        }
      }
    }
    if (field.type === 'group') referenceKeys(stored, field.fields || [], refs)
    if ((field.type === 'blocks' || field.type === 'array') && Array.isArray(stored)) {
      for (const item of stored) {
        const definition = field.type === 'blocks' ? field.blocks?.find(block => block.slug === item?.blockType) : null
        referenceKeys(item, definition?.fields || field.fields || [], refs)
      }
    }
  }
  return refs
}

export async function saveEditorEmail(req: PayloadRequest, id: string, body: unknown) {
  const { email: incoming, expectedUpdatedAt } = readNativeDraftRequest(body)
  const current = await loadEditorEmail(req, id, 0)
  if (isEmailContentLocked(getEmailCampaignStatus(current.status))) {
    throw new NativeDraftError('This campaign is locked. Cancel its schedule or duplicate it before editing.', 409)
  }
  assertCurrentDraftRevision(current, expectedUpdatedAt)
  const fields = req.payload.config.collections.find(collection => collection.slug === 'emails')?.fields as unknown as DraftField[]
  if (!fields) throw new Error('Email schema is unavailable.')
  const patch = buildNativeEmailDraftPatch(incoming, fields)
  const previous = referenceKeys(current, fields)
  for (const [key, reference] of referenceKeys(patch, fields)) {
    if (previous.has(key)) continue
    const related = await req.payload.findByID({ collection: reference.collection as 'media', id: reference.id, depth: 0, overrideAccess: false, req })
    if (!relationshipID(current.tenant) || relationshipID((related as unknown as { tenant?: unknown }).tenant) !== relationshipID(current.tenant)) {
      throw new LiveEditorAccessError('Choose media and linked documents from this email’s site.', 403)
    }
  }
  // Optimistic stale-save detection, with the normal collection lock/lifecycle hooks
  // still enforced. This is not a database-wide compare-and-swap transaction.
  const email = await req.payload.update({ collection: 'emails', id, data: patch, draft: true, depth: 2, overrideAccess: false, overrideLock: false, req }) as unknown as EmailRecord
  return { email: editorEmail(email) }
}

export async function getEditorOptions(req: PayloadRequest, id: string, url: URL) {
  const email = await loadEditorEmail(req, id, 0)
  const collection = url.searchParams.get('collection') || 'media'
  if (!['media', 'pages', 'posts'].includes(collection)) throw new NativeDraftError('Unsupported collection.')
  const tenant = relationshipID(email.tenant)
  if (!tenant) return { options: [] }
  const query = (url.searchParams.get('query') || '').trim().slice(0, 200)
  const ids = (url.searchParams.get('ids') || '').split(',').filter(Boolean).slice(0, 100)
  const and: Where[] = [{ tenant: { equals: tenant } }]
  if (ids.length) and.push({ id: { in: ids } })
  else if (query) and.push({ or: (collection === 'media' ? ['filename', 'alt'] : ['title', 'slug']).map(field => ({ [field]: { like: query } })) })
  const result = await req.payload.find({ collection: collection as 'media', where: { and }, limit: ids.length || 60, depth: 1, overrideAccess: false, req })
  return { options: result.docs.map(doc => ({ value: String(doc.id), label: String(('alt' in doc && doc.alt) || ('filename' in doc && doc.filename) || ('title' in doc && doc.title) || doc.id), resource: doc, thumbnailURL: 'url' in doc ? doc.url : null })) }
}
