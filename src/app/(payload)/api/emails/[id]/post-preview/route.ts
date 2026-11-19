import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'
import { convertEmailToPost } from '@/lib/email/convertEmailToPost'
import { editorFailure } from '@/lib/live-editor/emailHttp'
import { loadEditorEmail } from '@/lib/live-editor/emailService'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const req = await createPayloadRequest({ canSetHeaders: false, config: configPromise, request })
    const email = await loadEditorEmail(req, (await params).id)
    const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''
    const title = text(email.subject) || text(email.title) || 'Email update'
    const preheader = text(email.preheader)
    return Response.json({
      ...convertEmailToPost(email.layout, preheader || title),
      meta: { description: preheader, title },
      title,
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return editorFailure(error, 'Unable to render the post preview.')
  }
}
