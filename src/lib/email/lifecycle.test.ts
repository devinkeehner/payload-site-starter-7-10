import { describe, expect, it } from 'vitest'

import {
  canSendEmailTest,
  canTransitionEmailLifecycle,
  isCurrentSuccessfulTest,
  validateScheduleInput,
} from './lifecycle'

describe('email lifecycle transitions', () => {
  it('allows only the delivery state machine transitions', () => {
    expect(canTransitionEmailLifecycle('draft', 'scheduled')).toBe(true)
    expect(canTransitionEmailLifecycle('draft', 'queued')).toBe(true)
    expect(canTransitionEmailLifecycle('scheduled', 'queued')).toBe(true)
    expect(canTransitionEmailLifecycle('queued', 'sending')).toBe(true)
    expect(canTransitionEmailLifecycle('sending', 'sent')).toBe(true)
    expect(canTransitionEmailLifecycle('sending', 'failed')).toBe(true)

    expect(canTransitionEmailLifecycle('draft', 'sent')).toBe(false)
    expect(canTransitionEmailLifecycle('scheduled', 'sent')).toBe(false)
    expect(canTransitionEmailLifecycle('sent', 'queued')).toBe(false)
  })
})

describe('matching current-revision test gate', () => {
  it('allows test sends only while a campaign is editable', () => {
    expect(canSendEmailTest('draft')).toBe(true)
    expect(canSendEmailTest('failed')).toBe(true)
    expect(canSendEmailTest('scheduled')).toBe(false)
    expect(canSendEmailTest('queued')).toBe(false)
    expect(canSendEmailTest('sending')).toBe(false)
    expect(canSendEmailTest('sent')).toBe(false)
  })

  it('requires both a successful test and an exact revision match', () => {
    expect(isCurrentSuccessfulTest({
      currentRevision: 'revision-a',
      lastTestRevision: 'revision-a',
      lastTestStatus: 'sent',
    })).toBe(true)
    expect(isCurrentSuccessfulTest({
      currentRevision: 'revision-a',
      lastTestRevision: 'revision-b',
      lastTestStatus: 'sent',
    })).toBe(false)
    expect(isCurrentSuccessfulTest({
      currentRevision: 'revision-a',
      lastTestRevision: 'revision-a',
      lastTestStatus: 'failed',
    })).toBe(false)
  })
})

describe('schedule input', () => {
  const now = new Date('2026-07-18T12:00:00.000Z')

  it('requires an explicit offset and a future instant', () => {
    expect(() => validateScheduleInput({
      now,
      scheduledAt: '2026-07-18T13:00:00',
    })).toThrow(/explicit UTC offset/i)
    expect(() => validateScheduleInput({
      now,
      scheduledAt: '2026-07-18T11:00:00-00:00',
    })).toThrow(/future/i)
  })

  it('normalizes offset times and validates IANA time zones across DST', () => {
    expect(validateScheduleInput({
      now,
      scheduledAt: '2026-11-01T01:30:00-04:00',
      timeZone: 'America/New_York',
    })).toEqual({
      scheduledAt: '2026-11-01T05:30:00.000Z',
      timeZone: 'America/New_York',
    })
    expect(() => validateScheduleInput({
      now,
      scheduledAt: '2026-07-18T13:00:00Z',
      timeZone: 'Not/A_Time_Zone',
    })).toThrow(/IANA time zone/i)
  })
})
