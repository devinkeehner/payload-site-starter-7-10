import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import type { PayloadRequest } from 'payload'
import configPromise from '@payload-config'

import {
  authenticatePayloadUser,
  canManageTenant,
  exchangeCodeForUserToken,
  exchangeForLongLivedUserToken,
  fetchManagedPages,
  getFacebookConfig,
  getFacebookRedirectUri,
  getString,
  getTenantId,
  getUserId,
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

const renderPage = ({
  title,
  body,
  returnTo,
}: {
  title: string
  body: string
  returnTo?: string
}) =>
  new NextResponse(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHTML(title)}</title>
    <style>
      :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f6f7f9; color: #111827; }
      main { width: min(720px, calc(100vw - 32px)); background: white; border: 1px solid #e5e7eb; border-radius: 18px; box-shadow: 0 18px 50px rgb(15 23 42 / 12%); padding: 28px; }
      h1 { margin: 0 0 12px; font-size: 24px; }
      p { color: #4b5563; line-height: 1.55; }
      .page { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 0; border-top: 1px solid #e5e7eb; }
      .page:first-of-type { border-top: 0; }
      .name { font-weight: 700; }
      .meta { color: #6b7280; font-size: 13px; }
      button, a.button { display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: 999px; background: #1877f2; color: white; padding: 10px 16px; font-weight: 700; text-decoration: none; cursor: pointer; white-space: nowrap; }
      a.secondary { background: #e5e7eb; color: #111827; }
      .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 22px; }
      @media (prefers-color-scheme: dark) {
        body { background: #0f172a; color: #f8fafc; }
        main { background: #111827; border-color: #334155; }
        p, .meta { color: #cbd5e1; }
        .page { border-color: #334155; }
        a.secondary { background: #334155; color: #f8fafc; }
      }
    </style>
  </head>
  <body>
    <main>${body}${returnTo ? `<div class="actions"><a class="button secondary" href="${escapeHTML(returnTo)}">Back to Payload</a></div>` : ''}</main>
  </body>
</html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8' } },
  )

export async function GET(req: NextRequest) {
  const payload = await getPayload({ config: configPromise })
  const user = await authenticatePayloadUser(payload, req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const state = req.nextUrl.searchParams.get('state') || ''
  const code = req.nextUrl.searchParams.get('code') || ''
  const oauthError = req.nextUrl.searchParams.get('error_description') || req.nextUrl.searchParams.get('error')

  const sessionLookup = await payload.find({
    collection: 'facebook-oauth-sessions',
    where: { state: { equals: state } },
    limit: 1,
    depth: 1,
    overrideAccess: true,
    req: req as unknown as PayloadRequest,
  })
  const session = sessionLookup.docs?.[0] as Record<string, unknown> | undefined
  const returnTo = safeAdminReturnTo(getString(session?.returnTo), getTenantId(session?.repInfo))

  if (!session?.id) {
    return renderPage({
      title: 'Facebook connection expired',
      body: '<h1>Facebook connection expired</h1><p>Start the connection again from Payload.</p>',
      returnTo: '/admin',
    })
  }

  if (getUserId(user) !== getTenantId(session.user)) {
    return NextResponse.json({ error: 'This Facebook connection session belongs to another user.' }, { status: 403 })
  }

  const expiresAt = new Date(String(session.expiresAt || 0)).getTime()
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    await payload.delete({
      collection: 'facebook-oauth-sessions',
      id: String(session.id),
      overrideAccess: true,
      req: req as unknown as PayloadRequest,
    })
    return renderPage({
      title: 'Facebook connection expired',
      body: '<h1>Facebook connection expired</h1><p>Start the connection again from Payload.</p>',
      returnTo,
    })
  }

  const tenantId = getTenantId(session.tenant)
  if (!canManageTenant(user, tenantId)) {
    return NextResponse.json({ error: 'You do not have access to connect Facebook for this site.' }, { status: 403 })
  }

  const repInfoId = getTenantId(session.repInfo)
  const recordConnectionError = async (message: string) => {
    if (!repInfoId) return
    await payload.update({
      collection: 'rep-info',
      id: repInfoId,
      data: {
        facebookConnectionStatus: 'error',
        facebookLastError: message,
      },
      overrideAccess: true,
      req: req as unknown as PayloadRequest,
    })
  }

  if (oauthError || !code) {
    return renderPage({
      title: 'Facebook connection cancelled',
      body: `<h1>Facebook connection cancelled</h1><p>${escapeHTML(oauthError || 'No authorization code was returned.')}</p>`,
      returnTo,
    })
  }

  if (!getFacebookConfig().configured) {
    return renderPage({
      title: 'Facebook is not configured',
      body: '<h1>Facebook is not configured</h1><p>Set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET on the backend.</p>',
      returnTo,
    })
  }

  try {
    const redirectUri = getString(session.redirectUri) || getFacebookRedirectUri(req.url, req.headers)
    const shortLived = await exchangeCodeForUserToken({ code, redirectUri })
    if (!shortLived.access_token) throw new Error('Facebook did not return a user access token.')

    const longLived = await exchangeForLongLivedUserToken(shortLived.access_token)
    const userAccessToken = longLived.access_token || shortLived.access_token
    const pages = await fetchManagedPages(userAccessToken)

    await payload.update({
      collection: 'facebook-oauth-sessions',
      id: String(session.id),
      data: {
        pages: pages.map((page) => ({
          pageId: page.pageId,
          name: page.name,
          link: page.link,
          accessToken: page.accessToken,
          tasks: page.tasks.map((task) => ({ task })),
        })),
      },
      overrideAccess: true,
      req: req as unknown as PayloadRequest,
    })

    if (pages.length === 0) {
      await recordConnectionError('Meta did not return any Pages for this account.')
      return renderPage({
        title: 'No Facebook Pages found',
        body:
          '<h1>No Facebook Pages found</h1><p>Meta did not return any Pages for this account. Check that the user has full Page access and that the app has the needed Page permissions.</p>',
        returnTo,
      })
    }

    const pageForms = pages
      .map(
        (page) => `<form class="page" method="post" action="/api/facebook/oauth/select">
          <input type="hidden" name="state" value="${escapeHTML(state)}" />
          <input type="hidden" name="pageId" value="${escapeHTML(page.pageId)}" />
          <div>
            <div class="name">${escapeHTML(page.name || page.pageId)}</div>
            <div class="meta">${escapeHTML(page.link || page.pageId)}</div>
          </div>
          <button type="submit">Use this Page</button>
        </form>`,
      )
      .join('')

    return renderPage({
      title: 'Choose Facebook Page',
      body: `<h1>Choose a Facebook Page</h1><p>Select the Page that should power this tenant’s public Facebook feed.</p>${pageForms}`,
      returnTo,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Facebook connection failed.'
    await recordConnectionError(message)
    payload.logger.error({ err: error }, 'Facebook OAuth callback failed')
    return renderPage({
      title: 'Facebook connection failed',
      body: `<h1>Facebook connection failed</h1><p>${escapeHTML(message)}</p>`,
      returnTo,
    })
  }
}
