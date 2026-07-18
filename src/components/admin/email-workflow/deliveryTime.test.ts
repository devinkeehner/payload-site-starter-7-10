import { describe, expect, it } from 'vitest'

import {
  formatDateTimeForZone,
  zonedLocalDateTimeToISO,
} from './deliveryTime'

const EASTERN_TIME = 'America/New_York'

describe('delivery time conversion', () => {
  it('converts an Eastern standard-time value to an immutable instant', () => {
    expect(zonedLocalDateTimeToISO('2026-01-15T10:30', EASTERN_TIME)).toEqual({
      error: null,
      iso: '2026-01-15T15:30:00.000Z',
    })
  })

  it('uses the daylight-saving offset in summer', () => {
    expect(zonedLocalDateTimeToISO('2026-07-15T10:30', EASTERN_TIME)).toEqual({
      error: null,
      iso: '2026-07-15T14:30:00.000Z',
    })
  })

  it('rejects a local time skipped by the spring DST transition', () => {
    const result = zonedLocalDateTimeToISO('2026-03-08T02:30', EASTERN_TIME)

    expect(result.iso).toBeNull()
    expect(result.error).toMatch(/daylight saving time/i)
  })

  it('formats an existing instant for the Eastern Time input', () => {
    expect(formatDateTimeForZone('2026-07-15T14:30:00.000Z', EASTERN_TIME))
      .toBe('2026-07-15T10:30')
  })
})
