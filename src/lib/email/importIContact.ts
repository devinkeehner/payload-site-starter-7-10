import type { Payload, PayloadRequest, Where } from 'payload'

import {
  getIContactConfigFromEnv,
  listIContactContacts,
  listIContactLists,
  listIContactSubscriptions,
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
type StatusCounts = Record<ContactStatus, number>
type StatusDebugSample = {
  email: string
  keys: string
  mappedStatus: ContactStatus
  statusValues: Record<string, unknown>
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

function getOperationReq(req: PayloadRequest): PayloadRequest {
  const operationReq = { ...req } as PayloadRequest & { transactionID?: unknown }
  delete operationReq.transactionID
  return operationReq
}

function mapIContactStatus(value: unknown): 'bounced' | 'doNotContact' | 'inactive' | 'subscribed' | 'unsubscribed' {
  const status = getString(value).toLowerCase()
  if (status.includes('unsubscribe')) return 'unsubscribed'
  if (status.includes('bounce')) return 'bounced'
  if (status.includes('inactive')) return 'inactive'
  if (status.includes('pending')) return 'inactive'
  if (status.includes('noassociation') || status.includes('no association')) return 'inactive'
  if (status.includes('donot') || status.includes('do not')) return 'doNotContact'
  return 'subscribed'
}

type ContactStatus = ReturnType<typeof mapIContactStatus>

const createStatusCounts = (): StatusCounts => ({
  bounced: 0,
  doNotContact: 0,
  inactive: 0,
  subscribed: 0,
  unsubscribed: 0,
})

const STATUS_DEBUG_KEYS = [
  'status',
  'contactStatus',
  'contactStatusName',
  'subscriptionStatus',
  'subscriptionStatusName',
  'listStatus',
  'listStatusName',
  'subscription',
  'subscriptions',
  'listSubscriptions',
  'memberships',
  'lists',
]

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
  'listid',
  'lists',
  'liststatus',
  'liststatusid',
  'liststatusname',
  'listsubscriptions',
  'memberships',
  'phone',
  'postalcode',
  'prefix',
  'street',
  'status',
  'suffix',
  'subscription',
  'subscriptionid',
  'subscriptions',
  'subscriptionstatus',
  'subscriptionstatusid',
  'subscriptionstatusname',
])

function getValueByKey(value: UnknownRecord, keys: string[]): unknown {
  const wanted = new Set(keys.map((key) => key.toLowerCase()))
  for (const [key, item] of Object.entries(value)) {
    if (wanted.has(key.toLowerCase())) return item
  }
  return undefined
}

function getListIdFromSubscription(value: UnknownRecord): string {
  return getString(getValueByKey(value, ['listId', 'listID', 'list_id', 'list']))
}

function getContactIdFromSubscription(value: UnknownRecord): string {
  return getString(getValueByKey(value, ['contactId', 'contactID', 'contact_id', 'contact']))
}

function getStatusFromSubscription(value: UnknownRecord): unknown {
  return getValueByKey(value, [
    'status',
    'subscriptionStatus',
    'subscriptionStatusName',
    'listStatus',
    'listStatusName',
  ])
}

function findSubscriptionRecord(contact: UnknownRecord, listId: string): UnknownRecord | null {
  const candidates = [
    getValueByKey(contact, ['subscription']),
    getValueByKey(contact, ['subscriptions']),
    getValueByKey(contact, ['listSubscriptions']),
    getValueByKey(contact, ['memberships']),
    getValueByKey(contact, ['lists']),
  ]

  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      const record = candidate as UnknownRecord
      if (!listId || getListIdFromSubscription(record) === listId) return record
    }

    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue
        const record = item as UnknownRecord
        if (!listId || getListIdFromSubscription(record) === listId) return record
      }
    }
  }

  return null
}

function getIContactContactStatus(contact: UnknownRecord): ContactStatus {
  const globalStatus = getValueByKey(contact, ['status', 'contactStatus', 'contactStatusName'])
  return mapIContactStatus(globalStatus)
}

function getIContactListStatus(contact: UnknownRecord, listId: string): ContactStatus {
  const globalStatus = getIContactContactStatus(contact)
  if (globalStatus === 'bounced' || globalStatus === 'doNotContact' || globalStatus === 'inactive') {
    return globalStatus
  }

  const subscription = findSubscriptionRecord(contact, listId)
  const subscriptionStatus = subscription ? getStatusFromSubscription(subscription) : undefined
  const directListStatus = getValueByKey(contact, [
    'subscriptionStatus',
    'subscriptionStatusName',
    'listStatus',
    'listStatusName',
  ])

  return mapIContactStatus(subscriptionStatus || directListStatus || globalStatus)
}

function getIContactSubscriptionId(contact: UnknownRecord, listId: string): string {
  const subscription = findSubscriptionRecord(contact, listId)
  return getString(subscription ? getValueByKey(subscription, ['subscriptionId', 'id']) : undefined) || getString(contact.subscriptionId)
}

function buildSubscriptionByContactId(subscriptions: unknown[], listId: string): Map<string, UnknownRecord> {
  const byContactId = new Map<string, UnknownRecord>()

  for (const item of subscriptions) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const subscription = item as UnknownRecord
    const contactId = getContactIdFromSubscription(subscription)
    if (!contactId) continue
    const subscriptionListId = getListIdFromSubscription(subscription)
    if (subscriptionListId && listId && subscriptionListId !== listId) continue
    byContactId.set(contactId, subscription)
  }

  return byContactId
}

function mergeSubscriptionIntoContact(contact: UnknownRecord, subscription: UnknownRecord | undefined): UnknownRecord {
  if (!subscription) return contact
  return {
    ...contact,
    subscription,
    subscriptionId: getValueByKey(subscription, ['subscriptionId', 'id']) || contact.subscriptionId,
  }
}

function summarizeValue(value: unknown): unknown {
  if (value == null) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) {
    return value.slice(0, 3).map((item) => summarizeValue(item))
  }
  if (typeof value === 'object') {
    const record = value as UnknownRecord
    return Object.fromEntries(
      Object.entries(record)
        .slice(0, 12)
        .map(([key, item]) => [key, summarizeValue(item)]),
    )
  }
  return String(value)
}

function getStatusDebugValues(contact: UnknownRecord): Record<string, unknown> {
  const values: Record<string, unknown> = {}

  for (const key of STATUS_DEBUG_KEYS) {
    const value = getValueByKey(contact, [key])
    if (typeof value !== 'undefined') {
      values[key] = summarizeValue(value)
    }
  }

  return values
}

function createStatusDebugSample(contact: UnknownRecord, mappedStatus: ContactStatus): StatusDebugSample {
  return {
    email: normalizeEmailAddress(contact.email),
    keys: Object.keys(contact).sort().join(', '),
    mappedStatus,
    statusValues: getStatusDebugValues(contact),
  }
}

function addStatusDebugSample({
  contact,
  hasExplicitStatusFields,
  mappedStatus,
  samples,
}: {
  contact: UnknownRecord
  hasExplicitStatusFields: boolean
  mappedStatus: ContactStatus
  samples: StatusDebugSample[]
}) {
  const sample = createStatusDebugSample(contact, mappedStatus)
  const isPrioritySample = !hasExplicitStatusFields || mappedStatus !== 'subscribed'

  if (samples.length < 20) {
    if (isPrioritySample || samples.length < 10) samples.push(sample)
    return
  }

  if (!isPrioritySample) return
  const replaceIndex = samples.findIndex((existing) => existing.mappedStatus === 'subscribed')
  if (replaceIndex >= 0) samples[replaceIndex] = sample
}

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
    req: getOperationReq(req),
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
    disableTransaction: true,
    overrideAccess: false,
    req: getOperationReq(req),
  })

  return getId(created)
}

async function upsertContact({
  contact,
  dryRun,
  payload,
  req,
  status,
  tenantId,
}: {
  contact: UnknownRecord
  dryRun: boolean
  payload: Payload
  req: PayloadRequest
  status: ContactStatus
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
    status,
    tenant: tenantId,
  }

  if (existing) {
    const updated = await payload.update({
      collection: 'contacts',
      data,
      disableTransaction: true,
      id: getId(existing) || '',
      overrideAccess: false,
      overrideLock: false,
      req: getOperationReq(req),
    })
    return { contactId: getId(updated), created: false, updated: true }
  }

  const created = await payload.create({
    collection: 'contacts',
    data,
    disableTransaction: true,
    overrideAccess: false,
    req: getOperationReq(req),
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
  if (dryRun) return

  const membershipData = {
    contact: contactId,
    emailList: emailListId,
    iContactSubscriptionId,
    source: 'icontact' as const,
    status,
    subscribedAt: status === 'subscribed' ? new Date().toISOString() : undefined,
    tenant: tenantId,
    unsubscribedAt: status === 'unsubscribed' ? new Date().toISOString() : undefined,
  }

  if (existing) {
    await payload.update({
      collection: 'email-list-memberships',
      data: membershipData,
      disableTransaction: true,
      id: getId(existing) || '',
      overrideAccess: true,
      overrideLock: false,
      req: getOperationReq(req),
    })
    return
  }

  await payload.create({
    collection: 'email-list-memberships',
    data: membershipData,
    disableTransaction: true,
    overrideAccess: true,
    req: getOperationReq(req),
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
  let subscriptionFetchError = ''
  const subscriptionsPayload = await listIContactSubscriptions(cfg, accountId, clientFolderId, listId).catch((error) => {
    subscriptionFetchError = error instanceof Error ? error.message : String(error)
    return { subscriptions: [], total: 0 }
  })
  const subscriptionByContactId = buildSubscriptionByContactId(subscriptionsPayload.subscriptions, listId)
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
  const statusCounts = createStatusCounts()
  const statusDebugSamples: StatusDebugSample[] = []
  let unknownStatusCount = 0

  for (const contact of contactsPayload.contacts.filter((item: unknown): item is UnknownRecord => Boolean(item && typeof item === 'object' && !Array.isArray(item)))) {
    try {
      const contactId = getString(contact.contactId)
      const contactWithSubscription = mergeSubscriptionIntoContact(contact, subscriptionByContactId.get(contactId))
      const contactStatus = getIContactContactStatus(contact)
      const listStatus = getIContactListStatus(contactWithSubscription, listId)
      statusCounts[listStatus] += 1
      const hasExplicitStatusFields = Object.keys(getStatusDebugValues(contactWithSubscription)).length > 0
      if (!hasExplicitStatusFields) unknownStatusCount += 1
      addStatusDebugSample({
        contact: contactWithSubscription,
        hasExplicitStatusFields,
        mappedStatus: listStatus,
        samples: statusDebugSamples,
      })
      const result = await upsertContact({
        contact: contactWithSubscription,
        dryRun,
        payload,
        req,
        status: contactStatus,
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
          iContactSubscriptionId: getIContactSubscriptionId(contactWithSubscription, listId),
          payload,
          req,
          status: listStatus,
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
    statusDebug: {
      sampleSize: statusDebugSamples.length,
      samples: statusDebugSamples,
      subscriptionFetchError,
      subscriptionRecords: subscriptionsPayload.total,
      unknownStatusCount,
    },
    statusCounts,
    totalContacts: contactsPayload.total,
    updatedContacts,
  }
}
