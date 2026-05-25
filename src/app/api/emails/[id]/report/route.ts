import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'

import { canUseEmailFeatures } from '@/lib/access/isSuperUser'

const EVENT_TYPES = ['queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complaint', 'unsubscribed', 'failed'] as const

type EventType = typeof EVENT_TYPES[number]
type EventDoc = {
  eventType?: string
  occurredAt?: string
  recipientEmail?: string
  url?: string | null
}

function getString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function getId(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const id = (value as Record<string, unknown>).id ?? (value as Record<string, unknown>).value
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null
}

function percent(value: number, total: number) {
  if (!total) return 0
  return Math.round((value / total) * 1000) / 10
}

function csvEscape(value: unknown) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function toCSV(events: EventDoc[]) {
  const rows = [
    ['eventType', 'recipientEmail', 'occurredAt', 'url'],
    ...events.map((event) => [event.eventType || '', event.recipientEmail || '', event.occurredAt || '', event.url || '']),
  ]
  return rows.map((row) => row.map(csvEscape).join(',')).join('\n')
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
  const url = new URL(req.url)
  const { payload, req: payloadReq, user } = await getAuthenticatedPayloadRequest(req)

  if (!user || !canUseEmailFeatures(user)) {
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
  if (url.searchParams.get('format') === 'csv') {
    return new Response(toCSV(events.docs as EventDoc[]), {
      headers: {
        'Content-Disposition': `attachment; filename="email-${id}-events.csv"`,
        'Content-Type': 'text/csv; charset=utf-8',
      },
    })
  }
  const counts = Object.fromEntries(EVENT_TYPES.map((type) => [type, 0])) as Record<EventType, number>
  const clickedLinks = new Map<string, number>()
  const recipientEvents = new Map<string, Set<EventType>>()

  for (const event of events.docs) {
    const eventType = getString(event.eventType) as EventType
    if (eventType in counts) counts[eventType] += 1
    const recipientEmail = getString(event.recipientEmail).toLowerCase()
    if (recipientEmail && eventType in counts) {
      if (!recipientEvents.has(recipientEmail)) recipientEvents.set(recipientEmail, new Set<EventType>())
      recipientEvents.get(recipientEmail)?.add(eventType)
    }
    const url = getString(event.url)
    if (eventType === 'clicked' && url) clickedLinks.set(url, (clickedLinks.get(url) || 0) + 1)
  }
  const recipientCount = email.sendSummary?.recipientCount || 0
  const terminalRecipients = Array.from(recipientEvents.values()).filter((types) => (
    types.has('delivered') || types.has('bounced') || types.has('failed') || types.has('complaint') || types.has('unsubscribed')
  )).length
  const tenantId = getId(email.tenant)
  const previousCampaigns = await payload.find({
    collection: 'emails',
    depth: 0,
    limit: 5,
    overrideAccess: false,
    req: payloadReq,
    sort: '-sendSummary.sentAt',
    where: {
      and: [
        { id: { not_equals: id } },
        { status: { equals: 'sent' } },
        ...(tenantId ? [{ tenant: { equals: tenantId } }] : []),
      ],
    },
  })

  return Response.json({
    counts,
    events: events.docs.slice(0, 50).map((event) => ({
      eventType: event.eventType,
      occurredAt: event.occurredAt,
      recipientEmail: event.recipientEmail,
        url: event.url,
      })),
    previousCampaigns: previousCampaigns.docs.map((campaign) => ({
      id: campaign.id,
      recipientCount: campaign.sendSummary?.recipientCount || 0,
      sentAt: campaign.sendSummary?.sentAt,
      title: campaign.title,
    })),
    rates: {
      bounce: percent(counts.bounced, recipientCount),
      click: percent(counts.clicked, recipientCount),
      delivery: percent(counts.delivered, recipientCount),
      open: percent(counts.opened, recipientCount),
      unsubscribe: percent(counts.unsubscribed, recipientCount),
    },
    recipientCount,
    reconciliation: {
      terminalRecipients,
      unaccountedRecipients: Math.max(0, recipientCount - terminalRecipients),
    },
    topLinks: Array.from(clickedLinks.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([url, count]) => ({ count, url })),
  })
}
