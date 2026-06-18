import configPromise from '@payload-config'
import { getPayload } from 'payload'

function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeEventType(value: unknown): 'bounced' | 'clicked' | 'complaint' | 'delivered' | 'failed' | 'opened' | 'queued' | 'sent' | 'unsubscribed' {
  const eventType = getString(value).toLowerCase()
  if (eventType.includes('open')) return 'opened'
  if (eventType.includes('click')) return 'clicked'
  if (eventType.includes('bounce')) return 'bounced'
  if (eventType.includes('complaint') || eventType.includes('abuse')) return 'complaint'
  if (eventType.includes('unsubscribe')) return 'unsubscribed'
  if (eventType.includes('deliver')) return 'delivered'
  if (eventType.includes('fail') || eventType.includes('error')) return 'failed'
  if (eventType.includes('send')) return 'sent'
  return 'queued'
}

function getEvents(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? [value as Record<string, unknown>] : []
}

function getId(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const id = record.id ?? record._id ?? record.value
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null
}

export async function POST(req: Request) {
  const secret = process.env.ELASTIC_EMAIL_WEBHOOK_SECRET?.trim()
  if (secret) {
    const provided = req.headers.get('x-elastic-email-webhook-secret') || req.headers.get('x-webhook-secret')
    if (provided !== secret) return new Response('Unauthorized', { status: 401 })
  }

  const payload = await getPayload({ config: configPromise })
  const body = (await req.json()) as unknown
  const events = getEvents(body)

  for (const event of events) {
    const recipientEmail = getString(event.Email || event.email || event.To || event.to)
    if (!recipientEmail) continue

    const eventType = normalizeEventType(event.EventType || event.eventType || event.Event || event.event)
    const elasticCampaignId = getString(
      event.ChannelName ||
      event.channelName ||
      event.CampaignName ||
      event.campaignName ||
      event.CampaignID ||
      event.campaignID ||
      event.TransactionID ||
      event.transactionID,
    )
    const emailResult = elasticCampaignId
      ? await payload.find({
          collection: 'emails',
          depth: 0,
          limit: 1,
          overrideAccess: true,
          where: {
            'sendSummary.elasticCampaignId': {
              equals: elasticCampaignId,
            },
          },
        })
      : null
    const email = emailResult?.docs?.[0]
    const tenantId = getId((email as Record<string, unknown> | undefined)?.tenant)
    const contactResult = await payload.find({
      collection: 'contacts',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: {
        and: [
          { normalizedEmail: { equals: recipientEmail.toLowerCase() } },
          ...(tenantId ? [{ tenant: { equals: tenantId } }] : []),
        ],
      },
    })
    const contact = contactResult.docs[0]

    await payload.create({
      collection: 'email-send-events',
      data: {
        contact: contact?.id,
        email: email?.id,
        elasticCampaignId,
        elasticMessageId: getString(event.MessageID || event.messageID || event.TransactionID || event.transactionID),
        eventType,
        occurredAt: getString(event.Date || event.date || event.EventDate || event.eventDate) || new Date().toISOString(),
        raw: event,
        recipientEmail,
        url: getString(event.Url || event.url),
      },
      overrideAccess: true,
    })

    if (contact?.id && ['bounced', 'complaint', 'unsubscribed'].includes(eventType)) {
      const emailListId = getId((email as Record<string, unknown> | undefined)?.emailList)
      if (emailListId) {
        const membershipResult = await payload.find({
          collection: 'email-list-memberships',
          depth: 0,
          limit: 20,
          overrideAccess: true,
          where: {
            and: [
              { contact: { equals: contact.id } },
              { emailList: { equals: emailListId } },
              ...(tenantId ? [{ tenant: { equals: tenantId } }] : []),
            ],
          },
        })
        for (const membership of membershipResult.docs) {
          await payload.update({
            collection: 'email-list-memberships',
            data: {
              status: eventType === 'unsubscribed' ? 'unsubscribed' : eventType === 'bounced' ? 'bounced' : 'doNotContact',
              unsubscribedAt: eventType === 'unsubscribed' ? new Date().toISOString() : undefined,
            },
            id: membership.id,
            overrideAccess: true,
          })
        }
      }
      await payload.update({
        collection: 'contacts',
        data: {
          status: eventType === 'unsubscribed' ? 'unsubscribed' : eventType === 'bounced' ? 'bounced' : 'doNotContact',
        },
        id: contact.id,
        overrideAccess: true,
      })
    }
  }

  return Response.json({ ok: true, processed: events.length })
}
