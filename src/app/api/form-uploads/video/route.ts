import type { PayloadRequest } from 'payload'
import { getPayload } from 'payload'
import configPromise from '@payload-config'

export const runtime = 'nodejs'

const HEADER_TOKEN = 'x-form-upload-token'

const buildFilename = (sourceName: string | undefined, fallbackType: string | undefined): string => {
  const trimmed = typeof sourceName === 'string' ? sourceName.trim() : ''
  if (trimmed) return trimmed

  const extension = (() => {
    const type = fallbackType || 'video/webm'
    const match = type.match(/\/([a-z0-9]+)$/i)
    return match ? match[1] : 'webm'
  })()

  return `form-video-${Date.now()}.${extension}`
}

const extractKey = (doc: any): string | undefined => {
  if (!doc) return undefined
  if (typeof doc.key === 'string' && doc.key) return doc.key
  const prefix = typeof doc.prefix === 'string' ? doc.prefix.replace(/\/+$/u, '') : ''
  const filename = typeof doc.filename === 'string' ? doc.filename.replace(/^\/+/, '') : ''
  if (prefix && filename) return `${prefix}/${filename}`
  if (filename) return filename
  if (typeof doc.url === 'string') {
    try {
      const parsed = new URL(doc.url)
      return parsed.pathname.replace(/^\/+/, '')
    } catch {
      return doc.url.replace(/^\/+/, '')
    }
  }
  return undefined
}

export async function POST(req: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })

  // Authenticate either via existing Payload session or shared token header
  let user: any
  try {
    user = await payload.auth({ req: req as unknown as PayloadRequest, headers: req.headers })
  } catch (err) {
    payload.logger.debug({ err }, 'Video upload auth attempt failed')
  }

  const headerToken = req.headers.get(HEADER_TOKEN)
  const expectedToken = process.env.FORM_VIDEO_UPLOAD_TOKEN
  const ALLOWED_ORIGINS = (process.env.FORM_VIDEO_UPLOAD_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  const matchOrigin = (origin: string, allowed: string): boolean => {
    if (allowed === '*') return true
    if (allowed === origin) return true
    if (allowed.startsWith('*.')) {
      const suffix = allowed.slice(1)
      return origin.endsWith(suffix)
    }
    return false
  }

  const isOriginAllowed = (origin: string | null): boolean => {
    if (!origin) return true
    if (ALLOWED_ORIGINS.length === 0) return true
    const normalized = origin.toLowerCase()
    return ALLOWED_ORIGINS.some((allowed) => matchOrigin(normalized, allowed.toLowerCase()))
  }

  if (!user) {
    if (!expectedToken || headerToken !== expectedToken) {
      return new Response('Unauthorized', { status: 401 })
    }
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return new Response('Invalid form data', { status: 400 })
  }

  const origin = req.headers.get('Origin')
  if (!isOriginAllowed(origin)) {
    payload.logger.debug({ origin }, 'Origin not allowed')
    return new Response('Forbidden', { status: 403 })
  }

  const file = formData.get('file') as File | null
  if (!file) return new Response('Missing file field', { status: 400 })

  const tenant = (formData.get('tenant') as string) || undefined
  const durationStr = (formData.get('duration') as string) || undefined
  const duration = durationStr ? Number.parseInt(durationStr, 10) : undefined

  const filename = buildFilename((file as any)?.name, file.type)

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const alt = (formData.get('alt') as string) || `Form submission video (${filename})`

  try {
    const payloadReq: PayloadRequest = {
      ...(req as unknown as PayloadRequest),
      user,
      headers: req.headers,
      payload,
    }

    const created = await payload.create({
      collection: 'media',
      data: {
        alt,
        ...(tenant ? { tenant } : {}),
      },
      file: {
        data: buffer,
        name: filename,
        filename,
        size: buffer.length,
        mimeType: file.type || 'video/webm',
        mimetype: file.type || 'video/webm',
      } as any,
      req: payloadReq,
      overrideAccess: !user,
    })

    const responseBody = {
      url: (created as any)?.url ?? undefined,
      key: extractKey(created),
      size: buffer.length,
      mimeType: file.type || 'video/webm',
      duration: duration || undefined,
      mediaId: (created as any)?.id ?? undefined,
    }

    return new Response(JSON.stringify(responseBody), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    })
  } catch (err: any) {
    payload.logger.error({ err }, 'Error uploading video from public form')
    const message = typeof err?.message === 'string' ? err.message : 'Upload failed'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
}
