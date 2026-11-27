import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET, POST } from '@/app/api/admin/assistant/[[...action]]/route'
import { assistantSiteHeader } from './protocol'
import { designChatScope } from '@/lib/live-editor/designChatStore'
import { LiveEditorAccessError } from '@/lib/live-editor/emailAccess'

const mocks = vi.hoisted(() => ({
  create: vi.fn(), getTenant: vi.fn(), assertSite: vi.fn(), upload: vi.fn(), run: vi.fn(), store: vi.fn(),
  load: vi.fn(), reset: vi.fn(), begin: vi.fn(), find: vi.fn(),
}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({ createPayloadRequest: mocks.create }))
vi.mock('@/lib/dashboard-assistant/access', () => ({ assertDashboardSite: mocks.assertSite }))
vi.mock('@/lib/dashboard-assistant/runner', () => ({ streamDashboardChat: mocks.run }))
vi.mock('@/lib/live-editor/emailService', () => ({ uploadDraftMedia: mocks.upload }))
vi.mock('@payloadcms/plugin-multi-tenant/utilities', () => ({ getTenantFromCookie: mocks.getTenant }))
vi.mock('@/lib/live-editor/designChatStore', async (original) => ({
  ...await original<typeof import('@/lib/live-editor/designChatStore')>(), designChatStore: mocks.store,
}))

const chatId = '67a04d37-31d4-457b-9fc7-acbad06c654e'
const turnId = '16f3230f-6262-4508-b4df-28fadf3448d8'
const creator = { collection: 'users', id: 'creator' }
const req = { user: creator, payload: { findByID: mocks.find } }
const thread = { id: chatId, busy: false, messages: [] }
const body = { chatId, turnId, content: 'Create a release draft', imageId: null as string | null }
const base = 'https://cms.example.test/api/admin/assistant'
const ctx = (action?: string) => ({ params: Promise.resolve({ action: action ? [action] : undefined }) })
const post = (data: unknown = body, origin = 'https://cms.example.test', expectedSite?: string) => new Request(base, {
  method: 'POST', headers: {
    Origin: origin, 'Content-Type': 'application/json', ...(expectedSite !== undefined && { [assistantSiteHeader]: expectedSite }),
  }, body: JSON.stringify(data),
})

beforeEach(() => {
  vi.stubEnv('OPENAI_API_KEY', 'test-only')
  mocks.create.mockResolvedValue(req)
  mocks.getTenant.mockReturnValue('site-a')
  mocks.assertSite.mockImplementation(async (_req, id) => ({ id, name: id === 'site-a' ? 'Site A' : 'Site B' }))
  mocks.store.mockReturnValue({ load: mocks.load, reset: mocks.reset, begin: mocks.begin })
  mocks.load.mockResolvedValue(thread)
  mocks.begin.mockResolvedValue({ history: [] })
  mocks.run.mockReturnValue(new Response('{"type":"done"}\n').body)
})
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs() })

describe('dashboard assistant', () => {
  it('requires a Payload user session and rejects foreign browser origins before opening a chat', async () => {
    expect((await POST(post(body, 'https://other.test'), ctx())).status).toBe(403)
    expect(mocks.create).not.toHaveBeenCalled()
    for (const user of [null, { id: 'key', collection: 'payload-mcp-api-keys' }]) {
      mocks.create.mockResolvedValue({ user })
      expect((await GET(new Request(base), ctx())).status).toBe(401)
      expect((await POST(post(), ctx())).status).toBe(401)
    }
    expect(mocks.store).not.toHaveBeenCalled()
    expect(mocks.run).not.toHaveBeenCalled()
  })
  it('scopes transcripts to the signed-in account and the current dashboard site', async () => {
    const first = await GET(new Request(base), ctx())
    expect(await first.json()).toEqual({ ...thread, site: { id: 'site-a', name: 'Site A' } })
    expect(first.headers.get('Cache-Control')).toBe('private, no-store')
    mocks.getTenant.mockReturnValueOnce('site-b')
    await GET(new Request(base), ctx())
    expect(mocks.store.mock.calls.map(call => call[1])).toEqual(['site-a', 'site-b'].map(site => designChatScope('creator', site, 'payload-dashboard-assistant')))
    mocks.reset.mockResolvedValue({ ...thread, id: turnId })
    expect((await (await POST(post({ chatId }), ctx('reset'))).json()).id).toBe(turnId)
    expect(mocks.reset).toHaveBeenCalledWith(chatId)
  })
  it('checks current site access before loading its transcript or starting another turn', async () => {
    mocks.assertSite.mockRejectedValue(new LiveEditorAccessError('This site is unavailable.', 403))
    expect((await GET(new Request(base), ctx())).status).toBe(403)
    expect((await POST(post(), ctx())).status).toBe(403)
    expect(mocks.store).not.toHaveBeenCalled()
    expect(mocks.run).not.toHaveBeenCalled()
  })
  it('rejects a different site in the current tab before loading a chat, starting a turn or uploading an image', async () => {
    const headers = { [assistantSiteHeader]: 'site-b', 'X-Assistant-Chat': chatId }
    expect((await GET(new Request(base, { headers }), ctx())).status).toBe(409)
    expect((await POST(post(body, 'https://cms.example.test', 'site-b'), ctx())).status).toBe(409)
    expect((await POST(new Request(base + '/media', { method: 'POST', headers }), ctx('media'))).status).toBe(409)
    expect(mocks.assertSite).not.toHaveBeenCalled()
    expect(mocks.store).not.toHaveBeenCalled()
    expect(mocks.run).not.toHaveBeenCalled()
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('keeps the conversation for All Sites separate, even for a user with one saved site', async () => {
    mocks.getTenant.mockReturnValue(null)
    mocks.create.mockResolvedValue({ ...req, user: { ...creator, tenants: [{ tenant: 'site-a' }] } })
    const result = await GET(new Request(base, { headers: { [assistantSiteHeader]: '' } }), ctx())
    expect(await result.json()).toMatchObject({ site: null })
    expect(mocks.assertSite).not.toHaveBeenCalled()
    expect(mocks.store).toHaveBeenCalledWith(expect.anything(), designChatScope('creator', null, 'payload-dashboard-assistant'))
  })
  it('rejects client-supplied authority and validates the actual owner and type of gallery images', async () => {
    expect((await POST(post({ ...body, tenantId: 'site-b' }), ctx())).status).toBe(400)
    for (const media of [null, { id: 'm', tenant: 'site-b', mimeType: 'image/png' }, { id: 'm', tenant: 'site-a', mimeType: 'application/pdf' }]) {
      mocks.find.mockResolvedValueOnce(media)
      expect((await POST(post({ ...body, imageId: 'm' }), ctx())).status).toBe(400)
    }
    expect(mocks.begin).not.toHaveBeenCalled()
    expect(mocks.run).not.toHaveBeenCalled()
  })
  it('streams a long pasted release with verified media metadata and stable per-turn identity', async () => {
    const content = 'Press release text. '.repeat(590)
    mocks.find.mockResolvedValue({ id: 'm', tenant: { id: 'site-a' }, mimeType: 'image/jpeg', filename: 'banner.jpg' })
    for (let i = 0; i < 2; i++) {
      const result = await POST(post({ ...body, content, imageId: 'm' }), ctx())
      expect(result.headers.get('Content-Type')).toContain('x-ndjson')
    }
    expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({ req, id: 'm', overrideAccess: false }))
    const call = mocks.run.mock.calls[0]![0]
    expect(call.req).toBe(req)
    expect(call.tenantId).toBe('site-a')
    expect(call.input.message).toEqual({ content, attachments: [{ kind: 'media', mediaId: 'm', mediaType: 'image', name: 'banner.jpg' }] })
    expect(call.runId).toMatch(/^[0-9a-f]{64}$/)
    expect(mocks.run.mock.calls[1]![0].runId).toBe(call.runId)
  })
  it('checks the chat and site before uploading a banner to the gallery', async () => {
    const upload = (id: string) => new Request(base + '/media', { method: 'POST', headers: { 'X-Assistant-Chat': id } })
    expect((await POST(upload(turnId), ctx('media'))).status).toBe(409)
    expect(mocks.upload).not.toHaveBeenCalled()
    mocks.upload.mockResolvedValue({ id: 'm', filename: 'banner.jpg' })
    const request = upload(chatId)
    const response = await POST(request, ctx('media'))
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ id: 'm', name: 'banner.jpg' })
    expect(mocks.upload).toHaveBeenCalledWith(req, 'site-a', request)
  })
})
