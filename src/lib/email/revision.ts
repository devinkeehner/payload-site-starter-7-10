import { createHash } from 'node:crypto'

import type { Payload, PayloadRequest } from 'payload'

type UnknownRecord = Record<string, unknown>

export type EmailRenderedRevisionInput = {
  audienceListId?: string | null
  fromEmail?: string
  fromName?: string
  html: string
  origin?: string
  preheader?: string
  replyTo?: string
  subject: string
  tenantId?: string | null
  text: string
}

const CONTENT_FIELDS = [
  'emailList',
  'layout',
  'preheader',
  'replyTo',
  'subject',
  'tenant',
] as const

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function getRelationshipId(value: unknown): string | number | null {
  if (typeof value === 'string' || typeof value === 'number') return value
  if (!isRecord(value)) return null

  const id = value.id ?? value._id ?? value.value
  return typeof id === 'string' || typeof id === 'number' ? id : null
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!isRecord(value)) return value ?? null

  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  )
}

export function getEmailRevisionInput(email: UnknownRecord): UnknownRecord {
  return {
    emailList: getRelationshipId(email.emailList),
    layout: canonicalize(email.layout),
    preheader: typeof email.preheader === 'string' ? email.preheader.trim() : '',
    replyTo: typeof email.replyTo === 'string' ? email.replyTo.trim().toLowerCase() : '',
    subject: typeof email.subject === 'string' ? email.subject.trim() : '',
    tenant: getRelationshipId(email.tenant),
  }
}

export function computeEmailContentRevision(email: UnknownRecord): string {
  return createHash('sha256')
    .update(JSON.stringify(getEmailRevisionInput(email)))
    .digest('hex')
}

export function computeEmailRenderedContentRevision(
  input: EmailRenderedRevisionInput,
): string {
  const normalizeOrigin = (value: string) =>
    input.origin ? value.split(input.origin).join('{{email-origin}}') : value
  return createHash('sha256')
    .update(JSON.stringify(canonicalize({
      audienceListId: input.audienceListId || null,
      fromEmail: input.fromEmail?.trim().toLowerCase() || '',
      fromName: input.fromName?.trim() || '',
      html: normalizeOrigin(input.html),
      preheader: input.preheader?.trim() || '',
      replyTo: input.replyTo?.trim().toLowerCase() || '',
      subject: input.subject.trim(),
      tenantId: input.tenantId || null,
      text: normalizeOrigin(input.text),
    })))
    .digest('hex')
}

export function mergeEmailRevisionFields(
  data: UnknownRecord,
  originalDoc?: UnknownRecord | null,
): UnknownRecord {
  const original = originalDoc || {}
  return Object.fromEntries(
    CONTENT_FIELDS.map((field) => [
      field,
      Object.prototype.hasOwnProperty.call(data, field) ? data[field] : original[field],
    ]),
  )
}

export async function getEmailContentRevision({
  emailId,
  overrideAccess = false,
  payload,
  req,
}: {
  emailId: string
  overrideAccess?: boolean
  payload: Payload
  req?: PayloadRequest
}): Promise<string> {
  const email = (await payload.findByID({
    collection: 'emails',
    depth: 0,
    draft: true,
    id: emailId,
    overrideAccess,
    req,
  })) as unknown as UnknownRecord

  return computeEmailContentRevision(email)
}

export function didEmailSendContentChange(
  data: UnknownRecord,
  originalDoc?: UnknownRecord | null,
): boolean {
  if (!originalDoc) return false
  if (!CONTENT_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(data, field))) {
    return false
  }

  return computeEmailContentRevision(mergeEmailRevisionFields(data, originalDoc)) !==
    computeEmailContentRevision(originalDoc)
}
