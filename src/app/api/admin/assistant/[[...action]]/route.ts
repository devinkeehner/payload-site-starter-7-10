import { createHash } from 'node:crypto'
import { createPayloadRequest } from 'payload'
import { z } from 'zod'
import configPromise from '@payload-config'
import { getSelectedTenantID } from '@/components/admin/dashboard/adminDashboardMeta'
import { MAX_ASSISTANT_MESSAGE } from '@/lib/dashboard-assistant/protocol'
import { streamDashboardChat } from '@/lib/dashboard-assistant/runner'
import { assertDashboardSite } from '@/lib/dashboard-assistant/access'
import { designChatScope, designChatStore } from '@/lib/live-editor/designChatStore'
import { allowDesignChatRun, readDesignChatJSON, readDesignChatReset } from '@/lib/live-editor/designChatService'
import type { DesignChatRequest } from '@/lib/live-editor/designChatProtocol'
import { LiveEditorAccessError, relationshipID } from '@/lib/live-editor/emailAccess'
import { isSameOriginDraftRequest, NativeDraftError } from '@/lib/live-editor/emailDraft'
import { editorFailure } from '@/lib/live-editor/emailHttp'
import { uploadDraftMedia } from '@/lib/live-editor/emailService'

export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'private, no-store' }
const scopeName = 'payload-dashboard-assistant'
const schema = z.object({
  chatId: z.string().uuid(), turnId: z.string().uuid(),
  content: z.string().max(MAX_ASSISTANT_MESSAGE),
  imageId: z.string().min(1).max(100).nullable(),
}).strict().refine(message => message.content.trim() || message.imageId)

type Context = { params: Promise<{ action?: string[] }> }

async function authorize(request: Request) {
  const req = await createPayloadRequest({ config: configPromise, request, canSetHeaders: false })
  if (!req.user?.id || req.user.collection !== 'users') throw new LiveEditorAccessError('Sign in to the dashboard to use the assistant.', 401)
  const userId = String(req.user.id)
  const selection = getSelectedTenantID(req)
  const tenant = selection ? await assertDashboardSite(req, selection) : null
  const tenantId = tenant ? String(tenant.id) : null
  const scope = designChatScope(userId, tenantId, scopeName)
  return { req, userId, tenant, tenantId, scope, store: designChatStore(req, scope) }
}

export async function GET(request: Request, { params }: Context) {
  if ((await params).action?.length) return new Response(null, { status: 404, headers })
  try {
    const { store, tenant } = await authorize(request)
    return Response.json({ ...await store.load(), site: tenant ? { id: tenant.id, name: tenant.name || tenant.slug } : null }, { headers })
  } catch (error) { return editorFailure(error, 'Unable to open this conversation.') }
}

export async function POST(request: Request, { params }: Context) {
  if (!isSameOriginDraftRequest(request)) return Response.json({ error: 'Use the signed-in dashboard for this action.' }, { status: 403, headers })
  const operation = (await params).action?.join('/') || 'message'
  if (!['message', 'reset', 'media'].includes(operation)) return new Response(null, { status: 404, headers })
  try {
    const { req, store, scope, tenantId, userId } = await authorize(request)
    if (operation === 'reset') {
      const { chatId } = await readDesignChatReset(request)
      return Response.json(await store.reset(chatId), { headers })
    }
    if (operation === 'media') {
      const current = await store.load()
      if (current.id !== request.headers.get('X-Assistant-Chat') || current.busy) throw new NativeDraftError('The site or conversation changed. Reload it before adding media.', 409)
      if (!tenantId) throw new NativeDraftError('Select a website before adding an image to its gallery.')
      const media = await uploadDraftMedia(req, tenantId, request)
      return Response.json({ id: String(media.id), name: media.filename || media.alt }, { headers, status: 201 })
    }
    const apiKey = process.env.OPENAI_API_KEY?.trim()
    if (!apiKey) return Response.json({ error: 'The website assistant is not configured on this server.' }, { headers, status: 503 })
    const { chatId, turnId, content, imageId } = await readDesignChatJSON(request, schema, MAX_ASSISTANT_MESSAGE * 6 + 1200)
    if (!allowDesignChatRun(userId)) return Response.json({ error: 'Please wait a moment before sending another message.' }, { headers, status: 429 })
    const input: DesignChatRequest = { chatId, message: { content, attachments: [] } }
    if (imageId) {
      if (!tenantId) throw new NativeDraftError('Select the website that owns this gallery image.')
      const media = await req.payload.findByID({ req, collection: 'media', id: imageId, depth: 0, overrideAccess: false,
        disableErrors: true, select: { tenant: true, mimeType: true, filename: true, alt: true } })
      if (!media || relationshipID(media.tenant) !== tenantId || !media.mimeType?.startsWith('image/')) {
        throw new NativeDraftError('Choose an image from the current site’s gallery.')
      }
      input.message.attachments.push({ kind: 'media', mediaId: String(media.id), mediaType: 'image', name: String(media.filename || media.alt || media.id).slice(0, 240) })
    }
    const turn = await store.begin(input)
    const runId = createHash('sha256').update(JSON.stringify([scope, chatId, turnId])).digest('hex')
    return new Response(streamDashboardChat({ req, tenantId, request, runId, input, turn, apiKey }), {
      headers: { ...headers, 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'private, no-store, no-transform', 'X-Accel-Buffering': 'no' },
    })
  } catch (error) { return editorFailure(error, 'Unable to complete this dashboard request.') }
}
