import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@payload-config', () => ({ default: Promise.resolve({}) }))
vi.mock('payload', () => ({ createPayloadRequest: vi.fn() }))
import { createPayloadRequest } from 'payload'
import { POST } from './route'
const create = vi.fn(),
  log = vi.fn()
const mockRequest = (user: unknown) =>
  vi
    .mocked(createPayloadRequest)
    .mockResolvedValue({ user, payload: { create, logger: { error: log } } } as unknown as Awaited<
      ReturnType<typeof createPayloadRequest>
    >)
beforeEach(() => {
  vi.resetAllMocks()
})
const upload = () => {
  const body = new FormData()
  body.append('file', new File(['PNG bytes'], 'test.png', { type: 'image/png' }))
  body.append('alt', 'Budget graphic')
  return new Request('https://admin.cthousegop.com/api/media/upload', {
    method: 'POST',
    headers: { 'x-payload-tenant': 'tenant-qa' },
    body,
  })
}
describe('admin media uploads', () => {
  it('rejects a Payload auth result with no signed-in user', async () => {
    mockRequest(null)
    expect((await POST(upload())).status).toBe(401)
    expect(create).not.toHaveBeenCalled()
  })
  it('creates media with the authenticated Payload request and access enforcement', async () => {
    mockRequest({ id: 'user-qa' })
    create.mockResolvedValue({ id: 'media-qa' })
    const response = await POST(upload())
    expect(response.status).toBe(201)
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        overrideAccess: false,
        data: { alt: 'Budget graphic', tenant: 'tenant-qa' },
        req: expect.objectContaining({ user: { id: 'user-qa' } }),
      }),
    )
    expect(await response.json()).toEqual({ id: 'media-qa' })
  })
  it('keeps server stacks in logs rather than returning them', async () => {
    mockRequest({ id: 'user-qa' })
    create.mockRejectedValue(new Error('Upload failed'))
    const response = await POST(upload())
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ message: 'Upload failed' })
    expect(log).toHaveBeenCalled()
  })
})
