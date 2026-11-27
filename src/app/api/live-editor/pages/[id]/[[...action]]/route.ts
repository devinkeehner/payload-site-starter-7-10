import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'
import { relationshipID } from '@/lib/live-editor/emailAccess'
import { isSameOriginDraftRequest, NativeDraftError } from '@/lib/live-editor/emailDraft'
import { editorFailure } from '@/lib/live-editor/emailHttp'
import { getDraftResourceOptions, uploadDraftMedia } from '@/lib/live-editor/emailService'
import { getEditorPage, loadEditorPage, saveEditorPage, listPageSections, savePageSection } from '@/lib/live-editor/pageService'
import { allowDesignChatRun, readDesignChatRequest, readDesignChatReset, readDesignToolResult, streamDesignChat } from '@/lib/live-editor/designChatService'
import { readDesignSitePreview, stageDesignSitePreview } from '@/lib/live-editor/designSitePreview'
import { designChatScope, designChatStore } from '@/lib/live-editor/designChatStore'
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
    if (!operation) return Response.json(await getEditorPage(req, id), { headers })
    if (operation !== 'options' && operation !== 'preview' && operation !== 'sections' && operation !== 'design-chat') return new Response(null, { status: 404, headers })
    const page = await loadEditorPage(req, id, 0)
    const tenantId = relationshipID(page.tenant) || undefined
    if (operation === 'design-chat') {
      const store = designChatStore(req, designChatScope(String(req.user!.id), tenantId ?? null, String(page.id)))
      return Response.json(await store.load(), { headers })
    }
    if (operation === 'sections') return Response.json(await listPageSections(req, tenantId || null), { headers })
    if (operation === 'options') return Response.json(await getDraftResourceOptions(req, tenantId || null, new URL(request.url), ['forms']), { headers })
    if (!page.slug) throw new NativeDraftError('Set a page slug in Payload before opening a website preview.')
    const url = generatePreviewPath({ collection: 'pages', slug: page.slug, req, tenantId })
    return new Response(null, { status: 302, headers: { ...headers, Location: url } })
  } catch (error) {
    return editorFailure(error, 'Unable to access this page draft.')
  }
}

export async function PATCH(request: Request, { params }: Context) {
  if (!isSameOriginDraftRequest(request)) return Response.json({ error: 'Save drafts from this site’s editor.' }, { status: 403, headers })
  try {
    const { id, action } = await params
    if (action?.length) return new Response(null, { status: 404, headers })
    if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') throw new NativeDraftError('Send the page draft as JSON.')
    const raw = await request.text()
    if (raw.length > 2_000_000) throw new NativeDraftError('This draft is too large to save in Live Editor.')
    let body: unknown
    try { body = JSON.parse(raw) } catch { throw new NativeDraftError('Invalid draft JSON.') }
    return Response.json(await saveEditorPage(await payloadRequest(request), id, body), { headers })
  } catch (error) {
    return editorFailure(error, 'Unable to save this page draft.')
  }
}

export async function POST(request: Request, { params }: Context) {
  if (!isSameOriginDraftRequest(request)) return Response.json({ error: 'Use this site’s editor.' }, { status: 403, headers })
  try {
    const { id, action } = await params
    const operation = action?.join('/')
    if (operation !== 'media' && operation !== 'sections' && operation !== 'design-chat' && operation !== 'design-chat/tool' && operation !== 'design-chat/reset' && operation !== 'design-chat/preview') return new Response(null, { status: 404, headers })
    const req = await payloadRequest(request)
    const page = await loadEditorPage(req, id, operation === 'design-chat/preview' ? 1 : 0)
    if (operation.startsWith('design-chat')) {
      const userId = String(req.user!.id)
      const store = designChatStore(req, designChatScope(userId, relationshipID(page.tenant), String(page.id)))
      if (operation === 'design-chat/preview') {
        const input = await readDesignSitePreview(request)
        await store.assertPreviewCall(input.callId)
        return Response.json(await stageDesignSitePreview(req, page, input), { headers })
      }
      if (operation === 'design-chat/tool') {
        await store.finishTool(await readDesignToolResult(request))
        return new Response(null, { status: 204, headers })
      }
      if (operation === 'design-chat/reset') {
        const { chatId } = await readDesignChatReset(request)
        return Response.json(await store.reset(chatId), { headers })
      }
      const apiKey = process.env.OPENAI_API_KEY?.trim()
      if (!apiKey) return Response.json({ error: 'Design chat is not configured on this server.' }, { status: 503, headers })
      const input = await readDesignChatRequest(request)
      if (!allowDesignChatRun(userId)) return Response.json({ error: 'Design chat is busy. Try again shortly.' }, { status: 429, headers })
      const run = await store.begin(input)
      return new Response(streamDesignChat(input, apiKey, userId, request.signal, run, store.runTool), {
        headers: { 'Cache-Control': 'private, no-store, no-transform', 'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-Accel-Buffering': 'no' },
      })
    }
    if (operation === 'sections') {
      if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') throw new NativeDraftError('Send the section as JSON.')
      const raw = await request.text()
      if (raw.length > 250_000) throw new NativeDraftError('This section is too large to save.')
      let body: unknown
      try { body = JSON.parse(raw) } catch { throw new NativeDraftError('Invalid section JSON.') }
      return Response.json(await savePageSection(req, relationshipID(page.tenant), body), { headers, status: 201 })
    }
    const resource = await uploadDraftMedia(req, relationshipID(page.tenant), request, { video: true, pdf: true })
    return Response.json({ resource, doc: resource }, { headers })
  } catch (error) {
    return editorFailure(error, 'Unable to complete this page editor request.')
  }
}
