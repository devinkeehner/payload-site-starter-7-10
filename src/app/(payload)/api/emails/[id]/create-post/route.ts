// Keep specific dynamic endpoints beside Payload's REST catch-all so Next routes them first.
import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'

import { convertEmailToPost } from '@/lib/email/convertEmailToPost'
import { canUseEmailFeatures } from '@/lib/access/isSuperUser'

type EmailDoc = Record<string, unknown> & {
  id?: string | number
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
    const email = await payload.findByID({
      collection: 'emails',
      id,
      draft: true,
      depth: 2,
      overrideAccess: false,
      req: payloadReq,
    }) as unknown as EmailDoc

    const relatedPostId = getRelationshipId(email.relatedPost)
    if (relatedPostId) {
      const post = await payload.findByID({
        collection: 'posts',
        depth: 2,
        draft: true,
        id: relatedPostId,
        overrideAccess: false,
        req: payloadReq,
      })

      return Response.json({
        adminUrl: `/admin/collections/posts/${relatedPostId}/visual`,
        created: false,
        post,
      })
    }

    const title = email.subject?.trim() || email.title?.trim() || 'Email update'
    const tenantId = getRelationshipId(email.tenant)
    const tenantDefaultFeaturedImageId = await getTenantDefaultFeaturedImageId(payload, payloadReq, tenantId)
    const converted = convertEmailToPost(email.layout, email.preheader || title, {
      tenantDefaultFeaturedImageId,
    })
    const data: Record<string, unknown> = {
      _status: 'draft',
      content: converted.content,
      layout: converted.layout,
      meta: {
        description: email.preheader || undefined,
        title,
      },
      title,
    }

    if (tenantId) {
      data.tenant = tenantId
    }

    const post = await payload.create({
      collection: 'posts',
      data,
      depth: 2,
      draft: true,
      overrideAccess: false,
      req: payloadReq,
    })
    await payload.update({
      collection: 'emails',
      data: {
        relatedPost: post.id,
      },
      draft: true,
      id,
      overrideAccess: false,
      overrideLock: false,
      req: payloadReq,
    })

    return Response.json({
      adminUrl: `/admin/collections/posts/${post.id}/visual`,
      created: true,
      post,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create post from email'
    return new Response(message, { status: 500 })
  }
}
