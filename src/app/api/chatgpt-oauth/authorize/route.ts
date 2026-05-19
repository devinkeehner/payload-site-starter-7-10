import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'

import {
  CHATGPT_AUTH_CODE_TTL_SECONDS,
  expiresIn,
  findClientByClientId,
  formatScope,
  getChatgptMcpResourceURL,
  hashOAuthToken,
  isAllowedRedirectURI,
  parseScope,
  randomToken,
} from '@/lib/chatgpt-oauth'
import { canAccessCollection } from '@/lib/access/roles'

function redirectWithOAuthError(redirectURI: string, error: string, state?: string | null) {
  const target = new URL(redirectURI)
  target.searchParams.set('error', error)
  if (state) target.searchParams.set('state', state)
  return Response.redirect(target, 302)
}

function redirectToLogin(req: Request) {
  const current = new URL(req.url)
  const login = new URL('/admin/login', current.origin)
  login.searchParams.set('redirect', `${current.pathname}${current.search}`)
  return Response.redirect(login, 302)
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const responseType = url.searchParams.get('response_type')
  const clientId = url.searchParams.get('client_id')?.trim()
  const redirectURI = url.searchParams.get('redirect_uri')?.trim()
  const codeChallenge = url.searchParams.get('code_challenge')?.trim()
  const codeChallengeMethod = url.searchParams.get('code_challenge_method')?.trim()
  const state = url.searchParams.get('state')
  const requestedResource = url.searchParams.get('resource')?.trim()
  const expectedResource = getChatgptMcpResourceURL(req)

  if (!clientId || !redirectURI) {
    return Response.json({ error: 'invalid_request' }, { status: 400 })
  }

  const payloadReq = await createPayloadRequest({
    canSetHeaders: false,
    config: configPromise,
    request: req,
  })
  const payload = payloadReq.payload
  const client = await findClientByClientId(payload, clientId)

  if (!client || !isAllowedRedirectURI(client, redirectURI)) {
    return Response.json({ error: 'invalid_client' }, { status: 400 })
  }

  if (
    responseType !== 'code' ||
    !codeChallenge ||
    codeChallengeMethod !== 'S256' ||
    (requestedResource && requestedResource !== expectedResource)
  ) {
    return redirectWithOAuthError(redirectURI, 'invalid_request', state)
  }

  if (!payloadReq.user) {
    return redirectToLogin(req)
  }

  if (!canAccessCollection(payloadReq.user, 'pages')) {
    return redirectWithOAuthError(redirectURI, 'access_denied', state)
  }

  const code = randomToken(32)
  const secret = payload.secret || process.env.PAYLOAD_SECRET || ''
  const scopes = parseScope(url.searchParams.get('scope'))

  await payload.create({
    collection: 'chatgpt-oauth-codes',
    data: {
      client: client.id,
      codeChallenge,
      codeHash: hashOAuthToken(code, secret),
      expiresAt: expiresIn(CHATGPT_AUTH_CODE_TTL_SECONDS),
      redirectUri: redirectURI,
      resource: expectedResource,
      scope: formatScope(scopes),
      user: payloadReq.user.id,
    },
    overrideAccess: true,
  })

  const target = new URL(redirectURI)
  target.searchParams.set('code', code)
  if (state) target.searchParams.set('state', state)

  return Response.redirect(target, 302)
}
