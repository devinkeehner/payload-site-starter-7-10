import { z } from 'zod'

import {
  findIContactTestContactId,
  getIContactConfigFromEnv,
  iContactFetch,
  inspectIContactTestList,
  resolveIContactAccountId,
  triggerIContactTestListSubscription,
} from '@/lib/icontact'
import type { IContactConfig } from '@/lib/icontact'

import { getIContactTestListName } from './iContactEmail'

const providerId = z.union([z.string(), z.number().int().positive().safe()])
  .transform((value) => String(value).trim())
  .pipe(z.string().regex(/^[1-9]\d*$/))

const targetSchema = z.object({
  campaignId: providerId.optional(),
  listId: providerId,
  messageId: providerId,
  messageName: z.string().trim().min(1).optional(),
  recipientEmail: z.string().trim().email().toLowerCase(),
}).strict()

const targetsSchema = z.record(z.string().regex(/^[1-9]\d*$/), targetSchema)

export type IContactAutomationTestTarget = z.output<typeof targetSchema>

type TestTargetInput = {
  clientFolderId: string
  expectedCampaignId?: string
  recipientEmail: string
  target: IContactAutomationTestTarget
}

type RecordFields = Record<string, unknown>

function record(value: unknown): RecordFields | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as RecordFields
}

export function getIContactAutomationTestTarget(clientFolderId: string): IContactAutomationTestTarget | null {
  const value = process.env.ICONTACT_TEST_AUTOMATIONS?.trim()
  if (!value) return null

  try {
    const targets = targetsSchema.parse(JSON.parse(value))
    return Object.hasOwn(targets, clientFolderId) ? targets[clientFolderId] ?? null : null
  } catch {
    throw new Error('ICONTACT_TEST_AUTOMATIONS must map client folder IDs to valid test list, message, and recipient settings.')
  }
}

function getResource(
  data: unknown,
  kind: 'list' | 'message',
  id: string,
  clientFolderId: string,
) {
  const value = record(record(data)?.[kind])
  const idField = kind === 'list' ? value?.listId : value?.messageId
  if (!value || providerId.safeParse(idField).data !== id || (
    value.clientFolderId != null && providerId.safeParse(value.clientFolderId).data !== clientFolderId
  )) {
    throw new Error(`iContact did not confirm the configured test ${kind} in this client folder.`)
  }
  return value
}

async function readTestMessage({
  cfg,
  clientFolderId,
  expectedCampaignId,
  messagePath,
  target,
}: TestTargetInput & { cfg: IContactConfig; messagePath: string }) {
  const response = await iContactFetch(cfg, messagePath, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Could not read the iContact test message (${response.status}).`)

  const message = getResource(response.data, 'message', target.messageId, clientFolderId)
  const name = typeof message.messageName === 'string' ? message.messageName : ''
  const ownsMessage = target.messageName ? name === target.messageName : name.startsWith('TEST — ')
  if (!ownsMessage || message.messageType !== 'normal') {
    throw new Error('The configured iContact message is not an identifiable test draft.')
  }

  const campaignId = providerId.safeParse(message.campaignId).data
  const expectedSender = expectedCampaignId?.trim()
  if ((target.campaignId && campaignId !== target.campaignId) || (expectedSender && campaignId !== expectedSender)) {
    throw new Error('The iContact test message uses a different sender property.')
  }

  return { message, name, campaignId, replyToCampaignId: providerId.safeParse(message.replyToCampaignId).data }
}

async function inspectAutomationTarget(input: TestTargetInput) {
  const { clientFolderId, target } = input
  const recipientEmail = input.recipientEmail.trim().toLowerCase()
  if (recipientEmail !== target.recipientEmail) {
    throw new Error('This iContact test automation is configured for a different recipient.')
  }

  const folderId = providerId.parse(clientFolderId)
  const listId = providerId.parse(target.listId)
  const messageId = providerId.parse(target.messageId)
  const cfg = getIContactConfigFromEnv()
  if (!cfg) throw new Error('iContact API credentials are missing.')
  const accountId = providerId.parse(await resolveIContactAccountId(cfg))
  const folderPath = `/icp/a/${accountId}/c/${folderId}`
  const messagePath = `${folderPath}/messages/${messageId}`

  const listResponse = await iContactFetch(cfg, `${folderPath}/lists/${listId}`, { cache: 'no-store' })
  if (!listResponse.ok) throw new Error(`Could not read the iContact test list (${listResponse.status}).`)

  const list = getResource(listResponse.data, 'list', listId, folderId)
  const listName = getIContactTestListName(recipientEmail)
  if (list.name !== listName) {
    throw new Error('The configured iContact list is not the dedicated test list for this recipient.')
  }
  if (['emailOwnerOnChange', 'welcomeOnManualAdd', 'welcomeOnSignupAdd'].some((flag) => {
    const value = list[flag]
    return value != null && value !== false && value !== 0 && value !== '0'
  })) {
    throw new Error('The iContact test list must have list notifications and welcome messages disabled.')
  }

  const contactId = await findIContactTestContactId({ cfg, accountId, clientFolderId, recipientEmail })
  const listTarget = { cfg, accountId, clientFolderId, contactId, listId }
  await inspectIContactTestList(listTarget)
  const messageReader = { ...input, cfg, messagePath }
  const original = await readTestMessage(messageReader)

  return {
    evidence: { clientFolderId, contactId, listId, listName, messageId, recipientEmail },
    listTarget,
    messageReader,
    original,
  }
}

export async function sendIContactAutomationTestEmail({
  beforeTrigger,
  html,
  preheader,
  subject,
  text,
  ...targetInput
}: TestTargetInput & {
  beforeTrigger?: () => Promise<void>
  html: string
  preheader?: string
  subject: string
  text: string
}) {
  const { evidence, listTarget, messageReader, original } = await inspectAutomationTarget(targetInput)
  const update = {
    htmlBody: html,
    messageId: evidence.messageId,
    previewText: preheader || '',
    subject,
    textBody: text,
  }
  const response = await iContactFetch(messageReader.cfg, messageReader.messagePath, { method: 'POST', body: update })
  if (!response.ok) throw new Error(`Could not update the iContact test message (${response.status}).`)

  getResource(response.data, 'message', evidence.messageId, evidence.clientFolderId)
  const { message, name, campaignId, replyToCampaignId } = await readTestMessage(messageReader)
  if (
    message.subject !== update.subject ||
    message.htmlBody !== update.htmlBody ||
    message.textBody !== update.textBody ||
    (message.previewText ?? '') !== update.previewText ||
    name !== original.name ||
    campaignId !== original.campaignId ||
    replyToCampaignId !== original.replyToCampaignId
  ) {
    throw new Error('iContact did not confirm the updated test draft and sender settings.')
  }

  await triggerIContactTestListSubscription({ ...listTarget, beforeTrigger })
  return { ...evidence, activeRecipientCount: 1 as const, recipientCount: 1 as const }
}
