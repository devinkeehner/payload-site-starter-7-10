import { describe, expect, it } from 'vitest'

import {
  chunkEmailRecipients,
  getEmailSnapshotHTML,
} from './snapshot'

describe('immutable email snapshots', () => {
  it('chunks the approved recipients without loss, duplication, or mutation', () => {
    const recipients = [
      { email: 'one@example.com' },
      { email: 'two@example.com' },
      { email: 'three@example.com' },
    ]
    const chunks = chunkEmailRecipients(recipients, 2)

    expect(chunks).toEqual([
      [{ email: 'one@example.com' }, { email: 'two@example.com' }],
      [{ email: 'three@example.com' }],
    ])
    chunks[0]?.splice(0, 1)
    expect(recipients).toHaveLength(3)
  })

  it('returns the stored HTML verbatim instead of deriving it from mutable content', () => {
    const snapshot = { html: '<html><body>Approved copy</body></html>' }
    const currentDraft = { html: '<html><body>Changed draft</body></html>' }

    expect(getEmailSnapshotHTML(snapshot)).toBe('<html><body>Approved copy</body></html>')
    expect(getEmailSnapshotHTML(currentDraft)).not.toBe(getEmailSnapshotHTML(snapshot))
  })
})
