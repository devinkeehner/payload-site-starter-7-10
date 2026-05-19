import configPromise from '@payload-config'
import { getPayload } from 'payload'

import {
  CHATGPT_ACCESS_TOKEN_TTL_SECONDS,
  CHATGPT_REFRESH_TOKEN_TTL_SECONDS,
  type ChatgptOAuthClientDoc,
  type ChatgptOAuthCodeDoc,
  type ChatgptOAuthTokenDoc,
  expiresIn,
  findClientByClientId,
  formatScope,
  hashOAuthToken,
  isAllowedRedirectURI,
  isExpired,
  parseScope,
  randomToken,
  verifyPkceChallenge,
} from '@/lib/chatgpt-oauth'
import { canAccessCollection } from '@/lib/access/roles'

type TokenParams = Record<string, string | undefined>

function corsHeaders() {
  return {
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Origin': '*',
  }
}

async function readTokenParams(req: Request): Promise<TokenParams> {
  const contentType = req.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(body).map(([key, value]) => [key, typeof value === 'string' ? value : undefined]),
    )
  }

  const form = await req.formData()
  return Object.fromEntries(
    Array.from(form.entries()).map(([key, value]) => [key, typeof value === 'string' ? value : undefined]),
  )
}

function oauthError(error: string, description: string, status = 400) {
  return Response.json(
    { error, error_description: description },
    {
      headers: corsHeaders(),
      status,
    },
  )
}

function relationshipId(value: unknown): string | null {
  if (!value) return null
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: string | number | null }).id
    return id == null ? null : String(id)
  }
  return null
}

async function issueTokenSet({
  client,
  payload,
  resource,
  scope,
  userId,
}: {
  client: ChatgptOAuthClientDoc
  payload: Awaited<ReturnType<typeof getPayload>>
  resource: string
  scope: string
  userId: string
}) {
  const accessToken = randomToken(32)
  const refreshToken = randomToken(32)
  const secret = payload.secret || process.env.PAYLOAD_SECRET || ''

  await payload.create({
    collection: 'chatgpt-oauth-tokens',
    data: {
      accessTokenExpiresAt: expiresIn(CHATGPT_ACCESS_TOKEN_TTL_SECONDS),
      accessTokenHash: hashOAuthToken(accessToken, secret),
      client: client.id,
      refreshTokenExpiresAt: expiresIn(CHATGPT_REFRESH_TOKEN_TTL_SECONDS),
      refreshTokenHash: hashOAuthToken(refreshToken, secret),
      resource,
      scope,
      user: userId,
    },
    overrideAccess: true,
  })

  return {
    access_token: accessToken,
    expires_in: CHATGPT_ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refreshToken,
    scope,
    token_type: 'Bearer',
  }
}

async function exchangeAuthorizationCode(params: TokenParams) {
  const clientId = params.client_id?.trim()
  const code = params.code?.trim()
  const redirectURI = params.redirect_uri?.trim()
  const codeVerifier = params.code_verifier?.trim()

  if (!clientId || !code || !redirectURI || !codeVerifier) {
    return oauthError('invalid_request', 'client_id, code, redirect_uri, and code_verifier are required.')
  }

  const payload = await getPayload({ config: configPromise })
  const client = await findClientByClientId(payload, clientId)
  if (!client || !isAllowedRedirectURI(client, redirectURI)) {
    return oauthError('invalid_grant', 'Invalid client or redirect_uri.')
  }

  const secret = payload.secret || process.env.PAYLOAD_SECRET || ''
  const codeHash = hashOAuthToken(code, secret)
  const codeResult = await payload.find({
    collection: 'chatgpt-oauth-codes',
    depth: 1,
    limit: 1,
    overrideAccess: true,
    where: {
      codeHash: {
        equals: codeHash,
      },
    },
  })
  const codeDoc = codeResult.docs[0] as ChatgptOAuthCodeDoc | undefined

  if (
    !codeDoc ||
    codeDoc.consumedAt ||
    isExpired(codeDoc.expiresAt) ||
    relationshipId(codeDoc.client) !== client.id ||
    codeDoc.redirectUri !== redirectURI ||
    !codeDoc.codeChallenge ||
    !verifyPkceChallenge(codeVerifier, codeDoc.codeChallenge)
  ) {
    return oauthError('invalid_grant', 'Invalid or expired authorization code.')
  }

  await payload.update({
    collection: 'chatgpt-oauth-codes',
    id: codeDoc.id,
    data: {
      consumedAt: new Date().toISOString(),
    },
    overrideAccess: true,
  })

  const userId = relationshipId(codeDoc.user)
  if (!userId || !codeDoc.resource || !codeDoc.scope) {
    return oauthError('invalid_grant', 'Authorization code is incomplete.')
  }

  const tokenSet = await issueTokenSet({
    client,
    payload,
    resource: codeDoc.resource,
    scope: formatScope(parseScope(codeDoc.scope)),
    userId,
  })

  return Response.json(tokenSet, { headers: corsHeaders() })
}

async function exchangeRefreshToken(params: TokenParams) {
  const clientId = params.client_id?.trim()
  const refreshToken = params.refresh_token?.trim()

  if (!clientId || !refreshToken) {
    return oauthError('invalid_request', 'client_id and refresh_token are required.')
  }

  const payload = await getPayload({ config: configPromise })
  const client = await findClientByClientId(payload, clientId)
  if (!client) {
    return oauthError('invalid_grant', 'Invalid client.')
  }

  const secret = payload.secret || process.env.PAYLOAD_SECRET || ''
  const refreshTokenHash = hashOAuthToken(refreshToken, secret)
  const tokenResult = await payload.find({
    collection: 'chatgpt-oauth-tokens',
    depth: 1,
    limit: 1,
    overrideAccess: true,
    where: {
      refreshTokenHash: {
        equals: refreshTokenHash,
      },
    },
  })
  const tokenDoc = tokenResult.docs[0] as ChatgptOAuthTokenDoc | undefined

  if (
    !tokenDoc ||
    tokenDoc.revokedAt ||
    isExpired(tokenDoc.refreshTokenExpiresAt) ||
    relationshipId(tokenDoc.client) !== client.id
  ) {
    return oauthError('invalid_grant', 'Invalid or expired refresh token.')
  }

  await payload.update({
    collection: 'chatgpt-oauth-tokens',
    id: tokenDoc.id,
    data: {
      revokedAt: new Date().toISOString(),
    },
    overrideAccess: true,
  })

  const userId = relationshipId(tokenDoc.user)
  const user = tokenDoc.user && typeof tokenDoc.user === 'object' ? tokenDoc.user : null
  if (!userId || !user || !canAccessCollection(user, 'pages') || !tokenDoc.resource || !tokenDoc.scope) {
    return oauthError('invalid_grant', 'Refresh token is incomplete.')
  }

  const tokenSet = await issueTokenSet({
    client,
    payload,
    resource: tokenDoc.resource,
    scope: formatScope(parseScope(tokenDoc.scope)),
    userId,
  })

  return Response.json(tokenSet, { headers: corsHeaders() })
}

export async function POST(req: Request): Promise<Response> {
  const params = await readTokenParams(req)

  if (params.grant_type === 'authorization_code') {
    return exchangeAuthorizationCode(params)
  }

  if (params.grant_type === 'refresh_token') {
    return exchangeRefreshToken(params)
  }

  return oauthError('unsupported_grant_type', 'Only authorization_code and refresh_token are supported.')
}

export function OPTIONS() {
  return new Response(null, {
    headers: corsHeaders(),
    status: 204,
  })
}
