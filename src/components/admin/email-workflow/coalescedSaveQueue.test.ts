import { describe, expect, it, vi } from 'vitest'

import { createCoalescedSaveQueue } from './coalescedSaveQueue'

function deferred() {
  let reject!: (reason?: unknown) => void
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

describe('createCoalescedSaveQueue', () => {
  it('serializes saves and makes every flusher wait for the newest revision', async () => {
    const first = deferred()
    const second = deferred()
    const persist = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
    const queue = createCoalescedSaveQueue<{ subject: string }>(persist)

    queue.update({ subject: 'Version A' }, 1)
    const firstFlush = queue.flush()
    expect(persist).toHaveBeenCalledTimes(1)
    expect(persist).toHaveBeenNthCalledWith(1, { subject: 'Version A' }, 1)

    queue.update({ subject: 'Version B' }, 2)
    const continueFlush = queue.flush()
    expect(persist).toHaveBeenCalledTimes(1)

    first.resolve()
    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(2))
    expect(persist).toHaveBeenNthCalledWith(2, { subject: 'Version B' }, 2)

    second.resolve()
    await expect(Promise.all([firstFlush, continueFlush])).resolves.toEqual([undefined, undefined])
    expect(queue.getSavedVersion()).toBe(2)
    expect(queue.isDirty()).toBe(false)
  })

  it('coalesces multiple waiting edits into one newest snapshot', async () => {
    const first = deferred()
    const second = deferred()
    const persist = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
    const queue = createCoalescedSaveQueue<{ subject: string }>(persist)

    queue.update({ subject: 'Version A' }, 1)
    const flush = queue.flush()
    queue.update({ subject: 'Version B' }, 2)
    queue.update({ subject: 'Version C' }, 3)

    first.resolve()
    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(2))
    expect(persist).toHaveBeenNthCalledWith(2, { subject: 'Version C' }, 3)

    second.resolve()
    await flush
    expect(queue.getSavedVersion()).toBe(3)
  })

  it('keeps the newest revision dirty after a failure so Continue can retry it', async () => {
    const persist = vi.fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(undefined)
    const queue = createCoalescedSaveQueue<{ subject: string }>(persist)

    queue.update({ subject: 'Keep me' }, 1)
    await expect(queue.flush()).rejects.toThrow('network down')
    expect(queue.isDirty()).toBe(true)

    await expect(queue.flush()).resolves.toBeUndefined()
    expect(persist).toHaveBeenCalledTimes(2)
    expect(queue.isDirty()).toBe(false)
  })
})
