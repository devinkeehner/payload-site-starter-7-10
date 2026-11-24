import type { PayloadRequest } from 'payload'

import { isSuperUser } from '@/lib/access/isSuperUser'
import { getServerSideURL } from '@/lib/utilities/getURL'
import type { Media } from '@/payload-types'

function mediaDownloadURL(media: Media): URL {
  const cdn = process.env.R2_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_MEDIA_BASE_URL
  if (cdn && media.filename) {
    const url = new URL(cdn)
    const parts = [media.prefix, media.filename].filter(Boolean).join('/').split('/').filter(Boolean)
    url.pathname = `${url.pathname.replace(/\/+$/u, '')}/${parts.map(encodeURIComponent).join('/')}`
    url.search = ''
    url.hash = ''
    return url
  }

  if (media.url) return new URL(media.url, process.env.NEXT_PUBLIC_PAYLOAD_URL || getServerSideURL())
  throw new Error(`Media ${media.id} is missing a resolvable URL`)
}

function assertMediaAccess(media: Media, user: PayloadRequest['user']) {
  const owner = typeof media.tenant === 'string' ? media.tenant : media.tenant?.id
  if (!owner || isSuperUser(user)) return

  const tenants = user && 'tenants' in user ? user.tenants : undefined
  if (!tenants?.some(({ tenant }) => (typeof tenant === 'string' ? tenant : tenant?.id) === owner)) {
    throw new Error(`Media ${media.id} does not belong to an accessible site`)
  }
}

export function createTenantShareMediaCloner(
  req: PayloadRequest,
  sourceTenantID?: string,
  tenants = new Map<string, { id: string; slug?: string | null }>(),
  documents = new Map<string, Promise<Media>>(),
  copies = new Map<string, Promise<string>>(),
) {
  async function clone(mediaId: string, tenantId: string, scopedReq: PayloadRequest) {
    let pending = documents.get(mediaId)
    if (!pending) {
      const sourceReq = { ...req, headers: req.headers, query: { ...req.query }, context: { ...req.context }, tenant: sourceTenantID }
      pending = req.payload.findByID({
        collection: 'media',
        id: mediaId,
        depth: 0,
        overrideAccess: true,
        req: sourceReq,
      })
      documents.set(mediaId, pending)
    }
    const media = await pending
    assertMediaAccess(media, req.user)

    const url = mediaDownloadURL(media)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error(`Media ${mediaId} has an unsupported download URL`)
    }
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Unable to download media ${mediaId} (status ${response.status})`)
    const bytes = Buffer.from(await response.arrayBuffer())
    if (!bytes.length) throw new Error(`Downloaded media ${mediaId} was empty`)

    let tenant = tenants.get(tenantId)
    if (!tenant) {
      tenant = await req.payload.findByID({ collection: 'tenants', id: tenantId, depth: 0, overrideAccess: true })
      tenants.set(tenantId, tenant)
    }

    const filename = media.filename?.replace(/\\/gu, '/').split('/').pop() || mediaId
    const dot = filename.lastIndexOf('.')
    const stem = dot > 0 ? filename.slice(0, dot) : filename
    const extension = dot > 0 ? filename.slice(dot) : ''
    const prefix = (tenant.slug || tenantId).replace(/[^a-z0-9_-]+/giu, '-')
    const name = `${prefix}-${stem}-${mediaId}`
    const upload = (fileName: string) => req.payload.create({
      collection: 'media',
      data: {
        alt: media.alt?.trim() || fileName,
        caption: media.caption,
        focalX: media.focalX,
        focalY: media.focalY,
        prefix,
        tenant: tenantId,
      },
      file: {
        data: bytes,
        mimetype: media.mimeType || response.headers.get('content-type')?.split(';')[0] || 'application/octet-stream',
        name: fileName,
        size: bytes.length,
      },
      // Payload writes upload state to its request during each local operation.
      req: { ...scopedReq, headers: scopedReq.headers, query: { ...scopedReq.query }, context: { ...scopedReq.context } },
      overrideAccess: true,
      context: { disableRevalidate: true },
    })

    let copy: Media
    try {
      copy = await upload(`${name}${extension}`)
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('filename')) throw error
      copy = await upload(`${name}-${Date.now().toString(36)}${extension}`)
    }
    if (!copy.id) throw new Error(`Cloned media for ${mediaId} did not return an ID`)
    return copy.id
  }

  return async (mediaId: string | undefined, tenantId: string, scopedReq: PayloadRequest) => {
    if (!mediaId) return undefined
    const key = `${mediaId}:${tenantId}`
    const existing = copies.get(key)
    if (existing) return existing

    const copy = clone(mediaId, tenantId, scopedReq)
    copies.set(key, copy)
    try {
      return await copy
    } catch (error) {
      copies.delete(key)
      throw error
    }
  }
}
