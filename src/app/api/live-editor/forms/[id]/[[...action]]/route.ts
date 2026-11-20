import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'

import { relationshipID } from '@/lib/live-editor/emailAccess'
import { isSameOriginDraftRequest, NativeDraftError } from '@/lib/live-editor/emailDraft'
import { editorFailure } from '@/lib/live-editor/emailHttp'
import { getDraftResourceOptions, uploadDraftMedia } from '@/lib/live-editor/emailService'
import { getEditorForm, loadEditorForm, saveEditorForm } from '@/lib/live-editor/formService'

export const runtime = 'nodejs'

const headers = { 'Cache-Control': 'private, no-store' }
type Context = { params: Promise<{ id: string; action?: string[] }> }
const payloadRequest = (request: Request) => createPayloadRequest({ config: configPromise, request, canSetHeaders: false })

export async function GET(request: Request, { params }: Context) {
  try {
    const { id, action } = await params
    if (!action?.length) return Response.json(await getEditorForm(await payloadRequest(request), id), { headers })
    if (action.join('/') !== 'options') return new Response(null, { status: 404, headers })

    const req = await payloadRequest(request)
    const form = await loadEditorForm(req, id, 0)
    const options = await getDraftResourceOptions(req, relationshipID(form.tenant), new URL(request.url))
    return Response.json(options, { headers })
  } catch (error) {
    return editorFailure(error, 'Unable to access this form.')
  }
}

export async function PATCH(request: Request, { params }: Context) {
  if (!isSameOriginDraftRequest(request)) {
    return Response.json({ error: 'Save forms from this site’s editor.' }, { status: 403, headers })
  }

  try {
    const { id, action } = await params
    if (action?.length) return new Response(null, { status: 404, headers })
    if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') {
      throw new NativeDraftError('Send the form as JSON.')
    }

    const raw = await request.text()
    if (raw.length > 2_000_000) throw new NativeDraftError('This form is too large to save in the editor.')
    let body: unknown
    try { body = JSON.parse(raw) } catch { throw new NativeDraftError('Invalid form JSON.') }

    return Response.json(await saveEditorForm(await payloadRequest(request), id, body), { headers })
  } catch (error) {
    return editorFailure(error, 'Unable to save this form.')
  }
}

export async function POST(request: Request, { params }: Context) {
  if (!isSameOriginDraftRequest(request)) {
    return Response.json({ error: 'Upload media from this site’s editor.' }, { status: 403, headers })
  }

  try {
    const { id, action } = await params
    if (action?.join('/') !== 'media') return new Response(null, { status: 404, headers })

    const req = await payloadRequest(request)
    const form = await loadEditorForm(req, id, 0)
    const resource = await uploadDraftMedia(req, relationshipID(form.tenant), request)
    return Response.json({ resource, doc: resource }, { headers })
  } catch (error) {
    return editorFailure(error, 'Unable to upload media to this form.')
  }
}
