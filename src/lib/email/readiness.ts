import type { Payload, PayloadRequest } from 'payload'

import { getEmailAudienceSummary } from './audienceSummary'
import { prepareEmailLayoutForRender } from './footerContext'
import { applyConfirmedEmailLinks, checkRemoteEmailLinks, inspectEmailQuality, type DeclaredEmailLink, type EmailLinkCheck, type EmailQualityResult } from './quality'
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
      ...flattenBlocks(block.fourthBlocks),
    ]
    return [block, ...nested]
  })
}

function looksLikeMediaRecord(value: UnknownRecord): boolean {
  return Boolean(value.mimeType || value.filename || value.filesize || value.sizes)
}

function getLinkLabel(record: UnknownRecord, key: string): string {
  if (key === 'primaryUrl') return getString(record.primaryLabel) || getString(record.primaryText) || 'Primary button'
  if (key === 'secondaryUrl') return getString(record.secondaryLabel) || getString(record.secondaryText) || 'Secondary button'

  return (
    getString(record.label) ||
    getString(record.linkLabel) ||
    getString(record.text) ||
    getString(record.title) ||
    getString(record.heading) ||
    getString(record.platform) ||
    getString(record.town) ||
    getString(record.alt) ||
    'Link'
  )
}

function hasDeclaredLinkIntent(record: UnknownRecord, key: string, href: string): boolean {
  if (href.trim()) return true
  if (key === 'primaryUrl') return Boolean(getString(record.primaryLabel) || getString(record.primaryText))
  if (key === 'secondaryUrl') return Boolean(getString(record.secondaryLabel) || getString(record.secondaryText))

  return Boolean(
    getString(record.label) ||
    getString(record.linkLabel) ||
    getString(record.text) ||
    getString(record.platform),
  )
}

function getNodeText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(getNodeText).join(' ').replace(/\s+/g, ' ').trim()
  if (!isRecord(value)) return ''

  return [
    getString(value.text),
    getNodeText(value.children),
  ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
}

function collectDeclaredEmailLinks(value: unknown): DeclaredEmailLink[] {
  const links: DeclaredEmailLink[] = []
  const linkKeys = new Set(['href', 'primaryUrl', 'secondaryUrl', 'url'])

  function visit(node: unknown) {
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }

    if (!isRecord(node)) return

    if (node.type === 'link' || node.type === 'autolink') {
      const fields = isRecord(node.fields) ? node.fields : {}
      const href = getString(fields.url) || getString(node.url)
      const label = getNodeText(node.children) || 'Inline link'
      if (href || label) {
        links.push({ href, label })
      }
    }

    Object.entries(node).forEach(([key, child]) => {
      if (linkKeys.has(key) && typeof child === 'string') {
        if (!(key === 'url' && looksLikeMediaRecord(node)) && hasDeclaredLinkIntent(node, key, child)) {
          links.push({
            href: child,
            label: getLinkLabel(node, key),
          })
        }
      }

      visit(child)
    })
  }

  visit(value)
  return links
}

function addItem(items: EmailReadinessItem[], item: EmailReadinessItem) {
  items.push(item)
}

export function getBlockingEmailLinks(links: EmailLinkCheck[] | undefined): EmailLinkCheck[] {
  if (!Array.isArray(links)) return []

  return links.filter((link) => {
    if (link.status === 'invalid') return true
    return false
  })
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
    ? await checkRemoteEmailLinks(applyConfirmedEmailLinks(
        inspectEmailQuality({
          declaredLinks: collectDeclaredEmailLinks(prepared.layout),
          hasAddress: prepared.footerContext.hasAddress,
          hasUnsubscribeLink,
          html: rendered.html,
          subject,
          text: rendered.text,
        }),
        Array.isArray(email.linkReviewOverrides) ? email.linkReviewOverrides as Array<{ confirmedAt?: string; href?: string | null }> : undefined,
      ))
    : undefined
  const blockingLinks = getBlockingEmailLinks(quality?.links)

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
    label: 'Footer preferences',
    message: hasUnsubscribeLink ? 'Email preferences link will be included in the footer.' : 'Add an email preferences link.',
    status: hasUnsubscribeLink ? 'pass' : 'fail',
  })
  addItem(items, {
    key: 'links',
    label: 'Broken links',
    message: !rendered
      ? 'Render the email before checking links.'
      : blockingLinks.length
        ? `${blockingLinks.length} malformed or missing link${blockingLinks.length === 1 ? '' : 's'} must be fixed before sending.`
        : quality?.links.length
          ? `${quality.links.length} link${quality.links.length === 1 ? '' : 's'} checked.`
          : 'No links found in the rendered email.',
    status: !rendered || blockingLinks.length ? 'fail' : 'pass',
  })
  addItem(items, {
    key: 'send-status',
    label: 'Send status',
    message: status === 'queued'
      ? 'This email is queued for sending.'
      : status === 'sent' || status === 'sending'
        ? `This email is already ${status}. Duplicate it before sending again.`
      : 'This email has not been sent.',
    status: status === 'sent' || status === 'sending' || status === 'queued' ? 'fail' : 'pass',
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
    label: 'Audience selected',
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
