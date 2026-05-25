import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'

import { isSuperUser } from '@/lib/access/isSuperUser'

const EVENT_TYPES = ['queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complaint', 'unsubscribed', 'failed'] as const

type EventType = typeof EVENT_TYPES[number]

function getString(value: unknown) {
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

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { payload, req: payloadReq, user } = await getAuthenticatedPayloadRequest(req)

  if (!user || !isSuperUser(user)) {
    return new Response('Unauthorized', { status: 403 })
  }

  const email = await payload.findByID({
    collection: 'emails',
    depth: 0,
    draft: true,
    id,
    overrideAccess: false,
    req: payloadReq,
  })
  const events = await payload.find({
    collection: 'email-send-events',
    depth: 1,
    limit: 1000,
    overrideAccess: false,
    req: payloadReq,
    sort: '-occurredAt',
    where: {
      email: {
        equals: id,
      },
    },
  })
  const counts = Object.fromEntries(EVENT_TYPES.map((type) => [type, 0])) as Record<EventType, number>
  const clickedLinks = new Map<string, number>()

  for (const event of events.docs) {
    const eventType = getString(event.eventType) as EventType
    if (eventType in counts) counts[eventType] += 1
    const url = getString(event.url)
    if (eventType === 'clicked' && url) clickedLinks.set(url, (clickedLinks.get(url) || 0) + 1)
  }

  return Response.json({
    counts,
    events: events.docs.slice(0, 50).map((event) => ({
      eventType: event.eventType,
      occurredAt: event.occurredAt,
      recipientEmail: event.recipientEmail,
      url: event.url,
    })),
    recipientCount: email.sendSummary?.recipientCount || 0,
    topLinks: Array.from(clickedLinks.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([url, count]) => ({ count, url })),
  })
}
