import { randomUUID } from 'node:crypto'
import type { Payload } from 'payload'

type Phase = 'preparing' | 'triggering' | 'triggered' | 'uncertain'

type PilotRun = {
  _id: string
  emailId: string
  phase: Phase
  runId: string
  startedAt: Date
  subject: string
}

function runs(payload: Payload) {
  const db = payload.db.connection?.db
  if (!db) throw new Error('The automation pilot database is unavailable.')
  return db.collection<PilotRun>('email_automation_pilot_runs')
}

function pilotConflict(message: string) {
  return Object.assign(new Error(message), { status: 409 })
}

export async function getAutomationPilotRun(payload: Payload, folderId: string) {
  return runs(payload).findOne({ _id: folderId })
}

export async function beginAutomationPilotRun({
  emailId,
  folderId,
  payload,
  subject,
}: {
  emailId: string
  folderId: string
  payload: Payload
  subject: string
}) {
  const runId = randomUUID()
  const run: PilotRun = {
    _id: folderId,
    emailId,
    phase: 'preparing',
    runId,
    startedAt: new Date(),
    subject: `[TEST ${runId.slice(0, 8)}] ${subject}`.slice(0, 255),
  }

  try {
    await runs(payload).insertOne(run)
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
      throw pilotConflict('An automation test is already pending for this iContact folder. Confirm its receipt before starting another.')
    }
    throw error
  }

  return run
}

export async function advanceAutomationPilotRun(
  payload: Payload,
  run: PilotRun,
  from: Phase,
  to: Phase,
) {
  const result = await runs(payload).updateOne(
    { _id: run._id, phase: from, runId: run.runId },
    { $set: { phase: to } },
  )
  if (result.matchedCount !== 1) {
    throw pilotConflict('The automation test state changed. Refresh before retrying.')
  }
}

export async function releaseUntriggeredAutomationPilotRun(payload: Payload, run: PilotRun) {
  await runs(payload).deleteOne({ _id: run._id, phase: 'preparing', runId: run.runId })
}

export async function confirmAutomationPilotReceipt({
  emailId,
  folderId,
  payload,
  runId,
}: {
  emailId: string
  folderId: string
  payload: Payload
  runId: string
}) {
  const result = await runs(payload).deleteOne({
    _id: folderId,
    emailId,
    phase: { $in: ['triggered', 'uncertain'] },
    runId,
  })
  if (result.deletedCount !== 1) throw pilotConflict('That automation test is no longer awaiting confirmation.')
}
