import { describe, expect, it } from 'vitest'

import {
  canClaimEmailSendJob,
  isExpiredEmailSendJobLock,
  isIdempotentlyQueuedStatus,
} from './sendQueue'

describe('email send queue safety', () => {
  const now = new Date('2026-07-18T12:00:00.000Z')

  it('never directly reclaims a running job for another provider attempt', () => {
    expect(isExpiredEmailSendJobLock('2026-07-18T11:59:59.000Z', now)).toBe(true)
    expect(isExpiredEmailSendJobLock('2026-07-18T12:01:00.000Z', now)).toBe(false)
    expect(canClaimEmailSendJob({
      attempts: 1,
      lockExpiresAt: '2026-07-18T11:59:59.000Z',
      status: 'running',
    }, now, 3)).toBe(false)
    expect(canClaimEmailSendJob({
      attempts: 3,
      lockExpiresAt: '2026-07-18T11:59:59.000Z',
      status: 'running',
    }, now, 3)).toBe(false)
    expect(canClaimEmailSendJob({
      attempts: 1,
      status: 'pending',
    }, now, 3)).toBe(true)
    expect(canClaimEmailSendJob({
      attempts: 1,
      lockExpiresAt: '2026-07-18T12:01:00.000Z',
      status: 'running',
    }, now, 3)).toBe(false)
  })

  it('treats pending/running enqueue requests as idempotent but not completed jobs', () => {
    expect(isIdempotentlyQueuedStatus('pending')).toBe(true)
    expect(isIdempotentlyQueuedStatus('running')).toBe(true)
    expect(isIdempotentlyQueuedStatus('completed')).toBe(false)
    expect(isIdempotentlyQueuedStatus('failed')).toBe(false)
  })
})
