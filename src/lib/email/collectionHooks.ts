import type {
  CollectionBeforeChangeHook,
  CollectionBeforeValidateHook,
  FieldHook,
  PayloadRequest,
} from 'payload'

import { getEmailCampaignStatus, isEmailContentLocked } from './lifecycle'
import { isEmailLifecycleRequest } from './lifecycleContext'
import {
  computeEmailContentRevision,
  didEmailSendContentChange,
  mergeEmailRevisionFields,
} from './revision'

type UnknownRecord = Record<string, unknown>

const LIFECYCLE_FIELDS = [
  'deliveryConfirmedAt',
  'deliveryConfirmedBy',
  'deliveryContentRevision',
  'deliveryJob',
  'deliveryTimeZone',
  'legacyScheduleNeedsReview',
  'lastSend',
  'scheduledAt',
  'sendSummary',
  'status',
] as const

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export const normalizeEmailGroupAfterRead: FieldHook = ({ value }) =>
  isRecord(value) ? value : {}

function getId(value: unknown): string | number | null {
  if (typeof value === 'string' || typeof value === 'number') return value
  if (!isRecord(value)) return null
  const id = value.id ?? value._id ?? value.value
  return typeof id === 'string' || typeof id === 'number' ? id : null
}

function comparable(value: unknown): unknown {
  const id = getId(value)
  if (id != null && isRecord(value)) return id
  if (Array.isArray(value)) return value.map(comparable)
  if (!isRecord(value)) return value ?? null
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, comparable(value[key])]),
  )
}

function changed(data: UnknownRecord, original: UnknownRecord, field: string): boolean {
  if (!Object.prototype.hasOwnProperty.call(data, field)) return false
  return JSON.stringify(comparable(data[field])) !== JSON.stringify(comparable(original[field]))
}

export const syncEmailContentRevision: CollectionBeforeValidateHook = ({
  data,
  originalDoc,
}) => {
  if (!data) return data
  const original = isRecord(originalDoc) ? originalDoc : undefined
  const merged = mergeEmailRevisionFields(data as UnknownRecord, original)

  return {
    ...data,
    contentRevision: computeEmailContentRevision(merged),
  }
}

export const protectEmailLifecycleFields: CollectionBeforeChangeHook = ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (!data) return data
  if (isEmailLifecycleRequest(req as PayloadRequest)) return data
  if (operation === 'create') {
    return {
      ...data,
      deliveryConfirmedAt: null,
      deliveryConfirmedBy: null,
      deliveryContentRevision: null,
      deliveryJob: null,
      deliveryTimeZone: null,
      lastSend: {},
      legacyScheduleNeedsReview: false,
      relatedPost: null,
      scheduledAt: null,
      sendSummary: {},
      status: 'draft',
    }
  }
  if (operation !== 'update' || !isRecord(originalDoc)) return data

  const incoming = data as UnknownRecord
  const original = originalDoc as UnknownRecord
  const status = getEmailCampaignStatus(original.status)

  if (isEmailContentLocked(status) && didEmailSendContentChange(incoming, original)) {
    const instruction = status === 'scheduled'
      ? 'Cancel the scheduled send before editing this email.'
      : 'Duplicate this campaign to make content changes.'
    throw new Error(`This email is ${status} and its send content is locked. ${instruction}`)
  }

  if (LIFECYCLE_FIELDS.some((field) => changed(incoming, original, field))) {
    throw new Error('Use the campaign delivery controls to change email delivery status or timing.')
  }

  return data
}
