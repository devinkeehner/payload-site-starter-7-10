import { afterEach, describe, expect, it, vi } from 'vitest'
import { POST as redeemPreview } from '@/app/api/live-editor/design-preview/route'
import { GET, POST } from '@/app/api/live-editor/pages/[id]/[[...action]]/route'
import { NativeDraftError } from './emailDraft'
import { LiveEditorAccessError } from './emailAccess'
import { designChatScope } from './designChatStore'

const { createRequest, getPayload, loadPage, streamChat, getStore, load, begin, reset, finishTool, runTool, assertPreviewCall, stagePreview } = vi.hoisted(() => ({
  createRequest: vi.fn(), getPayload: vi.fn(), loadPage: vi.fn(), streamChat: vi.fn(), getStore: vi.fn(),
  load: vi.fn(), begin: vi.fn(), reset: vi.fn(), finishTool: vi.fn(), runTool: vi.fn(), assertPreviewCall: vi.fn(), stagePreview: vi.fn(),
}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({ createPayloadRequest: createRequest, getPayload }))
vi.mock('./pageService', () => ({ loadEditorPage: loadPage }))
vi.mock('./designChatService', async original => ({ ...(await original<typeof import('./designChatService')>()), streamDesignChat: streamChat }))
vi.mock('./designSitePreview', async original => ({ ...(await original<typeof import('./designSitePreview')>()), stageDesignSitePreview: stagePreview }))
vi.mock('./designChatStore', async original => ({ ...(await original<typeof import('./designChatStore')>()), designChatStore: getStore }))

const context = (action = 'design-chat') => ({ params: Promise.resolve({ id: 'page-a', action: action.split('/') }) })
const chatId = 'da6be39c-78f3-4ac5-aee7-4d6481c6e20f'
const wireBody = { chatId, message: { content: 'Build a section', attachments: [] } }
const request = (route = 'design-chat', body: unknown = wireBody, origin = 'https://cms.example.test') =>
  new Request(`https://cms.example.test/api/live-editor/pages/page-a/${route}`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
const req = { user: { id: 'session-user' } }
const page = { id: 'page-a', tenant: 'site-a' }

afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs() })

describe('page design chat route', () => {
  it('rejects foreign origins and denied page access before using the transcript or provider', async () => {
    expect((await POST(request('design-chat', wireBody, 'https://other.example.test'), context())).status).toBe(403)
    expect(createRequest).not.toHaveBeenCalled()
    createRequest.mockResolvedValue(req)
    loadPage.mockRejectedValue(new LiveEditorAccessError('This page is outside your assigned sites.', 403))
    expect((await GET(new Request('https://cms.example.test/design-chat'), context())).status).toBe(403)
    expect((await POST(request(), context())).status).toBe(403)
    expect((await POST(request('design-chat/tool'), context('design-chat/tool'))).status).toBe(403)
    expect((await POST(request('design-chat/reset'), context('design-chat/reset'))).status).toBe(403)
    expect((await POST(request('design-chat/preview'), context('design-chat/preview'))).status).toBe(403)
    expect(loadPage).toHaveBeenCalledWith(req, 'page-a', 0)
    expect(getStore).not.toHaveBeenCalled()
    expect(streamChat).not.toHaveBeenCalled()
  })

  it('reuses the server API key and authorizes all chat operations in the same account and page scope', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'seo-key-mock')
    createRequest.mockResolvedValue(req)
    loadPage.mockResolvedValue(page)
    getStore.mockReturnValue({ load, begin, reset, finishTool, runTool })
    const thread = { id: chatId, messages: [], busy: false }
    load.mockResolvedValue(thread)
    reset.mockResolvedValue({ ...thread, id: 'new-chat' })
    const run = { history: [], finish: vi.fn() }
    begin.mockResolvedValue(run)
    streamChat.mockReturnValueOnce(new Response('{"type":"done"}\n').body)
    const source = request()
    expect(await (await GET(new Request('https://cms.example.test/design-chat'), context())).json()).toEqual(thread)
    const result = await POST(source, context())
    expect(result.headers.get('content-type')).toContain('application/x-ndjson')
    expect(await result.text()).toBe('{"type":"done"}\n')
    expect(begin).toHaveBeenCalledWith(wireBody)
    expect(streamChat).toHaveBeenCalledWith(wireBody, 'seo-key-mock', 'session-user', source.signal, run, runTool)
    const tool = { id: chatId, output: 'done' }
    expect((await POST(request('design-chat/tool', tool), context('design-chat/tool'))).status).toBe(204)
    expect(finishTool).toHaveBeenCalledWith(tool)
    expect((await (await POST(request('design-chat/reset', { chatId }), context('design-chat/reset'))).json()).id).toBe('new-chat')
    expect(reset).toHaveBeenCalledWith(chatId)
    expect(getStore.mock.calls).toEqual(Array.from({ length: 4 }, () => [req, designChatScope('session-user', 'site-a', 'page-a')]))
  })
  it('stages the unsaved layout only for an active preview tool call in the same page scope', async () => {
    createRequest.mockResolvedValue(req)
    loadPage.mockResolvedValue(page)
    getStore.mockReturnValue({ assertPreviewCall })
    const action = 'design-chat/preview'
    const input = { callId: chatId, revision: 7, layout: [{ blockType: 'composableSection' }] }
    assertPreviewCall.mockRejectedValueOnce(new NativeDraftError('This preview request is no longer active.', 409))
    expect((await POST(request(action, input), context(action))).status).toBe(409)
    expect(stagePreview).not.toHaveBeenCalled()
    stagePreview.mockResolvedValueOnce({ url: 'https://site.example.test/preview' })
    const response = await POST(request(action, input), context(action))
    expect(await response.json()).toEqual({ url: 'https://site.example.test/preview' })
    expect(loadPage).toHaveBeenCalledWith(req, 'page-a', 1)
    expect(getStore).toHaveBeenCalledWith(req, designChatScope('session-user', 'site-a', 'page-a'))
    expect(assertPreviewCall).toHaveBeenCalledWith(chatId)
    expect(stagePreview).toHaveBeenCalledWith(req, page, input)
  })

  it('redeems each unexpired preview ticket only once without exposing the ticket digest', async () => {
    const token = 'a'.repeat(43)
    const snapshot = { _id: 'internal-digest', expiresAt: new Date(Date.now() + 10_000),
      page: { id: 'page-a', layout: [] }, editorOrigin: 'https://cms.example.test', tenantSlug: 'site-a', revision: 7 }
    const findOneAndDelete = vi.fn().mockResolvedValueOnce(snapshot).mockResolvedValueOnce(null)
    const collection = vi.fn().mockReturnValue({ findOneAndDelete })
    getPayload.mockResolvedValue({ db: { connection: {
      name: 'test', getClient: () => ({ db: () => ({ collection }) }),
    } } })
    const url = 'https://cms.example.test/api/live-editor/design-preview'
    const redeem = () => redeemPreview(new Request(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }))
    expect((await redeemPreview(new Request(url, { method: 'POST' }))).status).toBe(404)
    expect(getPayload).not.toHaveBeenCalled()
    const first = await redeem()
    expect(first.headers.get('cache-control')).toBe('private, no-store')
    expect(await first.json()).toEqual({ page: snapshot.page, editorOrigin: snapshot.editorOrigin, tenantSlug: 'site-a', revision: 7 })
    expect((await redeem()).status).toBe(404)
    expect(findOneAndDelete).toHaveBeenCalledWith({
      _id: expect.stringMatching(/^[0-9a-f]{64}$/), expiresAt: { $gt: expect.any(Date) },
    })
  })

})
