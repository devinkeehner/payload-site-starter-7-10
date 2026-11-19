import { describe, expect, it } from 'vitest'

import {
  normalizeEmailGroupAfterRead,
  protectEmailLifecycleFields,
} from './collectionHooks'

describe('email collection hooks', () => {
  it.each([
    { title: 'Updated draft', layout: [] },
    { emailList: 'audience-1' },
  ])('allows content and audience saves after Payload fills defaults on an older draft', async (patch) => {
    const data = {
      ...patch,
      legacyScheduleNeedsReview: false,
      lastSend: { sentAt: null, recipientEmail: undefined },
      sendSummary: { recipientCount: null, sentAt: undefined },
      status: 'draft',
    }
    const result = await protectEmailLifecycleFields({
      data,
      operation: 'update',
      originalDoc: { title: 'Original draft', lastSend: {}, sendSummary: null },
      req: {},
    } as never)

    expect(result).toMatchObject(patch)
  })

  it.each([
    { status: 'queued' },
    { scheduledAt: '2027-01-01T12:00:00.000Z' },
    { legacyScheduleNeedsReview: true },
    { lastSend: { status: 'sent' } },
    { sendSummary: { recipientCount: 0 } },
  ])('rejects a real delivery change during a normal save', async (patch) => {
    await expect(async () => protectEmailLifecycleFields({
      data: { title: 'Updated draft', ...patch },
      operation: 'update',
      originalDoc: { title: 'Original draft', status: 'draft', lastSend: {}, sendSummary: {} },
      req: {},
    } as never)).rejects.toMatchObject({ status: 409, message: expect.stringContaining('campaign delivery controls') })
  })

  it('still rejects audience changes on a scheduled campaign', async () => {
    await expect(async () => protectEmailLifecycleFields({
      data: { emailList: 'other-audience' },
      operation: 'update',
      originalDoc: { status: 'scheduled', emailList: 'approved-audience' },
      req: {},
    } as never)).rejects.toMatchObject({ status: 409, message: expect.stringContaining('send content is locked') })
  })

  it('stores new lifecycle groups as objects so Payload can traverse them', async () => {
    const result = await protectEmailLifecycleFields({
      data: { title: 'Campaign' },
      operation: 'create',
      req: {},
    } as never)

    expect(result).toMatchObject({
      lastSend: {},
      sendSummary: {},
      status: 'draft',
    })
  })

  it('normalizes legacy null group values before child fields are read', async () => {
    expect(await normalizeEmailGroupAfterRead({ value: null } as never)).toEqual({})
    expect(
      await normalizeEmailGroupAfterRead({
        value: { iContactSendId: 'icontact-send-1' },
      } as never),
    ).toEqual({ iContactSendId: 'icontact-send-1' })
  })
})
