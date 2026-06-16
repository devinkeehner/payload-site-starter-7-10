import type { Payload, PayloadRequest, Where } from 'payload'

import { getId, getString } from './footerContext'

type UnknownRecord = Record<string, unknown>

export type EmailSenderSettings = {
  fromEmail?: string
  fromName?: string
  replyTo?: string
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function hasElasticEmailSender(settings?: EmailSenderSettings): boolean {
  return Boolean(
    process.env.ELASTIC_EMAIL_API_KEY?.trim() &&
      (settings?.fromEmail || process.env.ELASTIC_EMAIL_FROM_EMAIL?.trim()),
  )
}

export async function getTenantEmailSenderSettings({
  email,
  emailList,
  overrideAccess = false,
  payload,
  req,
}: {
  email?: UnknownRecord | null
  emailList?: UnknownRecord | null
  overrideAccess?: boolean
  payload: Payload
  req: PayloadRequest
}): Promise<EmailSenderSettings> {
  const tenantId = getId(email?.tenant) || getId(emailList?.tenant)
  if (!tenantId) return {}

  const result = await payload.find({
    collection: 'rep-info',
    depth: 0,
    limit: 1,
    overrideAccess,
    req,
    select: {
      emailFromEmail: true,
      emailFromName: true,
      emailReplyTo: true,
    },
    where: {
      tenant: {
        equals: tenantId,
      },
    } as Where,
  })

  const repInfo = result.docs[0] as unknown
  if (!isRecord(repInfo)) return {}

  return {
    fromEmail: getString(repInfo.emailFromEmail) || undefined,
    fromName: getString(repInfo.emailFromName) || undefined,
    replyTo: getString(repInfo.emailReplyTo) || undefined,
  }
}
