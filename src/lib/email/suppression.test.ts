import { describe, expect, it } from 'vitest'

import { suppressIneligibleSnapshotRecipients } from './suppression'

describe('snapshot suppression intersection', () => {
  it('removes newly ineligible recipients and never adds post-approval contacts', () => {
    const result = suppressIneligibleSnapshotRecipients(
      [
        { email: 'approved@example.com', firstName: 'Approved' },
        { email: 'later-unsubscribed@example.com' },
      ],
      [
        { email: 'APPROVED@example.com', firstName: 'Changed current data' },
        { email: 'joined-after-approval@example.com' },
      ],
    )

    expect(result.recipients).toEqual([
      { email: 'approved@example.com', firstName: 'Approved' },
    ])
    expect(result.suppressedCount).toBe(1)
    expect(result.recipients.some(({ email }) => email === 'joined-after-approval@example.com')).toBe(false)
  })
})
