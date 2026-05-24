import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'

import { isSuperUser } from '@/lib/access/isSuperUser'

async function getAuthenticatedPayloadRequest(req: Request) {
  const payloadReq = await createPayloadRequest({
    canSetHeaders: false,
    config: configPromise,
    request: req,
  })

  return { payload: payloadReq.payload, req: payloadReq, user: payloadReq.user }
}

export async function POST(req: Request) {
  const { payload, req: payloadReq, user } = await getAuthenticatedPayloadRequest(req)

  if (!user || !isSuperUser(user)) {
    return new Response('Unauthorized', { status: 403 })
  }

  try {
    const body = (await req.json()) as { title?: unknown }
    const title = typeof body.title === 'string' ? body.title.trim() : ''

    if (!title) {
      return new Response('Email name is required.', { status: 400 })
    }

    const email = await payload.create({
      collection: 'emails',
      data: {
        _status: 'draft',
        status: 'draft',
        title,
      },
      depth: 0,
      draft: true,
      overrideAccess: false,
      req: payloadReq,
    })

    return Response.json({
      adminUrl: `/admin/collections/emails/${email.id}/visual`,
      email,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to start email campaign'
    return new Response(message, { status: 500 })
  }
}
