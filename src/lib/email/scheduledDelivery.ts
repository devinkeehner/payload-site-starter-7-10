type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function getId(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (!isRecord(value)) return null
  const id = value.id ?? value._id ?? value.value
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null
}

export function getScheduledDeliveryAuthorizationError({
  currentRevision,
  deliveryConfirmedAt,
  deliveryContentRevision,
  deliveryJobId,
  emailId,
  job,
  scheduledAt,
}: {
  currentRevision: string
  deliveryConfirmedAt: unknown
  deliveryContentRevision: unknown
  deliveryJobId: string | null
  emailId: string
  job: UnknownRecord | null
  scheduledAt: unknown
}): string | null {
  if (!getString(deliveryConfirmedAt)) {
    return 'This legacy schedule was never explicitly confirmed in the delivery workflow.'
  }
  if (!deliveryJobId || !job) {
    return 'This schedule has no immutable delivery snapshot.'
  }
  if (getString(deliveryContentRevision) !== currentRevision) {
    return 'Campaign content changed after this schedule was confirmed.'
  }
  if (getString(job.status) !== 'scheduled') {
    return 'The scheduled delivery job is no longer available.'
  }
  const snapshot = isRecord(job.snapshot) ? job.snapshot : null
  if (
    getId(job.email) !== emailId ||
    getString(job.scheduledFor) !== getString(scheduledAt) ||
    getString(job.contentRevision) !== currentRevision ||
    !snapshot ||
    getString(snapshot.emailId) !== emailId ||
    getString(snapshot.contentRevision) !== currentRevision
  ) {
    return 'The scheduled delivery snapshot does not match the confirmed campaign revision.'
  }
  return null
}
