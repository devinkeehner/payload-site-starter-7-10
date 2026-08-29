import { randomUUID } from 'node:crypto'

import type { Payload, PayloadRequest, Where } from 'payload'

import { sendProductionEmailSnapshotJob } from './campaignSend'
import {
  getEmailCampaignStatus,
  transitionEmailLifecycle,
} from './lifecycle'
import { transitionEmailSendJob } from './jobState'
import { getEmailRelationshipId } from './recipients'

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function getNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function getMaxAttempts(): number {
  const value = Number(process.env.EMAIL_SEND_JOB_MAX_ATTEMPTS || 3)
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 3
}

function getLockExpiration(now = new Date()): string {
  const ttlMinutes = Number(process.env.EMAIL_SEND_JOB_LOCK_MINUTES || 30)
  const ttl = Number.isFinite(ttlMinutes) && ttlMinutes > 0 ? ttlMinutes : 30
  return new Date(now.getTime() + ttl * 60 * 1000).toISOString()
}

export function isExpiredEmailSendJobLock(
  lockExpiresAt: unknown,
  now = new Date(),
): boolean {
  if (typeof lockExpiresAt !== 'string' || !lockExpiresAt) return true
  const expiresAt = new Date(lockExpiresAt)
  return !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= now.getTime()
}

export function canClaimEmailSendJob(
  job: UnknownRecord,
  now = new Date(),
  maxAttempts = getMaxAttempts(),
): boolean {
  void now
  const status = getString(job.status)
  return status === 'pending' && getNumber(job.attempts) < maxAttempts
}

export function isIdempotentlyQueuedStatus(status: unknown): boolean {
  return status === 'pending' || status === 'running'
}

export async function requeueExpiredPreDispatchJob({
  claimToken,
  jobId,
  payload,
}: {
  claimToken?: string
  jobId: string
  payload: Payload
}): Promise<UnknownRecord | null> {
  return transitionEmailSendJob({
    data: {
      claimToken: null,
      lockExpiresAt: null,
      lockedAt: null,
      message: 'Worker lease expired before provider dispatch; safely returned to queue.',
    },
    expected: {
      ...(claimToken ? { claimToken } : {}),
      providerAttemptedAt: null,
    },
    from: 'running',
    jobId,
    payload,
    to: 'pending',
  })
}

async function getQueueActivationState({
  emailId,
  jobId,
  overrideAccess,
  payload,
  req,
}: {
  emailId: string
  jobId: string
  overrideAccess: boolean
  payload: Payload
  req: PayloadRequest
}) {
  const [email, job] = await Promise.all([
    payload.findByID({
      collection: 'emails',
      depth: 0,
      draft: true,
      id: emailId,
      overrideAccess,
      req,
    }),
    payload.findByID({
      collection: 'email-send-jobs' as never,
      depth: 0,
      id: jobId,
      overrideAccess,
      req,
    }),
  ])
  return {
    email: email as unknown as UnknownRecord,
    emailStatus: getEmailCampaignStatus((email as unknown as UnknownRecord).status),
    job: job as unknown as UnknownRecord,
    jobStatus: getString((job as unknown as UnknownRecord).status),
  }
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
  req: PayloadRequest
}): Promise<UnknownRecord | null> {
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
            { status: { equals: 'scheduled' } },
            { status: { equals: 'preparing' } },
            { status: { equals: 'pending' } },
            { status: { equals: 'running' } },
          ],
        },
      ],
    } as Where,
  })

  return (existing.docs[0] as UnknownRecord | undefined) || null
}

export async function enqueueEmailSendJob({
  emailId,
  jobId,
  overrideAccess = false,
  payload,
  req,
}: {
  emailId: string
  jobId?: string | null
  overrideAccess?: boolean
  payload: Payload
  req: PayloadRequest
}) {
  const email = (await payload.findByID({
    collection: 'emails',
    depth: 1,
    draft: true,
    id: emailId,
    overrideAccess,
    req,
  })) as unknown as UnknownRecord
  const resolvedJobId = jobId || getEmailRelationshipId(email.deliveryJob)
  const job = resolvedJobId
    ? (await payload.findByID({
        collection: 'email-send-jobs' as never,
        depth: 0,
        id: resolvedJobId,
        overrideAccess,
        req,
      })) as unknown as UnknownRecord
    : await findActiveJob({ emailId, overrideAccess, payload, req })
  const activeJobId = getEmailRelationshipId(job)
  if (!job || !activeJobId) {
    throw new Error('No approved snapshot job exists for this campaign.')
  }
  if (getEmailRelationshipId(job.email) !== emailId) {
    throw new Error('The delivery job does not belong to this campaign.')
  }

  const jobStatus = getString(job.status)
  const emailStatus = getEmailCampaignStatus(email.status)
  if (
    isIdempotentlyQueuedStatus(jobStatus) &&
    (emailStatus === 'queued' || emailStatus === 'sending') &&
    getEmailRelationshipId(email.deliveryJob) === activeJobId
  ) {
    return {
      alreadyQueued: true,
      emailId,
      jobId: activeJobId,
      message: 'This campaign is already queued.',
      status: jobStatus,
    }
  }
  if (jobStatus !== 'scheduled') {
    throw new Error(`A ${jobStatus || 'missing'} delivery job cannot be queued.`)
  }

  if (emailStatus === 'scheduled') {
    try {
      await transitionEmailLifecycle({
        emailId,
        expected: {
          deliveryContentRevision: getString(job.contentRevision),
          deliveryJob: activeJobId,
          scheduledAt: getString(job.scheduledFor),
        },
        from: emailStatus,
        overrideAccess,
        payload,
        req,
        to: 'queued',
      })
    } catch (error) {
      const current = await getQueueActivationState({
        emailId,
        jobId: activeJobId,
        overrideAccess,
        payload,
        req,
      }).catch(() => null)
      if (
        !current ||
        !['queued', 'sending'].includes(current.emailStatus) ||
        getEmailRelationshipId(current.email.deliveryJob) !== activeJobId ||
        !['scheduled', 'pending', 'running'].includes(current.jobStatus)
      ) {
        throw error
      }
      if (isIdempotentlyQueuedStatus(current.jobStatus)) {
        return {
          alreadyQueued: true,
          emailId,
          jobId: activeJobId,
          message: 'This campaign is already queued.',
          status: current.jobStatus,
        }
      }
    }
  } else if (emailStatus !== 'queued') {
    throw new Error(`A campaign in ${emailStatus} cannot activate a scheduled delivery.`)
  }
  const activated = await transitionEmailSendJob({
    data: {
      message: null,
    },
    expected: {
      activeKey: emailId,
    },
    from: 'scheduled',
    jobId: activeJobId,
    payload,
    to: 'pending',
  })
  if (!activated) {
    const current = await getQueueActivationState({
      emailId,
      jobId: activeJobId,
      overrideAccess,
      payload,
      req,
    }).catch(() => null)
    if (
      current &&
      isIdempotentlyQueuedStatus(current.jobStatus) &&
      ['queued', 'sending'].includes(current.emailStatus) &&
      getEmailRelationshipId(current.email.deliveryJob) === activeJobId
    ) {
      return {
        alreadyQueued: true,
        emailId,
        jobId: activeJobId,
        message: 'This campaign is already queued.',
        status: current.jobStatus,
      }
    }
    await transitionEmailLifecycle({
      data: {
        sendSummary: {
          sendError: 'The scheduled send job could not be activated.',
          sendJob: activeJobId,
        },
      },
      emailId,
      expected: {
        deliveryJob: activeJobId,
      },
      from: 'queued',
      overrideAccess,
      payload,
      req,
      to: 'failed',
    }).catch(() => undefined)
    throw new Error('The scheduled send job could not be activated.')
  }

  return {
    alreadyQueued: false,
    emailId,
    jobId: activeJobId,
    message: 'Campaign queued for delivery.',
    status: 'pending',
  }
}

async function claimJob({
  job,
  now = new Date(),
  payload,
}: {
  job: UnknownRecord
  now?: Date
  payload: Payload
}): Promise<UnknownRecord | null> {
  const id = getEmailRelationshipId(job)
  if (!id || !canClaimEmailSendJob(job, now)) return null
  const nowISO = now.toISOString()
  const claimToken = randomUUID()
  const claimData = {
    attempts: getNumber(job.attempts) + 1,
    claimToken,
    completedAt: null,
    lockedAt: nowISO,
    lockExpiresAt: getLockExpiration(now),
    message: null,
    providerAttemptedAt: null,
    startedAt: job.startedAt || nowISO,
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
      {
        _id: id,
        attempts: { $lt: getMaxAttempts() },
        status: 'pending',
      },
      { $set: claimData },
      { new: true },
    )
    const claimed = typeof query === 'object' && 'lean' in query && query.lean
      ? await query.lean()
      : await query

    return claimed ? ({ ...job, ...claimData } as UnknownRecord) : null
  }
  throw new Error('Atomic email send-job claims are unavailable.')
}

async function failJobAndCampaign({
  claimToken,
  deliveryUnknown = false,
  emailId,
  emailStatus,
  jobId,
  message,
  overrideAccess,
  payload,
  req,
}: {
  claimToken?: string
  deliveryUnknown?: boolean
  emailId: string
  emailStatus: ReturnType<typeof getEmailCampaignStatus>
  jobId: string
  message: string
  overrideAccess: boolean
  payload: Payload
  req: PayloadRequest
}) {
  const completedAt = new Date().toISOString()
  const terminalStatus = deliveryUnknown ? 'delivery_unknown' : 'failed'
  const updatedJob = await transitionEmailSendJob({
    data: {
      // Unknown provider outcomes deliberately retain the campaign's active
      // key. That blocks any new delivery job until an operator investigates,
      // preventing an ambiguous provider acceptance from being resent.
      activeKey: deliveryUnknown ? emailId : `terminal:${jobId}`,
      completedAt,
      lockExpiresAt: null,
      lockedAt: null,
      message,
    },
    expected: claimToken ? { claimToken } : {},
    from: claimToken ? 'running' : 'pending',
    jobId,
    payload,
    to: terminalStatus,
  }).catch(() => null)
  if (!updatedJob) return false

  if (emailStatus === 'queued' || emailStatus === 'sending') {
    const currentEmail = (await payload.findByID({
      collection: 'emails',
      depth: 0,
      draft: true,
      id: emailId,
      overrideAccess,
      req,
    }).catch(() => null)) as UnknownRecord | null
    const previousSummary = isRecord(currentEmail?.sendSummary) ? currentEmail.sendSummary : {}
    await transitionEmailLifecycle({
      data: {
        sendSummary: {
          ...previousSummary,
          sendError: message,
          sendJob: jobId,
        },
      },
      emailId,
      expected: {
        deliveryJob: jobId,
      },
      from: emailStatus,
      overrideAccess,
      payload,
      req,
      to: 'failed',
    }).catch(() => undefined)
  }
  return true
}

export async function reconcileCompletedEmailSendJob({
  job,
  overrideAccess = false,
  payload,
  req,
}: {
  job: UnknownRecord
  overrideAccess?: boolean
  payload: Payload
  req: PayloadRequest
}): Promise<boolean> {
  const jobId = getEmailRelationshipId(job)
  const emailId = getEmailRelationshipId(job.email)
  if (
    !jobId ||
    !emailId ||
    getString(job.status) !== 'completed' ||
    job.reconciliationPending !== true ||
    getString(job.activeKey) !== emailId
  ) {
    return false
  }

  let email = (await payload.findByID({
    collection: 'emails',
    depth: 0,
    draft: true,
    id: emailId,
    overrideAccess,
    req,
  }).catch(() => null)) as UnknownRecord | null
  if (!email || getEmailRelationshipId(email.deliveryJob) !== jobId) return false

  let emailStatus = getEmailCampaignStatus(email.status)
  if (emailStatus !== 'sent') {
    if (emailStatus !== 'sending') return false
    const previousSummary = isRecord(email.sendSummary) ? email.sendSummary : {}
    try {
      await transitionEmailLifecycle({
        data: {
          sendSummary: {
            ...previousSummary,
            contentRevision: getString(job.contentRevision),
            iContactMessageId: getString(job.iContactMessageId),
            iContactSendId: getString(job.iContactSendId),
            recipientCount: getNumber(job.sentRecipientCount),
            sendError: null,
            sendJob: jobId,
            sentAt: getString(job.completedAt) || new Date().toISOString(),
            suppressedRecipientCount: getNumber(job.suppressedRecipientCount),
          },
        },
        emailId,
        expected: {
          deliveryJob: jobId,
        },
        from: 'sending',
        overrideAccess,
        payload,
        req,
        to: 'sent',
      })
      emailStatus = 'sent'
    } catch {
      email = (await payload.findByID({
        collection: 'emails',
        depth: 0,
        draft: true,
        id: emailId,
        overrideAccess,
        req,
      }).catch(() => null)) as UnknownRecord | null
      emailStatus = getEmailCampaignStatus(email?.status)
      if (
        emailStatus !== 'sent' ||
        getEmailRelationshipId(email?.deliveryJob) !== jobId
      ) {
        return false
      }
    }
  }

  const released = await transitionEmailSendJob({
    data: {
      activeKey: `terminal:${jobId}`,
      reconciliationPending: false,
    },
    expected: {
      activeKey: emailId,
      reconciliationPending: true,
    },
    from: 'completed',
    jobId,
    payload,
    to: 'completed',
  })
  if (released) return true

  const currentJob = (await payload.findByID({
    collection: 'email-send-jobs' as never,
    depth: 0,
    id: jobId,
    overrideAccess,
    req,
  }).catch(() => null)) as UnknownRecord | null
  return Boolean(
    currentJob &&
    getString(currentJob.status) === 'completed' &&
    currentJob.reconciliationPending !== true &&
    getString(currentJob.activeKey) === `terminal:${jobId}`,
  )
}

export async function reconcileCompletedEmailSendJobs({
  emailId,
  limit = 10,
  overrideAccess = false,
  payload,
  req,
}: {
  emailId?: string
  limit?: number
  overrideAccess?: boolean
  payload: Payload
  req: PayloadRequest
}) {
  const jobs = await payload.find({
    collection: 'email-send-jobs' as never,
    depth: 0,
    limit: Math.max(1, Math.min(25, limit)),
    overrideAccess,
    req,
    sort: 'completedAt',
    where: {
      and: [
        { status: { equals: 'completed' } },
        { reconciliationPending: { equals: true } },
        ...(emailId ? [{ email: { equals: emailId } }] : []),
      ],
    } as Where,
  })

  const results: Array<{ jobId: string; reconciled: boolean }> = []
  for (const job of jobs.docs as UnknownRecord[]) {
    const jobId = getEmailRelationshipId(job)
    if (!jobId) continue
    results.push({
      jobId,
      reconciled: await reconcileCompletedEmailSendJob({
        job,
        overrideAccess,
        payload,
        req,
      }),
    })
  }
  return results
}

export async function processEmailSendQueue({
  emailId,
  limit = 1,
  overrideAccess = false,
  payload,
  req,
}: {
  emailId?: string
  limit?: number
  overrideAccess?: boolean
  payload: Payload
  request?: Request
  req: PayloadRequest
}) {
  await reconcileCompletedEmailSendJobs({
    emailId,
    limit,
    overrideAccess,
    payload,
    req,
  })
  const now = new Date()
  const expiredRunningWhere = {
    and: [
      { status: { equals: 'running' } },
      {
        or: [
          { lockExpiresAt: { less_than_equal: now.toISOString() } },
          { lockExpiresAt: { exists: false } },
        ],
      },
    ],
  }
  const statusWhere = {
    or: [
      { status: { equals: 'pending' } },
      expiredRunningWhere,
    ],
  }
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
            statusWhere,
            { email: { equals: emailId } },
          ],
        } as Where
      : statusWhere as Where,
  })
  const results: Array<{ emailId?: string; error?: string; jobId: string; sent?: boolean }> = []

  for (const pendingJob of jobs.docs as UnknownRecord[]) {
    const jobId = getEmailRelationshipId(pendingJob)
    const campaignId = getEmailRelationshipId(pendingJob.email)
    if (!jobId || !campaignId) continue
    const initialEmail = (await payload.findByID({
      collection: 'emails',
      depth: 1,
      draft: true,
      id: campaignId,
      overrideAccess,
      req,
    })) as unknown as UnknownRecord
    const initialStatus = getEmailCampaignStatus(initialEmail.status)

    if (
      getString(pendingJob.status) === 'running' &&
      isExpiredEmailSendJobLock(pendingJob.lockExpiresAt, now)
    ) {
      if (pendingJob.providerAttemptedAt === null) {
        const requeued = await requeueExpiredPreDispatchJob({
          claimToken: getString(pendingJob.claimToken) || undefined,
          jobId,
          payload,
        })
        if (requeued) continue

        // The worker may have marked provider dispatch after this process read
        // the stale job. Refresh before classifying; never requeue that job.
        const refreshedJob = (await payload.findByID({
          collection: 'email-send-jobs' as never,
          depth: 0,
          id: jobId,
          overrideAccess,
          req,
        }).catch(() => null)) as UnknownRecord | null
        if (
          getString(refreshedJob?.status) === 'running' &&
          refreshedJob?.providerAttemptedAt
        ) {
          const message = 'Provider delivery outcome is unknown after the worker lease expired. Investigate before sending again.'
          await failJobAndCampaign({
            claimToken: getString(refreshedJob.claimToken),
            deliveryUnknown: true,
            emailId: campaignId,
            emailStatus: initialStatus,
            jobId,
            message,
            overrideAccess,
            payload,
            req,
          })
          results.push({ emailId: campaignId, error: message, jobId, sent: false })
        }
        continue
      }
      const message = 'Provider delivery outcome is unknown after the worker lease expired. Investigate before sending again.'
      await failJobAndCampaign({
        claimToken: getString(pendingJob.claimToken),
        deliveryUnknown: true,
        emailId: campaignId,
        emailStatus: initialStatus,
        jobId,
        message,
        overrideAccess,
        payload,
        req,
      })
      results.push({ emailId: campaignId, error: message, jobId, sent: false })
      continue
    }

    if (
      initialStatus !== 'queued' ||
      getEmailRelationshipId(initialEmail.deliveryJob) !== jobId
    ) {
      const message = 'Queued job no longer matches the campaign delivery reservation.'
      await failJobAndCampaign({
        emailId: campaignId,
        emailStatus: initialStatus,
        jobId,
        message,
        overrideAccess,
        payload,
        req,
      })
      results.push({ emailId: campaignId, error: message, jobId, sent: false })
      continue
    }

    if (!canClaimEmailSendJob(pendingJob, now)) {
      if (getNumber(pendingJob.attempts) >= getMaxAttempts()) {
        const message = 'Email send job exceeded its retry limit.'
        await failJobAndCampaign({
          emailId: campaignId,
          emailStatus: initialStatus,
          jobId,
          message,
          overrideAccess,
          payload,
          req,
        })
        results.push({ emailId: campaignId, error: message, jobId, sent: false })
      }
      continue
    }

    const claimedJob = await claimJob({
      job: pendingJob,
      now,
      payload,
    })
    if (!claimedJob) continue
    let providerAttempted = false

    try {
      if (initialStatus !== 'queued') {
        throw new Error(`A campaign in ${initialStatus} cannot be processed from the send queue.`)
      }
      await transitionEmailLifecycle({
        emailId: campaignId,
        expected: {
          deliveryJob: jobId,
        },
        from: initialStatus,
        overrideAccess,
        payload,
        req,
        to: 'sending',
      })
      const sent = await sendProductionEmailSnapshotJob({
        beforeProviderDispatch: async () => {
          const attemptedAt = new Date().toISOString()
          const marked = await transitionEmailSendJob({
            data: {
              providerAttemptedAt: attemptedAt,
            },
            expected: {
              claimToken: getString(claimedJob.claimToken),
            },
            from: 'running',
            jobId,
            payload,
            to: 'running',
          })
          if (!marked) {
            throw new Error('This send worker lost its delivery lease before provider dispatch.')
          }
          providerAttempted = true
        },
        jobId,
        overrideAccess,
        payload,
        req,
      })
      const completedAt = new Date().toISOString()
      const completedJob = await transitionEmailSendJob({
        data: {
          completedAt,
          iContactMessageId: sent.iContactMessageId,
          iContactSendId: sent.iContactSendId,
          lockExpiresAt: null,
          lockedAt: null,
          message: sent.message,
          reconciliationPending: true,
          sentRecipientCount: sent.recipientCount,
          suppressedRecipientCount: sent.suppressedRecipientCount,
        },
        expected: {
          claimToken: getString(claimedJob.claimToken),
        },
        from: 'running',
        jobId,
        payload,
        to: 'completed',
      })
      if (!completedJob) {
        throw new Error('This send worker no longer owns the delivery job.')
      }
      const reconciled = await reconcileCompletedEmailSendJob({
        job: completedJob,
        overrideAccess,
        payload,
        req,
      })
      if (!reconciled) {
        throw new Error('Provider accepted the delivery, but campaign results still need reconciliation.')
      }
      results.push({ emailId: campaignId, jobId, sent: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to process email send job'
      await failJobAndCampaign({
        claimToken: getString(claimedJob.claimToken),
        deliveryUnknown: providerAttempted,
        emailId: campaignId,
        emailStatus: 'sending',
        jobId,
        message,
        overrideAccess,
        payload,
        req,
      })
      results.push({ emailId: campaignId, error: message, jobId, sent: false })
    }
  }

  return results
}
