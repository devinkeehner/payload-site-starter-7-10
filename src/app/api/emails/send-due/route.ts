import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'

import { transitionEmailLifecycle } from '@/lib/email/lifecycle'
import { transitionEmailSendJob } from '@/lib/email/jobState'
import { getEmailRelationshipId } from '@/lib/email/recipients'
import { getEmailReadiness } from '@/lib/email/readiness'
import { getScheduledDeliveryAuthorizationError } from '@/lib/email/scheduledDelivery'
import { enqueueEmailSendJob, processEmailSendQueue } from '@/lib/email/sendQueue'

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

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
    depth: 1,
    limit: 25,
    overrideAccess: true,
    req: payloadReq,
    sort: 'scheduledAt',
    where: {
      and: [
        { status: { equals: 'scheduled' } },
        { scheduledAt: { less_than_equal: now } },
      ],
    },
  })
  const enqueued: Array<{ emailId: string; error?: string; jobId?: string | null; queued?: boolean }> = []

  for (const rawEmail of due.docs) {
    const email = rawEmail as unknown as UnknownRecord
    const emailId = String(rawEmail.id)
    try {
      const currentRevision = (await getEmailReadiness({
        emailId,
        overrideAccess: true,
        payload,
        req: payloadReq,
      })).contentRevision
      const deliveryJobId = getEmailRelationshipId(email.deliveryJob)
      const job = deliveryJobId
        ? (await payload.findByID({
            collection: 'email-send-jobs' as never,
            depth: 0,
            id: deliveryJobId,
            overrideAccess: true,
            req: payloadReq,
          }).catch(() => null)) as UnknownRecord | null
        : null
      const authorizationError = getScheduledDeliveryAuthorizationError({
        currentRevision,
        deliveryConfirmedAt: email.deliveryConfirmedAt,
        deliveryContentRevision: email.deliveryContentRevision,
        deliveryJobId,
        emailId,
        job,
        scheduledAt: email.scheduledAt,
      })

      if (authorizationError) {
        const previousSummary = isRecord(email.sendSummary) ? email.sendSummary : {}
        await transitionEmailLifecycle({
          data: {
            legacyScheduleNeedsReview: true,
            sendSummary: {
              ...previousSummary,
              sendError: `${authorizationError} Review and confirm delivery again.`,
            },
          },
          emailId,
          expected: {
            deliveryContentRevision: getString(email.deliveryContentRevision) || null,
            deliveryJob: deliveryJobId,
            scheduledAt: getString(email.scheduledAt) || null,
          },
          from: 'scheduled',
          overrideAccess: true,
          payload,
          req: payloadReq,
          to: 'draft',
        })
        if (deliveryJobId) {
          await transitionEmailSendJob({
            data: {
              activeKey: `terminal:${deliveryJobId}`,
              completedAt: new Date().toISOString(),
              lockExpiresAt: null,
              lockedAt: null,
              message: `${authorizationError} Delivery requires explicit reconfirmation.`,
            },
            from: ['preparing', 'scheduled'],
            jobId: deliveryJobId,
            payload,
            to: 'cancelled',
          }).catch(() => undefined)
        }
        enqueued.push({ emailId, error: authorizationError, jobId: deliveryJobId, queued: false })
        continue
      }

      const result = await enqueueEmailSendJob({
        emailId,
        jobId: deliveryJobId,
        overrideAccess: true,
        payload,
        req: payloadReq,
      })
      enqueued.push({ emailId, jobId: result.jobId, queued: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to queue scheduled email'
      enqueued.push({ emailId, error: message, queued: false })
    }
  }
  const processLimit = Number(process.env.EMAIL_SEND_QUEUE_PROCESS_LIMIT || 2)
  const processed = await processEmailSendQueue({
    limit: Number.isFinite(processLimit) && processLimit > 0 ? processLimit : 2,
    overrideAccess: true,
    payload,
    req: payloadReq,
  })

  return Response.json({
    checkedAt: now,
    enqueued,
    processed,
  })
}
