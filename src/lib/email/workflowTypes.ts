export type EmailCampaignStatus =
  | 'draft'
  | 'failed'
  | 'queued'
  | 'scheduled'
  | 'sending'
  | 'sent'

export type EmailWorkflowPhase =
  | 'audience'
  | 'compose'
  | 'delivery'
  | 'results'
  | 'review'

export type EmailWorkflowAction =
  | 'cancelSchedule'
  | 'createPost'
  | 'duplicate'
  | 'edit'
  | 'reschedule'
  | 'retry'
  | 'schedule'
  | 'sendNow'
  | 'sendTest'
  | 'viewPost'

export type EmailWorkflowTestState = 'current' | 'failed' | 'never' | 'stale'

export type EmailWorkflowDeliveryMode =
  | 'failed'
  | 'none'
  | 'queued'
  | 'scheduled'
  | 'sending'
  | 'sent'

export type EmailWorkflowReadinessItem = {
  key: string
  label: string
  message: string
  status: 'fail' | 'pass' | 'warn'
}

export type EmailWorkflowLinkCheck = {
  confirmed?: boolean
  confirmedAt?: string
  href: string
  label: string
  reason?: string
  remoteStatus?: number
  status: 'invalid' | 'merge' | 'ok' | 'warning'
}

export type EmailWorkflowAudience = {
  active: number
  bounced: number
  contactBlocked: number
  doNotContact: number
  duplicates: number
  eligible: number
  inactive: number
  invalid: number
  listId: string
  listName: string
  total: number
  unsubscribed: number
}

export type EmailWorkflowReadiness = {
  audience?: EmailWorkflowAudience
  canSend: boolean
  contentRevision: string
  failures: number
  items: EmailWorkflowReadinessItem[]
  quality?: {
    label: string
    links: EmailWorkflowLinkCheck[]
    score: number
    warnings: string[]
  }
  warnings: number
}

export type EmailWorkflowRelatedPost = {
  adminUrl: string
  id: string
  title?: string
}

export type EmailWorkflowResponse = {
  audience: EmailWorkflowAudience | null
  availableActions: EmailWorkflowAction[]
  delivery: {
    confirmedAt: string | null
    error: string | null
    jobId: string | null
    mode: EmailWorkflowDeliveryMode
    requiresScheduleConfirmation: boolean
    scheduledAt: string | null
    timeZone: string | null
  }
  email: {
    contentRevision: string
    id: string
    preheader: string
    readOnly: boolean
    recipientEmail: string
    relatedPost: EmailWorkflowRelatedPost | null
    replyTo: string
    scheduledAt: string | null
    status: EmailCampaignStatus
    subject: string
    tenantId: string | null
    title: string
  }
  phase: EmailWorkflowPhase
  readiness: EmailWorkflowReadiness
  steps: Record<EmailWorkflowPhase, {
    available: boolean
    complete: boolean
    reason?: string
  }>
  test: {
    contentRevision: string | null
    message: string | null
    recipientEmail: string | null
    sentAt: string | null
    state: EmailWorkflowTestState
  }
}

export type EmailSendNowRequest = {
  expectedRevision: string
}

export type EmailScheduleRequest = EmailSendNowRequest & {
  scheduledAt: string
  timeZone?: string
}

export type EmailDeliveryPostRequest =
  | (EmailSendNowRequest & { mode: 'sendNow' })
  | (EmailScheduleRequest & { mode: 'schedule' })

export type EmailCancelScheduleRequest = {
  expectedRevision?: string
}

export type EmailDeliveryMutationResponse = {
  job?: {
    id: string
    status: string
  }
  ok: true
  workflow: EmailWorkflowResponse
}
