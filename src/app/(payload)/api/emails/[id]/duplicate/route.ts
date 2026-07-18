// Keep specific dynamic endpoints beside Payload's REST catch-all so Next routes them first.
import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'

import { canUseEmailFeatures } from '@/lib/access/isSuperUser'
import { getEmailRelationshipId } from '@/lib/email/recipients'

type UnknownRecord = Record<string, unknown>

function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const req = await createPayloadRequest({
    canSetHeaders: false,
    config: configPromise,
    request,
  })

  if (!req.user || !canUseEmailFeatures(req.user)) {
    return new Response('Unauthorized', { status: 403 })
  }

  try {
    const source = (await req.payload.findByID({
      collection: 'emails',
      depth: 0,
      draft: true,
      id,
      overrideAccess: false,
      req,
    })) as unknown as UnknownRecord
    const data: UnknownRecord = {
      emailList: getEmailRelationshipId(source.emailList) || null,
      layout: Array.isArray(source.layout) ? source.layout : [],
      preheader: getString(source.preheader),
      recipientEmail: getString(source.recipientEmail),
      replyTo: getString(source.replyTo),
      status: 'draft',
      subject: getString(source.subject),
      tenant: getEmailRelationshipId(source.tenant) || undefined,
      title: `${getString(source.title) || 'Untitled email'} Copy`,
    }
    const email = await req.payload.create({
      collection: 'emails',
      data,
      depth: 1,
      draft: true,
      overrideAccess: false,
      req,
    })

    return Response.json({
      adminUrl: `/admin/collections/emails/${email.id}/visual`,
      email,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to duplicate this campaign.'
    return new Response(message, { status: 500 })
  }
}
