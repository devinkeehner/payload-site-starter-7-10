import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import type { PayloadRequest } from 'payload'
import configPromise from '@payload-config'

import {
  asRecord,
  authenticatePayloadUser,
  canManageTenant,
  getString,
  getTenantId,
  getUserId,
  safeAdminReturnTo,
} from '@/lib/facebook'

export const runtime = 'nodejs'

const getTaskStrings = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => getString(asRecord(entry).task) || getString(entry))
    .filter((task): task is string => Boolean(task))
}

export async function POST(req: NextRequest) {
  const payload = await getPayload({ config: configPromise })
  const user = await authenticatePayloadUser(payload, req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 })
  }

  const state = String(form.get('state') || '')
  const pageId = String(form.get('pageId') || '')
  if (!state || !pageId) return NextResponse.json({ error: 'Missing state or pageId.' }, { status: 400 })

  const sessionLookup = await payload.find({
    collection: 'facebook-oauth-sessions',
    where: { state: { equals: state } },
    limit: 1,
    depth: 1,
    overrideAccess: true,
    req: req as unknown as PayloadRequest,
  })
  const session = sessionLookup.docs?.[0] as Record<string, unknown> | undefined
  if (!session?.id) return NextResponse.json({ error: 'Facebook connection session expired.' }, { status: 404 })

  const returnTo = safeAdminReturnTo(getString(session.returnTo), getTenantId(session.repInfo))
  if (getUserId(user) !== getTenantId(session.user)) {
    return NextResponse.json({ error: 'This Facebook connection session belongs to another user.' }, { status: 403 })
  }

  const tenantId = getTenantId(session.tenant)
  if (!canManageTenant(user, tenantId)) {
    return NextResponse.json({ error: 'You do not have access to connect Facebook for this site.' }, { status: 403 })
  }

  const expiresAt = new Date(String(session.expiresAt || 0)).getTime()
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    await payload.delete({
      collection: 'facebook-oauth-sessions',
      id: String(session.id),
      overrideAccess: true,
      req: req as unknown as PayloadRequest,
    })
    return NextResponse.json({ error: 'Facebook connection session expired.' }, { status: 410 })
  }

  const pages = Array.isArray(session.pages) ? session.pages.map(asRecord) : []
  const selected = pages.find((page) => getString(page.pageId) === pageId)
  const accessToken = getString(selected?.accessToken)
  if (!selected || !accessToken) {
    return NextResponse.json({ error: 'Selected Facebook Page was not found in this session.' }, { status: 400 })
  }

  const repInfoId = getTenantId(session.repInfo)
  if (!repInfoId) return NextResponse.json({ error: 'Missing rep info target.' }, { status: 400 })

  const pageName = getString(selected.name)
  const pageLink = getString(selected.link) || `https://www.facebook.com/${encodeURIComponent(pageId)}`
  const tasks = getTaskStrings(selected.tasks)

  await payload.update({
    collection: 'rep-info',
    id: repInfoId,
    data: {
      facebook: pageLink,
      facebookPageId: pageId,
      facebookPageName: pageName,
      facebookPageAccessToken: accessToken,
      facebookPageTasks: tasks.map((task) => ({ task })),
      facebookConnectionStatus: 'connected',
      facebookConnectedAt: new Date().toISOString(),
      facebookConnectedBy: getUserId(user),
      facebookLastError: null,
    },
    overrideAccess: true,
    req: req as unknown as PayloadRequest,
  })

  await payload.delete({
    collection: 'facebook-oauth-sessions',
    id: String(session.id),
    overrideAccess: true,
    req: req as unknown as PayloadRequest,
  })

  const redirectUrl = new URL(returnTo, req.nextUrl.origin)
  redirectUrl.searchParams.set('facebook', 'connected')
  return NextResponse.redirect(redirectUrl, { status: 303 })
}
