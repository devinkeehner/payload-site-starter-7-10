import type { Payload, PayloadRequest } from 'payload'

import { sendIContactCampaign } from './iContactEmail'
import {
  assertEmailAudienceTenantMatch,
  resolveEmailAudience,
} from './recipients'
import {
  getEmailSnapshotJob,
  getEmailSnapshotRecipients,
} from './snapshot'
import { suppressIneligibleSnapshotRecipients } from './suppression'

function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export async function sendProductionEmailSnapshotJob({
  beforeProviderDispatch,
  jobId,
  overrideAccess = false,
  payload,
  req,
}: {
  beforeProviderDispatch?: () => Promise<void>
  jobId: string
  overrideAccess?: boolean
  payload: Payload
  req: PayloadRequest
}) {
  const { snapshot } = await getEmailSnapshotJob({
    jobId,
    overrideAccess,
    payload,
    req,
  })
  const snapshotRecipients = await getEmailSnapshotRecipients({
    jobId,
    overrideAccess,
    payload,
    req,
  })
  if (!snapshotRecipients.length) {
    throw new Error('Email send job has no approved recipient snapshot.')
  }

  const currentAudience = await resolveEmailAudience({
    listId: snapshot.audienceListId,
    overrideAccess,
    payload,
    req,
  })
  assertEmailAudienceTenantMatch({
    audienceTenant: currentAudience.list.tenant,
    campaignTenant: snapshot.tenantId,
  })
  const suppression = suppressIneligibleSnapshotRecipients(
    snapshotRecipients,
    currentAudience.recipients,
  )
  if (!suppression.recipients.length) {
    throw new Error('Every approved recipient is now suppressed; no email was sent.')
  }

  const clientFolderId = getString(currentAudience.list.iContactClientFolderId)
  const listId = getString(currentAudience.list.iContactListId)
  await beforeProviderDispatch?.()
  const iContactSend = await sendIContactCampaign({
    clientFolderId,
    campaignId: snapshot.iContactCampaignId,
    fromEmail: snapshot.fromEmail,
    html: snapshot.html,
    listId,
    messageName: `${snapshot.subject} — ${jobId}`.slice(0, 255),
    preheader: snapshot.preheader,
    subject: snapshot.subject,
    text: snapshot.text,
  })

  await payload.update({
    collection: 'email-lists',
    data: {
      activeContactCount: suppression.recipients.length,
    },
    id: snapshot.audienceListId,
    overrideAccess,
    overrideLock: false,
    req,
  })

  return {
    iContactMessageId: iContactSend.messageId,
    iContactSendId: iContactSend.sendId,
    message: iContactSend.message,
    recipientCount: iContactSend.recipientCount || suppression.recipients.length,
    suppressedRecipientCount: suppression.suppressedCount,
  }
}
