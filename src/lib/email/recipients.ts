import type { Payload, PayloadRequest, Where } from 'payload'

import { isValidEmailAddress, normalizeEmailAddress } from './contactNormalization'
import type { EmailWorkflowAudience } from './workflowTypes'

type UnknownRecord = Record<string, unknown>

export type EmailCampaignRecipient = {
  contactId?: string
  email: string
  firstName?: string
  lastName?: string
  phone?: string
  postalCode?: string
}

export type ResolvedEmailAudience = {
  list: UnknownRecord
  recipients: EmailCampaignRecipient[]
  summary: EmailWorkflowAudience
}

const BLOCKED_STATUSES = new Set(['bounced', 'doNotContact', 'inactive', 'unsubscribed'])

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function getEmailRelationshipId(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (!isRecord(value)) return null
  const id = value.id ?? value._id ?? value.value
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null
}

export function assertEmailAudienceTenantMatch({
  audienceTenant,
  campaignTenant,
}: {
  audienceTenant: unknown
  campaignTenant: unknown
}): {
  audienceTenantId: string
  campaignTenantId: string
} {
  const audienceTenantId = getEmailRelationshipId(audienceTenant)
  const campaignTenantId = getEmailRelationshipId(campaignTenant)

  if (!campaignTenantId || !audienceTenantId || campaignTenantId !== audienceTenantId) {
    throw new Error('Audience list must belong to the same site as this email.')
  }

  return { audienceTenantId, campaignTenantId }
}

function getContactRecipient(value: unknown): {
  blockedStatus?: string
  recipient?: EmailCampaignRecipient
  valid: boolean
} {
  if (!isRecord(value)) return { valid: false }
  const status = getString(value.status) || 'subscribed'
  if (BLOCKED_STATUSES.has(status)) return { blockedStatus: status, valid: true }

  const email = normalizeEmailAddress(value.email || value.normalizedEmail)
  if (!isValidEmailAddress(email)) return { valid: false }

  return {
    recipient: {
      contactId: getEmailRelationshipId(value) || undefined,
      email,
      firstName: getString(value.firstName) || undefined,
      lastName: getString(value.lastName) || undefined,
      phone: getString(value.phone) || undefined,
      postalCode: getString(value.postalCode) || undefined,
    },
    valid: true,
  }
}

async function findAll({
  collection,
  depth = 0,
  overrideAccess,
  payload,
  req,
  where,
}: {
  collection: string
  depth?: number
  overrideAccess: boolean
  payload: Payload
  req?: PayloadRequest
  where: UnknownRecord
}): Promise<UnknownRecord[]> {
  const docs: UnknownRecord[] = []
  let page = 1

  while (true) {
    const result = await payload.find({
      collection: collection as never,
      depth,
      limit: 250,
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

function incrementExcludedStatus(summary: EmailWorkflowAudience, status: string) {
  switch (status) {
    case 'bounced':
      summary.bounced += 1
      break
    case 'doNotContact':
      summary.doNotContact += 1
      break
    case 'inactive':
      summary.inactive += 1
      break
    case 'unsubscribed':
      summary.unsubscribed += 1
      break
    default:
      summary.inactive += 1
  }
}

export async function resolveEmailAudience({
  emailList,
  listId,
  overrideAccess = false,
  payload,
  req,
}: {
  emailList?: UnknownRecord
  listId?: string
  overrideAccess?: boolean
  payload: Payload
  req?: PayloadRequest
}): Promise<ResolvedEmailAudience> {
  const resolvedListId = listId || getEmailRelationshipId(emailList)
  if (!resolvedListId) throw new Error('Audience list is required.')

  const list = emailList || ((await payload.findByID({
    collection: 'email-lists',
    depth: 2,
    id: resolvedListId,
    overrideAccess,
    req,
  })) as unknown as UnknownRecord)
  const listStatus = getString(list.status)
  if (listStatus && listStatus !== 'active') {
    throw new Error('Audience list must be active before sending.')
  }

  const summary: EmailWorkflowAudience = {
    active: 0,
    bounced: 0,
    contactBlocked: 0,
    doNotContact: 0,
    duplicates: 0,
    eligible: 0,
    inactive: 0,
    invalid: 0,
    listId: resolvedListId,
    listName: getString(list.name) || 'Audience list',
    total: 0,
    unsubscribed: 0,
  }
  const recipients = new Map<string, EmailCampaignRecipient>()
  const membershipContactIds = new Set<string>()

  const addCandidate = (contact: unknown, membershipStatus: string) => {
    summary.total += 1
    if (membershipStatus !== 'subscribed') {
      incrementExcludedStatus(summary, membershipStatus)
      return
    }

    const result = getContactRecipient(contact)
    if (result.blockedStatus) {
      summary.contactBlocked += 1
      incrementExcludedStatus(summary, result.blockedStatus)
      return
    }
    if (!result.valid || !result.recipient) {
      summary.invalid += 1
      return
    }
    if (recipients.has(result.recipient.email)) {
      summary.duplicates += 1
      return
    }

    recipients.set(result.recipient.email, result.recipient)
    summary.eligible += 1
    summary.active += 1
  }

  const memberships = await findAll({
    collection: 'email-list-memberships',
    depth: 2,
    overrideAccess,
    payload,
    req,
    where: {
      and: [
        { emailList: { equals: resolvedListId } },
        ...(list.tenant ? [{ tenant: { equals: getEmailRelationshipId(list.tenant) } }] : []),
      ],
    },
  })

  memberships.forEach((membership) => {
    const contactId = getEmailRelationshipId(membership.contact)
    if (contactId) membershipContactIds.add(contactId)
    addCandidate(membership.contact, getString(membership.status) || 'subscribed')
  })

  const legacyContacts = Array.isArray(list.contacts) ? list.contacts : []
  legacyContacts.forEach((contact) => {
    const contactId = getEmailRelationshipId(contact)
    if (contactId && membershipContactIds.has(contactId)) return
    addCandidate(contact, 'subscribed')
  })

  return {
    list,
    recipients: Array.from(recipients.values()),
    summary,
  }
}
