import configPromise from '@payload-config'
import { commitTransaction, createPayloadRequest, initTransaction, killTransaction } from 'payload'
import { convertEmailToPost } from '@/lib/email/convertEmailToPost'
import { LiveEditorAccessError, relationshipID } from '@/lib/live-editor/emailAccess'
import { isSameOriginDraftRequest } from '@/lib/live-editor/emailDraft'
import { editorFailure } from '@/lib/live-editor/emailHttp'
import { assertDraftReferences, loadEditorEmail } from '@/lib/live-editor/emailService'
import { assertPostSite, loadEditorPost, normalizePostLayoutPatch } from '@/lib/live-editor/postService'
import { formatSlug } from '@/collections/fields/slug/formatSlug'
import { randomBytes } from 'node:crypto'

const headers = { 'Cache-Control': 'private, no-store' }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginDraftRequest(request)) return Response.json({ error: 'Create a post from this site’s editor.' }, { status: 403, headers })
  try {
    const req = await createPayloadRequest({ canSetHeaders: false, config: configPromise, request })
    const { id } = await params
    const shouldCommit = await initTransaction(req)
    try {
      const email = await loadEditorEmail(req, id)
      const tenant = relationshipID(email.tenant)
      if (!tenant) throw new LiveEditorAccessError('Assign this email to a site before creating a post.', 403)
      assertPostSite(req, tenant)
      const linkedId = relationshipID(email.relatedPost)
      if (linkedId) {
        const post = await loadEditorPost(req, linkedId, 0)
        if (relationshipID(post.tenant) !== tenant) throw new LiveEditorAccessError('The linked post belongs to a different site.', 403)
        if (shouldCommit) await commitTransaction(req)
        return Response.json({ adminUrl: `/live-editor/posts/${encodeURIComponent(linkedId)}`, created: false, post }, { headers })
      }
      const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''
      const title = text(email.subject) || text(email.title) || 'Email update'
      const preheader = text(email.preheader)
      const { content, layout } = convertEmailToPost(email.layout, preheader || title)
      const { fields, patch } = normalizePostLayoutPatch(req, { title, layout })
      await assertDraftReferences(req, patch, {}, fields, tenant, 'post')
      // Payload permits missing publish-time metadata on an unpublished draft.
      const data: Record<string, unknown> = {
        ...patch, title, tenant, content, _status: 'draft',
        slug: `${formatSlug(title).slice(0, 100) || 'email-update'}-${randomBytes(5).toString('hex')}`,
        meta: { description: preheader, title },
      }
      const post = await req.payload.create({
        collection: 'posts',
        data,
        depth: 0, draft: true, overrideAccess: false, req,
      })
      await req.payload.update({
        collection: 'emails', id, data: { relatedPost: post.id }, depth: 0,
        draft: true, overrideAccess: false, overrideLock: false, req,
      })
      if (shouldCommit) await commitTransaction(req)
      return Response.json({ adminUrl: `/live-editor/posts/${encodeURIComponent(String(post.id))}`, created: true, post }, { headers })
    } catch (error) {
      if (shouldCommit) await killTransaction(req)
      throw error
    }
  } catch (error) {
    return editorFailure(error, 'Unable to create a post from this email.')
  }
}
