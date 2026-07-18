import type { Payload, PayloadRequest, Where } from 'payload'

import { prepareEmailLayoutForRender } from './footerContext'
import { transitionEmailSendJob } from './jobState'
import { emailLifecycleContext } from './lifecycleContext'
import {
  assertEmailAudienceTenantMatch,
  type EmailCampaignRecipient,
  getEmailRelationshipId,
  resolveEmailAudience,
} from './recipients'
import { computeEmailRenderedContentRevision } from './revision'
import { renderEmail } from './renderEmail'
import { getTenantEmailSenderSettings } from './sender'
import { getEmailWebVersionUrl } from './webVersion'
import type { EmailWorkflowAudience } from './workflowTypes'

type UnknownRecord = Record<string, unknown>

export type EmailSendSnapshot = {
  audience: EmailWorkflowAudience
  audienceListId: string
  contentRevision: string
  createdAt: string
  emailId: string
  fromEmail: string
  fromName: string
  html: string
  origin: string
  preheader: string
  replyTo?: string
  subject: string
  tenantId?: string
  tenantSlug?: string
  text: string
  version: 1
}

const DEFAULT_RECIPIENT_CHUNK_SIZE = 250

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function getEmailSnapshotHTML(value: unknown): string | null {
  if (!isRecord(value)) return null
  const html = value.html
  return typeof html === 'string' && html.trim() ? html : null
}

export function chunkEmailRecipients(
  recipients: EmailCampaignRecipient[],
  chunkSize: number,
): EmailCampaignRecipient[][] {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) {
    throw new Error('Recipient chunk size must be a positive integer.')
  }
  return Array.from(
    { length: Math.ceil(recipients.length / chunkSize) },
    (_, index) => recipients.slice(index * chunkSize, (index + 1) * chunkSize),
  )
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function getRequiredString(value: unknown, label: string): string {
  const text = getString(value)
  if (!text) throw new Error(`${label} is required.`)
  return text
}

function hasSendableLayout(value: unknown): value is UnknownRecord[] {
  return Array.isArray(value) && value.some((block) => isRecord(block))
}

export function getEmailRequestOrigin(req: Request): string {
  const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const host = forwardedHost || req.headers.get('host')?.split(',')[0]?.trim()
  const forwardedProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const requestUrl = new URL(req.url)
  const protocol = forwardedProto || requestUrl.protocol.replace(':', '') || 'https'

  return host ? `${protocol}://${host}` : requestUrl.origin
}

export async function buildEmailSendSnapshot({
  emailId,
  overrideAccess = false,
  payload,
  req,
  request,
}: {
  emailId: string
  overrideAccess?: boolean
  payload: Payload
  req: PayloadRequest
  request: Request
}): Promise<{
  recipients: EmailCampaignRecipient[]
  snapshot: EmailSendSnapshot
}> {
  const email = (await payload.findByID({
    collection: 'emails',
    depth: 2,
    draft: true,
    id: emailId,
    overrideAccess,
    req,
  })) as unknown as UnknownRecord
  const subject = getRequiredString(email.subject, 'Subject')
  if (!hasSendableLayout(email.layout)) {
    throw new Error('Email content is required before sending.')
  }

  const audienceListId = getEmailRelationshipId(email.emailList)
  if (!audienceListId) throw new Error('Audience list is required before sending.')
  const resolvedAudience = await resolveEmailAudience({
    listId: audienceListId,
    overrideAccess,
    payload,
    req,
  })
  assertEmailAudienceTenantMatch({
    audienceTenant: resolvedAudience.list.tenant,
    campaignTenant: email.tenant,
  })
  if (!resolvedAudience.recipients.length) {
    throw new Error('Audience list has no eligible recipients.')
  }

  const senderSettings = await getTenantEmailSenderSettings({
    email,
    emailList: resolvedAudience.list,
    overrideAccess,
    payload,
    req,
  })
  const prepared = await prepareEmailLayoutForRender({
    email,
    emailList: resolvedAudience.list,
    overrideAccess,
    payload,
    req,
  })
  const origin = getEmailRequestOrigin(request)
  const preheader = getString(email.preheader)
  const { html, text } = await renderEmail({
    layout: prepared.layout,
    origin,
    preheader,
    subject,
    webVersionUrl: getEmailWebVersionUrl(emailId, origin),
  })
  const tenantId = getEmailRelationshipId(email.tenant) || undefined
  const tenantSlug = isRecord(email.tenant) ? getString(email.tenant.slug) || undefined : undefined
  const fromEmail = getRequiredString(senderSettings.fromEmail, 'Sender email')
  const fromName = getString(senderSettings.fromName)
  const replyTo = getString(email.replyTo) || senderSettings.replyTo || undefined

  return {
    recipients: resolvedAudience.recipients,
    snapshot: {
      audience: resolvedAudience.summary,
      audienceListId,
      contentRevision: computeEmailRenderedContentRevision({
        audienceListId,
        fromEmail,
        fromName,
        html,
        origin,
        preheader,
        replyTo,
        subject,
        tenantId,
        text,
      }),
      createdAt: new Date().toISOString(),
      emailId,
      fromEmail,
      fromName,
      html,
      origin,
      preheader,
      replyTo,
      subject,
      tenantId,
      tenantSlug,
      text,
      version: 1,
    },
  }
}

export async function createEmailSnapshotJob({
  emailId,
  kind,
  overrideAccess = false,
  payload,
  req,
  request,
  requestedBy,
  scheduledFor,
}: {
  emailId: string
  kind: 'manual' | 'scheduled'
  overrideAccess?: boolean
  payload: Payload
  req: PayloadRequest
  request: Request
  requestedBy?: string
  scheduledFor?: string
}): Promise<{
  job: UnknownRecord
  jobId: string
  snapshot: EmailSendSnapshot
}> {
  const { recipients, snapshot } = await buildEmailSendSnapshot({
    emailId,
    overrideAccess,
    payload,
    req,
    request,
  })
  const chunkSizeValue = Number(process.env.EMAIL_RECIPIENT_CHUNK_SIZE || DEFAULT_RECIPIENT_CHUNK_SIZE)
  const chunkSize = Number.isFinite(chunkSizeValue) && chunkSizeValue > 0
    ? Math.min(1000, Math.floor(chunkSizeValue))
    : DEFAULT_RECIPIENT_CHUNK_SIZE
  const chunks = chunkEmailRecipients(recipients, chunkSize)
  const now = new Date().toISOString()
  const job = (await payload.create({
    collection: 'email-send-jobs' as never,
    context: emailLifecycleContext,
    data: {
      activeKey: emailId,
      contentRevision: snapshot.contentRevision,
      email: emailId,
      kind,
      recipientChunkCount: chunks.length,
      recipientCount: recipients.length,
      requestedAt: now,
      requestedBy: requestedBy || undefined,
      scheduledFor: scheduledFor || undefined,
      snapshot,
      status: 'preparing',
      tenant: snapshot.tenantId,
    } as never,
    overrideAccess,
    req,
  })) as unknown as UnknownRecord
  const jobId = getEmailRelationshipId(job)
  if (!jobId) throw new Error('Email send job was created without an ID.')

  try {
    for (let index = 0; index < chunks.length; index += 1) {
      const recipientsInChunk = chunks[index] || []
      await payload.create({
        collection: 'email-send-recipient-chunks' as never,
        context: emailLifecycleContext,
        data: {
          chunkIndex: index,
          chunkKey: `${jobId}:${index}`,
          email: emailId,
          job: jobId,
          recipientCount: recipientsInChunk.length,
          recipients: recipientsInChunk,
          tenant: snapshot.tenantId,
        } as never,
        overrideAccess,
        req,
      })
    }
  } catch (error) {
    await transitionEmailSendJob({
      data: {
        activeKey: `terminal:${jobId}`,
        completedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : 'Unable to store recipient snapshot.',
      },
      from: 'preparing',
      jobId,
      payload,
      to: 'failed',
    }).catch(() => undefined)
    throw error
  }

  return { job, jobId, snapshot }
}

export async function getEmailSnapshotJob({
  jobId,
  overrideAccess = false,
  payload,
  req,
}: {
  jobId: string
  overrideAccess?: boolean
  payload: Payload
  req?: PayloadRequest
}): Promise<{
  job: UnknownRecord
  snapshot: EmailSendSnapshot
}> {
  const job = (await payload.findByID({
    collection: 'email-send-jobs' as never,
    depth: 1,
    id: jobId,
    overrideAccess,
    req,
  })) as unknown as UnknownRecord
  if (!isRecord(job.snapshot)) {
    throw new Error('Email send job is missing its immutable snapshot.')
  }

  return {
    job,
    snapshot: job.snapshot as EmailSendSnapshot,
  }
}

export async function getEmailSnapshotRecipients({
  jobId,
  overrideAccess = false,
  payload,
  req,
}: {
  jobId: string
  overrideAccess?: boolean
  payload: Payload
  req?: PayloadRequest
}): Promise<EmailCampaignRecipient[]> {
  const recipients: EmailCampaignRecipient[] = []
  let page = 1

  while (true) {
    const result = await payload.find({
      collection: 'email-send-recipient-chunks' as never,
      depth: 0,
      limit: 100,
      overrideAccess,
      page,
      req,
      sort: 'chunkIndex',
      where: {
        job: {
          equals: jobId,
        },
      } as Where,
    })
    for (const chunk of result.docs as UnknownRecord[]) {
      if (!Array.isArray(chunk.recipients)) continue
      recipients.push(
        ...chunk.recipients.filter(
          (recipient): recipient is EmailCampaignRecipient =>
            isRecord(recipient) && typeof recipient.email === 'string',
        ),
      )
    }
    if (!result.hasNextPage) break
    page += 1
  }

  return recipients
}
