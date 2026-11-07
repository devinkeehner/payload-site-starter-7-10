import { createPayloadRequest, type PayloadRequest } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/puck/schema', () => ({
  getEmailPuckBlockSchema: vi.fn(() => [{ slug: 'emailImage', fields: [] }]),
}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({ createPayloadRequest: vi.fn() }))

import { GET, PATCH } from '@/app/api/live-editor/emails/[id]/route'
import { POST as uploadMedia } from '@/app/api/live-editor/emails/[id]/media/route'
import { getEmailPuckBlockSchema } from '@/lib/puck/schema'
import { editorEmail, getEditorEmail, getEditorOptions, loadEditorEmail, saveEditorEmail } from './emailService'
import type { DraftField } from './emailDraft'

const updatedAt = '2026-11-06T12:00:00.000Z'
const alpha = { id: 'alpha-a', collection: 'users', roles: ['alphaTester'], tenants: [{ tenant: 'site-a' }] }
const fields: DraftField[] = [{ name: 'title', type: 'text' }, { type: 'tabs', tabs: [{ fields: [
  { name: 'subject', type: 'text' }, { name: 'preheader', type: 'text' }, { name: 'replyTo', type: 'text' },
  { name: 'layout', type: 'blocks', blocks: [
    { slug: 'emailImage', fields: [{ name: 'image', type: 'upload', relationTo: 'media' }, { name: 'extension', type: 'json' }] },
    { slug: 'emailText', fields: [{ name: 'text', type: 'richText' }] },
    { slug: 'emailLinks', fields: [{ name: 'items', type: 'array', fields: [{ name: 'link', type: 'relationship', relationTo: ['pages', 'posts'] }] }] },
  ] },
] }] }]

function email(overrides: Record<string, unknown> = {}) {
  return { id: 'email-a', title: 'Original', subject: 'Original subject', preheader: '', replyTo: '', layout: [], tenant: 'site-a', status: 'draft', updatedAt, ...overrides }
}

function mockRequest({ user = alpha as unknown, current = email(), related = { id: 'media-a', tenant: 'site-a' }, cookie = 'payload-tenant=site-a' } = {}) {
  const payload = {
    config: { collections: [{ slug: 'emails', fields }] },
    findByID: vi.fn(async ({ collection }: { collection: string }): Promise<Record<string, unknown>> => collection === 'emails' ? current : related),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...current, ...data, updatedAt: '2026-11-06T12:01:00.000Z' })),
    find: vi.fn(async (_args: Record<string, unknown>) => ({ docs: [{ id: 'media-a', alt: 'A photograph', filename: 'a.jpg', url: '/a.jpg', tenant: 'site-a' }] })),
    create: vi.fn(async (_args: Record<string, unknown>) => ({ id: 'uploaded-a', tenant: 'site-a', url: '/uploaded.png', alt: 'Uploaded image' })),
  }
  const req = { user, payload, headers: new Headers({ cookie }) } as unknown as PayloadRequest
  return { req, payload, current }
}

const saveBody = (content: Record<string, unknown>, token = updatedAt) => ({ email: content, expectedUpdatedAt: token })

describe('Live Editor email service security boundary', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it.each([null, { roles: ['admin'] }, { collection: 'apiKeys', roles: ['super'] }])('denies unauthorized identities before reading any email: %j', user => {
    const { req, payload } = mockRequest({ user })
    return expect(loadEditorEmail(req, 'email-a')).rejects.toMatchObject({ status: 403 }).then(() => {
      expect(payload.findByID).not.toHaveBeenCalled()
    })
  })

  it('loads the native draft using Payload access controls and the authenticated request', async () => {
    const { req, payload, current } = mockRequest()
    expect(await loadEditorEmail(req, 'email-a')).toBe(current)
    expect(payload.findByID).toHaveBeenCalledExactlyOnceWith({ collection: 'emails', id: 'email-a', draft: true, depth: 2, overrideAccess: false, req })
  })

  it('denies alpha reads and writes to a foreign tenant even when the active-site cookie matches it', async () => {
    const { req, payload } = mockRequest({ current: email({ tenant: { id: 'site-b', name: 'Foreign site' } }), cookie: 'payload-tenant=site-b' })
    await expect(getEditorEmail(req, 'email-a')).rejects.toMatchObject({ status: 403 })
    await expect(saveEditorEmail(req, 'email-a', saveBody({ title: 'Forged' }))).rejects.toMatchObject({ status: 403 })
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('allows assigned-tenant editing when a different site is active in the browser cookie', async () => {
    const { req, payload } = mockRequest({ cookie: 'payload-tenant=site-b' })
    await saveEditorEmail(req, 'email-a', saveBody({ title: 'Assigned native campaign' }))
    expect(payload.update).toHaveBeenCalledOnce()
    expect(payload.update.mock.calls[0]?.[0].data).toEqual({ title: 'Assigned native campaign' })
  })

  it('allows a super user to read a foreign-tenant email while retaining Payload access checks', async () => {
    const { req, payload } = mockRequest({ user: { roles: ['super'] }, current: email({ tenant: 'site-b' }) })
    await getEditorEmail(req, 'email-a')
    expect(payload.findByID.mock.calls[0]?.[0]).toMatchObject({ overrideAccess: false, req })
  })

  it('returns editor content and schemas without exposing recipient or delivery internals', async () => {
    const { req } = mockRequest({ current: email({ tenant: { id: 'site-a', title: 'Site A' }, recipientEmail: 'private@example.gov', emailList: 'secret-list', sendSummary: { iContactSendId: 'private-send' }, lastSend: { status: 'sent' } }) })
    const result = await getEditorEmail(req, 'email-a')
    expect(result.schemas).toEqual([{ slug: 'emailImage', fields: [] }])
    expect(getEmailPuckBlockSchema).toHaveBeenCalledOnce()
    expect(result.email).toMatchObject({ id: 'email-a', tenantId: 'site-a', status: 'draft', updatedAt })
    expect(result.email).not.toHaveProperty('recipientEmail')
    expect(result.email).not.toHaveProperty('emailList')
    expect(result.email).not.toHaveProperty('sendSummary')
    expect(result.email).not.toHaveProperty('lastSend')
    expect(editorEmail(email())).toHaveProperty('tenantId', 'site-a')
    expect(editorEmail(email({ subject: null, preheader: undefined, replyTo: null }))).toMatchObject({ subject: '', preheader: '', replyTo: '' })
  })

  it.each(['queued', 'scheduled', 'sending', 'sent'])('denies changes to a %s campaign before updating it', async status => {
    const { req, payload } = mockRequest({ current: email({ status }) })
    await expect(saveEditorEmail(req, 'email-a', saveBody({ title: 'Changed' }))).rejects.toMatchObject({ status: 409 })
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('denies an outdated editor revision before resolving resources or updating', async () => {
    const { req, payload } = mockRequest()
    await expect(saveEditorEmail(req, 'email-a', saveBody({ layout: [{ blockType: 'emailImage', image: 'media-a' }] }, '2026-11-06T11:59:00.000Z'))).rejects.toMatchObject({ status: 409 })
    expect(payload.findByID).toHaveBeenCalledOnce()
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('rejects malformed request envelopes before reading or writing', async () => {
    const { req, payload } = mockRequest()
    await expect(saveEditorEmail(req, 'email-a', { email: { title: 'Changed' }, expectedUpdatedAt: updatedAt, overrideAccess: true })).rejects.toMatchObject({ status: 400 })
    expect(payload.findByID).not.toHaveBeenCalled()
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('saves only native content, preserving IDs and opaque metadata while stripping lifecycle, recipients, and ownership', async () => {
    const { req, payload } = mockRequest({ current: email({ status: 'failed' }) })
    const layout = [{ id: 'native-row', blockType: 'emailImage', blockName: 'Header', image: { id: 'media-a', url: '/a.jpg', tenant: 'site-a' }, extension: { id: 'opaque', value: { id: 'untouched' } }, futureField: 'preserved' }]
    const result = await saveEditorEmail(req, 'email-a', saveBody({
      title: 'Changed title', subject: 'Changed subject', preheader: 'Native preview', replyTo: 'office@example.gov', layout,
      tenant: 'site-b', id: 'other-email', status: 'sent', _status: 'published', updatedAt: 'forged', recipientEmail: 'recipient@example.gov', emailList: 'other-list', scheduledAt: updatedAt,
      sendSummary: { sentAt: updatedAt }, lastSend: { status: 'sent' }, deliveryJob: 'other-job', contentRevision: 'forged',
    }))
    const data = { title: 'Changed title', subject: 'Changed subject', preheader: 'Native preview', replyTo: 'office@example.gov', layout: [{ ...layout[0], image: 'media-a' }] }
    expect(payload.findByID).toHaveBeenNthCalledWith(1, { collection: 'emails', id: 'email-a', draft: true, depth: 0, overrideAccess: false, req })
    expect(payload.findByID).toHaveBeenNthCalledWith(2, { collection: 'media', id: 'media-a', depth: 0, overrideAccess: false, req })
    expect(payload.update).toHaveBeenCalledExactlyOnceWith({ collection: 'emails', id: 'email-a', data, draft: true, depth: 2, overrideAccess: false, overrideLock: false, req })
    expect(result.email).toMatchObject({ ...data, tenant: 'site-a', tenantId: 'site-a', status: 'failed', updatedAt: '2026-11-06T12:01:00.000Z' })
    expect(layout[0]?.image).toEqual({ id: 'media-a', url: '/a.jpg', tenant: 'site-a' })
  })

  it('denies newly selected media from another tenant even if the client labels it as local', async () => {
    const { req, payload } = mockRequest({ related: { id: 'media-b', tenant: 'site-b' } })
    await expect(saveEditorEmail(req, 'email-a', saveBody({ layout: [{ blockType: 'emailImage', image: { id: 'media-b', tenant: 'site-a', url: '/forged.jpg' } }] }))).rejects.toMatchObject({ status: 403 })
    expect(payload.findByID).toHaveBeenLastCalledWith({ collection: 'media', id: 'media-b', depth: 0, overrideAccess: false, req })
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('validates newly selected native rich-text media and internal page links with Payload access', async () => {
    const { req, payload } = mockRequest()
    payload.findByID.mockImplementation(async ({ collection }: { collection: string }): Promise<Record<string, unknown>> => collection === 'emails' ? email() : { id: 'resource', tenant: { id: 'site-a' } })
    const text = { root: { type: 'root', children: [{ type: 'paragraph', children: [
      { type: 'upload', relationTo: 'media', value: { id: 'media-a', url: '/a.jpg' } },
      { type: 'link', fields: { linkType: 'internal', doc: { relationTo: 'pages', value: { id: 'page-a', title: 'About' } } }, children: [] },
    ] }] } }
    await saveEditorEmail(req, 'email-a', saveBody({ layout: [{ blockType: 'emailText', text }] }))
    expect(payload.findByID).toHaveBeenCalledWith({ collection: 'media', id: 'media-a', depth: 0, overrideAccess: false, req })
    expect(payload.findByID).toHaveBeenCalledWith({ collection: 'pages', id: 'page-a', depth: 0, overrideAccess: false, req })
    expect(payload.update).toHaveBeenCalledOnce()
  })

  it('validates new polymorphic array relationships against the target tenant', async () => {
    const { req, payload } = mockRequest({ related: { id: 'post-b', tenant: 'site-b' } })
    await expect(saveEditorEmail(req, 'email-a', saveBody({ layout: [{ blockType: 'emailLinks', items: [{ id: 'row', link: { relationTo: 'posts', value: { id: 'post-b' } } }] }] }))).rejects.toMatchObject({ status: 403 })
    expect(payload.findByID).toHaveBeenLastCalledWith({ collection: 'posts', id: 'post-b', depth: 0, overrideAccess: false, req })
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('deduplicates new media validation and preserves references already present in the authorized document', async () => {
    const { req, payload } = mockRequest({ current: email({ layout: [{ id: 'old', blockType: 'emailImage', image: 'media-old' }] }) })
    await saveEditorEmail(req, 'email-a', saveBody({ layout: [
      { id: 'old', blockType: 'emailImage', image: { id: 'media-old', url: '/old.jpg' } },
      { id: 'new-a', blockType: 'emailImage', image: 'media-a' },
      { id: 'new-b', blockType: 'emailImage', image: { id: 'media-a' } },
    ] }))
    expect(payload.findByID).toHaveBeenCalledTimes(2)
    expect(payload.findByID).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'media-old' }))
  })

  it('propagates native Payload update lock or hook rejection', async () => {
    const { req, payload } = mockRequest()
    const locked = Object.assign(new Error('Document is locked by another user'), { status: 409 })
    payload.update.mockRejectedValueOnce(locked)
    await expect(saveEditorEmail(req, 'email-a', saveBody({ title: 'Changed' }))).rejects.toBe(locked)
    expect(payload.update.mock.calls[0]?.[0]).toMatchObject({ overrideAccess: false, overrideLock: false, req })
  })
})

describe('Live Editor HTTP request boundary', () => {
  const context = () => ({ params: Promise.resolve({ id: 'email-a' }) })
  const draftRequest = (body: string, headers: HeadersInit = { 'content-type': 'application/json', origin: 'https://editor.example.gov' }) => new Request('https://editor.example.gov/api/live-editor/emails/email-a', { method: 'PATCH', headers, body })

  beforeEach(() => { vi.mocked(createPayloadRequest).mockReset() })

  it('loads authenticated native email content with private response caching', async () => {
    const { req } = mockRequest()
    vi.mocked(createPayloadRequest).mockResolvedValueOnce(req)
    const request = new Request('https://editor.example.gov/api/live-editor/emails/email-a')
    const response = await GET(request, context())
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toMatchObject({ email: { id: 'email-a', tenantId: 'site-a' } })
    expect(createPayloadRequest).toHaveBeenCalledExactlyOnceWith({ config: {}, request, canSetHeaders: false })
  })

  it('rejects a foreign browser origin before authenticating or saving', async () => {
    const response = await PATCH(draftRequest(JSON.stringify(saveBody({ title: 'Changed' })), { 'content-type': 'application/json', origin: 'https://attacker.example', 'sec-fetch-site': 'cross-site' }), context())
    expect(response.status).toBe(403)
    expect(createPayloadRequest).not.toHaveBeenCalled()
  })

  it.each([
    { body: JSON.stringify(saveBody({ title: 'Changed' })), type: 'text/plain', message: 'JSON' },
    { body: '{broken-json', type: 'application/json', message: 'Invalid draft JSON' },
    { body: 'x'.repeat(2_000_001), type: 'application/json', message: 'too large' },
  ])('rejects malformed HTTP content before authenticating: $message', async ({ body, type, message }) => {
    const response = await PATCH(draftRequest(body, { 'content-type': type, origin: 'https://editor.example.gov' }), context())
    expect(response.status).toBe(400)
    expect((await response.json()).error).toContain(message)
    expect(createPayloadRequest).not.toHaveBeenCalled()
  })

  it('saves valid JSON with authenticated Payload context and returns the native revision', async () => {
    const { req, payload } = mockRequest()
    vi.mocked(createPayloadRequest).mockResolvedValueOnce(req)
    const response = await PATCH(draftRequest(JSON.stringify(saveBody({ title: 'Changed' })), { 'content-type': 'application/json; charset=utf-8', origin: 'https://editor.example.gov' }), context())
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toMatchObject({ email: { title: 'Changed', updatedAt: '2026-11-06T12:01:00.000Z' } })
    expect(payload.update.mock.calls[0]?.[0]).toMatchObject({ draft: true, overrideAccess: false, overrideLock: false, req })
  })

  it('maps unauthorized and stale save errors to a private client error response', async () => {
    const unauthorized = mockRequest({ user: null })
    vi.mocked(createPayloadRequest).mockResolvedValueOnce(unauthorized.req)
    const rejected = await PATCH(draftRequest(JSON.stringify(saveBody({ title: 'Changed' }))), context())
    expect(rejected.status).toBe(403)
    expect(unauthorized.payload.update).not.toHaveBeenCalled()
    const stale = mockRequest()
    vi.mocked(createPayloadRequest).mockResolvedValueOnce(stale.req)
    const conflict = await PATCH(draftRequest(JSON.stringify(saveBody({ title: 'Changed' }, '2026-11-06T11:59:00.000Z'))), context())
    expect(conflict.status).toBe(409)
    expect(conflict.headers.get('cache-control')).toBe('private, no-store')
    expect(stale.payload.update).not.toHaveBeenCalled()
  })

  it('hides unexpected server details from HTTP clients', async () => {
    vi.mocked(createPayloadRequest).mockRejectedValueOnce(new Error('private database connection details'))
    const response = await GET(new Request('https://editor.example.gov/api/live-editor/emails/email-a'), context())
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Unable to access this email draft.' })
  })
})

describe('Live Editor native media upload route', () => {
  const context = () => ({ params: Promise.resolve({ id: 'email-a' }) })
  function imageRequest({ file = new File([new Uint8Array([137, 80, 78, 71])], 'upload.png', { type: 'image/png' }) as File | null, origin = 'https://editor.example.gov', alt = 'Campaign image' } = {}) {
    const form = new FormData()
    if (file) form.set('file', file)
    form.set('tenant', 'site-b')
    form.set('alt', alt)
    const request = new Request('https://editor.example.gov/api/live-editor/emails/email-a/media', { method: 'POST', headers: { origin } })
    vi.spyOn(request, 'formData').mockResolvedValue(form)
    return request
  }

  beforeEach(() => { vi.mocked(createPayloadRequest).mockReset() })

  it('creates media in the authorized email tenant and forwards native Payload access checks', async () => {
    const { req, payload } = mockRequest({ cookie: 'payload-tenant=site-b' })
    vi.mocked(createPayloadRequest).mockResolvedValueOnce(req)
    const request = imageRequest()
    const response = await uploadMedia(request, context())
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(payload.findByID).toHaveBeenCalledExactlyOnceWith({ collection: 'emails', id: 'email-a', draft: true, depth: 0, overrideAccess: false, req })
    expect(payload.create).toHaveBeenCalledExactlyOnceWith({ collection: 'media', data: { tenant: 'site-a', alt: 'Campaign image' }, file: { data: Buffer.from([137, 80, 78, 71]), mimetype: 'image/png', name: 'upload.png', size: 4 }, overrideAccess: false, req })
    expect(await response.json()).toEqual({ resource: { id: 'uploaded-a', tenant: 'site-a', url: '/uploaded.png', alt: 'Uploaded image' }, doc: { id: 'uploaded-a', tenant: 'site-a', url: '/uploaded.png', alt: 'Uploaded image' } })
    expect(createPayloadRequest).toHaveBeenCalledExactlyOnceWith({ config: {}, request, canSetHeaders: false })
  })

  it('rejects a foreign browser origin before accessing Payload or parsing the file', async () => {
    const request = imageRequest({ origin: 'https://attacker.example' })
    const response = await uploadMedia(request, context())
    expect(response.status).toBe(403)
    expect(createPayloadRequest).not.toHaveBeenCalled()
    expect(request.formData).not.toHaveBeenCalled()
  })

  it.each([
    { user: null, current: email(), status: 403 },
    { user: alpha, current: email({ tenant: 'site-b' }), status: 403 },
    { user: alpha, current: email({ status: 'scheduled' }), status: 409 },
    { user: { roles: ['super'] }, current: email({ tenant: null }), status: 400 },
  ])('rejects unauthorized, foreign, locked, or tenant-less upload: $status', async ({ user, current, status }) => {
    const { req, payload } = mockRequest({ user, current })
    vi.mocked(createPayloadRequest).mockResolvedValueOnce(req)
    const request = imageRequest()
    const response = await uploadMedia(request, context())
    expect(response.status).toBe(status)
    expect(payload.create).not.toHaveBeenCalled()
    expect(request.formData).not.toHaveBeenCalled()
  })

  it.each([
    { file: null, message: 'up to 10 MB' },
    { file: new File([], 'empty.png', { type: 'image/png' }), message: 'up to 10 MB' },
    { file: new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'too-large.png', { type: 'image/png' }), message: 'up to 10 MB' },
    { file: new File(['<svg/>'], 'vector.svg', { type: 'image/svg+xml' }), message: 'JPEG, PNG' },
    { file: new File(['<script/>'], 'script.html', { type: 'text/html' }), message: 'JPEG, PNG' },
    { file: new File(['image'], 'no-mime.png'), message: 'JPEG, PNG' },
  ])('rejects missing, empty, oversized or unsupported files: $message', async ({ file, message }) => {
    const { req, payload } = mockRequest()
    vi.mocked(createPayloadRequest).mockResolvedValueOnce(req)
    const response = await uploadMedia(imageRequest({ file }), context())
    expect(response.status).toBe(400)
    expect((await response.json()).error).toContain(message)
    expect(payload.create).not.toHaveBeenCalled()
  })

  it('limits alt text and falls back to the native file name when no alt is provided', async () => {
    const { req, payload } = mockRequest()
    vi.mocked(createPayloadRequest).mockResolvedValue(req)
    await uploadMedia(imageRequest({ alt: 'a'.repeat(501) }), context())
    expect(payload.create.mock.calls[0]?.[0]).toMatchObject({ data: { tenant: 'site-a', alt: 'a'.repeat(500) } })
    await uploadMedia(imageRequest({ alt: '' }), context())
    expect(payload.create.mock.calls[1]?.[0]).toMatchObject({ data: { tenant: 'site-a', alt: 'upload.png' } })
  })

  it('returns native collection validation failures without reporting successful uploads', async () => {
    const { req, payload } = mockRequest()
    payload.create.mockRejectedValueOnce(Object.assign(new Error('You may not create media'), { status: 403 }))
    vi.mocked(createPayloadRequest).mockResolvedValueOnce(req)
    const response = await uploadMedia(imageRequest(), context())
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'You may not create media' })
  })
})

describe('Live Editor tenant-scoped resource options', () => {
  it('limits media searches to the authorized document tenant, independent of the site cookie', async () => {
    const { req, payload } = mockRequest({ cookie: 'payload-tenant=site-b' })
    const result = await getEditorOptions(req, 'email-a', new URL('https://editor.example.gov/options?query=photo'))
    expect(payload.find).toHaveBeenCalledExactlyOnceWith({ collection: 'media', where: { and: [{ tenant: { equals: 'site-a' } }, { or: [{ filename: { like: 'photo' } }, { alt: { like: 'photo' } }] }] }, limit: 60, depth: 1, overrideAccess: false, req })
    expect(result.options).toEqual([{ value: 'media-a', label: 'A photograph', thumbnailURL: '/a.jpg', resource: { id: 'media-a', alt: 'A photograph', filename: 'a.jpg', url: '/a.jpg', tenant: 'site-a' } }])
  })

  it('keeps explicit ID hydration tenant-scoped instead of bypassing the filter', async () => {
    const { req, payload } = mockRequest()
    await getEditorOptions(req, 'email-a', new URL('https://editor.example.gov/options?collection=pages&ids=page-a,page-b&query=ignored'))
    expect(payload.find).toHaveBeenCalledExactlyOnceWith({ collection: 'pages', where: { and: [{ tenant: { equals: 'site-a' } }, { id: { in: ['page-a', 'page-b'] } }] }, limit: 2, depth: 1, overrideAccess: false, req })
  })

  it.each(['pages', 'posts'])('searches native document titles and slugs in %s', async collection => {
    const { req, payload } = mockRequest()
    await getEditorOptions(req, 'email-a', new URL(`https://editor.example.gov/options?collection=${collection}&query=%20news%20`))
    expect(payload.find.mock.calls[0]?.[0]).toMatchObject({ collection, where: { and: [{ tenant: { equals: 'site-a' } }, { or: [{ title: { like: 'news' } }, { slug: { like: 'news' } }] }] } })
  })

  it('bounds user-supplied query text and ID lists', async () => {
    const { req, payload } = mockRequest()
    await getEditorOptions(req, 'email-a', new URL(`https://editor.example.gov/options?query=${'q'.repeat(300)}`))
    expect(payload.find.mock.calls[0]?.[0]).toMatchObject({ where: { and: [{ tenant: { equals: 'site-a' } }, { or: [{ filename: { like: 'q'.repeat(200) } }, { alt: { like: 'q'.repeat(200) } }] }] } })
    await getEditorOptions(req, 'email-a', new URL(`https://editor.example.gov/options?ids=${Array.from({ length: 105 }, (_, index) => `media-${index}`).join(',')}`))
    expect(payload.find.mock.calls[1]?.[0]).toMatchObject({ limit: 100, where: { and: [{ tenant: { equals: 'site-a' } }, { id: { in: Array.from({ length: 100 }, (_, index) => `media-${index}`) } }] } })
  })

  it('rejects unsupported collections and foreign-tenant access before querying options', async () => {
    const { req, payload } = mockRequest()
    await expect(getEditorOptions(req, 'email-a', new URL('https://editor.example.gov/options?collection=users'))).rejects.toMatchObject({ status: 400 })
    expect(payload.find).not.toHaveBeenCalled()
    const foreign = mockRequest({ current: email({ tenant: 'site-b' }) })
    await expect(getEditorOptions(foreign.req, 'email-a', new URL('https://editor.example.gov/options?ids=media-b'))).rejects.toMatchObject({ status: 403 })
    expect(foreign.payload.find).not.toHaveBeenCalled()
  })

  it('returns no options for a tenant-less document a super user can read', async () => {
    const { req, payload } = mockRequest({ user: { roles: ['super'] }, current: email({ tenant: null }) })
    expect(await getEditorOptions(req, 'email-a', new URL('https://editor.example.gov/options'))).toEqual({ options: [] })
    expect(payload.find).not.toHaveBeenCalled()
  })
})
