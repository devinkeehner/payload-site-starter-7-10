import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import type { PayloadRequest } from 'payload'
import configPromise from '@payload-config'

import {
  authenticatePayloadUser,
  FACEBOOK_SESSION_TTL_MS,
  getFacebookConfig,
  getFacebookRedirectUri,
  getRepInfoForUser,
  getUserId,
  makeState,
  safeAdminReturnTo,
} from '@/lib/facebook'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const payload = await getPayload({ config: configPromise })
  const user = await authenticatePayloadUser(payload, req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const repInfoId = req.nextUrl.searchParams.get('repInfoId') || ''
  const userId = getUserId(user)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const repResult = await getRepInfoForUser({
    payload,
    req: req as unknown as PayloadRequest,
    repInfoId,
    user,
  })
  if ('error' in repResult) {
    return NextResponse.json({ error: repResult.error }, { status: repResult.status })
  }

  const fbConfig = getFacebookConfig()
  if (!fbConfig.configured) {
    return NextResponse.json({ error: 'Facebook app credentials are not configured.' }, { status: 500 })
  }

  const state = makeState()
  const returnTo = safeAdminReturnTo(req.nextUrl.searchParams.get('returnTo'), repInfoId)

  await payload.create({
    collection: 'facebook-oauth-sessions',
    data: {
      state,
      user: userId,
      repInfo: repInfoId,
      tenant: repResult.tenantId,
      returnTo,
      expiresAt: new Date(Date.now() + FACEBOOK_SESSION_TTL_MS).toISOString(),
      pages: [],
    },
    overrideAccess: true,
    req: req as unknown as PayloadRequest,
  })

  const authUrl = new URL('https://www.facebook.com/dialog/oauth')
  authUrl.searchParams.set('client_id', fbConfig.appId)
  authUrl.searchParams.set('redirect_uri', getFacebookRedirectUri(req.url))
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', 'pages_show_list,pages_read_engagement')

  return NextResponse.redirect(authUrl)
}
