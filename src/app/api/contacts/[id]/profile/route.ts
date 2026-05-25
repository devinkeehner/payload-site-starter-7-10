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

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { payload, req: payloadReq, user } = await getAuthenticatedPayloadRequest(req)

  if (!user || !isSuperUser(user)) {
    return new Response('Unauthorized', { status: 403 })
  }

  const [contact, memberships, events] = await Promise.all([
    payload.findByID({
      collection: 'contacts',
      depth: 1,
      id,
      overrideAccess: false,
      req: payloadReq,
    }),
    payload.find({
      collection: 'email-list-memberships',
      depth: 2,
      limit: 200,
      overrideAccess: false,
      req: payloadReq,
      sort: '-updatedAt',
      where: {
        contact: {
          equals: id,
        },
      },
    }),
    payload.find({
      collection: 'email-send-events',
      depth: 1,
      limit: 100,
      overrideAccess: false,
      req: payloadReq,
      sort: '-occurredAt',
      where: {
        contact: {
          equals: id,
        },
      },
    }),
  ])

  return Response.json({
    contact,
    events: events.docs,
    memberships: memberships.docs,
  })
}
