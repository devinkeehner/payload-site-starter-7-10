import type { EmailCampaignRecipient } from './recipients'

export type SnapshotSuppressionResult = {
  recipients: EmailCampaignRecipient[]
  suppressedCount: number
}

export function suppressIneligibleSnapshotRecipients(
  snapshotRecipients: EmailCampaignRecipient[],
  currentlyEligibleRecipients: EmailCampaignRecipient[],
): SnapshotSuppressionResult {
  const eligibleEmails = new Set(
    currentlyEligibleRecipients.map((recipient) => recipient.email.trim().toLowerCase()),
  )
  const recipients = snapshotRecipients.filter((recipient) =>
    eligibleEmails.has(recipient.email.trim().toLowerCase()),
  )

  return {
    recipients,
    suppressedCount: Math.max(0, snapshotRecipients.length - recipients.length),
  }
}
