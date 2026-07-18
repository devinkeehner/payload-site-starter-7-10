import { describe, expect, it } from 'vitest'

import { getScheduledDeliveryAuthorizationError } from './scheduledDelivery'

describe('scheduled delivery authorization', () => {
  const valid = {
    currentRevision: 'revision-a',
    deliveryConfirmedAt: '2026-07-18T12:00:00.000Z',
    deliveryContentRevision: 'revision-a',
    deliveryJobId: 'job-1',
    emailId: 'email-1',
    job: {
      contentRevision: 'revision-a',
      email: 'email-1',
      scheduledFor: '2026-07-19T12:00:00.000Z',
      snapshot: {
        contentRevision: 'revision-a',
        emailId: 'email-1',
        html: '<p>Frozen</p>',
      },
      status: 'scheduled',
    },
    scheduledAt: '2026-07-19T12:00:00.000Z',
  }

  it('accepts only an explicitly confirmed matching immutable snapshot', () => {
    expect(getScheduledDeliveryAuthorizationError(valid)).toBeNull()
    expect(getScheduledDeliveryAuthorizationError({
      ...valid,
      deliveryConfirmedAt: null,
    })).toMatch(/never explicitly confirmed/i)
    expect(getScheduledDeliveryAuthorizationError({
      ...valid,
      deliveryContentRevision: 'revision-old',
    })).toMatch(/content changed/i)
    expect(getScheduledDeliveryAuthorizationError({
      ...valid,
      job: null,
    })).toMatch(/no immutable delivery snapshot/i)
  })
})
