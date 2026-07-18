import type { Payload, PayloadRequest } from 'payload'

import { sendElasticBulkMarketingEmail } from './elasticEmail'
import {
  assertEmailAudienceTenantMatch,
  resolveEmailAudience,
} from './recipients'
import {
  getEmailSnapshotJob,
  getEmailSnapshotRecipients,
} from './snapshot'
import { suppressIneligibleSnapshotRecipients } from './suppression'

function getElasticSendChannelName(jobId: string): string {
  return `hro-email-job-${jobId}`.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 80)
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function runElasticStep<T>(label: string, action: () => Promise<T>): Promise<T> {
  try {
    return await action()
  } catch (error) {
    throw new Error(`${label}: ${getErrorMessage(error)}`)
  }
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

  const channelName = getElasticSendChannelName(jobId)
  await beforeProviderDispatch?.()
  const elasticSend = await runElasticStep('Elastic bulk send failed', () =>
    sendElasticBulkMarketingEmail({
      channelName,
      fromEmail: snapshot.fromEmail,
      fromName: snapshot.fromName,
      html: snapshot.html,
      recipients: suppression.recipients.map((recipient) => ({
        Email: recipient.email,
        Fields: {
          contactId: recipient.contactId || '',
          email: recipient.email,
          firstName: recipient.firstName || '',
          fullName: [recipient.firstName, recipient.lastName].filter(Boolean).join(' '),
          lastName: recipient.lastName || '',
          phone: recipient.phone || '',
          postalCode: recipient.postalCode || '',
          tenant: snapshot.tenantSlug || '',
        },
      })),
      replyTo: snapshot.replyTo,
      subject: snapshot.subject,
      text: snapshot.text,
    }),
  )

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
    elasticCampaignId: elasticSend.id || channelName,
    message: elasticSend.message,
    recipientCount: suppression.recipients.length,
    suppressedRecipientCount: suppression.suppressedCount,
  }
}
