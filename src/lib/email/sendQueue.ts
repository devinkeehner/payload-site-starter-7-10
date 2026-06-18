import type { Payload, PayloadRequest, Where } from 'payload'

import { sendProductionEmailCampaign } from './campaignSend'

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function getId(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (!isRecord(value)) return null
  const id = value.id ?? value._id ?? value.value
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function getNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function lockExpiresAt() {
  const ttlMinutes = Number(process.env.EMAIL_SEND_JOB_LOCK_MINUTES || 30)
  const ttl = Number.isFinite(ttlMinutes) && ttlMinutes > 0 ? ttlMinutes : 30
  return new Date(Date.now() + ttl * 60 * 1000).toISOString()
}

async function findActiveJob({
  emailId,
  overrideAccess,
  payload,
  req,
}: {
  emailId: string
  overrideAccess: boolean
  payload: Payload
  req?: PayloadRequest
}) {
  const existing = await payload.find({
    collection: 'email-send-jobs' as never,
    depth: 0,
    limit: 1,
    overrideAccess,
    req,
    sort: '-createdAt',
    where: {
      and: [
        { email: { equals: emailId } },
        {
          or: [
            { status: { equals: 'pending' } },
            { status: { equals: 'running' } },
          ],
        },
      ],
    } as Where,
  })

  return existing.docs[0] as UnknownRecord | undefined
}

export async function enqueueEmailSendJob({
  emailId,
  kind = 'manual',
  overrideAccess = false,
  payload,
  req,
  userId,
}: {
  emailId: string
  kind?: 'manual' | 'scheduled'
  overrideAccess?: boolean
  payload: Payload
  req?: PayloadRequest
  userId?: string | null
}) {
  const email = (await payload.findByID({
    collection: 'emails',
    depth: 1,
    draft: true,
    id: emailId,
    overrideAccess,
    req,
  })) as unknown as UnknownRecord
  const status = getString(email.status) || 'draft'

  if (status === 'sent') {
    throw new Error('This email has already been sent. Duplicate it before sending again.')
  }

  const activeJob = await findActiveJob({ emailId, overrideAccess, payload, req })
  if (activeJob) {
    return {
      alreadyQueued: true,
      emailId,
      jobId: getId(activeJob),
      message: 'This email is already queued for sending.',
      status: getString(activeJob.status) || 'pending',
    }
  }

  const now = new Date().toISOString()
  await payload.update({
    collection: 'emails',
    data: {
      sendSummary: {
        approvedAt: now,
        approvedBy: userId || undefined,
        sendError: undefined,
      },
      status: 'queued',
    } as never,
    draft: true,
    id: emailId,
    overrideAccess,
    overrideLock: false,
    req,
  })

  const job = (await payload.create({
    collection: 'email-send-jobs' as never,
    data: {
      email: emailId,
      kind,
      requestedAt: now,
      requestedBy: userId || undefined,
      status: 'pending',
      tenant: getId(email.tenant) || undefined,
    } as never,
    overrideAccess,
    req,
  })) as unknown as UnknownRecord

  return {
    alreadyQueued: false,
    emailId,
    jobId: getId(job),
    message: 'Email queued for sending.',
    status: 'pending',
  }
}

async function claimJob({
  job,
  overrideAccess,
  payload,
  req,
}: {
  job: UnknownRecord
  overrideAccess: boolean
  payload: Payload
  req?: PayloadRequest
}) {
  const id = getId(job)
  if (!id) return null
  const now = new Date().toISOString()
  const claimData = {
    attempts: getNumber(job.attempts) + 1,
    lockedAt: now,
    lockExpiresAt: lockExpiresAt(),
    startedAt: job.startedAt || now,
    status: 'running',
  }

  const model = (payload.db.collections as Record<string, unknown>)['email-send-jobs'] as
    | {
        findOneAndUpdate?: (
          filter: UnknownRecord,
          update: UnknownRecord,
          options: UnknownRecord,
        ) => { lean?: () => Promise<unknown> } | Promise<unknown>
      }
    | undefined

  if (model?.findOneAndUpdate) {
    const query = model.findOneAndUpdate(
      { _id: id, status: 'pending' },
      { $set: claimData },
      { new: true },
    )
    const claimed = typeof query === 'object' && 'lean' in query && query.lean
      ? await query.lean()
      : await query

    return claimed ? ({ ...job, ...claimData } as UnknownRecord) : null
  }

  return payload.update({
    collection: 'email-send-jobs' as never,
    data: claimData as never,
    id,
    overrideAccess,
    overrideLock: false,
    req,
  }) as Promise<UnknownRecord>
}

export async function processEmailSendQueue({
  emailId,
  limit = 1,
  overrideAccess = false,
  payload,
  request,
  req,
}: {
  emailId?: string
  limit?: number
  overrideAccess?: boolean
  payload: Payload
  request: Request
  req: PayloadRequest
}) {
  const jobs = await payload.find({
    collection: 'email-send-jobs' as never,
    depth: 1,
    limit: Math.max(1, Math.min(10, limit)),
    overrideAccess,
    req,
    sort: 'createdAt',
    where: emailId
      ? {
          and: [
            { status: { equals: 'pending' } },
            { email: { equals: emailId } },
          ],
        } as Where
      : {
          status: { equals: 'pending' },
        } as Where,
  })
  const results: Array<{ emailId?: string; error?: string; jobId: string; sent?: boolean }> = []

  for (const pendingJob of jobs.docs as UnknownRecord[]) {
    const jobId = getId(pendingJob)
    const emailId = getId(pendingJob.email)
    if (!jobId || !emailId) continue

    const claimedJob = await claimJob({ job: pendingJob, overrideAccess, payload, req })
    if (!claimedJob) continue

    try {
      const sent = await sendProductionEmailCampaign({
        allowSendingStatus: true,
        emailId,
        overrideAccess,
        payload,
        req,
        request,
      })
      await payload.update({
        collection: 'email-send-jobs' as never,
        data: {
          completedAt: new Date().toISOString(),
          elasticCampaignId: sent.elasticCampaignId,
          message: sent.message,
          recipientCount: sent.recipientCount,
          status: 'completed',
        } as never,
        id: jobId,
        overrideAccess,
        overrideLock: false,
        req,
      })
      results.push({ emailId, jobId, sent: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to process email send job'
      await payload.update({
        collection: 'email-send-jobs' as never,
        data: {
          completedAt: new Date().toISOString(),
          message,
          status: 'failed',
        } as never,
        id: jobId,
        overrideAccess,
        overrideLock: false,
        req,
      }).catch(() => undefined)
      await payload.update({
        collection: 'emails',
        data: {
          sendSummary: {
            sendError: message,
          },
          status: 'failed',
        },
        draft: true,
        id: emailId,
        overrideAccess,
        overrideLock: false,
        req,
      }).catch(() => undefined)
      results.push({ emailId, error: message, jobId, sent: false })
    }
  }

  return results
}
