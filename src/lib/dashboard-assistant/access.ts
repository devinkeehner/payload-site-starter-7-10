import { commitTransaction, initTransaction, killTransaction, type PayloadRequest } from 'payload'
import { LiveEditorAccessError, relationshipID } from '@/lib/live-editor/emailAccess'

export class DashboardInputError extends Error {
  readonly status = 400
}

export const local = (req: PayloadRequest) => ({ req, depth: 0, overrideAccess: false } as const)

function requireDashboardUser(req: PayloadRequest) {
  if (req.user?.collection !== 'users' || !req.user.id) {
    throw new LiveEditorAccessError('Sign in to the dashboard to use its assistant.', 403)
  }
  return req.user
}

export async function dashboardAccount(req: PayloadRequest) {
  const user = requireDashboardUser(req)
  // My Sites can change during a conversation. Read the actual user record.
  const account = await req.payload.findByID({
    ...local(req), collection: 'users', id: user.id, select: { tenants: true, updatedAt: true },
  })
  const assignedIds = (account.tenants ?? []).flatMap(row => relationshipID(row.tenant) ?? [])
  return { account, assignedIds }
}

export async function assertDashboardSite(req: PayloadRequest, tenantId: string | null, assignedOnly = false) {
  requireDashboardUser(req)
  if (!tenantId) throw new DashboardInputError('Select a website in the dashboard first.')
  if (assignedOnly && !(await dashboardAccount(req)).assignedIds.includes(tenantId)) {
    throw new LiveEditorAccessError('This site is outside your assigned sites.', 403)
  }
  const site = await req.payload.findByID({
    ...local(req), collection: 'tenants', id: tenantId, disableErrors: true, select: { archived: true, slug: true, name: true },
  })
  if (!site || site.id !== tenantId || site.archived) throw new DashboardInputError('This site is unavailable or archived.')
  return site
}

export async function dashboardTransaction<T>(req: PayloadRequest, work: () => Promise<T>) {
  const owns = await initTransaction(req)
  try {
    const result = await work()
    if (owns) await commitTransaction(req)
    return result
  } catch (error) {
    if (owns) await killTransaction(req)
    throw error
  }
}
