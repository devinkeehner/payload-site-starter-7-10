import type { Access, CollectionBeforeChangeHook, PayloadRequest } from 'payload'

import { isEmailLifecycleRequest } from './lifecycleContext'

type UnknownRecord = Record<string, unknown>

const IMMUTABLE_JOB_FIELDS = [
  'contentRevision',
  'email',
  'kind',
  'recipientChunkCount',
  'recipientCount',
  'requestedAt',
  'requestedBy',
  'scheduledFor',
  'snapshot',
  'tenant',
] as const

const MANAGED_JOB_FIELDS = [
  'activeKey',
  'attempts',
  'claimToken',
  'completedAt',
  'elasticCampaignId',
  'lockedAt',
  'lockExpiresAt',
  'message',
  'providerAttemptedAt',
  'reconciliationPending',
  'startedAt',
  'status',
] as const

function comparable(value: unknown): string {
  return JSON.stringify(value ?? null)
}

function changed(data: UnknownRecord, original: UnknownRecord, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(data, field) &&
    comparable(data[field]) !== comparable(original[field])
}

export const emailSendJobLifecycleAccess: Access = ({ req }) =>
  isEmailLifecycleRequest(req as PayloadRequest)

export const protectEmailSendJob: CollectionBeforeChangeHook = ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (operation !== 'update' || !data || !originalDoc) return data
  const incoming = data as UnknownRecord
  const original = originalDoc as UnknownRecord

  if (IMMUTABLE_JOB_FIELDS.some((field) => changed(incoming, original, field))) {
    throw new Error('Email send snapshots and recipient metadata are immutable.')
  }
  if (
    !isEmailLifecycleRequest(req as PayloadRequest) &&
    MANAGED_JOB_FIELDS.some((field) => changed(incoming, original, field))
  ) {
    throw new Error('Email send job state is managed by the delivery service.')
  }

  return data
}
