import { createHash } from 'node:crypto'

import {
  ensureIContactList,
  getIContactConfigFromEnv,
  ICONTACT_DISPATCH_LIST_PREFIX,
  iContactFetch,
  listIContactContacts,
  listIContactSubscriptions,
  resolveIContactAccountId,
} from '@/lib/icontact'

import { normalizeEmailAddress } from './contactNormalization'

export type IContactDispatch = {
  iContactClientFolderId: string
  iContactSourceListId: string
  iContactDispatchListId: string
}

const providerId = (value: unknown) => typeof value === 'number' || typeof value === 'string' ? String(value).trim() : ''
const status = (value: unknown) => typeof value === 'string' ? value.trim().toLowerCase() : ''

export async function prepareIContactDispatch({
  approvedEmails,
  clientFolderId,
  jobId,
  priorDispatchLists,
  sourceListId,
}: {
  approvedEmails: readonly string[]
  clientFolderId: string
  jobId: string
  priorDispatchLists: readonly string[]
  sourceListId: string
}) {
  const cfg = getIContactConfigFromEnv()
  if (!cfg || !clientFolderId || !sourceListId) {
    throw new Error('The campaign needs a configured iContact audience before it can send.')
  }
  const accountId = await resolveIContactAccountId(cfg)
  const contactsForSource = () => listIContactContacts(cfg, accountId, clientFolderId, sourceListId)
  const subscriptionsFor = (listId: string) => listIContactSubscriptions(cfg, accountId, clientFolderId, listId)
  const approved = new Set(approvedEmails.map(normalizeEmailAddress))

  async function eligibleContactIds() {
    const [{ contacts }, { subscriptions }] = await Promise.all([
      contactsForSource(),
      subscriptionsFor(sourceListId),
    ])
    const active = new Set(subscriptions.filter(row => status(row.status) === 'normal').map(row => providerId(row.contactId)))
    const optedOut = new Set<string>()
    for (const listId of new Set(priorDispatchLists)) {
      const { subscriptions: prior } = await subscriptionsFor(listId)
      for (const row of prior) {
        if (status(row.status) === 'unsubscribed') optedOut.add(providerId(row.contactId))
      }
    }
    const contactIds = new Set<string>()
    const matchedEmails = new Set<string>()
    for (const contact of contacts) {
      const id = providerId(contact.contactId)
      const email = normalizeEmailAddress(contact.email)
      if (!id || !approved.has(email) || !active.has(id) || optedOut.has(id) || status(contact.status) !== 'normal') continue
      if (matchedEmails.has(email) && !contactIds.has(id)) {
        throw new Error('The iContact audience contains multiple active contacts for an approved address.')
      }
      matchedEmails.add(email)
      contactIds.add(id)
    }
    return [...contactIds].sort()
  }

  const contactIds = await eligibleContactIds()
  if (!contactIds.length) throw new Error('No approved recipients are still eligible in iContact.')
  const fingerprint = createHash('sha256').update(JSON.stringify(contactIds)).digest('hex').slice(0, 16)
  const { listId } = await ensureIContactList({
    clientFolderId,
    description: 'Private delivery audience managed by HRO Web.',
    name: ICONTACT_DISPATCH_LIST_PREFIX + jobId + ' — ' + fingerprint,
  })
  if (listId === sourceListId) throw new Error('iContact returned the source list as the delivery audience.')
  const desired = new Set(contactIds)
  const existing = new Map((await subscriptionsFor(listId)).subscriptions.map(row => [providerId(row.contactId), status(row.status)]))
  const missingIds = contactIds.filter(id => !existing.has(id))
  for (let i = 0; i < missingIds.length; i += 100) {
    const response = await iContactFetch(cfg, '/icp/a/' + accountId + '/c/' + clientFolderId + '/subscriptions', {
      method: 'POST',
      body: missingIds.slice(i, i + 100).map(contactId => ({ contactId, listId, status: 'normal' })),
    })
    if (!response.ok) throw new Error('Unable to prepare the approved iContact audience.')
  }

  return {
    dispatch: {
      iContactClientFolderId: clientFolderId,
      iContactSourceListId: sourceListId,
      iContactDispatchListId: listId,
    } satisfies IContactDispatch,
    recipientCount: contactIds.length,
    async verify() {
      const [current, { subscriptions }] = await Promise.all([eligibleContactIds(), subscriptionsFor(listId)])
      const actual = new Set(subscriptions.filter(row => status(row.status) === 'normal').map(row => providerId(row.contactId)))
      if (current.length !== desired.size || current.some(id => !desired.has(id)) ||
          actual.size !== desired.size || [...actual].some(id => !desired.has(id))) {
        throw new Error('The iContact audience changed during preparation. Review the campaign before trying again.')
      }
    },
  }
}
