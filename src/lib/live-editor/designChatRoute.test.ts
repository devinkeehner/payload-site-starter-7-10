import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET, POST } from '@/app/api/live-editor/pages/[id]/[[...action]]/route'
import { LiveEditorAccessError } from './emailAccess'
import { designChatScope } from './designChatStore'

const { createRequest, loadPage, streamChat, getStore, load, begin, reset, finishTool, runTool } = vi.hoisted(() => ({
  createRequest: vi.fn(), loadPage: vi.fn(), streamChat: vi.fn(), getStore: vi.fn(),
  load: vi.fn(), begin: vi.fn(), reset: vi.fn(), finishTool: vi.fn(), runTool: vi.fn(),
}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({ createPayloadRequest: createRequest }))
vi.mock('./pageService', () => ({ loadEditorPage: loadPage }))
vi.mock('./designChatService', async original => ({ ...(await original<typeof import('./designChatService')>()), streamDesignChat: streamChat }))
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
})
