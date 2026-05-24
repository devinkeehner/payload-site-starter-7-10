import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'

import { isSuperUser } from '@/lib/access/isSuperUser'

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

async function getEmailLists(payload: Awaited<ReturnType<typeof getAuthenticatedPayloadRequest>>['payload'], payloadReq: Awaited<ReturnType<typeof getAuthenticatedPayloadRequest>>['req']) {
  const lists = await payload.find({
    collection: 'email-lists',
    depth: 0,
    limit: 200,
    overrideAccess: false,
    req: payloadReq,
    sort: 'name',
    where: {
      status: {
        equals: 'active',
      },
    },
  })

  return lists.docs.map((list) => ({
    id: String(list.id),
    name: typeof list.name === 'string' ? list.name : 'Untitled audience',
  }))
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { payload, req: payloadReq, user } = await getAuthenticatedPayloadRequest(req)

  if (!user || !isSuperUser(user)) {
    return new Response('Unauthorized', { status: 403 })
  }

  try {
    const [email, lists] = await Promise.all([
      payload.findByID({
        collection: 'emails',
        depth: 2,
        draft: true,
        id,
        overrideAccess: false,
        req: payloadReq,
      }),
      getEmailLists(payload, payloadReq),
    ])

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

    const email = await payload.update({
      collection: 'emails',
      data: {
        emailList: emailList || null,
        preheader: getString(body.preheader),
        recipientEmail: getString(body.recipientEmail),
        replyTo: getString(body.replyTo),
        scheduledAt: scheduledAt || null,
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
