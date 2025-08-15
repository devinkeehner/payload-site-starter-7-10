import type { PayloadRequest } from 'payload'
import { getPayload } from 'payload'
import configPromise from '@payload-config'

export const runtime = 'nodejs'

export async function POST(req: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })

  // Authenticate user (admin UI will include cookies/headers)
  let user: any
  try {
    user = await payload.auth({ req: req as unknown as PayloadRequest, headers: req.headers })
  } catch (err) {
    payload.logger.error({ err }, 'Auth error while uploading Media Canvas')
    return new Response('Unauthorized', { status: 401 })
  }
  if (!user) return new Response('Unauthorized', { status: 401 })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return new Response('Invalid form data', { status: 400 })
  }

  const file = form.get('file') as File | null
  if (!file) return new Response('Missing file', { status: 400 })

  const rawAlt = (form.get('alt') as string) || ''
  const rawData = (form.get('data') as string) || ''

  let data: any = {}
  try {
    if (rawData) data = JSON.parse(rawData)
  } catch {
    // ignore, we'll rely on flat fields
  }

  const alt = (data?.alt as string) || rawAlt || 'Media Canvas'

  // caption can be stringified JSON or pre-built Lexical JSON
  let caption: any = data?.caption
  if (typeof caption === 'string') {
    try { caption = JSON.parse(caption) } catch { /* keep as string */ }
  }

  // tenant can come from data or header
  let tenant = (data?.tenant as string) || ''
  if (!tenant) {
    const headerTenant = req.headers.get('x-payload-tenant')
    if (headerTenant) tenant = headerTenant
  }

  // no canvas linking in this route

  // Build filename (keep the original if provided)
  let originalName = (file as any).name || 'media-canvas.png'
  if (!/\.[a-z0-9]+$/i.test(originalName)) originalName = `${originalName}.png`

  // Convert File to Buffer
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const size = buffer.length

  try {
    const created = await payload.create({
      collection: 'media',
      data: {
        alt,
        ...(caption ? { caption } : {}),
        ...(tenant ? { tenant } : {}),
      },
      // Use Payload local API file shape
      file: {
        data: buffer,
        // include both names for maximum compatibility
        name: originalName,
        filename: originalName,
        size,
        // Some adapters expect `mimeType` (camelCase)
        mimeType: file.type || 'image/png',
        // Others accept `mimetype` (lowercase); harmless to include both
        mimetype: file.type || 'image/png',
      } as any,
      req: req as unknown as PayloadRequest,
    })
    
    return new Response(JSON.stringify(created), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    })
  } catch (err: any) {
    payload.logger.error({ err, meta: { originalName, type: file.type, size } }, 'Error creating media from Media Canvas')
    const message = typeof err?.message === 'string' ? err.message : 'Upload failed'
    const stack = typeof err?.stack === 'string' ? err.stack : undefined
    const detail = { message, stack, file: { originalName, type: file.type, size } }
    return new Response(JSON.stringify(detail), { status: 400, headers: { 'content-type': 'application/json' } })
  }
}
