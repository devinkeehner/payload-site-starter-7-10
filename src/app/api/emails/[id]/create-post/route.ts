import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'

import { convertEmailToPost } from '@/lib/email/convertEmailToPost'
import { isSuperUser } from '@/lib/access/isSuperUser'

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

  if (!user || !isSuperUser(user)) {
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

    const title = email.subject?.trim() || email.title?.trim() || 'Email update'
    const converted = convertEmailToPost(email.layout, email.preheader || title)
    const tenantId = getRelationshipId(email.tenant)
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

    return Response.json({
      adminUrl: `/admin/collections/posts/${post.id}/visual`,
      post,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create post from email'
    return new Response(message, { status: 500 })
  }
}
