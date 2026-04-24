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

const escapeHTML = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const renderStartError = (message: string, status = 500) =>
  new NextResponse(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Facebook connection failed</title>
    <style>
      :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f6f7f9; color: #111827; }
      main { width: min(720px, calc(100vw - 32px)); background: white; border: 1px solid #e5e7eb; border-radius: 18px; box-shadow: 0 18px 50px rgb(15 23 42 / 12%); padding: 28px; }
      h1 { margin: 0 0 12px; font-size: 24px; }
      p { color: #4b5563; line-height: 1.55; }
      code { background: #f3f4f6; border-radius: 6px; padding: 2px 6px; }
      @media (prefers-color-scheme: dark) {
        body { background: #0f172a; color: #f8fafc; }
        main { background: #111827; border-color: #334155; }
        p { color: #cbd5e1; }
        code { background: #1f2937; }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Facebook connection failed</h1>
      <p>${escapeHTML(message)}</p>
      <p>Go back to Payload after fixing this and click <code>Connect Facebook</code> again.</p>
    </main>
  </body>
</html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8' } },
  )

export async function GET(req: NextRequest) {
  const payload = await getPayload({ config: configPromise })

  try {
    const user = await authenticatePayloadUser(payload, req)
    if (!user) return renderStartError('You must be logged in to Payload before connecting Facebook.', 401)

    const repInfoId = req.nextUrl.searchParams.get('repInfoId') || ''
    const userId = getUserId(user)
    if (!userId) return renderStartError('Could not identify the current Payload user.', 401)

    const repResult = await getRepInfoForUser({
      payload,
      req: req as unknown as PayloadRequest,
      repInfoId,
      user,
    })
    if ('error' in repResult) {
      return renderStartError(repResult.error, repResult.status)
    }

    const fbConfig = getFacebookConfig()
    if (!fbConfig.appId) {
      return renderStartError('Missing backend environment variable: FACEBOOK_APP_ID.')
    }
    if (!fbConfig.appSecret) {
      return renderStartError('Missing backend environment variable: FACEBOOK_APP_SECRET.')
    }

    const state = makeState()
    const returnTo = safeAdminReturnTo(req.nextUrl.searchParams.get('returnTo'), repInfoId)

    await payload.create({
      collection: 'facebook-oauth-sessions',
      data: {
        state,
        user: userId,
        repInfo: repInfoId,
        ...(repResult.tenantId ? { tenant: repResult.tenantId } : {}),
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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error.'
    payload.logger.error({ err: error }, 'Facebook OAuth start failed')
    return renderStartError(message)
  }
}
