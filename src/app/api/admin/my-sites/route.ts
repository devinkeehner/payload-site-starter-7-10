import { NextRequest, NextResponse } from 'next/server'
import type { PayloadRequest } from 'payload'
import { getPayload } from 'payload'
import configPromise from '@payload-config'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({
    headers: req.headers,
    req: req as unknown as PayloadRequest,
  })
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await payload.find({
    collection: 'tenants',
    depth: 0,
    limit: 500,
    overrideAccess: true,
    pagination: false,
    sort: 'name',
    where: {
      archived: { not_equals: true },
    },
  })

  return NextResponse.json({ sites: result.docs })
}

function getSiteIDs(value: unknown) {
  if (!Array.isArray(value)) return null

  return Array.from(
    new Set(
      value
        .filter(
          (item): item is number | string => typeof item === 'number' || typeof item === 'string',
        )
        .map((item) => String(item).trim())
        .filter(Boolean),
    ),
  )
}

export async function PATCH(req: NextRequest) {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({
    headers: req.headers,
    req: req as unknown as PayloadRequest,
  })
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let siteIDs: string[] | null = null
  try {
    const body = (await req.json()) as { siteIds?: unknown }
    siteIDs = getSiteIDs(body.siteIds)
  } catch {
    siteIDs = null
  }
  if (!siteIDs) return NextResponse.json({ error: 'Invalid site list.' }, { status: 400 })
  if (siteIDs.length > 500) {
    return NextResponse.json({ error: 'Too many sites were selected.' }, { status: 400 })
  }

  if (siteIDs.length) {
    const sites = await payload.find({
      collection: 'tenants',
      depth: 0,
      limit: siteIDs.length,
      // Any authenticated creator may add a site to their quick-access list.
      overrideAccess: true,
      pagination: false,
      req: req as unknown as PayloadRequest,
      where: {
        and: [{ id: { in: siteIDs } }, { archived: { not_equals: true } }],
      },
    })
    const validIDs = new Set(sites.docs.map((site) => String(site.id)))
    if (siteIDs.some((id) => !validIDs.has(id))) {
      return NextResponse.json(
        { error: 'One or more selected sites are unavailable.' },
        { status: 400 },
      )
    }
  }

  await payload.update({
    collection: 'users',
    id: String(user.id),
    data: {
      tenants: siteIDs.map((tenant) => ({ tenant })),
    },
    overrideAccess: true,
    req: req as unknown as PayloadRequest,
  })

  return NextResponse.json({ ok: true, siteIds: siteIDs })
}
