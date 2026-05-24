import type { Payload, PayloadRequest, Where } from 'payload'

type UnknownRecord = Record<string, unknown>

export type EmailAudienceSummary = {
  active: number
  bounced: number
  doNotContact: number
  inactive: number
  listId: string
  listName: string
  total: number
  unsubscribed: number
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

async function findAll({
  collection,
  depth = 0,
  payload,
  req,
  where,
}: {
  collection: string
  depth?: number
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
      limit: 100,
      overrideAccess: false,
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

function incrementStatus(summary: EmailAudienceSummary, value: unknown) {
  const status = getString(value) || 'subscribed'
  summary.total += 1

  switch (status) {
    case 'unsubscribed':
      summary.unsubscribed += 1
      return
    case 'inactive':
      summary.inactive += 1
      return
    case 'bounced':
      summary.bounced += 1
      return
    case 'doNotContact':
      summary.doNotContact += 1
      return
    case 'subscribed':
    default:
      summary.active += 1
  }
}

export async function getEmailAudienceSummary({
  listId,
  payload,
  req,
}: {
  listId: string
  payload: Payload
  req: PayloadRequest
}): Promise<EmailAudienceSummary> {
  const list = (await payload.findByID({
    collection: 'email-lists',
    depth: 2,
    id: listId,
    overrideAccess: false,
    req,
  })) as unknown as UnknownRecord
  const summary: EmailAudienceSummary = {
    active: 0,
    bounced: 0,
    doNotContact: 0,
    inactive: 0,
    listId,
    listName: getString(list.name) || 'Audience list',
    total: 0,
    unsubscribed: 0,
  }
  const seen = new Set<string>()

  const memberships = await findAll({
    collection: 'email-list-memberships',
    depth: 2,
    payload,
    req,
    where: {
      emailList: {
        equals: listId,
      },
    },
  })

  memberships.forEach((membership) => {
    const contactId = getId(membership.contact)
    if (contactId) seen.add(contactId)
    incrementStatus(summary, membership.status)
  })

  const legacyContacts = Array.isArray(list.contacts) ? list.contacts : []
  legacyContacts.forEach((contact) => {
    if (!isRecord(contact)) return
    const contactId = getId(contact)
    if (contactId && seen.has(contactId)) return
    if (contactId) seen.add(contactId)
    incrementStatus(summary, contact.status)
  })

  return summary
}
