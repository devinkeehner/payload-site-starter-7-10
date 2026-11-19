import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'
import { relationshipID } from '@/lib/live-editor/emailAccess'
import { isSameOriginDraftRequest, NativeDraftError } from '@/lib/live-editor/emailDraft'
import { editorFailure } from '@/lib/live-editor/emailHttp'
import { getDraftResourceOptions, uploadDraftMedia } from '@/lib/live-editor/emailService'
import { getEditorPost, loadEditorPost, saveEditorPost } from '@/lib/live-editor/postService'
import { generatePreviewPath } from '@/lib/utilities/generatePreviewPath'

export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'private, no-store' }
type Context = { params: Promise<{ id: string; action?: string[] }> }
const payloadRequest = (request: Request) => createPayloadRequest({ config: configPromise, request, canSetHeaders: false })

export async function GET(request: Request, { params }: Context) {
  try {
    const { id, action } = await params
    const operation = action?.join('/')
    const req = await payloadRequest(request)
    if (!operation) return Response.json(await getEditorPost(req, id), { headers })
    if (operation !== 'options' && operation !== 'preview') return new Response(null, { status: 404, headers })
    const post = await loadEditorPost(req, id, 0)
    const tenantId = relationshipID(post.tenant) || undefined
    if (operation === 'options') return Response.json(await getDraftResourceOptions(req, tenantId || null, new URL(request.url)), { headers })
    if (!post.slug) throw new NativeDraftError('Set a post slug in Payload before opening a website preview.')
    const url = generatePreviewPath({ collection: 'posts', slug: post.slug, req, tenantId })
    return new Response(null, { status: 302, headers: { ...headers, Location: url } })
  } catch (error) {
    return editorFailure(error, 'Unable to access this post draft.')
  }
}

export async function PATCH(request: Request, { params }: Context) {
  if (!isSameOriginDraftRequest(request)) return Response.json({ error: 'Save drafts from this site’s editor.' }, { status: 403, headers })
  try {
    const { id, action } = await params
    if (action?.length) return new Response(null, { status: 404, headers })
    if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') throw new NativeDraftError('Send the post draft as JSON.')
    const raw = await request.text()
    if (raw.length > 2_000_000) throw new NativeDraftError('This draft is too large to save in Live Editor.')
    let body: unknown
    try { body = JSON.parse(raw) } catch { throw new NativeDraftError('Invalid draft JSON.') }
    return Response.json(await saveEditorPost(await payloadRequest(request), id, body), { headers })
  } catch (error) {
    return editorFailure(error, 'Unable to save this post draft.')
  }
}

export async function POST(request: Request, { params }: Context) {
  if (!isSameOriginDraftRequest(request)) return Response.json({ error: 'Upload media from this site’s editor.' }, { status: 403, headers })
  try {
    const { id, action } = await params
    if (action?.join('/') !== 'media') return new Response(null, { status: 404, headers })
    const req = await payloadRequest(request)
    const post = await loadEditorPost(req, id, 0)
    const resource = await uploadDraftMedia(req, relationshipID(post.tenant), request)
    return Response.json({ resource, doc: resource }, { headers })
  } catch (error) {
    return editorFailure(error, 'Unable to upload media to this post.')
  }
}
