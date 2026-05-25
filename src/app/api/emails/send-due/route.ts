import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'

import { sendProductionEmailCampaign } from '@/lib/email/campaignSend'

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
  const results: Array<{ emailId: string; error?: string; sent?: boolean }> = []

  for (const email of due.docs) {
    try {
      await payload.update({
        collection: 'emails',
        data: { status: 'sending' },
        draft: true,
        id: email.id,
        overrideAccess: true,
      })
      await sendProductionEmailCampaign({
        allowSendingStatus: true,
        emailId: String(email.id),
        overrideAccess: true,
        payload,
        req: payloadReq,
        request: req,
      })
      results.push({ emailId: String(email.id), sent: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to send scheduled email'
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
      results.push({ emailId: String(email.id), error: message, sent: false })
    }
  }

  return Response.json({
    checkedAt: now,
    processed: results.length,
    results,
  })
}
