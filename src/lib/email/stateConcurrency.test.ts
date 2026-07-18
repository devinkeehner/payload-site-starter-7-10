import type { Payload } from 'payload'
import { describe, expect, it } from 'vitest'

import { transitionEmailSendJob } from './jobState'
import { transitionEmailLifecycle } from './lifecycle'
import { requeueExpiredPreDispatchJob } from './sendQueue'

type UnknownRecord = Record<string, unknown>

function matches(document: UnknownRecord, filter: UnknownRecord): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    const actual = document[key]
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      const operator = expected as UnknownRecord
      if (Array.isArray(operator.$in)) return operator.$in.includes(actual)
      if (typeof operator.$lt === 'number') {
        return typeof actual === 'number' && actual < operator.$lt
      }
    }
    return actual === expected
  })
}

function createAtomicModel(document: UnknownRecord) {
  return {
    document,
    findOneAndUpdate(
      filter: UnknownRecord,
      update: { $set?: UnknownRecord },
    ) {
      const updated = matches(document, filter)
        ? Object.assign(document, update.$set || {})
        : null
      return {
        lean: async () => updated ? { ...updated } : null,
      }
    },
  }
}

function createPayload({
  email,
  job,
}: {
  email?: UnknownRecord
  job?: UnknownRecord
}) {
  const emailModel = createAtomicModel(email || {})
  const jobModel = createAtomicModel(job || {})
  const payload = {
    db: {
      collections: {
        emails: emailModel,
        'email-send-jobs': jobModel,
      },
    },
  } as unknown as Payload
  return { emailModel, jobModel, payload }
}

describe('email delivery compare-and-set concurrency', () => {
  it('allows exactly one competing campaign transition to win', async () => {
    const { emailModel, payload } = createPayload({
      email: {
        _id: 'email-1',
        deliveryJob: 'job-1',
        status: 'scheduled',
      },
    })

    const results = await Promise.allSettled([
      transitionEmailLifecycle({
        emailId: 'email-1',
        expected: { deliveryJob: 'job-1' },
        from: 'scheduled',
        payload,
        to: 'queued',
      }),
      transitionEmailLifecycle({
        emailId: 'email-1',
        expected: { deliveryJob: 'job-1' },
        from: 'scheduled',
        payload,
        to: 'draft',
      }),
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect(['queued', 'draft']).toContain(emailModel.document.status)
    const rejection = results.find((result) => result.status === 'rejected')
    expect((rejection as PromiseRejectedResult).reason).toMatchObject({ status: 409 })
  })

  it('allows only the current job claim to complete or fail a job', async () => {
    const { jobModel, payload } = createPayload({
      job: {
        _id: 'job-1',
        activeKey: 'email-1',
        claimToken: 'claim-current',
        status: 'running',
      },
    })

    const [completed, unknown] = await Promise.all([
      transitionEmailSendJob({
        data: { reconciliationPending: true },
        expected: { claimToken: 'claim-current' },
        from: 'running',
        jobId: 'job-1',
        payload,
        to: 'completed',
      }),
      transitionEmailSendJob({
        expected: { claimToken: 'claim-current' },
        from: 'running',
        jobId: 'job-1',
        payload,
        to: 'delivery_unknown',
      }),
    ])

    expect([completed, unknown].filter(Boolean)).toHaveLength(1)
    expect(['completed', 'delivery_unknown']).toContain(jobModel.document.status)
    await expect(transitionEmailSendJob({
      expected: { claimToken: 'claim-stale' },
      from: 'running',
      jobId: 'job-1',
      payload,
      to: 'failed',
    })).resolves.toBeNull()
  })

  it('cannot requeue a stale lease after the live worker marks provider dispatch', async () => {
    const job: UnknownRecord = {
      _id: 'job-1',
      activeKey: 'email-1',
      claimToken: 'claim-current',
      providerAttemptedAt: null,
      status: 'running',
    }
    const model = {
      findOneAndUpdate(
        filter: UnknownRecord,
        update: { $set?: UnknownRecord },
      ) {
        // This is the critical interleaving: the reclaimer read null, but the
        // live worker persisted its dispatch marker before Mongo evaluates the
        // requeue compare-and-set.
        if (filter.providerAttemptedAt === null) {
          job.providerAttemptedAt = '2026-07-18T12:00:00.000Z'
        }
        const updated = matches(job, filter)
          ? Object.assign(job, update.$set || {})
          : null
        return {
          lean: async () => updated ? { ...updated } : null,
        }
      },
    }
    const payload = {
      db: {
        collections: {
          'email-send-jobs': model,
        },
      },
    } as unknown as Payload

    await expect(requeueExpiredPreDispatchJob({
      claimToken: 'claim-current',
      jobId: 'job-1',
      payload,
    })).resolves.toBeNull()
    expect(job.status).toBe('running')
    expect(job.providerAttemptedAt).toBe('2026-07-18T12:00:00.000Z')
    expect(job.claimToken).toBe('claim-current')
  })
})
