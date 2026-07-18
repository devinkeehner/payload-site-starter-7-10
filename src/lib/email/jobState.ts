import type { Payload } from 'payload'

type UnknownRecord = Record<string, unknown>

type AtomicJobUpdateModel = {
  findOneAndUpdate?: (
    filter: UnknownRecord,
    update: UnknownRecord,
    options: UnknownRecord,
  ) => { lean?: () => Promise<unknown> } | Promise<unknown>
}

function compactData(data: UnknownRecord): UnknownRecord {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  )
}

export function isEmailJobConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : ''
  return Boolean(
    error &&
      typeof error === 'object' &&
      (
        ('code' in error && error.code === 11000) ||
        ('status' in error && error.status === 409)
      ),
  ) || /duplicate|unique|E11000/i.test(message)
}

export async function transitionEmailSendJob({
  data = {},
  expected = {},
  from,
  jobId,
  payload,
  to,
}: {
  data?: UnknownRecord
  expected?: UnknownRecord
  from: string | string[]
  jobId: string
  payload: Payload
  to: string
}): Promise<UnknownRecord | null> {
  const model = (payload.db.collections as Record<string, unknown>)['email-send-jobs'] as
    | AtomicJobUpdateModel
    | undefined
  if (!model?.findOneAndUpdate) {
    throw new Error('Atomic email job updates are unavailable.')
  }
  const statuses = Array.isArray(from) ? from : [from]
  const query = model.findOneAndUpdate(
    {
      _id: jobId,
      ...compactData(expected),
      status: statuses.length === 1 ? statuses[0] : { $in: statuses },
    },
    {
      $set: {
        ...compactData(data),
        status: to,
        updatedAt: new Date().toISOString(),
      },
    },
    {
      new: true,
      runValidators: true,
    },
  )
  const updated = typeof query === 'object' && 'lean' in query && query.lean
    ? await query.lean()
    : await query
  return updated ? updated as UnknownRecord : null
}
