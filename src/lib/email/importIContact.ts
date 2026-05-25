import type { Payload, PayloadRequest, Where } from 'payload'

import {
  getIContactConfigFromEnv,
  listIContactContacts,
  listIContactLists,
  resolveIContactAccountId,
} from '@/lib/icontact'

import {
  isValidEmailAddress,
  normalizeEmailAddress,
  normalizePhoneNumber,
  normalizePostalCode,
} from './contactNormalization'

type UnknownRecord = Record<string, unknown>
type CustomFieldRow = {
  key: string
  source: 'icontact'
  value: string
}

type ImportIContactListArgs = {
  clientFolderId: string
  dryRun?: boolean
  listId: string
  payload: Payload
  req: PayloadRequest
  tenantId: string
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function getId(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as UnknownRecord
  const id = record.id ?? record._id ?? record.value
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null
}

function mapIContactStatus(value: unknown): 'bounced' | 'doNotContact' | 'inactive' | 'subscribed' | 'unsubscribed' {
  const status = getString(value).toLowerCase()
  if (status.includes('unsubscribe')) return 'unsubscribed'
  if (status.includes('bounce')) return 'bounced'
  if (status.includes('inactive')) return 'inactive'
  if (status.includes('donot') || status.includes('do not')) return 'doNotContact'
  return 'subscribed'
}

type ContactStatus = ReturnType<typeof mapIContactStatus>

const STANDARD_ICONTACT_KEYS = new Set([
  'business',
  'contactid',
  'createby',
  'createdate',
  'email',
  'fax',
  'firstname',
  'lastmessageid',
  'lastname',
  'phone',
  'postalcode',
  'prefix',
  'street',
  'status',
  'suffix',
  'subscriptionid',
])

function stringifyCustomValue(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function addCustomField(fields: Map<string, CustomFieldRow>, key: string, value: unknown) {
  const cleanKey = key.trim()
  const cleanValue = stringifyCustomValue(value)
  if (!cleanKey || !cleanValue) return
  fields.set(cleanKey.toLowerCase(), {
    key: cleanKey,
    source: 'icontact',
    value: cleanValue,
  })
}

function extractCustomFields(contact: UnknownRecord): CustomFieldRow[] {
  const fields = new Map<string, CustomFieldRow>()

  for (const [key, value] of Object.entries(contact)) {
    if (STANDARD_ICONTACT_KEYS.has(key.toLowerCase())) continue
    if (key.toLowerCase() === 'customfields' && value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [customKey, customValue] of Object.entries(value as UnknownRecord)) {
        addCustomField(fields, customKey, customValue)
      }
      continue
    }
    addCustomField(fields, key, value)
  }

  return Array.from(fields.values()).sort((a, b) => a.key.localeCompare(b.key))
}

async function findFirst({
  collection,
  payload,
  req,
  where,
}: {
  collection: string
  payload: Payload
  req: PayloadRequest
  where: UnknownRecord
}): Promise<UnknownRecord | null> {
  const result = await payload.find({
    collection: collection as never,
    depth: 0,
    limit: 1,
    overrideAccess: false,
    req,
    where: where as Where,
  })

  const doc = result.docs[0]
  return doc && typeof doc === 'object' ? (doc as UnknownRecord) : null
}

async function ensureEmailList({
  clientFolderId,
  dryRun,
  list,
  listId,
  payload,
  req,
  tenantId,
}: {
  clientFolderId: string
  dryRun: boolean
  list: UnknownRecord | null
  listId: string
  payload: Payload
  req: PayloadRequest
  tenantId: string
}): Promise<string | null> {
  const existing = await findFirst({
    collection: 'email-lists',
    payload,
    req,
    where: {
      and: [
        { tenant: { equals: tenantId } },
        { iContactListId: { equals: listId } },
      ],
    },
  })
  if (existing) return getId(existing)
  if (dryRun) return null

  const created = await payload.create({
    collection: 'email-lists',
    data: {
      allowUnsubscribe: true,
      description: getString(list?.description),
      iContactClientFolderId: clientFolderId,
      iContactListId: listId,
      name: getString(list?.name) || `iContact List ${listId}`,
      status: 'active',
      tenant: tenantId,
    },
    overrideAccess: false,
    req,
  })

  return getId(created)
}

async function upsertContact({
  contact,
  dryRun,
  payload,
  req,
  tenantId,
}: {
  contact: UnknownRecord
  dryRun: boolean
  payload: Payload
  req: PayloadRequest
  tenantId: string
}): Promise<{ contactId: string | null; created: boolean; skipped?: string; updated: boolean }> {
  const email = normalizeEmailAddress(contact.email)
  if (!isValidEmailAddress(email)) {
    return { contactId: null, created: false, skipped: 'invalid-email', updated: false }
  }

  const existing = await findFirst({
    collection: 'contacts',
    payload,
    req,
    where: {
      and: [
        { tenant: { equals: tenantId } },
        { normalizedEmail: { equals: email } },
      ],
    },
  })
  if (dryRun) return { contactId: getId(existing), created: !existing, updated: Boolean(existing) }

  const data = {
    consentSource: 'icontact' as const,
    customFields: extractCustomFields(contact),
    email,
    firstName: getString(contact.firstName),
    iContactContactId: getString(contact.contactId),
    lastName: getString(contact.lastName),
    phone: normalizePhoneNumber(contact.phone),
    postalCode: normalizePostalCode(contact.postalCode),
    source: 'import' as const,
    sourceDetails: 'Imported from iContact API.',
    status: mapIContactStatus(contact.status),
    tenant: tenantId,
  }

  if (existing) {
    const updated = await payload.update({
      collection: 'contacts',
      data,
      id: getId(existing) || '',
      overrideAccess: false,
      overrideLock: false,
      req,
    })
    return { contactId: getId(updated), created: false, updated: true }
  }

  const created = await payload.create({
    collection: 'contacts',
    data,
    overrideAccess: false,
    req,
  } as never)
  return { contactId: getId(created), created: true, updated: false }
}

async function upsertMembership({
  contactId,
  dryRun,
  emailListId,
  iContactSubscriptionId,
  payload,
  req,
  status,
  tenantId,
}: {
  contactId: string
  dryRun: boolean
  emailListId: string
  iContactSubscriptionId?: string
  payload: Payload
  req: PayloadRequest
  status: ContactStatus
  tenantId: string
}) {
  const existing = await findFirst({
    collection: 'email-list-memberships',
    payload,
    req,
    where: {
      and: [
        { tenant: { equals: tenantId } },
        { emailList: { equals: emailListId } },
        { contact: { equals: contactId } },
      ],
    },
  })
  if (dryRun || existing) return

  await payload.create({
    collection: 'email-list-memberships',
    data: {
      contact: contactId,
      emailList: emailListId,
      iContactSubscriptionId,
      source: 'icontact',
      status,
      subscribedAt: new Date().toISOString(),
      tenant: tenantId,
    },
    overrideAccess: true,
    req,
  })
}

export async function importIContactList({
  clientFolderId,
  dryRun = true,
  listId,
  payload,
  req,
  tenantId,
}: ImportIContactListArgs) {
  const cfg = getIContactConfigFromEnv()
  if (!cfg) throw new Error('Missing iContact env credentials.')
  if (!tenantId) throw new Error('A tenant ID is required for iContact imports.')

  const accountId = await resolveIContactAccountId(cfg)
  const listsPayload = await listIContactLists(cfg, accountId, clientFolderId)
  const list = (listsPayload.lists || []).find((item: UnknownRecord) => getString(item.listId) === listId) || null
  const contactsPayload = await listIContactContacts(cfg, accountId, clientFolderId, listId)
  const emailListId = await ensureEmailList({
    clientFolderId,
    dryRun,
    list,
    listId,
    payload,
    req,
    tenantId,
  })
  let importedContacts = 0
  let updatedContacts = 0
  let failedContacts = 0
  const errors: Array<{ email?: string; message: string }> = []

  for (const contact of contactsPayload.contacts.filter((item: unknown): item is UnknownRecord => Boolean(item && typeof item === 'object' && !Array.isArray(item)))) {
    try {
      const result = await upsertContact({
        contact,
        dryRun,
        payload,
        req,
        tenantId,
      })
      if (result.skipped) {
        failedContacts += 1
        errors.push({ email: getString(contact.email), message: result.skipped })
        continue
      }
      if (result.created) importedContacts += 1
      if (result.updated) updatedContacts += 1

      if (emailListId && result.contactId) {
        await upsertMembership({
          contactId: result.contactId,
          dryRun,
          emailListId,
          iContactSubscriptionId: getString(contact.subscriptionId),
          payload,
          req,
          status: mapIContactStatus(contact.status),
          tenantId,
        })
      }
    } catch (error) {
      failedContacts += 1
      errors.push({
        email: getString(contact.email),
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return {
    dryRun,
    emailListId,
    errors,
    failedContacts,
    importedContacts,
    listName: getString(list?.name) || `iContact List ${listId}`,
    totalContacts: contactsPayload.total,
    updatedContacts,
  }
}
