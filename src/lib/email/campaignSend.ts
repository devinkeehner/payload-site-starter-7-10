import type { Payload, PayloadRequest } from 'payload'

import { prepareIContactDispatch, type IContactDispatch } from './iContactAudience'
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
  beforeProviderDispatch?: (dispatch: IContactDispatch & { iContactMessageId: string }) => Promise<void>
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
  const sourceListId = getString(currentAudience.list.iContactListId)
  if ((snapshot.iContactClientFolderId && snapshot.iContactClientFolderId !== clientFolderId) ||
      (snapshot.iContactSourceListId && snapshot.iContactSourceListId !== sourceListId)) {
    throw new Error('The linked iContact audience changed after approval. Review and confirm the new audience.')
  }
  const priorDispatches = await payload.find({
    collection: 'email-send-jobs',
    depth: 0,
    pagination: false,
    overrideAccess,
    req,
    where: {
      and: [
        { id: { not_equals: jobId } },
        { tenant: { equals: snapshot.tenantId } },
        { iContactClientFolderId: { equals: clientFolderId } },
        { iContactSourceListId: { equals: sourceListId } },
        { iContactDispatchListId: { exists: true } },
        { status: { in: ['completed', 'delivery_unknown'] } },
      ],
    },
  })
  const target = await prepareIContactDispatch({
    approvedEmails: suppression.recipients.map(recipient => recipient.email),
    clientFolderId,
    jobId,
    priorDispatchLists: priorDispatches.docs.map(job => getString(job.iContactDispatchListId)).filter(Boolean),
    sourceListId,
  })
  const iContactSend = await sendIContactCampaign({
    beforeSend: async (messageId) => {
      const [, latest] = await Promise.all([
        target.verify(),
        resolveEmailAudience({ listId: snapshot.audienceListId, overrideAccess, payload, req }),
      ])
      assertEmailAudienceTenantMatch({ audienceTenant: latest.list.tenant, campaignTenant: snapshot.tenantId })
      const stillEligible = suppressIneligibleSnapshotRecipients(suppression.recipients, latest.recipients)
      if (stillEligible.suppressedCount || getString(latest.list.iContactClientFolderId) !== clientFolderId ||
          getString(latest.list.iContactListId) !== sourceListId) {
        throw new Error('The campaign audience changed during send preparation. Review it before trying again.')
      }
      await beforeProviderDispatch?.({ ...target.dispatch, iContactMessageId: messageId })
    },
    clientFolderId,
    campaignId: snapshot.iContactCampaignId,
    fromEmail: snapshot.fromEmail,
    html: snapshot.html,
    listId: target.dispatch.iContactDispatchListId,
    messageName: `HRO ${jobId} — ${snapshot.subject}`.slice(0, 255),
    preheader: snapshot.preheader,
    replyTo: snapshot.replyTo,
    subject: snapshot.subject,
    text: snapshot.text,
  })

  if (iContactSend.recipientCount > target.recipientCount) {
    throw new Error('iContact reported more recipients than the verified audience. Investigate this send before retrying.')
  }

  return {
    iContactMessageId: iContactSend.messageId,
    iContactSendId: iContactSend.sendId,
    message: iContactSend.message,
    recipientCount: iContactSend.recipientCount,
    suppressedRecipientCount: snapshotRecipients.length - iContactSend.recipientCount,
  }
}
