// Keep specific dynamic endpoints beside Payload's REST catch-all so Next routes them first.
import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'

import { canUseEmailFeatures } from '@/lib/access/isSuperUser'
import { convertEmailToPost } from '@/lib/email/convertEmailToPost'

type EmailDoc = {
  layout?: unknown[] | null
  preheader?: string | null
  subject?: string | null
  tenant?: string | number | { id?: string | number } | null
  title?: string | null
}

function getRelationshipId(value: unknown): string | number | null {
  if (typeof value === 'string' || typeof value === 'number') return value
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    return typeof id === 'string' || typeof id === 'number' ? id : null
  }
  return null
}

async function getAuthenticatedPayloadRequest(req: Request) {
  const payloadReq = await createPayloadRequest({
    canSetHeaders: false,
    config: configPromise,
    request: req,
  })

  return { payload: payloadReq.payload, req: payloadReq, user: payloadReq.user }
}

async function getTenantDefaultFeaturedImageId(
  payload: Awaited<ReturnType<typeof getAuthenticatedPayloadRequest>>['payload'],
  payloadReq: Awaited<ReturnType<typeof getAuthenticatedPayloadRequest>>['req'],
  tenantId: string | number | null,
) {
  if (!tenantId) return null

  const result = await payload.find({
    collection: 'standard-media',
    depth: 0,
    limit: 1,
    overrideAccess: false,
    req: payloadReq,
    select: {
      defaultFeaturedImage: true,
    },
    where: {
      tenant: {
        equals: tenantId,
      },
    },
  })

  const doc = result.docs[0] as Record<string, unknown> | undefined
  return getRelationshipId(doc?.defaultFeaturedImage)
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { payload, req: payloadReq, user } = await getAuthenticatedPayloadRequest(req)

  if (!user || !canUseEmailFeatures(user)) {
    return new Response('Unauthorized', { status: 403 })
  }

  try {
    const email = (await payload.findByID({
      collection: 'emails',
      depth: 2,
      draft: true,
      id,
      overrideAccess: false,
      req: payloadReq,
    })) as EmailDoc
    const title = email.subject?.trim() || email.title?.trim() || 'Email update'
    const tenantDefaultFeaturedImageId = await getTenantDefaultFeaturedImageId(
      payload,
      payloadReq,
      getRelationshipId(email.tenant),
    )
    const converted = convertEmailToPost(email.layout, email.preheader || title, {
      tenantDefaultFeaturedImageId,
    })

    return Response.json({
      content: converted.content,
      layout: converted.layout,
      meta: {
        description: email.preheader || '',
        title,
      },
      title,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to render post preview'
    return new Response(message, { status: 500 })
  }
}
