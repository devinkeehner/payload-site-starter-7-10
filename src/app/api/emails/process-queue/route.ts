import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'

import { processEmailSendQueue } from '@/lib/email/sendQueue'

function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return new Response('Unauthorized', { status: 401 })
  }

  const payloadReq = await createPayloadRequest({
    canSetHeaders: false,
    config: configPromise,
    request: req,
  })
  const payload = payloadReq.payload
  const body = await req.json().catch(() => ({})) as { limit?: unknown }
  const requestedLimit = typeof body.limit === 'number' ? body.limit : Number(process.env.EMAIL_SEND_QUEUE_PROCESS_LIMIT || 2)
  const processed = await processEmailSendQueue({
    limit: Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : 2,
    overrideAccess: true,
    payload,
    req: payloadReq,
    request: req,
  })

  return Response.json({
    checkedAt: new Date().toISOString(),
    processed,
  })
}
