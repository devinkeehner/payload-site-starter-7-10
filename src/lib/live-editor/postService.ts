import type { PayloadRequest } from 'payload'
import { canUseBuilders, isSuperUser } from '@/lib/access/isSuperUser'
import { getSharedPostBuilderSchema } from '@/lib/puck/schema'
import { assertDraftReferences } from './emailService'
import { LiveEditorAccessError, relationshipID } from './emailAccess'
import { assertCurrentDraftRevision, buildNativeEmailDraftPatch, NativeDraftError, readNativeDraftRequest, type DraftField } from './emailDraft'

export function assertPostSite(req: PayloadRequest, tenant: string | null) {
  if (!canUseBuilders(req.user)) throw new LiveEditorAccessError('Sign in with an account authorized to edit post layouts.', 403)
  if (isSuperUser(req.user)) return
  const user = req.user as { tenants?: { tenant?: unknown }[] }
  if (!tenant || !user.tenants?.some(entry => relationshipID(entry.tenant) === tenant)) {
    throw new LiveEditorAccessError('This post is outside your assigned sites.', 403)
  }
}

export async function loadEditorPost(req: PayloadRequest, id: string, depth = 3) {
  if (!canUseBuilders(req.user)) throw new LiveEditorAccessError('Sign in with an account authorized to edit post layouts.', 403)
  const post = await req.payload.findByID({ collection: 'posts', id, draft: true, depth, overrideAccess: false, req })
  assertPostSite(req, relationshipID(post.tenant))
  return post
}

function postDraft(post: Awaited<ReturnType<typeof loadEditorPost>>) {
  return {
    collection: 'posts', id: post.id, title: post.title, layout: post.layout, content: post.content,
    updatedAt: post.updatedAt, tenantName: typeof post.tenant === 'object' ? post.tenant?.name : undefined,
  }
}

export async function getEditorPost(req: PayloadRequest, id: string) {
  return { post: postDraft(await loadEditorPost(req, id)), schemas: getSharedPostBuilderSchema() }
}

export function normalizePostLayoutPatch(req: PayloadRequest, incoming: Record<string, unknown>) {
  const fields = req.payload.config.collections.find(collection => collection.slug === 'posts')?.fields as unknown as DraftField[]
  if (!fields) throw new Error('Post schema is unavailable.')
  const patch = buildNativeEmailDraftPatch(incoming, fields, [], 'post')
  return { fields, patch }
}

export async function saveEditorPost(req: PayloadRequest, id: string, body: unknown) {
  if (!body || typeof body !== 'object' || !('post' in body) || Object.keys(body).some(key => !['post', 'expectedUpdatedAt'].includes(key))) {
    throw new NativeDraftError('Only post and expectedUpdatedAt may be submitted.')
  }
  const { email: incoming, expectedUpdatedAt } = readNativeDraftRequest({ email: body.post, expectedUpdatedAt: 'expectedUpdatedAt' in body ? body.expectedUpdatedAt : undefined })
  const current = await loadEditorPost(req, id, 0)
  assertCurrentDraftRevision(current, expectedUpdatedAt, 'post')
  const { fields, patch } = normalizePostLayoutPatch(req, incoming)
  await assertDraftReferences(req, patch, current, fields, relationshipID(current.tenant), 'post')
  const post = await req.payload.update({ collection: 'posts', id, data: patch, draft: true, depth: 0, overrideAccess: false, overrideLock: false, req })
  return { post: postDraft(post) }
}
