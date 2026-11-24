import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createPayloadRequest } from 'payload'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { mailPDFNameHeader } from '@/lib/mail-tool/filename'

import { POST } from './route'

const send = vi.hoisted(() => vi.fn())
vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-s3')>()
  return { ...actual, S3Client: class extends actual.S3Client { override send = send } }
})
vi.mock('@aws-sdk/s3-request-presigner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/s3-request-presigner')>()
  return { ...actual, getSignedUrl: vi.fn(actual.getSignedUrl) }
})
vi.mock('@payload-config', () => ({ default: Promise.resolve({}) }))
vi.mock('payload', () => ({ createPayloadRequest: vi.fn() }))

const logError = vi.fn()
const routeURL = 'https://admin.example.com/api/mail-tool/pdf'
const bytes = Buffer.from([37, 80, 68, 70, 45, 49, 46, 55, 10, 0, 255])

function mockUser(user: unknown) {
  vi.mocked(createPayloadRequest).mockResolvedValue({
    payload: { logger: { error: logError } },
    user,
  } as unknown as Awaited<ReturnType<typeof createPayloadRequest>>)
}

function upload(body: BodyInit = bytes, headers: HeadersInit = { 'Content-Type': 'application/pdf' }) {
  return new Request(routeURL, { body, headers, method: 'POST' })
}

function uploadWithFilename(filename: string) {
  return upload(bytes, { 'Content-Type': 'application/pdf', [mailPDFNameHeader]: encodeURIComponent(filename) })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('R2_ENDPOINT', 'https://account.r2.cloudflarestorage.com')
  vi.stubEnv('R2_BUCKET', 'private-mail')
  vi.stubEnv('R2_ACCESS_KEY_ID', 'fixture-key')
  vi.stubEnv('R2_SECRET_ACCESS_KEY', 'fixture-secret')
  vi.stubEnv('R2_PUBLIC_BASE_URL', undefined)
  mockUser({ id: 'staff' })
  send.mockResolvedValue({ $metadata: {} })
})

afterEach(() => vi.unstubAllEnvs())

describe('Mail Tool PDF storage', () => {
  it('requires a signed-in Payload user', async () => {
    mockUser(null)
    expect((await POST(upload())).status).toBe(401)
    expect(send).not.toHaveBeenCalled()
  })

  it('stores the original PDF and signs the same object when a public base is missing', async () => {
    const response = await POST(upload())
    expect(response.status).toBe(201)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(send).toHaveBeenCalledTimes(1)
    const [{ input }] = send.mock.calls[0] as [PutObjectCommand]
    expect(input).toEqual({
      Body: bytes,
      Bucket: 'private-mail',
      CacheControl: 'private, no-store',
      ContentDisposition: 'attachment; filename="mailer-two-up-letter.pdf"',
      ContentLength: bytes.byteLength,
      ContentType: 'application/pdf',
      IfNoneMatch: '*',
      Key: expect.stringMatching(/^mail-tool\/mailer-two-up-letter-[A-Za-z0-9_-]{8}\.pdf$/),
    })

    const result = await response.json() as { downloadUrl: string; expiresAt: string }
    const download = new URL(result.downloadUrl)
    expect(download.origin).toBe('https://account.r2.cloudflarestorage.com')
    expect(download.pathname).toBe(`/private-mail/${input.Key}`)
    expect(download.searchParams.get('X-Amz-Expires')).toBe('604800')
    expect(download.searchParams.has('x-amz-checksum-mode')).toBe(false)
    expect(download.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/)
    const signingDate = new Date(Date.parse(result.expiresAt) - 604800 * 1000)
    expect(download.searchParams.get('X-Amz-Date')).toBe(
      signingDate.toISOString().replace(/[:-]|\.\d{3}/g, ''),
    )
  })

  it('returns an unsigned, unexpiring link on a configured HTTPS media base', async () => {
    vi.stubEnv('R2_PUBLIC_BASE_URL', ' https://media.example.com/downloads/// ')

    const response = await POST(uploadWithFilename('budget-update'))

    expect(response.status).toBe(201)
    expect(send).toHaveBeenCalledOnce()
    const [{ input }] = send.mock.calls[0] as [PutObjectCommand]
    expect(input).toMatchObject({
      Body: bytes,
      ContentDisposition: 'attachment; filename="budget-update.pdf"',
      ContentType: 'application/pdf',
      Key: expect.stringMatching(/^mail-tool\/budget-update-[A-Za-z0-9_-]{8}\.pdf$/),
    })
    expect(await response.json()).toEqual({
      downloadUrl: `https://media.example.com/downloads/${input.Key}`,
      expiresAt: null,
    })
    expect(getSignedUrl).not.toHaveBeenCalled()
  })

  it('normalizes an encoded filename and gives Unicode downloads a safe ASCII alternative', async () => {
    const response = await POST(uploadWithFilename('..\\district\\Café Update"\r\n.pdf'))

    expect(response.status).toBe(201)
    const [{ input }] = send.mock.calls[0] as [PutObjectCommand]
    expect(input).toMatchObject({
      ContentDisposition: 'attachment; filename="cafe-update.pdf"; filename*=UTF-8\'\'caf%C3%A9-update.pdf',
      Key: expect.stringMatching(/^mail-tool\/café-update-[A-Za-z0-9_-]{8}\.pdf$/u),
    })
    const { downloadUrl } = await response.json() as { downloadUrl: string }
    expect(decodeURIComponent(new URL(downloadUrl).pathname)).toBe(`/private-mail/${input.Key}`)
  })

  it('uses the default filename when the encoded filename is malformed', async () => {
    const response = await POST(upload(bytes, {
      'Content-Type': 'application/pdf',
      [mailPDFNameHeader]: 'partial%F0%9F',
    }))

    expect(response.status).toBe(201)
    const [{ input }] = send.mock.calls[0] as [PutObjectCommand]
    expect(input.ContentDisposition).toBe('attachment; filename="mailer-two-up-letter.pdf"')
    expect(input.Key).toMatch(/^mail-tool\/mailer-two-up-letter-[A-Za-z0-9_-]{8}\.pdf$/)
  })

  it('retries a key collision and returns the URL for the successful conditional write', async () => {
    send.mockRejectedValueOnce(Object.assign(new Error('Already exists'), { $metadata: { httpStatusCode: 412 } }))

    const response = await POST(uploadWithFilename('budget-update'))

    expect(response.status).toBe(201)
    expect(send).toHaveBeenCalledTimes(2)
    const [[firstUpload], [secondUpload]] = send.mock.calls as [[PutObjectCommand], [PutObjectCommand]]
    const first = firstUpload.input
    const second = secondUpload.input
    expect(first.IfNoneMatch).toBe('*')
    expect(second.IfNoneMatch).toBe('*')
    expect(first.Key).not.toBe(second.Key)
    const { downloadUrl } = await response.json() as { downloadUrl: string }
    expect(new URL(downloadUrl).pathname).toBe(`/private-mail/${second.Key}`)
    expect(logError).not.toHaveBeenCalled()
  })

  it('returns a storage failure after three key collisions', async () => {
    send.mockRejectedValue(Object.assign(new Error('Already exists'), { $metadata: { httpStatusCode: 412 } }))

    const response = await POST(upload())

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ message: 'Could not save the print PDF.' })
    expect(send).toHaveBeenCalledTimes(3)
    expect(logError).toHaveBeenCalledOnce()
  })

  it.each([
    'https://',
    'http://media.example.com',
    'https://user:password@media.example.com',
    'https://media.example.com/?token=fixture',
    'https://media.example.com/#anchor',
  ])('falls back to a signed URL when the media base is invalid (%s)', async (base) => {
    vi.stubEnv('R2_PUBLIC_BASE_URL', base)

    const response = await POST(upload())

    expect(response.status).toBe(201)
    const result = await response.json() as { downloadUrl: string; expiresAt: string }
    const download = new URL(result.downloadUrl)
    expect(download.origin).toBe('https://account.r2.cloudflarestorage.com')
    expect(download.searchParams.get('X-Amz-Expires')).toBe('604800')
    expect(result.expiresAt).toBeTypeOf('string')
  })

  it('rejects the wrong media type, invalid PDF prefix, and declared oversize', async () => {
    expect((await POST(upload(bytes, { 'Content-Type': 'text/plain' }))).status).toBe(415)
    expect((await POST(upload('not a PDF'))).status).toBe(400)
    expect((await POST(upload(bytes, {
      'Content-Length': String(100 * 1024 * 1024 + 1),
      'Content-Type': 'application/pdf',
    }))).status).toBe(413)
    expect(send).not.toHaveBeenCalled()
  })

  it('enforces the byte limit when a streaming request has no declared length', async () => {
    const cancel = vi.fn()
    const chunk = new Uint8Array(1024 * 1024)
    const body = new ReadableStream<Uint8Array>({ cancel, pull: (controller) => controller.enqueue(chunk) })
    const request = new Request(routeURL, {
      body,
      duplex: 'half',
      headers: { 'Content-Type': 'application/pdf' },
      method: 'POST',
    } as RequestInit)

    expect((await POST(request)).status).toBe(413)
    expect(cancel).toHaveBeenCalledOnce()
    expect(send).not.toHaveBeenCalled()
  })

  it('reports storage failure without exposing its error details or a download link', async () => {
    send.mockRejectedValue(new Error('private storage details'))
    const response = await POST(upload())

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ message: 'Could not save the print PDF.' })
    expect(send).toHaveBeenCalledOnce()
    expect(logError).toHaveBeenCalledOnce()
  })
})
