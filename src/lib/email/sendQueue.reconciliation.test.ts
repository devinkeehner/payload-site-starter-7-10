import type { Payload, PayloadRequest } from 'payload'
import { describe, expect, it } from 'vitest'

import { reconcileCompletedEmailSendJob } from './sendQueue'

type UnknownRecord = Record<string, unknown>

function matches(document: UnknownRecord, filter: UnknownRecord): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    const actual = document[key]
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      const operator = expected as UnknownRecord
      if (Array.isArray(operator.$in)) return operator.$in.includes(actual)
    }
    return actual === expected
  })
}

function createAtomicModel(
  document: UnknownRecord,
  shouldFail?: () => boolean,
) {
  return {
    findOneAndUpdate(
      filter: UnknownRecord,
      update: { $set?: UnknownRecord },
    ) {
      const updated = !shouldFail?.() && matches(document, filter)
        ? Object.assign(document, update.$set || {})
        : null
      return {
        lean: async () => updated ? { ...updated } : null,
      }
    },
  }
}

describe('completed delivery reconciliation', () => {
  it('retains the active delivery lock until the campaign sent transition succeeds', async () => {
    const email: UnknownRecord = {
      _id: 'email-1',
      deliveryJob: 'job-1',
      sendSummary: {},
      status: 'sending',
    }
    const job: UnknownRecord = {
      _id: 'job-1',
      activeKey: 'email-1',
      completedAt: '2026-07-18T12:00:00.000Z',
      contentRevision: 'revision-1',
      iContactSendId: 'icontact-send-1',
      email: 'email-1',
      reconciliationPending: true,
      sentRecipientCount: 12,
      status: 'completed',
      suppressedRecipientCount: 2,
    }
    let failEmailUpdate = true
    const payload = {
      db: {
        collections: {
          emails: createAtomicModel(email, () => {
            const fail = failEmailUpdate
            failEmailUpdate = false
            return fail
          }),
          'email-send-jobs': createAtomicModel(job),
        },
      },
      findByID: async ({ collection }: { collection: string }) => ({
        ...(collection === 'emails' ? email : job),
      }),
    } as unknown as Payload
    const req = {} as PayloadRequest

    await expect(reconcileCompletedEmailSendJob({
      job: { ...job },
      overrideAccess: true,
      payload,
      req,
    })).resolves.toBe(false)
    expect(email.status).toBe('sending')
    expect(job.activeKey).toBe('email-1')
    expect(job.reconciliationPending).toBe(true)

    await expect(reconcileCompletedEmailSendJob({
      job: { ...job },
      overrideAccess: true,
      payload,
      req,
    })).resolves.toBe(true)
    expect(email.status).toBe('sent')
    expect(email.sendSummary).toMatchObject({
      iContactSendId: 'icontact-send-1',
      recipientCount: 12,
      sendJob: 'job-1',
      suppressedRecipientCount: 2,
    })
    expect(job.activeKey).toBe('terminal:job-1')
    expect(job.reconciliationPending).toBe(false)
  })
})
