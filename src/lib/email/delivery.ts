import type { Payload, PayloadRequest } from 'payload'

import {
  getEmailCampaignStatus,
  isCurrentSuccessfulTest,
  revisionsMatch,
  transitionEmailLifecycle,
  validateScheduleInput,
} from './lifecycle'
import {
  isEmailJobConflict,
  transitionEmailSendJob,
} from './jobState'
import { getEmailRelationshipId } from './recipients'
import {
  getEmailReadiness,
  type EmailReadiness,
  type EmailReadinessItem,
} from './readiness'
import { createEmailSnapshotJob } from './snapshot'

type UnknownRecord = Record<string, unknown>

export type EmailDeliveryResult = {
  jobId: string
  snapshotRevision: string
  status: 'pending' | 'running' | 'scheduled'
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function getBlockingDeliveryReadinessItems({
  items,
}: {
  items: EmailReadinessItem[]
}): EmailReadinessItem[] {
  return items.filter((item) => item.status === 'fail')
}

export function assertExpectedEmailRevision({
  currentRevision,
  expectedRevision,
}: {
  currentRevision: string
  expectedRevision: unknown
}) {
  if (!revisionsMatch(expectedRevision, currentRevision)) {
    const error = new Error('This campaign changed after it was reviewed. Refresh and review the latest version.')
    ;(error as Error & { status?: number }).status = 409
    throw error
  }
}

function assertCurrentTest({
  currentRevision,
  email,
}: {
  currentRevision: string
  email: UnknownRecord
}) {
  const lastSend = isRecord(email.lastSend) ? email.lastSend : {}
  if (isCurrentSuccessfulTest({
    currentRevision,
    lastTestRevision: lastSend.contentRevision,
    lastTestStatus: lastSend.status,
  })) {
    return
  }
  throw new Error('Send a successful test of the current campaign revision before delivery.')
}

async function getEmailForDelivery({
  emailId,
  overrideAccess,
  payload,
  req,
}: {
  emailId: string
  overrideAccess: boolean
  payload: Payload
  req: PayloadRequest
}): Promise<UnknownRecord> {
  return (await payload.findByID({
    collection: 'emails',
    depth: 2,
    draft: true,
    id: emailId,
    overrideAccess,
    req,
  })) as unknown as UnknownRecord
}

async function assertDeliveryReady({
  currentRevision,
  email,
  readiness,
}: {
  currentRevision: string
  email: UnknownRecord
  readiness: EmailReadiness
}) {
  assertCurrentTest({
    currentRevision,
    email,
  })
  const failures = getBlockingDeliveryReadinessItems({
    items: readiness.items,
  })
  if (failures.length) {
    throw new Error(
      `Resolve readiness failures before delivery:\n${failures
        .map((item) => `${item.label}: ${item.message}`)
        .join('\n')}`,
    )
  }

  return readiness
}

async function markJobCancelled({
  jobId,
  payload,
}: {
  jobId?: string | null
  payload: Payload
}) {
  if (!jobId) return
  await transitionEmailSendJob({
    data: {
      activeKey: `terminal:${jobId}`,
      completedAt: new Date().toISOString(),
      lockExpiresAt: null,
      lockedAt: null,
      message: 'Scheduled delivery cancelled.',
    },
    from: ['preparing', 'scheduled'],
    jobId,
    payload,
    to: 'cancelled',
  }).catch(() => undefined)
}

async function getActiveEmailJob({
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
  const result = await payload.find({
    collection: 'email-send-jobs' as never,
    depth: 0,
    limit: 1,
    overrideAccess,
    req,
    where: {
      activeKey: {
        equals: emailId,
      },
    } as never,
  })
  return (result.docs[0] as UnknownRecord | undefined) || null
}

function confirmationConflict(message: string): never {
  const error = new Error(message)
  ;(error as Error & { status?: number }).status = 409
  throw error
}

async function handleActiveJobConflict({
  currentRevision,
  emailId,
  intent,
  overrideAccess,
  payload,
  req,
  scheduledFor,
}: {
  currentRevision: string
  emailId: string
  intent: 'manual' | 'scheduled'
  overrideAccess: boolean
  payload: Payload
  req: PayloadRequest
  scheduledFor?: string
}): Promise<EmailDeliveryResult> {
  const active = await getActiveEmailJob({
    emailId,
    overrideAccess,
    payload,
    req,
  })
  const jobId = getEmailRelationshipId(active)
  const status = getString(active?.status)
  const email = (await payload.findByID({
    collection: 'emails',
    depth: 0,
    draft: true,
    id: emailId,
    overrideAccess,
    req,
  })) as unknown as UnknownRecord
  const emailStatus = getEmailCampaignStatus(email.status)
  const linkedJobId = getEmailRelationshipId(email.deliveryJob)
  if (
    !active ||
    !jobId ||
    getString(active.contentRevision) !== currentRevision ||
    getString(active.kind) !== intent
  ) {
    confirmationConflict('Another delivery confirmation is already active for this campaign.')
  }
  if (status === 'preparing') {
    confirmationConflict('Delivery confirmation is already being prepared. Try again in a moment.')
  }
  if (
    intent === 'scheduled' &&
    status === 'scheduled' &&
    getString(active.scheduledFor) === scheduledFor &&
    emailStatus === 'scheduled' &&
    linkedJobId === jobId
  ) {
    return { jobId, snapshotRevision: currentRevision, status: 'scheduled' }
  }
  if (
    intent === 'manual' &&
    (status === 'pending' || status === 'running') &&
    (emailStatus === 'queued' || emailStatus === 'sending') &&
    linkedJobId === jobId
  ) {
    return {
      jobId,
      snapshotRevision: currentRevision,
      status: status === 'running' ? 'running' : 'pending',
    }
  }
  if (status === 'delivery_unknown') {
    confirmationConflict(
      'The provider outcome for this delivery is unknown. Investigate the existing job before attempting another send.',
    )
  }
  confirmationConflict('Another delivery confirmation is already active for this campaign.')
}

export async function requestEmailSendNow({
  emailId,
  expectedRevision,
  overrideAccess = false,
  payload,
  req,
  request,
  userId,
}: {
  emailId: string
  expectedRevision: unknown
  overrideAccess?: boolean
  payload: Payload
  req: PayloadRequest
  request: Request
  userId?: string
}): Promise<EmailDeliveryResult> {
  const email = await getEmailForDelivery({ emailId, overrideAccess, payload, req })
  const from = getEmailCampaignStatus(email.status)
  const readiness = await getEmailReadiness({
    emailId,
    overrideAccess,
    payload,
    req,
  })
  const currentRevision = readiness.contentRevision
  assertExpectedEmailRevision({ currentRevision, expectedRevision })
  if (from === 'queued' || from === 'sending') {
    const existingJobId = getEmailRelationshipId(email.deliveryJob)
    if (
      existingJobId &&
      revisionsMatch(email.deliveryContentRevision, currentRevision)
    ) {
      return handleActiveJobConflict({
        currentRevision,
        emailId,
        intent: 'manual',
        overrideAccess,
        payload,
        req,
      })
    }
  }
  if (!['draft', 'failed'].includes(from)) {
    throw new Error(`This campaign cannot be sent while it is ${from}.`)
  }
  await assertDeliveryReady({
    currentRevision,
    email,
    readiness,
  })
  let created: Awaited<ReturnType<typeof createEmailSnapshotJob>>
  try {
    created = await createEmailSnapshotJob({
      emailId,
      kind: 'manual',
      overrideAccess,
      payload,
      req,
      request,
      requestedBy: userId,
    })
  } catch (error) {
    if (isEmailJobConflict(error)) {
      return handleActiveJobConflict({
        currentRevision,
        emailId,
        intent: 'manual',
        overrideAccess,
        payload,
        req,
      })
    }
    throw error
  }
  if (created.snapshot.contentRevision !== currentRevision) {
    await markJobCancelled({ jobId: created.jobId, payload })
    throw new Error('Campaign content changed while preparing delivery. Review it again.')
  }
  const now = new Date().toISOString()

  try {
    await transitionEmailLifecycle({
      data: {
        deliveryConfirmedAt: now,
        deliveryConfirmedBy: userId || undefined,
        deliveryContentRevision: currentRevision,
        deliveryJob: created.jobId,
        deliveryTimeZone: null,
        legacyScheduleNeedsReview: false,
        scheduledAt: null,
        sendSummary: {
          approvedAt: now,
          approvedBy: userId || undefined,
          contentRevision: currentRevision,
          sendError: undefined,
          sendJob: created.jobId,
        },
      },
      emailId,
      from,
      overrideAccess,
      payload,
      req,
      to: 'queued',
    })
  } catch (error) {
    await markJobCancelled({ jobId: created.jobId, payload })
    throw error
  }
  const activated = await transitionEmailSendJob({
    from: 'preparing',
    jobId: created.jobId,
    payload,
    to: 'pending',
  })
  if (!activated) {
    await transitionEmailSendJob({
      data: {
        activeKey: `terminal:${created.jobId}`,
        completedAt: new Date().toISOString(),
        message: 'The prepared delivery job could not be activated.',
      },
      from: 'preparing',
      jobId: created.jobId,
      payload,
      to: 'failed',
    }).catch(() => undefined)
    await transitionEmailLifecycle({
      data: {
        sendSummary: {
          contentRevision: currentRevision,
          sendError: 'The prepared delivery job could not be activated.',
          sendJob: created.jobId,
        },
      },
      emailId,
      expected: {
        deliveryJob: created.jobId,
      },
      from: 'queued',
      overrideAccess,
      payload,
      req,
      to: 'failed',
    }).catch(() => undefined)
    throw new Error('The prepared delivery job could not be activated.')
  }

  return {
    jobId: created.jobId,
    snapshotRevision: currentRevision,
    status: 'pending',
  }
}

export async function requestEmailSchedule({
  emailId,
  expectedRevision,
  overrideAccess = false,
  payload,
  req,
  request,
  rescheduleOnly = false,
  scheduledAt,
  timeZone,
  userId,
}: {
  emailId: string
  expectedRevision: unknown
  overrideAccess?: boolean
  payload: Payload
  req: PayloadRequest
  request: Request
  rescheduleOnly?: boolean
  scheduledAt: unknown
  timeZone?: unknown
  userId?: string
}): Promise<EmailDeliveryResult> {
  const schedule = validateScheduleInput({ scheduledAt, timeZone })
  const email = await getEmailForDelivery({ emailId, overrideAccess, payload, req })
  const from = getEmailCampaignStatus(email.status)
  if (rescheduleOnly ? from !== 'scheduled' : !['draft', 'failed', 'scheduled'].includes(from)) {
    throw new Error(`This campaign cannot be scheduled while it is ${from}.`)
  }
  const readiness = await getEmailReadiness({
    emailId,
    overrideAccess,
    payload,
    req,
  })
  const currentRevision = readiness.contentRevision
  assertExpectedEmailRevision({ currentRevision, expectedRevision })
  if (from === 'scheduled') {
    const existingJobId = getEmailRelationshipId(email.deliveryJob)
    if (
      existingJobId &&
      revisionsMatch(email.deliveryContentRevision, currentRevision) &&
      getString(email.scheduledAt) === schedule.scheduledAt
    ) {
      return handleActiveJobConflict({
        currentRevision,
        emailId,
        intent: 'scheduled',
        overrideAccess,
        payload,
        req,
        scheduledFor: schedule.scheduledAt,
      })
    }
    if (!rescheduleOnly) {
      throw new Error('This campaign is already scheduled. Use reschedule to change its delivery time.')
    }
  }
  await assertDeliveryReady({
    currentRevision,
    email,
    readiness,
  })
  const oldJobId = getEmailRelationshipId(email.deliveryJob)
  let transitionFrom = from
  if (rescheduleOnly) {
    if (!oldJobId) confirmationConflict('The scheduled delivery job is missing.')
    await transitionEmailLifecycle({
      data: {
        deliveryConfirmedAt: null,
        deliveryConfirmedBy: null,
        deliveryContentRevision: null,
        deliveryJob: null,
        deliveryTimeZone: null,
        scheduledAt: null,
      },
      emailId,
      expected: {
        deliveryContentRevision: currentRevision,
        deliveryJob: oldJobId,
        scheduledAt: getString(email.scheduledAt),
      },
      from: 'scheduled',
      overrideAccess,
      payload,
      req,
      to: 'draft',
    })
    const cancelled = await transitionEmailSendJob({
      data: {
        activeKey: `terminal:${oldJobId}`,
        completedAt: new Date().toISOString(),
        message: 'Superseded by a rescheduled delivery.',
      },
      from: 'scheduled',
      jobId: oldJobId,
      payload,
      to: 'cancelled',
    })
    if (!cancelled) {
      confirmationConflict('The prior scheduled job changed before it could be replaced.')
    }
    transitionFrom = 'draft'
  }

  let created: Awaited<ReturnType<typeof createEmailSnapshotJob>>
  try {
    created = await createEmailSnapshotJob({
      emailId,
      kind: 'scheduled',
      overrideAccess,
      payload,
      req,
      request,
      requestedBy: userId,
      scheduledFor: schedule.scheduledAt,
    })
  } catch (error) {
    if (isEmailJobConflict(error)) {
      return handleActiveJobConflict({
        currentRevision,
        emailId,
        intent: 'scheduled',
        overrideAccess,
        payload,
        req,
        scheduledFor: schedule.scheduledAt,
      })
    }
    throw error
  }
  if (created.snapshot.contentRevision !== currentRevision) {
    await markJobCancelled({ jobId: created.jobId, payload })
    throw new Error('Campaign content changed while preparing the schedule. Review it again.')
  }
  const now = new Date().toISOString()

  const activated = await transitionEmailSendJob({
    from: 'preparing',
    jobId: created.jobId,
    payload,
    to: 'scheduled',
  })
  if (!activated) {
    await transitionEmailSendJob({
      data: {
        activeKey: `terminal:${created.jobId}`,
        completedAt: new Date().toISOString(),
        message: 'The prepared schedule could not be activated.',
      },
      from: 'preparing',
      jobId: created.jobId,
      payload,
      to: 'failed',
    }).catch(() => undefined)
    throw new Error('The prepared schedule could not be activated.')
  }
  try {
    // Publish the job before exposing the scheduled campaign to the cron
    // scanner. If the email CAS loses, the scheduled job is cancelled below.
    await transitionEmailLifecycle({
      data: {
        deliveryConfirmedAt: now,
        deliveryConfirmedBy: userId || undefined,
        deliveryContentRevision: currentRevision,
        deliveryJob: created.jobId,
        deliveryTimeZone: schedule.timeZone || null,
        legacyScheduleNeedsReview: false,
        scheduledAt: schedule.scheduledAt,
        sendSummary: {
          approvedAt: now,
          approvedBy: userId || undefined,
          contentRevision: currentRevision,
          sendError: undefined,
          sendJob: created.jobId,
        },
      },
      emailId,
      from: transitionFrom,
      overrideAccess,
      payload,
      req,
      to: 'scheduled',
    })
  } catch (error) {
    await markJobCancelled({ jobId: created.jobId, payload })
    throw error
  }

  return {
    jobId: created.jobId,
    snapshotRevision: currentRevision,
    status: 'scheduled',
  }
}

export async function cancelEmailSchedule({
  emailId,
  expectedRevision,
  overrideAccess = false,
  payload,
  req,
}: {
  emailId: string
  expectedRevision?: unknown
  overrideAccess?: boolean
  payload: Payload
  req: PayloadRequest
}) {
  const email = await getEmailForDelivery({ emailId, overrideAccess, payload, req })
  const from = getEmailCampaignStatus(email.status)
  if (from !== 'scheduled') {
    throw new Error('Only a scheduled campaign can have its schedule cancelled.')
  }
  const currentRevision = (await getEmailReadiness({
    emailId,
    overrideAccess,
    payload,
    req,
  })).contentRevision
  if (expectedRevision != null) {
    assertExpectedEmailRevision({ currentRevision, expectedRevision })
  }

  const jobId = getEmailRelationshipId(email.deliveryJob)
  if (!jobId) confirmationConflict('The scheduled delivery job is missing.')
  await transitionEmailLifecycle({
    data: {
      deliveryConfirmedAt: null,
      deliveryConfirmedBy: null,
      deliveryContentRevision: null,
      deliveryJob: null,
      deliveryTimeZone: null,
      legacyScheduleNeedsReview: false,
      scheduledAt: null,
      sendSummary: {
        sendError: undefined,
      },
    },
    emailId,
    expected: {
      deliveryContentRevision: currentRevision,
      deliveryJob: jobId,
      scheduledAt: getString(email.scheduledAt),
    },
    from,
    overrideAccess,
    payload,
    req,
    to: 'draft',
  })
  const cancelled = await transitionEmailSendJob({
    data: {
      activeKey: `terminal:${jobId}`,
      completedAt: new Date().toISOString(),
      message: 'Scheduled delivery cancelled.',
    },
    from: 'scheduled',
    jobId,
    payload,
    to: 'cancelled',
  })
  if (!cancelled) {
    confirmationConflict('The scheduled job changed while cancellation was in progress.')
  }
}
