import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'
import { NativeDraftError, isSameOriginDraftRequest } from '@/lib/live-editor/emailDraft'
import { editorFailure } from '@/lib/live-editor/emailHttp'
import { getEditorEmail, saveEditorEmail } from '@/lib/live-editor/emailService'

export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'private, no-store' }
type Context = { params: Promise<{ id: string }> }
export async function GET(request: Request, context: Context) {
  try {
    const req = await createPayloadRequest({ config: configPromise, request, canSetHeaders: false })
    return Response.json(await getEditorEmail(req, (await context.params).id), { headers })
  } catch (error) { return editorFailure(error) }
}
export async function PATCH(request: Request, context: Context) {
  if (!isSameOriginDraftRequest(request)) return Response.json({ error: 'Save drafts from this site’s editor.' }, { status: 403, headers })
  try {
    if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') throw new NativeDraftError('Send the email draft as JSON.')
    const raw = await request.text()
    if (raw.length > 2_000_000) throw new NativeDraftError('This draft is too large to save in Live Editor.')
    let body: unknown
    try { body = JSON.parse(raw) } catch { throw new NativeDraftError('Invalid draft JSON.') }
    const req = await createPayloadRequest({ config: configPromise, request, canSetHeaders: false })
    return Response.json(await saveEditorEmail(req, (await context.params).id, body), { headers })
  } catch (error) { return editorFailure(error) }
}
