import type { ToolCallOutputContent } from '@openai/agents'
import type { PayloadRequest, Where } from 'payload'
import sharp from 'sharp'
import { isSuperUser } from '@/lib/access/isSuperUser'
import { canAccessCollection } from '@/lib/access/roles'
import { getServerSideURL } from '@/lib/utilities/getURL'
import type { Media } from '@/payload-types'
import { LiveEditorAccessError, relationshipID } from './emailAccess'

export function assertSiteLibraryAccess(req: PayloadRequest, tenantId: string | null): asserts tenantId is string {
  if (!tenantId || !req.user || (req.user.collection && req.user.collection !== 'users') ||
      (!isSuperUser(req.user) && !req.user.tenants?.some(row => relationshipID(row.tenant) === tenantId))) {
    throw new LiveEditorAccessError('Choose a site assigned to your account.', 403)
  }
}

const maxSourceBytes = 5 * 1024 * 1024
const formats = ['jpeg', 'png', 'gif', 'webp', 'avif', 'heif', 'tiff', 'svg']
const mimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/heif', 'image/heic', 'image/tiff', 'image/svg+xml']

function galleryImageURL(value: string) {
  const site = new URL(getServerSideURL())
  const cms = new URL(process.env.NEXT_PUBLIC_PAYLOAD_URL || site.origin)
  const url = new URL(value, cms)
  if (url.username || url.password) return null
  const payloadFile = url.origin === cms.origin && url.pathname.startsWith('/api/media/file/')
  if (payloadFile || ((url.origin === cms.origin || url.origin === site.origin) && url.pathname.startsWith('/media/'))) {
    return { url, payloadFile }
  }

  const cdnOrigins = ['https://media.cthousegop.com', process.env.R2_PUBLIC_BASE_URL, process.env.NEXT_PUBLIC_MEDIA_BASE_URL]
    .filter((item): item is string => Boolean(item)).map(item => new URL(item).origin)
  return url.protocol === 'https:' && cdnOrigins.includes(url.origin) ? { url, payloadFile: false } : null
}

async function loadThumbnail(req: PayloadRequest, value: string, detailed: boolean, signal: AbortSignal) {
  const source = galleryImageURL(value)
  if (!source) throw new Error('No gallery image source.')
  const { url, payloadFile } = source
  const headers = new Headers()
  // A private Payload file checks the same session as the gallery query.
  if (payloadFile && req.url && new URL(req.url).origin === url.origin) {
    for (const name of ['cookie', 'authorization']) {
      const value = req.headers.get(name)
      if (value) headers.set(name, value)
    }
  }
  const response = await fetch(url, { headers, cache: 'no-store', redirect: 'error', signal })
  if (!response.ok || !response.body || Number(response.headers.get('Content-Length')) > maxSourceBytes) {
    await response.body?.cancel()
    throw new Error('Gallery image unavailable.')
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > maxSourceBytes) {
        await reader.cancel()
        throw new Error('Gallery image is too large.')
      }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const raster = sharp(Buffer.concat(chunks), { limitInputPixels: 32_000_000, animated: false })
  const { format } = await raster.metadata()
  if (!format || !formats.includes(format)) throw new Error('Unsupported thumbnail format.')
  const size = detailed ? 900 : 360
  const jpeg = await raster.rotate().resize(size, size, { fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' }).jpeg({ quality: 74 }).toBuffer()
  return 'data:image/jpeg;base64,' + jpeg.toString('base64')
}

async function thumbnail(req: PayloadRequest, media: Pick<Media, 'sizes' | 'url'>, detailed: boolean, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(8_000)
  const captureSignal = signal ? AbortSignal.any([signal, timeout]) : timeout
  const urls = new Set([detailed ? media.sizes?.medium?.url : media.sizes?.thumbnail?.url, media.sizes?.small?.url, media.url])
  for (const url of urls) {
    if (!url) continue
    try { return await loadThumbnail(req, url, detailed, captureSignal) } catch { captureSignal.throwIfAborted() }
  }
}

/** Callers supply a server-authorized site. Return inline pixels so the model can actually inspect each candidate. */
export async function browseSiteGallery(req: PayloadRequest, tenantId: string, input: { query?: string; page?: number; mediaId?: string }, signal?: AbortSignal): Promise<ToolCallOutputContent[]> {
  assertSiteLibraryAccess(req, tenantId)
  if (!canAccessCollection(req.user, 'media')) throw new LiveEditorAccessError('Your account cannot access media.', 403)
  const page = typeof input.page === 'number' && Number.isInteger(input.page) ? Math.max(1, Math.min(input.page, 10_000)) : 1
  const query = input.query?.trim().slice(0, 150)
  const and: Where[] = [{ tenant: { equals: tenantId } }, { mimeType: { in: mimeTypes } }]
  if (input.mediaId) and.push({ id: { equals: input.mediaId } })
  else if (query) and.push({ or: [{ alt: { like: query } }, { filename: { like: query } }] })
  const result = await req.payload.find({
    collection: 'media', where: { and }, page: input.mediaId ? 1 : page, limit: input.mediaId ? 1 : 6, sort: '-createdAt',
    select: { tenant: true, alt: true, filename: true, width: true, height: true, mimeType: true, sizes: true, url: true, prefix: true },
    depth: 0, overrideAccess: false, req,
  })
  const media = result.docs.filter(item => relationshipID(item.tenant) === tenantId && mimeTypes.includes(item.mimeType ?? ''))
  const candidates = await Promise.all(media.map(async (item): Promise<ToolCallOutputContent[]> => {
    let image: string | undefined
    try { image = await thumbnail(req, item, Boolean(input.mediaId), signal) } catch { signal?.throwIfAborted() }
    const text = JSON.stringify({ mediaId: item.id, filename: item.filename, alt: item.alt, width: item.width, height: item.height, imageAvailable: Boolean(image) })
    return image ? [{ type: 'text', text }, { type: 'image', image, detail: input.mediaId ? 'high' : 'low' }] : [{ type: 'text', text }]
  }))
  return [{ type: 'text', text: JSON.stringify({ page: result.page, nextPage: result.nextPage, total: result.totalDocs,
    guidance: 'Each image follows its media ID. Only describe what you can see. Search by a different term or browse the next page for more candidates.' }) }, ...candidates.flat()]
}
