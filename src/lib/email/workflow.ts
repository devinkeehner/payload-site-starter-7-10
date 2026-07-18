import type { Payload, PayloadRequest, Where } from 'payload'

import { getEmailCampaignStatus, updateEmailIfStatus } from './lifecycle'
import { getEmailRelationshipId } from './recipients'
import { getEmailReadiness } from './readiness'
import { reconcileCompletedEmailSendJob } from './sendQueue'
import type {
  EmailWorkflowAction,
  EmailWorkflowDeliveryMode,
  EmailWorkflowPhase,
  EmailWorkflowRelatedPost,
  EmailWorkflowResponse,
  EmailWorkflowTestState,
} from './workflowTypes'

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function getRelatedPost(value: unknown): EmailWorkflowRelatedPost | null {
  const id = getEmailRelationshipId(value)
  if (!id) return null

  return {
    adminUrl: `/admin/collections/posts/${id}/visual`,
    id,
    title: isRecord(value) ? getString(value.title) || undefined : undefined,
  }
}

function getTestState(
  lastSend: UnknownRecord | null,
  contentRevision: string,
): EmailWorkflowTestState {
  if (!lastSend) return 'never'
  if (lastSend.status === 'failed') return 'failed'
  if (lastSend.status !== 'sent') return 'never'
  return getString(lastSend.contentRevision) === contentRevision ? 'current' : 'stale'
}

function getDeliveryMode(status: ReturnType<typeof getEmailCampaignStatus>): EmailWorkflowDeliveryMode {
  switch (status) {
    case 'failed':
    case 'queued':
    case 'scheduled':
    case 'sending':
    case 'sent':
      return status
    default:
      return 'none'
  }
}

function getWorkflowPhase({
  hasAudience,
  hasContent,
  reviewComplete,
  status,
}: {
  hasAudience: boolean
  hasContent: boolean
  reviewComplete: boolean
  status: ReturnType<typeof getEmailCampaignStatus>
}): EmailWorkflowPhase {
  if (status === 'queued' || status === 'sending' || status === 'sent' || status === 'failed') {
    return 'results'
  }
  if (status === 'scheduled') return 'delivery'
  if (!hasContent) return 'compose'
  if (!hasAudience) return 'audience'
  if (reviewComplete) return 'delivery'
  return 'review'
}

export function getEmailWorkflowSteps({
  audienceEligible,
  hasAudience,
  hasContent,
  readinessCanSend,
  status,
}: {
  audienceEligible: number
  hasAudience: boolean
  hasContent: boolean
  readinessCanSend: boolean
  status: ReturnType<typeof getEmailCampaignStatus>
}): EmailWorkflowResponse['steps'] {
  const deliveryStarted = ['failed', 'queued', 'scheduled', 'sending', 'sent'].includes(status)
  const audienceComplete = hasAudience && audienceEligible > 0
  const reviewComplete = readinessCanSend || deliveryStarted
  const resultsAvailable = ['failed', 'queued', 'sending', 'sent'].includes(status)

  return {
    compose: {
      available: true,
      complete: hasContent,
    },
    audience: {
      available: hasContent,
      complete: audienceComplete,
      reason: hasContent ? undefined : 'Finish the campaign content before choosing its audience.',
    },
    review: {
      available: hasContent && audienceComplete,
      complete: reviewComplete,
      reason: !hasContent
        ? 'Finish the campaign content before review.'
        : !audienceComplete
          ? 'Choose an audience with at least one eligible recipient before review.'
          : undefined,
    },
    delivery: {
      available: reviewComplete,
      complete: status === 'sent',
      reason: reviewComplete ? undefined : 'Resolve the review checks before choosing delivery.',
    },
    results: {
      available: resultsAvailable,
      complete: status === 'sent',
      reason: resultsAvailable ? undefined : 'Results appear after the campaign enters the send queue.',
    },
  }
}

async function getLatestJob({
  email,
  emailId,
  overrideAccess,
  payload,
  req,
}: {
  email: UnknownRecord
  emailId: string
  overrideAccess: boolean
  payload: Payload
  req: PayloadRequest
}): Promise<UnknownRecord | null> {
  const deliveryJobId = getEmailRelationshipId(email.deliveryJob)
  if (deliveryJobId) {
    return (await payload.findByID({
      collection: 'email-send-jobs' as never,
      depth: 1,
      id: deliveryJobId,
      overrideAccess,
      req,
    }).catch(() => null)) as UnknownRecord | null
  }

  const result = await payload.find({
    collection: 'email-send-jobs' as never,
    depth: 1,
    limit: 1,
    overrideAccess,
    req,
    sort: '-createdAt',
    where: {
      email: {
        equals: emailId,
      },
    } as Where,
  })
  return (result.docs[0] as UnknownRecord | undefined) || null
}

export async function getEmailWorkflow({
  emailId,
  overrideAccess = false,
  payload,
  req,
}: {
  emailId: string
  overrideAccess?: boolean
  payload: Payload
  req: PayloadRequest
}): Promise<EmailWorkflowResponse> {
  let email = (await payload.findByID({
    collection: 'emails',
    depth: 2,
    draft: true,
    id: emailId,
    overrideAccess,
    req,
  })) as unknown as UnknownRecord
  if (email.status === 'approved') {
    await updateEmailIfStatus({
      allowedStatuses: ['draft'],
      data: {
        status: 'draft',
      },
      emailId,
      payload,
    })
    email.status = 'draft'
  }
  let job = await getLatestJob({
    email,
    emailId,
    overrideAccess,
    payload,
    req,
  })
  if (job?.status === 'completed' && job.reconciliationPending === true) {
    const reconciled = await reconcileCompletedEmailSendJob({
      job,
      overrideAccess,
      payload,
      req,
    })
    if (reconciled) {
      email = (await payload.findByID({
        collection: 'emails',
        depth: 2,
        draft: true,
        id: emailId,
        overrideAccess,
        req,
      })) as unknown as UnknownRecord
      job = await getLatestJob({
        email,
        emailId,
        overrideAccess,
        payload,
        req,
      })
    }
  }
  const resolvedStatus = getEmailCampaignStatus(email.status)
  const readiness = await getEmailReadiness({
    emailId,
    overrideAccess,
    payload,
    req,
  })
  const contentRevision = readiness.contentRevision
  const lastSend = isRecord(email.lastSend) ? email.lastSend : null
  const sendSummary = isRecord(email.sendSummary) ? email.sendSummary : null
  const testState = getTestState(lastSend, contentRevision)
  const relatedPost = getRelatedPost(email.relatedPost)
  const deliveryUnknown = job?.status === 'delivery_unknown'
  const editable = !deliveryUnknown && (resolvedStatus === 'draft' || resolvedStatus === 'failed')
  const availableActions: EmailWorkflowAction[] = ['duplicate']

  if (editable) availableActions.push('edit', 'sendTest')
  if (editable && readiness.canSend) availableActions.push('sendNow', 'schedule')
  if (resolvedStatus === 'scheduled') availableActions.push('reschedule', 'cancelSchedule')
  if (resolvedStatus === 'failed' && !deliveryUnknown) availableActions.push('retry')
  availableActions.push(relatedPost ? 'viewPost' : 'createPost')

  const deliveryRevision = getString(email.deliveryContentRevision)
  const confirmedAt = getString(email.deliveryConfirmedAt)
  const requiresScheduleConfirmation = Boolean(
    email.legacyScheduleNeedsReview ||
    (resolvedStatus === 'scheduled' &&
      (!confirmedAt || !deliveryRevision || deliveryRevision !== contentRevision)),
  )
  const hasContent = Array.isArray(email.layout) && email.layout.length > 0
  const hasAudience = Boolean(getEmailRelationshipId(email.emailList))
  const steps = getEmailWorkflowSteps({
    audienceEligible: readiness.audience?.eligible ?? readiness.audience?.active ?? 0,
    hasAudience,
    hasContent,
    readinessCanSend: readiness.canSend,
    status: resolvedStatus,
  })

  return {
    audience: readiness.audience || null,
    availableActions,
    delivery: {
      confirmedAt: confirmedAt || null,
      error: getString(sendSummary?.sendError) ||
        (job?.status === 'failed' || deliveryUnknown ? getString(job?.message) : '') ||
        null,
      jobId: getEmailRelationshipId(job),
      mode: getDeliveryMode(resolvedStatus),
      requiresScheduleConfirmation,
      scheduledAt: getString(email.scheduledAt) || null,
      timeZone: getString(email.deliveryTimeZone) || null,
    },
    email: {
      contentRevision,
      id: emailId,
      preheader: getString(email.preheader),
      readOnly: !editable,
      recipientEmail: getString(email.recipientEmail),
      relatedPost,
      replyTo: getString(email.replyTo),
      scheduledAt: getString(email.scheduledAt) || null,
      status: resolvedStatus,
      subject: getString(email.subject),
      tenantId: getEmailRelationshipId(email.tenant),
      title: getString(email.title) || 'Untitled email',
    },
    phase: getWorkflowPhase({
      hasAudience: steps.audience.complete,
      hasContent,
      reviewComplete: readiness.canSend,
      status: resolvedStatus,
    }),
    readiness: {
      ...readiness,
      contentRevision,
    },
    steps,
    test: {
      contentRevision: getString(lastSend?.contentRevision) || null,
      message: getString(lastSend?.message) || null,
      recipientEmail: getString(lastSend?.recipientEmail) || null,
      sentAt: getString(lastSend?.sentAt) || null,
      state: testState,
    },
  }
}
