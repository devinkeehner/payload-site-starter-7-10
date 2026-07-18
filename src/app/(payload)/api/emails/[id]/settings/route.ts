// Keep specific dynamic endpoints beside Payload's REST catch-all so Next routes them first.
import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'

import { canUseEmailFeatures } from '@/lib/access/isSuperUser'
import {
  assertEmailAudienceTenantMatch,
  resolveEmailAudience,
} from '@/lib/email/recipients'

type EmailSettingsBody = {
  emailList?: unknown
  preheader?: unknown
  recipientEmail?: unknown
  replyTo?: unknown
  subject?: unknown
}

function getString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
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
  if (!tenantId) return []

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
    const resolved = await resolveEmailAudience({
      emailList: list as unknown as Record<string, unknown>,
      payload,
      req: payloadReq,
    }).catch(() => null)
    if (resolved) {
      assertEmailAudienceTenantMatch({
        audienceTenant: resolved.list.tenant,
        campaignTenant: tenantId,
      })
    }
    const summary = resolved?.summary
    return {
      active: summary?.active ?? 0,
      bounced: summary?.bounced ?? 0,
      contactBlocked: summary?.contactBlocked ?? 0,
      doNotContact: summary?.doNotContact ?? 0,
      duplicates: summary?.duplicates ?? 0,
      eligible: summary?.eligible ?? 0,
      id: String(list.id),
      inactive: summary?.inactive ?? 0,
      invalid: summary?.invalid ?? 0,
      name: typeof list.name === 'string' ? list.name : 'Untitled audience',
      total: summary?.total ?? 0,
      unsubscribed: summary?.unsubscribed ?? 0,
    }
  }))
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { payload, req: payloadReq, user } = await getAuthenticatedPayloadRequest(req)

  if (!user || !canUseEmailFeatures(user)) {
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

  if (!user || !canUseEmailFeatures(user)) {
    return new Response('Unauthorized', { status: 403 })
  }

  try {
    const body = (await req.json()) as EmailSettingsBody
    const emailListProvided = hasOwn(body, 'emailList')
    const emailList = emailListProvided ? getRelationshipId(body.emailList) : null
    const currentEmail = await payload.findByID({
      collection: 'emails',
      depth: 0,
      draft: true,
      id,
      overrideAccess: false,
      req: payloadReq,
    })
    const tenantId = getRelationshipId(currentEmail.tenant)

    if (emailListProvided && emailList) {
      const list = await payload.findByID({
        collection: 'email-lists',
        depth: 0,
        id: emailList,
        overrideAccess: false,
        req: payloadReq,
      })
      const listTenantId = getRelationshipId(list.tenant)
      try {
        assertEmailAudienceTenantMatch({
          audienceTenant: listTenantId,
          campaignTenant: tenantId,
        })
      } catch {
        return new Response('Audience list must belong to the same site as this email.', { status: 400 })
      }
    }

    const data: Record<string, unknown> = {}
    if (emailListProvided) data.emailList = emailList || null
    if (hasOwn(body, 'preheader')) data.preheader = getString(body.preheader)
    if (hasOwn(body, 'recipientEmail')) data.recipientEmail = getString(body.recipientEmail)
    if (hasOwn(body, 'replyTo')) data.replyTo = getString(body.replyTo)
    if (hasOwn(body, 'subject')) data.subject = getString(body.subject)

    const email = Object.keys(data).length
      ? await payload.update({
          collection: 'emails',
          data,
          depth: 2,
          draft: true,
          id,
          overrideAccess: false,
          req: payloadReq,
        })
      : currentEmail

    return Response.json({ email })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save email settings'
    return new Response(message, { status: 500 })
  }
}
