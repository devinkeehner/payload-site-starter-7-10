import { describe, expect, it } from 'vitest'

import { EmailSendJobs } from './index'

describe('email send job active reservation', () => {
  it('uses one optional unique active key per campaign', () => {
    const activeKey = EmailSendJobs.fields.find(
      (field) => 'name' in field && field.name === 'activeKey',
    )

    expect(activeKey).toMatchObject({
      index: true,
      name: 'activeKey',
      type: 'text',
      unique: true,
    })
    expect(activeKey && 'required' in activeKey ? activeKey.required : undefined).not.toBe(true)
  })
})
