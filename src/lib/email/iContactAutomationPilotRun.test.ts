import type { Payload } from 'payload'
import { describe, expect, it } from 'vitest'

import {
  advanceAutomationPilotRun,
  beginAutomationPilotRun,
  confirmAutomationPilotReceipt,
  getAutomationPilotRun,
  releaseUntriggeredAutomationPilotRun,
} from './iContactAutomationPilotRun'

type PilotRun = Awaited<ReturnType<typeof beginAutomationPilotRun>>
type RunFilter = {
  _id: string
  emailId?: string
  phase?: PilotRun['phase'] | { $in: PilotRun['phase'][] }
  runId?: string
}

function mockPayload(): Payload {
  const documents = new Map<string, PilotRun>()

  function find(filter: RunFilter): PilotRun | null {
    const doc = documents.get(filter._id)
    if (!doc) return null
    if (filter.emailId !== undefined && doc.emailId !== filter.emailId) return null
    if (filter.runId !== undefined && doc.runId !== filter.runId) return null
    if (typeof filter.phase === 'string' && doc.phase !== filter.phase) return null
    if (typeof filter.phase === 'object' && !filter.phase.$in.includes(doc.phase)) return null
    return doc
  }

  const collection = {
    async findOne(filter: RunFilter) {
      const doc = find(filter)
      return doc ? { ...doc } : null
    },
    async insertOne(doc: PilotRun) {
      if (documents.has(doc._id)) throw Object.assign(new Error('Duplicate key'), { code: 11000 })
      documents.set(doc._id, { ...doc })
    },
    async updateOne(filter: RunFilter, { $set }: { $set: Partial<PilotRun> }) {
      const doc = find(filter)
      if (!doc) return { matchedCount: 0 }
      documents.set(doc._id, { ...doc, ...$set })
      return { matchedCount: 1 }
    },
    async deleteOne(filter: RunFilter) {
      const doc = find(filter)
      if (!doc) return { deletedCount: 0 }
      documents.delete(doc._id)
      return { deletedCount: 1 }
    },
  }

  return { db: { connection: { db: { collection: () => collection } } } } as unknown as Payload
}

describe('iContact automation pilot runs', () => {
  const emailId = 'campaign-1'
  const folderId = 'folder-1'
  const subject = 'Newsletter revision'

  it('allows one run per folder even when another campaign requests the same folder', async () => {
    const payload = mockPayload()
    const requests = await Promise.allSettled([
      beginAutomationPilotRun({ emailId, folderId, payload, subject }),
      beginAutomationPilotRun({ emailId: 'campaign-2', folderId, payload, subject }),
    ])

    expect(requests).toMatchObject([
      { status: 'fulfilled', value: { emailId, phase: 'preparing' } },
      { status: 'rejected', reason: { status: 409 } },
    ])
    await expect(getAutomationPilotRun(payload, folderId)).resolves.toMatchObject({ emailId })
    await expect(beginAutomationPilotRun({ emailId, folderId: 'folder-2', payload, subject }))
      .resolves.toMatchObject({ _id: 'folder-2' })
  })

  it('releases a triggered run only for its matching campaign and receipt ID', async () => {
    const payload = mockPayload()
    const run = await beginAutomationPilotRun({ emailId, folderId, payload, subject })
    const receipt = { emailId, folderId, payload, runId: run.runId }

    await expect(confirmAutomationPilotReceipt(receipt)).rejects.toMatchObject({ status: 409 })
    await advanceAutomationPilotRun(payload, run, 'preparing', 'triggering')
    await expect(advanceAutomationPilotRun(payload, run, 'preparing', 'triggering'))
      .rejects.toMatchObject({ status: 409 })
    await expect(confirmAutomationPilotReceipt(receipt)).rejects.toMatchObject({ status: 409 })

    await advanceAutomationPilotRun(payload, run, 'triggering', 'triggered')
    await expect(confirmAutomationPilotReceipt({ ...receipt, emailId: 'campaign-2' }))
      .rejects.toMatchObject({ status: 409 })
    await expect(confirmAutomationPilotReceipt({ ...receipt, runId: 'another-run' }))
      .rejects.toMatchObject({ status: 409 })
    await expect(getAutomationPilotRun(payload, folderId)).resolves.toMatchObject({ phase: 'triggered' })
    await confirmAutomationPilotReceipt(receipt)
    await expect(getAutomationPilotRun(payload, folderId)).resolves.toBeNull()
  })

  it('prevents a stale run from releasing a new owner and retains an uncertain run', async () => {
    const payload = mockPayload()
    const firstRun = await beginAutomationPilotRun({ emailId, folderId, payload, subject })
    await releaseUntriggeredAutomationPilotRun(payload, firstRun)
    const nextRun = await beginAutomationPilotRun({ emailId, folderId, payload, subject })

    await releaseUntriggeredAutomationPilotRun(payload, firstRun)
    await expect(advanceAutomationPilotRun(payload, firstRun, 'preparing', 'triggering'))
      .rejects.toMatchObject({ status: 409 })
    await expect(getAutomationPilotRun(payload, folderId)).resolves.toMatchObject({ runId: nextRun.runId })

    await advanceAutomationPilotRun(payload, nextRun, 'preparing', 'triggering')
    await advanceAutomationPilotRun(payload, nextRun, 'triggering', 'uncertain')
    await releaseUntriggeredAutomationPilotRun(payload, nextRun)
    await expect(beginAutomationPilotRun({ emailId, folderId, payload, subject }))
      .rejects.toMatchObject({ status: 409 })

    await confirmAutomationPilotReceipt({ emailId, folderId, payload, runId: nextRun.runId })
    await expect(getAutomationPilotRun(payload, folderId)).resolves.toBeNull()
  })
})
