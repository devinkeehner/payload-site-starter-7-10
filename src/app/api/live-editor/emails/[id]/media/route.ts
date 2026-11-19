import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'
import { isEmailContentLocked, getEmailCampaignStatus } from '@/lib/email/lifecycle'
import { NativeDraftError, isSameOriginDraftRequest } from '@/lib/live-editor/emailDraft'
import { relationshipID } from '@/lib/live-editor/emailAccess'
import { editorFailure } from '@/lib/live-editor/emailHttp'
import { loadEditorEmail, uploadDraftMedia } from '@/lib/live-editor/emailService'
export const runtime = 'nodejs'
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginDraftRequest(request)) return Response.json({ error: 'Upload media from this site’s editor.' }, { status: 403 })
  try {
    const req = await createPayloadRequest({ config: configPromise, request, canSetHeaders: false })
    const email = await loadEditorEmail(req, (await params).id, 0)
    if (isEmailContentLocked(getEmailCampaignStatus(email.status))) throw new NativeDraftError('This campaign is locked.', 409)
    const resource = await uploadDraftMedia(req, relationshipID(email.tenant), request)
    return Response.json({ resource, doc: resource }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return editorFailure(error) }
}
