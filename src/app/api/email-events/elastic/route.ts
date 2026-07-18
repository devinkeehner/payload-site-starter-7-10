import configPromise from '@payload-config'
import type { Payload } from 'payload'
import { getPayload } from 'payload'

import {
  authenticateElasticWebhookSecret,
  type ElasticWebhookJobContext,
  getElasticWebhookChannelName,
  getElasticWebhookJobContext,
  getElasticWebhookRelationshipId,
  getElasticWebhookString,
  getEmailJobIdFromElasticChannelName,
  recordBelongsToElasticWebhookTenant,
} from '@/lib/email/elasticWebhook'

type UnknownRecord = Record<string, unknown>

type PreparedWebhookEvent = {
  channel: ElasticWebhookJobContext
  elasticMessageId: string
  eventType: ReturnType<typeof normalizeEventType>
  occurredAt: string
  raw: UnknownRecord
  recipientEmail: string
  url: string
}

class WebhookRequestError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

function normalizeEventType(
  value: unknown,
):
  | 'bounced'
  | 'clicked'
  | 'complaint'
  | 'delivered'
  | 'failed'
  | 'opened'
  | 'queued'
  | 'sent'
  | 'unsubscribed' {
  const eventType = getElasticWebhookString(value).toLowerCase()
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

function getEvents(value: unknown): UnknownRecord[] {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is UnknownRecord =>
        Boolean(item && typeof item === 'object' && !Array.isArray(item)),
    )
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? [value as UnknownRecord]
    : []
}

function getOccurredAt(event: UnknownRecord): string {
  const value = getElasticWebhookString(
    event.Date || event.date || event.EventDate || event.eventDate,
  )
  if (!value) return new Date().toISOString()

  const occurredAt = new Date(value)
  if (Number.isNaN(occurredAt.getTime())) {
    throw new WebhookRequestError('Webhook event has an invalid occurrence date.')
  }
  return occurredAt.toISOString()
}

async function getVerifiedChannelContext({
  channelName,
  payload,
}: {
  channelName: string
  payload: Payload
}): Promise<ElasticWebhookJobContext> {
  const channelJobId = getEmailJobIdFromElasticChannelName(channelName)
  if (!channelJobId) {
    throw new WebhookRequestError('Webhook event is missing a valid send-job channel.')
  }

  let job: UnknownRecord
  try {
    job = (await payload.findByID({
      collection: 'email-send-jobs',
      depth: 0,
      id: channelJobId,
      overrideAccess: true,
    })) as unknown as UnknownRecord
  } catch {
    throw new WebhookRequestError('Webhook send job was not found.', 404)
  }

  const channel = getElasticWebhookJobContext({ channelName, job })
  if (!channel) {
    throw new WebhookRequestError('Webhook send job metadata is incomplete or inconsistent.')
  }

  let email: UnknownRecord
  let emailList: UnknownRecord
  try {
    ;[email, emailList] = (await Promise.all([
      payload.findByID({
        collection: 'emails',
        depth: 0,
        draft: true,
        id: channel.emailId,
        overrideAccess: true,
      }),
      payload.findByID({
        collection: 'email-lists',
        depth: 0,
        id: channel.audienceListId,
        overrideAccess: true,
      }),
    ])) as unknown as [UnknownRecord, UnknownRecord]
  } catch {
    throw new WebhookRequestError('Webhook campaign or audience was not found.', 404)
  }

  const emailMatches =
    getElasticWebhookRelationshipId(email) === channel.emailId &&
    recordBelongsToElasticWebhookTenant(email, channel.tenantId)
  const listMatches =
    getElasticWebhookRelationshipId(emailList) === channel.audienceListId &&
    recordBelongsToElasticWebhookTenant(emailList, channel.tenantId)

  if (!emailMatches || !listMatches) {
    throw new WebhookRequestError('Webhook campaign tenant metadata does not match.', 409)
  }

  return channel
}

async function prepareWebhookEvents({
  events,
  payload,
}: {
  events: UnknownRecord[]
  payload: Payload
}): Promise<PreparedWebhookEvent[]> {
  const channelContexts = new Map<string, Promise<ElasticWebhookJobContext>>()

  return Promise.all(
    events.map(async (event) => {
      const recipientEmail = getElasticWebhookString(
        event.Email || event.email || event.To || event.to,
      ).toLowerCase()
      if (!recipientEmail) {
        throw new WebhookRequestError('Webhook event is missing a recipient email.')
      }

      const channelName = getElasticWebhookChannelName(event)
      if (!channelName) {
        throw new WebhookRequestError('Webhook event is missing its channel name.')
      }

      let channelPromise = channelContexts.get(channelName)
      if (!channelPromise) {
        channelPromise = getVerifiedChannelContext({ channelName, payload })
        channelContexts.set(channelName, channelPromise)
      }

      return {
        channel: await channelPromise,
        elasticMessageId: getElasticWebhookString(
          event.MessageID || event.messageID || event.TransactionID || event.transactionID,
        ),
        eventType: normalizeEventType(
          event.EventType || event.eventType || event.Event || event.event,
        ),
        occurredAt: getOccurredAt(event),
        raw: event,
        recipientEmail,
        url: getElasticWebhookString(event.Url || event.url),
      }
    }),
  )
}

function getSuppressionStatus(
  eventType: PreparedWebhookEvent['eventType'],
): 'bounced' | 'doNotContact' | 'unsubscribed' | null {
  if (eventType === 'unsubscribed') return 'unsubscribed'
  if (eventType === 'bounced') return 'bounced'
  if (eventType === 'complaint') return 'doNotContact'
  return null
}

export async function POST(req: Request) {
  const authentication = authenticateElasticWebhookSecret({
    configuredSecret: process.env.ELASTIC_EMAIL_WEBHOOK_SECRET,
    providedSecret:
      req.headers.get('x-elastic-email-webhook-secret') ||
      req.headers.get('x-webhook-secret'),
  })
  if (authentication === 'not-configured') {
    return new Response('Webhook unavailable', { status: 503 })
  }
  if (authentication !== 'authenticated') {
    return new Response('Unauthorized', { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const events = getEvents(body)
  if (!events.length) {
    return new Response('No webhook events supplied', { status: 400 })
  }

  const payload = await getPayload({ config: configPromise })
  let preparedEvents: PreparedWebhookEvent[]
  try {
    preparedEvents = await prepareWebhookEvents({ events, payload })
  } catch (error) {
    if (error instanceof WebhookRequestError) {
      return new Response(error.message, { status: error.status })
    }
    throw error
  }

  for (const event of preparedEvents) {
    const { audienceListId, channelName, emailId, tenantId } = event.channel
    const contactResult = await payload.find({
      collection: 'contacts',
      depth: 0,
      limit: 2,
      overrideAccess: true,
      where: {
        and: [
          { normalizedEmail: { equals: event.recipientEmail } },
          { tenant: { equals: tenantId } },
        ],
      },
    })
    const tenantContacts = contactResult.docs.filter((contact) =>
      recordBelongsToElasticWebhookTenant(contact, tenantId),
    )
    const contact = tenantContacts.length === 1 ? tenantContacts[0] : undefined

    await payload.create({
      collection: 'email-send-events',
      data: {
        contact: contact?.id,
        email: emailId,
        elasticCampaignId: channelName,
        elasticMessageId: event.elasticMessageId,
        eventType: event.eventType,
        occurredAt: event.occurredAt,
        raw: event.raw,
        recipientEmail: event.recipientEmail,
        tenant: tenantId,
        url: event.url,
      },
      overrideAccess: true,
    })

    const suppressionStatus = getSuppressionStatus(event.eventType)
    if (!contact?.id || !suppressionStatus) continue

    const membershipResult = await payload.find({
      collection: 'email-list-memberships',
      depth: 0,
      limit: 100,
      overrideAccess: true,
      where: {
        and: [
          { contact: { equals: contact.id } },
          { emailList: { equals: audienceListId } },
          { tenant: { equals: tenantId } },
        ],
      },
    })
    for (const membership of membershipResult.docs) {
      if (!recordBelongsToElasticWebhookTenant(membership, tenantId)) continue
      await payload.update({
        collection: 'email-list-memberships',
        data: {
          status: suppressionStatus,
          unsubscribedAt:
            suppressionStatus === 'unsubscribed' ? new Date().toISOString() : undefined,
        },
        id: membership.id,
        overrideAccess: true,
      })
    }

    await payload.update({
      collection: 'contacts',
      data: {
        status: suppressionStatus,
      },
      id: contact.id,
      overrideAccess: true,
    })
  }

  return Response.json({ ok: true, processed: preparedEvents.length })
}
