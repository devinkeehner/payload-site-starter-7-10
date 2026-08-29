import { describe, expect, it } from 'vitest'

import {
  normalizeEmailGroupAfterRead,
  protectEmailLifecycleFields,
} from './collectionHooks'

describe('email collection hooks', () => {
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
