import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'

import { isSuperUser } from '@/lib/access/isSuperUser'
import { getEmailAudienceSummary } from '@/lib/email/audienceSummary'

type EmailSettingsBody = {
  emailList?: unknown
  preheader?: unknown
  recipientEmail?: unknown
  replyTo?: unknown
  scheduledAt?: unknown
  subject?: unknown
}

function getString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
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

async function getEmailLists({
  payload,
  payloadReq,
  tenantId,
}: {
  payload: Awaited<ReturnType<typeof getAuthenticatedPayloadRequest>>['payload']
  payloadReq: Awaited<ReturnType<typeof getAuthenticatedPayloadRequest>>['req']
  tenantId?: string | number | null
}) {
  const lists = await payload.find({
    collection: 'email-lists',
    depth: 0,
    limit: 200,
    overrideAccess: false,
    req: payloadReq,
    sort: 'name',
    where: {
      and: [
        {
          status: {
            equals: 'active',
          },
        },
        ...(tenantId ? [{ tenant: { equals: tenantId } }] : []),
      ],
    },
  })

  return Promise.all(lists.docs.map(async (list) => {
    const summary = await getEmailAudienceSummary({ listId: String(list.id), payload, req: payloadReq }).catch(() => null)
    return {
      active: summary?.active || 0,
      bounced: summary?.bounced || 0,
      doNotContact: summary?.doNotContact || 0,
      id: String(list.id),
      name: typeof list.name === 'string' ? list.name : 'Untitled audience',
      total: summary?.total || 0,
      unsubscribed: summary?.unsubscribed || 0,
    }
  }))
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { payload, req: payloadReq, user } = await getAuthenticatedPayloadRequest(req)

  if (!user || !isSuperUser(user)) {
    return new Response('Unauthorized', { status: 403 })
  }

  try {
    const email = await payload.findByID({
      collection: 'emails',
      depth: 2,
      draft: true,
      id,
      overrideAccess: false,
      req: payloadReq,
    })
    const tenantId = getRelationshipId(email.tenant)
    const lists = await getEmailLists({ payload, payloadReq, tenantId })

    return Response.json({
      email: {
        emailList: getRelationshipId(email.emailList),
        preheader: email.preheader || '',
        recipientEmail: email.recipientEmail || '',
        replyTo: email.replyTo || '',
        scheduledAt: email.scheduledAt || '',
        status: email.status || 'draft',
        subject: email.subject || '',
        title: email.title || 'Untitled email',
      },
      lists,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load email settings'
    return new Response(message, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { payload, req: payloadReq, user } = await getAuthenticatedPayloadRequest(req)

  if (!user || !isSuperUser(user)) {
    return new Response('Unauthorized', { status: 403 })
  }

  try {
    const body = (await req.json()) as EmailSettingsBody
    const emailList = getString(body.emailList)
    const scheduledAt = getString(body.scheduledAt)
    const currentEmail = await payload.findByID({
      collection: 'emails',
      depth: 0,
      draft: true,
      id,
      overrideAccess: false,
      req: payloadReq,
    })
    const tenantId = getRelationshipId(currentEmail.tenant)

    if (emailList) {
      const list = await payload.findByID({
        collection: 'email-lists',
        depth: 0,
        id: emailList,
        overrideAccess: false,
        req: payloadReq,
      })
      const listTenantId = getRelationshipId(list.tenant)
      if (tenantId && listTenantId && String(tenantId) !== String(listTenantId)) {
        return new Response('Audience list must belong to the same site as this email.', { status: 400 })
      }
    }

    const email = await payload.update({
      collection: 'emails',
      data: {
        emailList: emailList || null,
        preheader: getString(body.preheader),
        recipientEmail: getString(body.recipientEmail),
        replyTo: getString(body.replyTo),
        scheduledAt: scheduledAt || null,
        status: scheduledAt
          ? 'scheduled'
          : currentEmail.status === 'scheduled'
            ? 'draft'
            : currentEmail.status,
        subject: getString(body.subject),
      },
      depth: 2,
      draft: true,
      id,
      overrideAccess: false,
      req: payloadReq,
    })

    return Response.json({ email })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save email settings'
    return new Response(message, { status: 500 })
  }
}
