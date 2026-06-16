import type { Payload, PayloadRequest, Where } from 'payload'

import { getElasticSafeListName, isValidEmailAddress, normalizeEmailAddress } from './contactNormalization'
import { addElasticContactsToList, createElasticCampaign, upsertElasticList } from './elasticEmail'
import { prepareEmailLayoutForRender } from './footerContext'
import { renderEmail } from './renderEmail'
import { getTenantEmailSenderSettings } from './sender'
import { getEmailWebVersionUrl } from './webVersion'

type UnknownRecord = Record<string, unknown>

type CampaignRecipient = {
  contactId?: string
  email: string
  firstName?: string
  lastName?: string
  phone?: string
  postalCode?: string
}

const ELIGIBLE_STATUSES = new Set(['subscribed'])
const BLOCKED_STATUSES = new Set(['unsubscribed', 'inactive', 'bounced', 'doNotContact'])

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

function getRequestOrigin(req: Request): string {
  const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const host = forwardedHost || req.headers.get('host')?.split(',')[0]?.trim()
  const forwardedProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const requestUrl = new URL(req.url)
  const protocol = forwardedProto || requestUrl.protocol.replace(':', '') || 'https'

  return host ? `${protocol}://${host}` : requestUrl.origin
}

function getTenantSlug(value: unknown): string {
  return isRecord(value) ? getString(value.slug) : ''
}

function getContactRecipient(value: unknown): CampaignRecipient | null {
  if (!isRecord(value)) return null
  const status = getString(value.status) || 'subscribed'
  if (BLOCKED_STATUSES.has(status)) return null

  const email = normalizeEmailAddress(value.email || value.normalizedEmail)
  if (!isValidEmailAddress(email)) return null

  return {
    contactId: getId(value) || undefined,
    email,
    firstName: getString(value.firstName) || undefined,
    lastName: getString(value.lastName) || undefined,
    phone: getString(value.phone) || undefined,
    postalCode: getString(value.postalCode) || undefined,
  }
}

async function findAll({
  collection,
  depth = 0,
  limit = 100,
  overrideAccess = false,
  payload,
  req,
  where,
}: {
  collection: string
  depth?: number
  limit?: number
  overrideAccess?: boolean
  payload: Payload
  req: PayloadRequest
  where: UnknownRecord
}): Promise<UnknownRecord[]> {
  const docs: UnknownRecord[] = []
  let page = 1

  while (true) {
    const result = await payload.find({
      collection: collection as never,
      depth,
      limit,
      overrideAccess,
      page,
      req,
      where: where as Where,
    })

    docs.push(...((result.docs || []) as UnknownRecord[]))
    if (!result.hasNextPage) break
    page += 1
  }

  return docs
}

async function getListRecipients({
  emailList,
  overrideAccess = false,
  payload,
  req,
}: {
  emailList: UnknownRecord
  overrideAccess?: boolean
  payload: Payload
  req: PayloadRequest
}): Promise<CampaignRecipient[]> {
  const recipients = new Map<string, CampaignRecipient>()
  const listId = getId(emailList)

  const addRecipient = (recipient: CampaignRecipient | null) => {
    if (!recipient) return
    recipients.set(recipient.email, recipient)
  }

  if (listId) {
    const memberships = await findAll({
      collection: 'email-list-memberships',
      depth: 2,
      overrideAccess,
      payload,
      req,
      where: {
        and: [
          { emailList: { equals: listId } },
          { status: { equals: 'subscribed' } },
          ...(emailList.tenant ? [{ tenant: { equals: getId(emailList.tenant) } }] : []),
        ],
      },
    })

    memberships.forEach((membership) => {
      const status = getString(membership.status)
      if (!ELIGIBLE_STATUSES.has(status || 'subscribed')) return
      addRecipient(getContactRecipient(membership.contact))
    })
  }

  const legacyContacts = Array.isArray(emailList.contacts) ? emailList.contacts : []
  legacyContacts.forEach((contact) => addRecipient(getContactRecipient(contact)))

  return Array.from(recipients.values())
}

function getRequiredString(value: unknown, label: string): string {
  const text = getString(value)
  if (!text) throw new Error(`${label} is required.`)
  return text
}

function hasSendableLayout(value: unknown): value is Array<UnknownRecord> {
  return Array.isArray(value) && value.some((block) => isRecord(block))
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

export async function sendProductionEmailCampaign({
  allowSendingStatus = false,
  emailId,
  overrideAccess = false,
  payload,
  request,
  req,
  userId,
}: {
  allowSendingStatus?: boolean
  emailId: string
  overrideAccess?: boolean
  payload: Payload
  request: Request
  req: PayloadRequest
  userId?: string | null
}) {
  const email = (await payload.findByID({
    collection: 'emails',
    depth: 2,
    draft: true,
    id: emailId,
    overrideAccess,
    req,
  })) as unknown as UnknownRecord

  const subject = getRequiredString(email.subject, 'Subject')
  const currentStatus = getString(email.status) || 'draft'
  if (currentStatus === 'sent' || (currentStatus === 'sending' && !allowSendingStatus)) {
    throw new Error(`This email is already ${currentStatus}. Duplicate it before sending again.`)
  }
  const emailListId = getId(email.emailList)
  if (!emailListId) throw new Error('Audience list is required before sending.')

  if (!hasSendableLayout(email.layout)) {
    throw new Error('Email content is required before sending.')
  }

  const emailList = (await payload.findByID({
    collection: 'email-lists',
    depth: 2,
    id: emailListId,
    overrideAccess,
    req,
  })) as unknown as UnknownRecord
  const listStatus = getString(emailList.status)
  if (listStatus && listStatus !== 'active') {
    throw new Error('Audience list must be active before sending.')
  }

  const recipients = await getListRecipients({ emailList, overrideAccess, payload, req })
  if (!recipients.length) throw new Error('Audience list has no subscribed recipients.')

  const tenantSlug = getTenantSlug(email.tenant) || getTenantSlug(emailList.tenant)
  const elasticListName = getString(emailList.elasticListName) || getElasticSafeListName(tenantSlug, getString(emailList.name))
  const allowUnsubscribe = emailList.allowUnsubscribe !== false
  const preheader = getString(email.preheader)
  const senderSettings = await getTenantEmailSenderSettings({
    email,
    emailList,
    overrideAccess,
    payload,
    req,
  })
  const replyTo = getString(email.replyTo) || senderSettings.replyTo || undefined

  const prepared = await prepareEmailLayoutForRender({
    email,
    emailList,
    overrideAccess,
    payload,
    req,
  })
  const { html, text } = await renderEmail({
    layout: prepared.layout,
    origin: getRequestOrigin(request),
    preheader,
    subject,
    webVersionUrl: getEmailWebVersionUrl(emailId, getRequestOrigin(request)),
  })

  await payload.update({
    collection: 'emails',
    data: {
      sendSummary: {
        approvedAt: new Date().toISOString(),
        approvedBy: userId || undefined,
        recipientCount: recipients.length,
      },
      status: 'sending',
    },
    draft: true,
    id: emailId,
    overrideAccess,
    overrideLock: false,
    req,
  })

  await upsertElasticList({
    allowUnsubscribe,
    listName: elasticListName,
  })

  for (const contactBatch of chunk(recipients, 1000)) {
    await addElasticContactsToList({
      contacts: contactBatch.map((recipient) => ({
        CustomFields: {
          ContactID: recipient.contactId || '',
          Phone: recipient.phone || '',
          PostalCode: recipient.postalCode || '',
          Tenant: tenantSlug,
        },
        Email: recipient.email,
        FirstName: recipient.firstName,
        LastName: recipient.lastName,
        Status: 'Active',
      })),
      listName: elasticListName,
    })
  }

  const campaignName = `payload-${emailId}-${Date.now()}`
  const campaign = await createElasticCampaign({
    fromEmail: senderSettings.fromEmail,
    fromName: senderSettings.fromName,
    html,
    listName: elasticListName,
    name: campaignName,
    replyTo,
    subject,
    text,
  })
  const sentAt = new Date().toISOString()

  await payload.update({
    collection: 'email-lists',
    data: {
      activeContactCount: recipients.length,
      elasticListName,
      lastSyncedToElasticAt: sentAt,
    },
    id: emailListId,
    overrideAccess,
    overrideLock: false,
    req,
  })

  await payload.update({
    collection: 'emails',
    data: {
      sendSummary: {
        approvedAt: sentAt,
        approvedBy: userId || undefined,
        elasticCampaignId: campaign.id,
        recipientCount: recipients.length,
        sendError: undefined,
        sentAt,
      },
      status: 'sent',
    },
    draft: true,
    id: emailId,
    overrideAccess,
    overrideLock: false,
    req,
  })

  return {
    elasticCampaignId: campaign.id,
    elasticListName,
    message: campaign.message,
    recipientCount: recipients.length,
  }
}
