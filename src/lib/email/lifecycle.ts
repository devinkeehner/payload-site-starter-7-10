import type { Payload, PayloadRequest } from 'payload'

import type { EmailCampaignStatus } from './workflowTypes'

type UnknownRecord = Record<string, unknown>

const TRANSITIONS: Record<EmailCampaignStatus, ReadonlySet<EmailCampaignStatus>> = {
  draft: new Set(['queued', 'scheduled']),
  failed: new Set(['draft', 'queued', 'scheduled']),
  queued: new Set(['failed', 'sending']),
  scheduled: new Set(['draft', 'queued', 'scheduled']),
  sending: new Set(['failed', 'sent']),
  sent: new Set(),
}

export const EMAIL_CONTENT_LOCKED_STATUSES = new Set<EmailCampaignStatus>([
  'queued',
  'scheduled',
  'sending',
  'sent',
])

export function getEmailCampaignStatus(value: unknown): EmailCampaignStatus {
  switch (value) {
    case 'failed':
    case 'queued':
    case 'scheduled':
    case 'sending':
    case 'sent':
      return value
    case 'draft':
    case 'approved':
    default:
      return 'draft'
  }
}

export function canTransitionEmailLifecycle(
  from: EmailCampaignStatus,
  to: EmailCampaignStatus,
): boolean {
  return from === to || TRANSITIONS[from].has(to)
}

export function assertEmailLifecycleTransition(
  from: EmailCampaignStatus,
  to: EmailCampaignStatus,
) {
  if (!canTransitionEmailLifecycle(from, to)) {
    throw new Error(`Email cannot transition from ${from} to ${to}.`)
  }
}

export function isEmailContentLocked(status: EmailCampaignStatus): boolean {
  return EMAIL_CONTENT_LOCKED_STATUSES.has(status)
}

export function canSendEmailTest(status: EmailCampaignStatus): boolean {
  return status === 'draft' || status === 'failed'
}

export function revisionsMatch(expected: unknown, current: unknown): boolean {
  return typeof expected === 'string' &&
    Boolean(expected) &&
    typeof current === 'string' &&
    expected === current
}

export function isCurrentSuccessfulTest({
  currentRevision,
  lastTestRevision,
  lastTestStatus,
}: {
  currentRevision: string
  lastTestRevision?: unknown
  lastTestStatus?: unknown
}): boolean {
  return lastTestStatus === 'sent' && revisionsMatch(lastTestRevision, currentRevision)
}

export function validateScheduleInput({
  now = new Date(),
  scheduledAt,
  timeZone,
}: {
  now?: Date
  scheduledAt: unknown
  timeZone?: unknown
}): {
  scheduledAt: string
  timeZone?: string
} {
  if (typeof scheduledAt !== 'string' || !scheduledAt.trim()) {
    throw new Error('Scheduled send time is required.')
  }
  const value = scheduledAt.trim()
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    throw new Error('Scheduled send time must include an explicit UTC offset.')
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error('Enter a valid scheduled send time.')
  }
  if (date.getTime() <= now.getTime()) {
    throw new Error('Scheduled send time must be in the future.')
  }

  const normalizedTimeZone = typeof timeZone === 'string' ? timeZone.trim() : ''
  if (normalizedTimeZone) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: normalizedTimeZone }).format(date)
    } catch {
      throw new Error('Enter a valid IANA time zone.')
    }
  }

  return {
    scheduledAt: date.toISOString(),
    timeZone: normalizedTimeZone || undefined,
  }
}

type AtomicEmailUpdateModel = {
  findOneAndUpdate?: (
    filter: UnknownRecord,
    update: UnknownRecord,
    options: UnknownRecord,
  ) => { lean?: () => Promise<unknown> } | Promise<unknown>
}

function lifecycleConflict(message = 'Campaign state changed while this action was in progress.') {
  const error = new Error(message)
  ;(error as Error & { status?: number }).status = 409
  return error
}

function compactData(data: UnknownRecord): UnknownRecord {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  )
}

function getRawLifecycleStatuses(
  statuses: EmailCampaignStatus[],
): Array<EmailCampaignStatus | 'approved'> {
  return statuses.includes('draft')
    ? [...statuses, 'approved']
    : statuses
}

export async function updateEmailIfStatus({
  allowedStatuses,
  data,
  emailId,
  expected = {},
  payload,
}: {
  allowedStatuses: EmailCampaignStatus[]
  data: UnknownRecord
  emailId: string
  expected?: UnknownRecord
  payload: Payload
}): Promise<UnknownRecord> {
  const model = (payload.db.collections as Record<string, unknown>).emails as
    | AtomicEmailUpdateModel
    | undefined
  if (!model?.findOneAndUpdate) {
    throw new Error('Atomic email lifecycle updates are unavailable.')
  }
  const rawStatuses = getRawLifecycleStatuses(allowedStatuses)
  const filter: UnknownRecord = {
    _id: emailId,
    ...compactData(expected),
    status: rawStatuses.length === 1 ? rawStatuses[0] : { $in: rawStatuses },
  }
  const update = {
    $set: {
      ...compactData(data),
      updatedAt: new Date().toISOString(),
    },
  }
  const query = model.findOneAndUpdate(filter, update, {
    new: true,
    runValidators: true,
  })
  const updated = typeof query === 'object' && 'lean' in query && query.lean
    ? await query.lean()
    : await query
  if (!updated) throw lifecycleConflict()
  return updated as UnknownRecord
}

export async function transitionEmailLifecycle({
  data = {},
  emailId,
  expected,
  from,
  overrideAccess = false,
  payload,
  req,
  to,
}: {
  data?: UnknownRecord
  emailId: string
  expected?: UnknownRecord
  from?: EmailCampaignStatus
  overrideAccess?: boolean
  payload: Payload
  req?: PayloadRequest
  to: EmailCampaignStatus
}): Promise<UnknownRecord> {
  let currentStatus = from
  if (!currentStatus) {
    const current = (await payload.findByID({
      collection: 'emails',
      depth: 0,
      draft: true,
      id: emailId,
      overrideAccess,
      req,
    })) as unknown as UnknownRecord
    currentStatus = getEmailCampaignStatus(current.status)
  }
  assertEmailLifecycleTransition(currentStatus, to)
  return updateEmailIfStatus({
    allowedStatuses: [currentStatus],
    data: {
      ...data,
      status: to,
    },
    emailId,
    expected,
    payload,
  })
}
