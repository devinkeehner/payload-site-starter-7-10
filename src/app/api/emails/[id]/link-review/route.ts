import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'

import { canUseEmailFeatures } from '@/lib/access/isSuperUser'

type LinkReviewEntry = {
  confirmedAt?: string
  confirmedBy?: string
  href?: string
  label?: string | null
  reason?: string | null
}

function normalizeHref(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

async function getAuthenticatedPayloadRequest(req: Request) {
  const payloadReq = await createPayloadRequest({
    canSetHeaders: false,
    config: configPromise,
    request: req,
  })

  return { payload: payloadReq.payload, req: payloadReq, user: payloadReq.user }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { payload, req: payloadReq, user } = await getAuthenticatedPayloadRequest(req)

  if (!user || !canUseEmailFeatures(user)) {
    return new Response('Unauthorized', { status: 403 })
  }

  try {
    const body = await req.json().catch(() => ({})) as { href?: unknown; label?: unknown; reason?: unknown }
    const href = normalizeHref(body.href)
    if (!href) return new Response('Link URL is required.', { status: 400 })

    const email = await payload.findByID({
      collection: 'emails',
      depth: 0,
      draft: true,
      id,
      overrideAccess: false,
      req: payloadReq,
    }) as unknown as { linkReviewOverrides?: LinkReviewEntry[] }
    const existing = Array.isArray(email.linkReviewOverrides) ? email.linkReviewOverrides : []
    const nextEntry: LinkReviewEntry = {
      confirmedAt: new Date().toISOString(),
      confirmedBy: String(user.id),
      href,
      label: typeof body.label === 'string' ? body.label.trim() : undefined,
      reason: typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'Manually confirmed in the link checker.',
    }
    const nextOverrides = [
      ...existing.filter((entry) => normalizeHref(entry.href) !== href),
      nextEntry,
    ]

    await payload.update({
      collection: 'emails',
      data: {
        linkReviewOverrides: nextOverrides,
      },
      draft: true,
      id,
      overrideAccess: false,
      overrideLock: false,
      req: payloadReq,
    })

    return Response.json({ linkReviewOverrides: nextOverrides, ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to confirm link'
    return new Response(message, { status: 500 })
  }
}
