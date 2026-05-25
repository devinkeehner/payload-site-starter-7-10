import type { Payload, PayloadRequest } from 'payload'

import { getEmailAudienceSummary } from './audienceSummary'
import { prepareEmailLayoutForRender } from './footerContext'
import { inspectEmailQuality, type EmailQualityResult } from './quality'
import { renderEmail } from './renderEmail'

type UnknownRecord = Record<string, unknown>

export type EmailReadinessItem = {
  key: string
  label: string
  message: string
  status: 'fail' | 'pass' | 'warn'
}

export type EmailReadiness = {
  audience?: Awaited<ReturnType<typeof getEmailAudienceSummary>>
  canSend: boolean
  failures: number
  items: EmailReadinessItem[]
  quality?: EmailQualityResult
  warnings: number
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function getId(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (!isRecord(value)) return null
  const id = value.id ?? value._id ?? value.value
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null
}

function flattenBlocks(value: unknown): UnknownRecord[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((block) => {
    if (!isRecord(block)) return []
    const nested = [
      ...flattenBlocks(block.leftBlocks),
      ...flattenBlocks(block.centerBlocks),
      ...flattenBlocks(block.rightBlocks),
    ]
    return [block, ...nested]
  })
}

function addItem(items: EmailReadinessItem[], item: EmailReadinessItem) {
  items.push(item)
}

export async function getEmailReadiness({
  emailId,
  payload,
  req,
}: {
  emailId: string
  payload: Payload
  req: PayloadRequest
}): Promise<EmailReadiness> {
  const email = (await payload.findByID({
    collection: 'emails',
    depth: 2,
    draft: true,
    id: emailId,
    overrideAccess: false,
    req,
  })) as unknown as UnknownRecord
  const items: EmailReadinessItem[] = []
  const subject = getString(email.subject)
  const preheader = getString(email.preheader)
  const recipientEmail = getString(email.recipientEmail)
  const emailListId = getId(email.emailList)
  const blocks = flattenBlocks(email.layout)
  const footer = blocks.some((block) => block.blockType === 'emailFooterOneColumn')
  const hasLayout = blocks.length > 0
  const lastTest = isRecord(email.lastSend) ? email.lastSend : null
  const status = getString(email.status) || 'draft'
  const elasticConfigured = Boolean(process.env.ELASTIC_EMAIL_API_KEY?.trim() && process.env.ELASTIC_EMAIL_FROM_EMAIL?.trim())
  const audience = emailListId
    ? await getEmailAudienceSummary({ listId: emailListId, payload, req }).catch(() => undefined)
    : undefined
  const emailList = emailListId
    ? await payload.findByID({
        collection: 'email-lists',
        depth: 1,
        id: emailListId,
        overrideAccess: false,
        req,
      }).catch(() => null)
    : null
  const prepared = await prepareEmailLayoutForRender({
    email,
    emailList: isRecord(emailList) ? emailList : null,
    payload,
    req,
  })
  const rendered = hasLayout
    ? await renderEmail({
        layout: prepared.layout,
        preheader,
        subject,
      }).catch(() => null)
    : null
  const hasUnsubscribeLink = prepared.layout.some((block) => {
    if (!isRecord(block) || block.blockType !== 'emailFooterOneColumn' || !Array.isArray(block.links)) return false
    return block.links.some((link) => isRecord(link) && /preferences|unsubscribe/i.test(getString(link.label)) && getString(link.url))
  })
  const quality = rendered
    ? inspectEmailQuality({
        hasAddress: prepared.footerContext.hasAddress,
        hasUnsubscribeLink,
        html: rendered.html,
        subject,
        text: rendered.text,
      })
    : undefined

  addItem(items, {
    key: 'subject',
    label: 'Subject',
    message: subject ? 'Subject is set.' : 'Add a subject before sending.',
    status: subject ? 'pass' : 'fail',
  })
  addItem(items, {
    key: 'preheader',
    label: 'Preheader',
    message: preheader ? 'Preheader is set.' : 'Add preview text for inboxes.',
    status: preheader ? 'pass' : 'warn',
  })
  addItem(items, {
    key: 'content',
    label: 'Content',
    message: hasLayout ? 'Email has builder content.' : 'Build the email content first.',
    status: hasLayout ? 'pass' : 'fail',
  })
  addItem(items, {
    key: 'footer',
    label: 'Footer',
    message: footer ? 'Footer is present.' : 'Add the standard footer before sending.',
    status: footer ? 'pass' : 'fail',
  })
  addItem(items, {
    key: 'compliance-address',
    label: 'Mailing address',
    message: prepared.footerContext.hasAddress
      ? 'Footer mailing address is available from Rep & District Settings.'
      : 'Add a physical mailing address in Rep & District Settings.',
    status: prepared.footerContext.hasAddress ? 'pass' : 'fail',
  })
  addItem(items, {
    key: 'unsubscribe',
    label: 'Email preferences',
    message: hasUnsubscribeLink ? 'Email preferences link will be included in the footer.' : 'Add an email preferences link.',
    status: hasUnsubscribeLink ? 'pass' : 'fail',
  })
  addItem(items, {
    key: 'send-status',
    label: 'Send status',
    message: status === 'sent' || status === 'sending'
      ? `This email is already ${status}. Duplicate it before sending again.`
      : 'This email has not been sent.',
    status: status === 'sent' || status === 'sending' ? 'fail' : 'pass',
  })
  addItem(items, {
    key: 'test-recipient',
    label: 'Test recipient',
    message: recipientEmail ? 'Test recipient is set.' : 'Add a test recipient email.',
    status: recipientEmail ? 'pass' : 'warn',
  })
  addItem(items, {
    key: 'test-send',
    label: 'Test send',
    message: lastTest?.status === 'sent' ? 'A test send has succeeded.' : 'Send a test before production.',
    status: lastTest?.status === 'sent' ? 'pass' : 'warn',
  })
  addItem(items, {
    key: 'audience',
    label: 'Audience',
    message: audience
      ? `${audience.active} subscribed recipients are eligible.`
      : 'Select an audience list before sending.',
    status: audience?.active ? 'pass' : 'fail',
  })
  addItem(items, {
    key: 'elastic',
    label: 'Elastic Email',
    message: elasticConfigured ? 'Elastic Email sender is configured.' : 'Elastic Email API key/from address are missing.',
    status: elasticConfigured ? 'pass' : 'fail',
  })

  const failures = items.filter((item) => item.status === 'fail').length
  const warnings = items.filter((item) => item.status === 'warn').length

  return {
    audience,
    canSend: failures === 0,
    failures,
    items,
    quality,
    warnings,
  }
}
