import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto'
import type { PayloadRequest } from 'payload'

import { canAccessCollection } from '@/lib/access/roles'
import { getServerSideURL } from '@/lib/utilities/getURL'

export const CHATGPT_OAUTH_SCOPES = ['cms:read', 'cms:write'] as const
export const CHATGPT_ACCESS_TOKEN_TTL_SECONDS = 60 * 60
export const CHATGPT_REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30
export const CHATGPT_AUTH_CODE_TTL_SECONDS = 60 * 5

export type ChatgptOAuthScope = (typeof CHATGPT_OAUTH_SCOPES)[number]

export type ChatgptOAuthClientDoc = {
  id: string
  clientId?: string | null
  clientName?: string | null
  redirectUris?: Array<{ id?: string | null; uri?: string | null }> | null
}

export type ChatgptOAuthCodeDoc = {
  id: string
  client?: string | ChatgptOAuthClientDoc | null
  codeChallenge?: string | null
  consumedAt?: string | null
  expiresAt?: string | null
  redirectUri?: string | null
  resource?: string | null
  scope?: string | null
  user?: string | { id?: string | number; email?: string | null; role?: string | null } | null
}

export type ChatgptOAuthTokenDoc = {
  id: string
  accessTokenExpiresAt?: string | null
  client?: string | ChatgptOAuthClientDoc | null
  refreshTokenExpiresAt?: string | null
  resource?: string | null
  revokedAt?: string | null
  scope?: string | null
  user?: string | { id?: string | number; email?: string | null; role?: string | null } | null
}

export type ValidChatgptAccessToken = {
  scopes: ChatgptOAuthScope[]
  token: ChatgptOAuthTokenDoc
  user: {
    id?: string | number
    email?: string | null
    role?: string | null
  }
}

const CHATGPT_ALLOWED_COLLECTIONS = [
  'pages',
  'posts',
  'bad-bills',
  'wordpress-posts',
  'media',
  'categories',
  'article-types',
  'authors',
  'tags',
  'emails',
  'email-lists',
  'contacts',
  'tenants',
  'forms',
  'site-seo',
  'rep-info',
  'standard-media',
  'navbars',
  'graphic-templates',
  'graphic-designs',
] as const

const READ_ONLY_COLLECTIONS = ['form-submissions', 'icontact-folders', 'icontact-lists'] as const

const CUSTOM_READ_TOOLS = new Set([
  'getEditingDefaults',
  'describeEntityShape',
  'listTenants',
  'findUsers',
  'getGlobal',
  'listPageBlocks',
  'getBlockShape',
  'listRichTextNodes',
  'listFormRecipientsByTitle',
  'listFormSubmissions',
  'listIContactFolders',
  'listIContactLists',
])

const CUSTOM_WRITE_TOOLS = new Set([
  'updateUsers',
  'refreshIContactCache',
  'bulkUpdateFormsByTitle',
  'bulkNormalizeContactForms',
  'reorderContactFormTailFields',
  'bulkConfigureIContactForms',
  'backfillIContactUnsynced',
  'updateGlobal',
  'shareDocumentToTenants',
  'upsertPageWithBlocks',
  'updateBlockFields',
  'publishDocument',
  'updateRichTextNodes',
  'updatePolicyVoicesSpeechBubbles',
  'updatePolicyVoicesCardLinks',
])

const toToolCollectionName = (slug: string) =>
  slug
    .split('-')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join('')

const READ_TOOL_NAMES = new Set([
  ...CHATGPT_ALLOWED_COLLECTIONS.map((slug) => `find${toToolCollectionName(slug)}`),
  ...READ_ONLY_COLLECTIONS.map((slug) => `find${toToolCollectionName(slug)}`),
  ...CUSTOM_READ_TOOLS,
])

const WRITE_TOOL_NAMES = new Set([
  ...CHATGPT_ALLOWED_COLLECTIONS.flatMap((slug) => [
    `create${toToolCollectionName(slug)}`,
    `update${toToolCollectionName(slug)}`,
  ]),
  ...CUSTOM_WRITE_TOOLS,
])

export function getPublicOrigin(req: Request): string {
  const forwardedHost = req.headers.get('x-forwarded-host')
  const forwardedProto = req.headers.get('x-forwarded-proto')

  if (forwardedHost) {
    const host = forwardedHost.split(',')[0]?.trim()
    const proto = forwardedProto?.split(',')[0]?.trim() || 'https'
    if (host) return `${proto}://${host}`
  }

  const forwarded = req.headers.get('forwarded')
  if (forwarded) {
    const first = forwarded.split(',')[0] || ''
    const parts = Object.fromEntries(
      first
        .split(';')
        .map((part) => part.split('=').map((value) => value.trim().replace(/^"|"$/g, '')))
        .filter((part): part is [string, string] => part.length === 2 && Boolean(part[0])),
    )
    if (parts.host) return `${parts.proto || 'https'}://${parts.host}`
  }

  try {
    return new URL(req.url).origin
  } catch {
    return getServerSideURL().replace(/\/+$/, '')
  }
}

export function getChatgptOAuthIssuer(req: Request): string {
  return getPublicOrigin(req).replace(/\/+$/, '')
}

export function getChatgptMcpResourceURL(req: Request): string {
  return `${getChatgptOAuthIssuer(req)}/api/chatgpt-mcp`
}

export function getProtectedResourceMetadataURL(req: Request): string {
  return `${getChatgptOAuthIssuer(req)}/.well-known/oauth-protected-resource`
}

export function getOAuthServerMetadata(req: Request) {
  const issuer = getChatgptOAuthIssuer(req)

  return {
    issuer,
    authorization_endpoint: `${issuer}/api/chatgpt-oauth/authorize`,
    token_endpoint: `${issuer}/api/chatgpt-oauth/token`,
    registration_endpoint: `${issuer}/api/chatgpt-oauth/register`,
    revocation_endpoint: `${issuer}/api/chatgpt-oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: CHATGPT_OAUTH_SCOPES,
  }
}

export function getProtectedResourceMetadata(req: Request) {
  return {
    resource: getChatgptMcpResourceURL(req),
    authorization_servers: [getChatgptOAuthIssuer(req)],
    bearer_methods_supported: ['header'],
    scopes_supported: CHATGPT_OAUTH_SCOPES,
  }
}

export function randomToken(byteLength = 32): string {
  return randomBytes(byteLength).toString('base64url')
}

export function hashOAuthToken(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token).digest('hex')
}

export function verifyPkceChallenge(verifier: string, challenge: string): boolean {
  const computed = createHash('sha256').update(verifier).digest('base64url')
  const computedBuffer = Buffer.from(computed)
  const challengeBuffer = Buffer.from(challenge)

  return (
    computedBuffer.length === challengeBuffer.length &&
    timingSafeEqual(computedBuffer, challengeBuffer)
  )
}

export function parseScope(scope: string | null | undefined): ChatgptOAuthScope[] {
  const requested = (scope || CHATGPT_OAUTH_SCOPES.join(' '))
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)

  const valid = requested.filter((item): item is ChatgptOAuthScope =>
    CHATGPT_OAUTH_SCOPES.includes(item as ChatgptOAuthScope),
  )

  return valid.length > 0 ? Array.from(new Set(valid)) : [...CHATGPT_OAUTH_SCOPES]
}

export function formatScope(scopes: ChatgptOAuthScope[]): string {
  return Array.from(new Set(scopes)).join(' ')
}

export function expiresIn(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString()
}

export function isExpired(value: string | null | undefined): boolean {
  if (!value) return true
  return new Date(value).getTime() <= Date.now()
}

export function getClientRedirectUris(client: ChatgptOAuthClientDoc): string[] {
  return (client.redirectUris || [])
    .map((item) => item.uri?.trim())
    .filter((item): item is string => Boolean(item))
}

export function isAllowedRedirectURI(client: ChatgptOAuthClientDoc, redirectURI: string): boolean {
  return getClientRedirectUris(client).includes(redirectURI)
}

export function isAllowedToolName(name: string, scopes: ChatgptOAuthScope[]): boolean {
  if (READ_TOOL_NAMES.has(name)) return scopes.includes('cms:read')
  if (WRITE_TOOL_NAMES.has(name)) return scopes.includes('cms:write')
  return false
}

export function filterToolsForScopes<T extends { name?: unknown }>(
  tools: T[],
  scopes: ChatgptOAuthScope[],
): T[] {
  return tools.filter(
    (tool) => typeof tool.name === 'string' && isAllowedToolName(tool.name, scopes),
  )
}

export function getToolSecuritySchemes(scopes: ChatgptOAuthScope[]) {
  return [
    {
      scopes,
      type: 'oauth2',
    },
  ]
}

export function addToolSecuritySchemes(tool: Record<string, unknown>, scopes: ChatgptOAuthScope[]) {
  const securitySchemes = getToolSecuritySchemes(scopes)
  const meta = tool._meta && typeof tool._meta === 'object' ? tool._meta : {}

  return {
    ...tool,
    securitySchemes,
    _meta: {
      ...meta,
      securitySchemes,
    },
  }
}

export async function findClientByClientId(
  payload: PayloadRequest['payload'],
  clientId: string,
): Promise<ChatgptOAuthClientDoc | null> {
  const result = await payload.find({
    collection: 'chatgpt-oauth-clients',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: {
      clientId: {
        equals: clientId,
      },
    },
  })

  return (result.docs[0] as ChatgptOAuthClientDoc | undefined) || null
}

export async function findValidAccessToken(
  payload: PayloadRequest['payload'],
  token: string,
): Promise<ValidChatgptAccessToken | null> {
  const secret = payload.secret || process.env.PAYLOAD_SECRET || ''
  const tokenHash = hashOAuthToken(token, secret)
  const result = await payload.find({
    collection: 'chatgpt-oauth-tokens',
    depth: 1,
    limit: 1,
    overrideAccess: true,
    where: {
      accessTokenHash: {
        equals: tokenHash,
      },
    },
  })

  const doc = result.docs[0] as ChatgptOAuthTokenDoc | undefined
  if (!doc || doc.revokedAt || isExpired(doc.accessTokenExpiresAt)) return null

  const user = doc.user && typeof doc.user === 'object' ? doc.user : null
  if (!user || !canAccessCollection(user, 'pages')) return null

  return {
    scopes: parseScope(doc.scope),
    token: doc,
    user,
  }
}
