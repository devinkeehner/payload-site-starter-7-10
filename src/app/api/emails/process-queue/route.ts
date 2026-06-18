import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'

import { canUseEmailFeatures } from '@/lib/access/isSuperUser'
import { processEmailSendQueue } from '@/lib/email/sendQueue'

function hasCronAuthorization(req: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function POST(req: Request) {
  const payloadReq = await createPayloadRequest({
    canSetHeaders: false,
    config: configPromise,
    request: req,
  })
  const isCron = hasCronAuthorization(req)
  if (!isCron && !canUseEmailFeatures(payloadReq.user)) {
    return new Response('Unauthorized', { status: 401 })
  }

  const payload = payloadReq.payload
  const body = await req.json().catch(() => ({})) as { emailId?: unknown; limit?: unknown }
  const emailId = typeof body.emailId === 'string' && body.emailId.trim() ? body.emailId.trim() : undefined
  const requestedLimit = typeof body.limit === 'number' ? body.limit : Number(process.env.EMAIL_SEND_QUEUE_PROCESS_LIMIT || 2)
  const processed = await processEmailSendQueue({
    emailId,
    limit: Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : 2,
    overrideAccess: isCron,
    payload,
    req: payloadReq,
    request: req,
  })

  return Response.json({
    checkedAt: new Date().toISOString(),
    processed,
  })
}
