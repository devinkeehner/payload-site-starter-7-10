import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'

import { canUseEmailFeatures } from '@/lib/access/isSuperUser'

const MEMBERSHIP_STATUSES = new Set(['subscribed', 'unsubscribed', 'inactive', 'bounced', 'doNotContact'])
type MembershipStatus = 'bounced' | 'doNotContact' | 'inactive' | 'subscribed' | 'unsubscribed'

async function getAuthenticatedPayloadRequest(req: Request) {
  const payloadReq = await createPayloadRequest({
    canSetHeaders: false,
    config: configPromise,
    request: req,
  })

  return { payload: payloadReq.payload, req: payloadReq, user: payloadReq.user }
}

function getString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { payload, req: payloadReq, user } = await getAuthenticatedPayloadRequest(req)

  if (!user || !canUseEmailFeatures(user)) {
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

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { payload, req: payloadReq, user } = await getAuthenticatedPayloadRequest(req)

  if (!user || !canUseEmailFeatures(user)) {
    return new Response('Unauthorized', { status: 403 })
  }

  const body = (await req.json()) as { membershipId?: unknown; status?: unknown }
  const membershipId = getString(body.membershipId)
  const status = getString(body.status)

  if (!membershipId) return new Response('Membership is required.', { status: 400 })
  if (!MEMBERSHIP_STATUSES.has(status)) return new Response('Membership status is invalid.', { status: 400 })
  const nextStatus = status as MembershipStatus

  const membership = await payload.findByID({
    collection: 'email-list-memberships',
    depth: 0,
    id: membershipId,
    overrideAccess: false,
    req: payloadReq,
  })

  const contactId = typeof membership.contact === 'object' && membership.contact ? membership.contact.id : membership.contact
  if (String(contactId) !== String(id)) {
    return new Response('Membership does not belong to this contact.', { status: 400 })
  }

  const now = new Date().toISOString()
  const updated = await payload.update({
    collection: 'email-list-memberships',
    data: {
      status: nextStatus,
      subscribedAt: nextStatus === 'subscribed' ? now : membership.subscribedAt,
      unsubscribedAt: nextStatus === 'unsubscribed' ? now : nextStatus === 'subscribed' ? null : membership.unsubscribedAt,
    },
    id: membershipId,
    overrideAccess: false,
    req: payloadReq,
  })

  return Response.json({ membership: updated })
}
