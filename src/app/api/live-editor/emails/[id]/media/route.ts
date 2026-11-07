import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'
import { isEmailContentLocked, getEmailCampaignStatus } from '@/lib/email/lifecycle'
import { NativeDraftError, isSameOriginDraftRequest } from '@/lib/live-editor/emailDraft'
import { relationshipID } from '@/lib/live-editor/emailAccess'
import { editorFailure } from '@/lib/live-editor/emailHttp'
import { loadEditorEmail } from '@/lib/live-editor/emailService'
export const runtime = 'nodejs'
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginDraftRequest(request)) return Response.json({ error: 'Upload media from this site’s editor.' }, { status: 403 })
  try {
    const req = await createPayloadRequest({ config: configPromise, request, canSetHeaders: false })
    const email = await loadEditorEmail(req, (await params).id, 0)
    if (isEmailContentLocked(getEmailCampaignStatus(email.status))) throw new NativeDraftError('This campaign is locked.', 409)
    const tenant = relationshipID(email.tenant)
    if (!tenant) throw new NativeDraftError('This email needs an assigned site before uploading media.')
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File) || !file.size || file.size > 10 * 1024 * 1024) throw new NativeDraftError('Choose an image up to 10 MB.')
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'].includes(file.type)) throw new NativeDraftError('Choose a JPEG, PNG, GIF, WebP or AVIF image.')
    const resource = await req.payload.create({ collection: 'media', data: { tenant, alt: String(form.get('alt') || file.name).slice(0, 500) },
      file: { data: Buffer.from(await file.arrayBuffer()), mimetype: file.type, name: file.name, size: file.size }, overrideAccess: false, req })
    return Response.json({ resource, doc: resource }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return editorFailure(error) }
}
