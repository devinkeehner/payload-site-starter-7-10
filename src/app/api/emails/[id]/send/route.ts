import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'

import { canUseEmailFeatures } from '@/lib/access/isSuperUser'
import { enqueueEmailSendJob } from '@/lib/email/sendQueue'

async function getAuthenticatedPayloadRequest(req: Request) {
  const payloadReq = await createPayloadRequest({
    canSetHeaders: false,
    config: configPromise,
    request: req,
  })

  return { payload: payloadReq.payload, req: payloadReq, user: payloadReq.user }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { payload, req: payloadReq, user } = await getAuthenticatedPayloadRequest(req)

  if (!user || !canUseEmailFeatures(user)) {
    return new Response('Unauthorized', { status: 403 })
  }

  try {
    const result = await enqueueEmailSendJob({
      emailId: id,
      payload,
      req: payloadReq,
      userId: typeof user.id === 'string' || typeof user.id === 'number' ? String(user.id) : undefined,
    })

    return Response.json({
      ...result,
      status: 'queued',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to send production email'
    return new Response(message, { status: 500 })
  }
}
