import { canUseEmailFeatures, isSuperUser } from '@/lib/access/isSuperUser'

export function relationshipID(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>
    return relationshipID(row.id ?? row._id ?? row.value)
  }
  return null
}

export class LiveEditorAccessError extends Error {
  constructor(message: string, public readonly status: number) { super(message) }
}

export function assertEditorUser(user: unknown): void {
  if (!canUseEmailFeatures(user)) throw new LiveEditorAccessError('Sign in with an account authorized to edit email campaigns.', 403)
}

/** Ownership comes from the authorized document, never the active-site cookie. */
export function assertEmailTenantAccess(user: unknown, email: { tenant?: unknown }): void {
  assertEditorUser(user)
  if (isSuperUser(user)) return
  const tenant = relationshipID(email.tenant)
  const raw = (user as { tenants?: Array<{ tenant?: unknown }> }).tenants
  const assignments = Array.isArray(raw) ? raw : []
  if (!tenant || !assignments.some(row => relationshipID(row.tenant) === tenant)) {
    throw new LiveEditorAccessError('This email is outside your assigned sites.', 403)
  }
}
