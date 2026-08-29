import { createHash } from 'node:crypto'

import {
  ensureIContactContactSubscription,
  ensureIContactList,
  getIContactConfigFromEnv,
  iContactFetch,
  resolveIContactAccountId,
  verifyIContactSingleRecipientList,
} from '@/lib/icontact'
import type { IContactConfig } from '@/lib/icontact'

type UnknownRecord = Record<string, unknown>

export type IContactEmailResult = {
  message: string
  messageId: string
  recipientCount: number
  sendId: string
}

export type IContactTestPreparation = {
  activeRecipientCount: 1
  clientFolderId: string
  contactId: string
  listId: string
  listName: string
  recipientEmail: string
}

function getString(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function getIContactError(data: unknown, status: number): string {
  if (typeof data === 'string' && data.trim()) return data.trim()
  if (!isRecord(data)) return `iContact request failed with status ${status}.`

  const warnings = data.warnings
  if (Array.isArray(warnings)) {
    const message = warnings
      .map((warning) => isRecord(warning) ? getString(warning.warning || warning.message) : getString(warning))
      .filter(Boolean)
      .join('; ')
    if (message) return message
  }

  return getString(data.message || data.error || data.errors) || `iContact request failed with status ${status}.`
}

function getFirstRecord(data: unknown, key: 'messages' | 'sends'): UnknownRecord | null {
  if (!isRecord(data)) return null
  const rows = data[key]
  return Array.isArray(rows) && isRecord(rows[0]) ? rows[0] : null
}

async function getDeliveryContext({
  campaignId,
  clientFolderId,
  fromEmail,
}: {
  campaignId?: string
  clientFolderId: string
  fromEmail?: string
}) {
  const cfg = getIContactConfigFromEnv()
  if (!cfg) throw new Error('iContact API credentials are missing.')

  const accountId = await resolveIContactAccountId(cfg)
  let resolvedCampaignId = campaignId?.trim() || process.env.ICONTACT_CAMPAIGN_ID?.trim() || ''
  if (!resolvedCampaignId && fromEmail?.trim()) {
    const response = await iContactFetch(cfg, `/icp/a/${accountId}/c/${clientFolderId}/campaigns`)
    if (!response.ok) throw new Error(`Unable to resolve the iContact sender property: ${getIContactError(response.data, response.status)}`)
    const campaigns = isRecord(response.data) && Array.isArray(response.data.campaigns)
      ? response.data.campaigns.filter(isRecord)
      : []
    const matchingCampaign = campaigns.find((value) => getString(value.fromEmail).toLowerCase() === fromEmail.trim().toLowerCase())
    resolvedCampaignId = getString(matchingCampaign?.campaignId)
  }
  if (!resolvedCampaignId) {
    throw new Error('Configure an iContact sender property ID on Rep & District Settings or set ICONTACT_CAMPAIGN_ID.')
  }

  return {
    accountId,
    campaignId: resolvedCampaignId,
    cfg,
  }
}

async function createIContactMessage({
  context,
  clientFolderId,
  html,
  messageName,
  preheader,
  subject,
  text,
}: {
  context: Awaited<ReturnType<typeof getDeliveryContext>>
  clientFolderId: string
  html: string
  messageName: string
  preheader?: string
  subject: string
  text: string
}) {
  const { accountId, campaignId, cfg } = context
  const response = await iContactFetch(
    cfg,
    `/icp/a/${accountId}/c/${clientFolderId}/messages`,
    {
      body: [{
        campaignId: Number(campaignId),
        htmlBody: html,
        messageName,
        messageType: 'normal',
        ...(preheader ? { previewText: preheader } : {}),
        replyToCampaignId: Number(campaignId),
        subject,
        textBody: text,
      }],
      method: 'POST',
    },
  )
  if (!response.ok) throw new Error(`iContact message creation failed: ${getIContactError(response.data, response.status)}`)

  const message = getFirstRecord(response.data, 'messages')
  const messageId = getString(message?.messageId)
  if (!messageId) throw new Error('iContact created a message without returning a messageId.')
  return messageId
}

async function createIContactSend({
  accountId,
  cfg,
  clientFolderId,
  listId,
  messageId,
}: {
  accountId: string
  cfg: IContactConfig
  clientFolderId: string
  listId: string
  messageId: string
}) {
  const response = await iContactFetch(
    cfg,
    `/icp/a/${accountId}/c/${clientFolderId}/sends`,
    {
      body: [{
        includeListIds: listId,
        messageId: Number(messageId),
      }],
      method: 'POST',
    },
  )
  if (!response.ok) throw new Error(`iContact send creation failed: ${getIContactError(response.data, response.status)}`)

  const send = getFirstRecord(response.data, 'sends')
  const sendId = getString(send?.sendId)
  if (!sendId) throw new Error('iContact created a send without returning a sendId.')
  return {
    recipientCount: Number(send?.recipientCount) || 0,
    sendId,
    status: getString(send?.status),
  }
}

export function hasIContactDeliveryConfiguration(): boolean {
  return Boolean(getIContactConfigFromEnv())
}

export async function sendIContactCampaign({
  campaignId,
  clientFolderId,
  fromEmail,
  html,
  listId,
  messageName,
  preheader,
  subject,
  text,
}: {
  campaignId?: string
  clientFolderId: string
  fromEmail?: string
  html: string
  listId: string
  messageName: string
  preheader?: string
  subject: string
  text: string
}): Promise<IContactEmailResult> {
  if (!clientFolderId || !listId) throw new Error('This audience is not linked to an iContact folder and list.')
  const context = await getDeliveryContext({ campaignId, clientFolderId, fromEmail })
  const messageId = await createIContactMessage({
    context,
    clientFolderId,
    html,
    messageName,
    preheader,
    subject,
    text,
  })
  const send = await createIContactSend({ accountId: context.accountId, cfg: context.cfg, clientFolderId, listId, messageId })
  if (send.recipientCount < 1) {
    throw new Error(`iContact send ${send.sendId} has no recipients.`)
  }

  return {
    message: `iContact send ${send.sendId} created${send.status ? ` (${send.status})` : ''}.`,
    messageId,
    recipientCount: send.recipientCount,
    sendId: send.sendId,
  }
}

export async function prepareIContactTestEmail({
  clientFolderId,
  expectedListId,
  recipientEmail,
}: {
  clientFolderId: string
  expectedListId?: string
  recipientEmail: string
}): Promise<IContactTestPreparation> {
  if (!clientFolderId.trim()) {
    throw new Error('Choose an iContact-backed audience before sending a test email.')
  }
  const normalizedEmail = recipientEmail.trim().toLowerCase()
  const recipientKey = createHash('sha256').update(normalizedEmail).digest('hex').slice(0, 10)
  const listName = `HRO Web Test — ${normalizedEmail} — ${recipientKey}`.slice(0, 255)
  const { listId } = await ensureIContactList({
    clientFolderId,
    description: 'Single-recipient test list managed automatically by HRO Web.',
    name: listName,
  })
  if (expectedListId && listId !== expectedListId) {
    throw new Error('Safety check failed: the prepared iContact test list changed. Run the dry run again. No email was sent.')
  }
  const { contactId } = await ensureIContactContactSubscription({
    clientFolderId,
    email: normalizedEmail,
    listId,
  })
  const verification = await verifyIContactSingleRecipientList({ clientFolderId, contactId, listId })

  return {
    activeRecipientCount: verification.activeRecipientCount,
    clientFolderId,
    contactId,
    listId,
    listName,
    recipientEmail: normalizedEmail,
  }
}

export async function sendIContactTestEmail({
  campaignId,
  clientFolderId,
  fromEmail,
  html,
  preheader,
  preparedListId,
  recipientEmail,
  subject,
  text,
}: {
  campaignId?: string
  clientFolderId: string
  fromEmail?: string
  html: string
  preheader?: string
  preparedListId: string
  recipientEmail: string
  subject: string
  text: string
}): Promise<IContactEmailResult> {
  if (!preparedListId.trim()) {
    throw new Error('Run the recipient dry run before sending a test email.')
  }
  const preparation = await prepareIContactTestEmail({
    clientFolderId,
    expectedListId: preparedListId,
    recipientEmail,
  })
  const result = await sendIContactCampaign({
    campaignId,
    clientFolderId,
    fromEmail,
    html,
    listId: preparation.listId,
    messageName: `TEST — ${subject}`.slice(0, 255),
    preheader,
    subject: `[TEST] ${subject}`.slice(0, 255),
    text,
  })

  if (result.recipientCount !== 1) {
    throw new Error(`iContact reported ${result.recipientCount} recipients for test send ${result.sendId}; expected exactly one.`)
  }

  return result
}
