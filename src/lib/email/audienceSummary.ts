import type { Payload, PayloadRequest } from 'payload'

import { resolveEmailAudience } from './recipients'
import type { EmailWorkflowAudience } from './workflowTypes'

export type EmailAudienceSummary = EmailWorkflowAudience

export async function getEmailAudienceSummary({
  listId,
  payload,
  req,
}: {
  listId: string
  payload: Payload
  req: PayloadRequest
}): Promise<EmailAudienceSummary> {
  const resolved = await resolveEmailAudience({
    listId,
    payload,
    req,
  })

  return resolved.summary
}
