import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'

import { enqueueEmailSendJob, processEmailSendQueue } from '@/lib/email/sendQueue'

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
  const now = new Date().toISOString()
  const due = await payload.find({
    collection: 'emails',
    depth: 0,
    limit: 25,
    overrideAccess: true,
    sort: 'scheduledAt',
    where: {
      and: [
        { status: { equals: 'scheduled' } },
        { scheduledAt: { less_than_equal: now } },
      ],
    },
  })
  const enqueued: Array<{ emailId: string; error?: string; jobId?: string | null; queued?: boolean }> = []

  for (const email of due.docs) {
    try {
      const result = await enqueueEmailSendJob({
        emailId: String(email.id),
        kind: 'scheduled',
        overrideAccess: true,
        payload,
        req: payloadReq,
      })
      enqueued.push({ emailId: String(email.id), jobId: result.jobId, queued: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to queue scheduled email'
      await payload.update({
        collection: 'emails',
        data: {
          sendSummary: {
            sendError: message,
          },
          status: 'failed',
        },
        draft: true,
        id: email.id,
        overrideAccess: true,
      }).catch(() => undefined)
      enqueued.push({ emailId: String(email.id), error: message, queued: false })
    }
  }
  const processLimit = Number(process.env.EMAIL_SEND_QUEUE_PROCESS_LIMIT || 2)
  const processed = await processEmailSendQueue({
    limit: Number.isFinite(processLimit) && processLimit > 0 ? processLimit : 2,
    overrideAccess: true,
    payload,
    req: payloadReq,
    request: req,
  })

  return Response.json({
    checkedAt: now,
    enqueued,
    processed,
  })
}
