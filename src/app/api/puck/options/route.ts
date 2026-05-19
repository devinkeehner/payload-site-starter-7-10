import configPromise from '@payload-config'
import { getTenantFromCookie } from '@payloadcms/plugin-multi-tenant/utilities'
import { createPayloadRequest, type Payload, type PayloadRequest, type Where } from 'payload'

const ALLOWED_COLLECTIONS = new Set(['media', 'pages', 'posts', 'forms', 'categories', 'tenants'])

function mergeTenantWhere(where: Where | undefined, tenantId: string | null): Where | undefined {
  if (!tenantId) return where
  const tenantWhere = { tenant: { equals: tenantId } }
  return where ? ({ and: [where, tenantWhere] } as Where) : (tenantWhere as Where)
}

async function getAuthenticatedPayloadRequest(req: Request) {
  const payloadReq = await createPayloadRequest({
    canSetHeaders: false,
    config: configPromise,
    request: req,
  })

  return { payload: payloadReq.payload, req: payloadReq, user: payloadReq.user }
}

function buildWhere(collection: string, query: string): Where | undefined {
  const trimmed = query.trim()
  if (!trimmed) return undefined

  if (collection === 'media') {
    return {
      or: [
        { filename: { like: trimmed } },
        { alt: { like: trimmed } },
      ],
    }
  }

  if (collection === 'categories') {
    return {
      or: [
        { title: { like: trimmed } },
        { slug: { like: trimmed } },
      ],
    }
  }

  if (collection === 'tenants') {
    return {
      or: [
        { name: { like: trimmed } },
        { slug: { like: trimmed } },
      ],
    }
  }

  return {
    or: [
      { title: { like: trimmed } },
      { slug: { like: trimmed } },
    ],
  }
}

function getSelectedTenantID(req: PayloadRequest): string | null {
  const tenantFromCookie = getTenantFromCookie(req.headers, 'text')
  if (tenantFromCookie) {
    return String(tenantFromCookie)
  }

  const userTenants = (req.user as { tenants?: { tenant?: unknown }[] } | null | undefined)?.tenants
  if (!Array.isArray(userTenants) || userTenants.length !== 1) {
    return null
  }

  const tenant = userTenants[0]?.tenant
  if (typeof tenant === 'string' || typeof tenant === 'number') {
    return String(tenant)
  }

  if (tenant && typeof tenant === 'object' && 'id' in tenant) {
    const id = (tenant as { id?: string | number | null }).id
    return id == null ? null : String(id)
  }

  return null
}

function getMediaThumbnail(doc: Record<string, unknown>) {
  const sizes = doc.sizes
  if (!sizes || typeof sizes !== 'object') return typeof doc.url === 'string' ? doc.url : null

  const thumbnail = (sizes as Record<string, unknown>).thumbnail
  if (thumbnail && typeof thumbnail === 'object' && typeof (thumbnail as Record<string, unknown>).url === 'string') {
    return (thumbnail as Record<string, string>).url
  }

  return typeof doc.url === 'string' ? doc.url : null
}

function getMediaResource(doc: Record<string, unknown>) {
  return {
    id: String(doc.id),
    alt: typeof doc.alt === 'string' ? doc.alt : '',
    filename: typeof doc.filename === 'string' ? doc.filename : undefined,
    focalX: typeof doc.focalX === 'number' ? doc.focalX : undefined,
    focalY: typeof doc.focalY === 'number' ? doc.focalY : undefined,
    height: typeof doc.height === 'number' ? doc.height : undefined,
    mimeType: typeof doc.mimeType === 'string' ? doc.mimeType : undefined,
    sizes: doc.sizes && typeof doc.sizes === 'object' ? doc.sizes : undefined,
    updatedAt: typeof doc.updatedAt === 'string' ? doc.updatedAt : undefined,
    url: typeof doc.url === 'string' ? doc.url : undefined,
    width: typeof doc.width === 'number' ? doc.width : undefined,
  }
}

function getLabel(collection: string, doc: Record<string, unknown>) {
  if (collection === 'media') {
    return String(doc.alt || doc.filename || doc.id)
  }

  return String(doc.title || doc.name || doc.label || doc.slug || doc.id)
}

async function findDocsByIds({
  collection,
  ids,
  payload,
  req,
}: {
  collection: string
  ids: string[]
  payload: Payload
  req: PayloadRequest
}) {
  const docs = await Promise.all(
    ids.slice(0, 100).map(async (id) => {
      try {
        return await payload.findByID({
          collection: collection as 'media',
          id,
          depth: 1,
          overrideAccess: false,
          req,
        })
      } catch {
        return null
      }
    }),
  )

  return docs.filter(Boolean)
}

export async function GET(req: Request) {
  const { payload, req: payloadReq, user } = await getAuthenticatedPayloadRequest(req)

  if (!user) {
    return new Response('Unauthorized', { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const collection = searchParams.get('collection') || ''
  const query = searchParams.get('query') || ''
  const ids = (searchParams.get('ids') || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)

  if (!ALLOWED_COLLECTIONS.has(collection)) {
    return new Response('Unsupported collection', { status: 400 })
  }

  try {
    const limit = collection === 'media' ? 60 : 20
    const tenantId = collection === 'tenants' ? null : getSelectedTenantID(payloadReq)
    const docs = ids.length
      ? await findDocsByIds({ collection, ids, payload, req: payloadReq })
      : (
        await payload.find({
          collection: collection as 'media',
          limit,
          depth: 1,
          pagination: false,
          overrideAccess: false,
          req: payloadReq,
          where: mergeTenantWhere(buildWhere(collection, query), tenantId),
        })
      ).docs

    const options = docs.map((doc) => {
      const record = doc as unknown as Record<string, unknown>
      return {
        label: getLabel(collection, record),
        value: String(record.id),
        resource: collection === 'media' ? getMediaResource(record) : undefined,
        thumbnailURL: collection === 'media' ? getMediaThumbnail(record) : null,
      }
    })

    return Response.json({ options })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load options'
    return new Response(message, { status: 500 })
  }
}
