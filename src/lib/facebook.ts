import { createHmac, randomBytes } from 'crypto'
import type { Payload, PayloadRequest } from 'payload'

import { isSuperUser } from '@/lib/access/isSuperUser'

export const FACEBOOK_SESSION_TTL_MS = 15 * 60 * 1000

export type UserRecord = Record<string, unknown>
export type RepInfoRecord = Record<string, unknown>
export type FacebookPageChoice = {
  pageId: string
  name?: string
  link?: string
  accessToken: string
  tasks: string[]
}

export const getString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined

export const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}

export const normalizeGraphVersion = (version?: string | null): string => {
  const raw = (version || process.env.FACEBOOK_GRAPH_API_VERSION || 'v22.0').trim()
  if (!raw) return 'v22.0'
  return raw.startsWith('v') ? raw : `v${raw}`
}

export const getFacebookConfig = () => {
  const appId = process.env.FACEBOOK_APP_ID || process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || ''
  const appSecret = process.env.FACEBOOK_APP_SECRET || ''
  const graphVersion = normalizeGraphVersion()

  return {
    appId,
    appSecret,
    graphVersion,
    configured: Boolean(appId && appSecret),
  }
}

export const getServerOrigin = (requestUrl: string) => {
  const explicit =
    process.env.PAYLOAD_PUBLIC_SERVER_URL ||
    process.env.NEXT_PUBLIC_PAYLOAD_URL ||
    process.env.PAYLOAD_SERVER_URL ||
    ''
  if (explicit) return explicit.replace(/\/+$/, '')
  return new URL(requestUrl).origin
}

export const getFacebookRedirectUri = (requestUrl: string) =>
  `${getServerOrigin(requestUrl)}/api/facebook/oauth/callback`

export const getTenantId = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value
  const record = asRecord(value)
  return getString(record.id) || getString(record.value)
}

export const getTenantSlug = (value: unknown): string | undefined => {
  const record = asRecord(value)
  return getString(record.slug)
}

export const getUserId = (user: unknown): string | undefined => {
  const record = asRecord(user)
  return getString(record.id)
}

export const userTenantIds = (user: unknown): string[] => {
  const tenants = asRecord(user).tenants
  if (!Array.isArray(tenants)) return []

  return tenants
    .map((entry) => getTenantId(asRecord(entry).tenant))
    .filter((tenantId): tenantId is string => Boolean(tenantId))
}

export const canManageTenant = (user: unknown, tenantId?: string | null): boolean => {
  if (isSuperUser(user)) return true
  if (!tenantId) return false
  return userTenantIds(user).includes(tenantId)
}

export const authenticatePayloadUser = async (payload: Payload, req: Request): Promise<UserRecord | null> => {
  try {
    const authResult = await payload.auth({
      req: req as unknown as PayloadRequest,
      headers: req.headers,
    })
    const maybeRecord = asRecord(authResult)
    const user = 'user' in maybeRecord ? maybeRecord.user : authResult
    return user && typeof user === 'object' ? (user as UserRecord) : null
  } catch (error) {
    payload.logger.error({ err: error }, 'Facebook auth lookup failed')
    return null
  }
}

export const getRepInfoForUser = async ({
  payload,
  req,
  repInfoId,
  user,
}: {
  payload: Payload
  req: PayloadRequest
  repInfoId: string
  user: unknown
}): Promise<{ repInfo: RepInfoRecord; tenantId?: string; tenantSlug?: string } | { error: string; status: number }> => {
  if (!repInfoId) return { error: 'Missing repInfoId.', status: 400 }

  let repInfo: RepInfoRecord
  try {
    repInfo = (await payload.findByID({
      collection: 'rep-info',
      id: repInfoId,
      depth: 1,
      overrideAccess: true,
      req,
    })) as unknown as RepInfoRecord
  } catch {
    return { error: 'Rep info not found.', status: 404 }
  }

  const tenantId = getTenantId(repInfo.tenant)
  const tenantSlug = getTenantSlug(repInfo.tenant)
  if (!canManageTenant(user, tenantId)) {
    return { error: 'You do not have access to connect Facebook for this site.', status: 403 }
  }

  return { repInfo, tenantId, tenantSlug }
}

export const makeState = () => randomBytes(24).toString('hex')

export const appSecretProof = (token: string, appSecret: string) =>
  createHmac('sha256', appSecret).update(token).digest('hex')

export const sanitizePageIdentifier = (input: string): string => {
  let value = input.trim()
  if (!value) return value
  if (value.startsWith('@')) value = value.slice(1)
  if (/facebook\.com/i.test(value)) {
    try {
      const url = new URL(value.startsWith('http') ? value : `https://${value}`)
      if (url.pathname === '/profile.php' || url.pathname.endsWith('/profile.php')) {
        const id = url.searchParams.get('id')
        if (id) return id
      }
      const parts = url.pathname.split('/').filter(Boolean)
      if (parts.length > 0) value = parts[parts.length - 1] || value
    } catch {
      // Keep the original value.
    }
  }
  return value
}

export const graphGet = async <T>(path: string, params: Record<string, string>): Promise<T> => {
  const { graphVersion } = getFacebookConfig()
  const url = new URL(`https://graph.facebook.com/${graphVersion}/${path.replace(/^\/+/, '')}`)
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value)
  }

  const response = await fetch(url.toString())
  const text = await response.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }

  if (!response.ok) {
    const message =
      getString(asRecord(asRecord(body).error).message) ||
      getString(asRecord(body).error) ||
      `Facebook request failed with status ${response.status}.`
    throw new Error(message)
  }

  return body as T
}

export const exchangeCodeForUserToken = async ({
  code,
  redirectUri,
}: {
  code: string
  redirectUri: string
}) => {
  const { appId, appSecret } = getFacebookConfig()
  return graphGet<{ access_token?: string; token_type?: string; expires_in?: number }>('oauth/access_token', {
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  })
}

export const exchangeForLongLivedUserToken = async (shortLivedToken: string) => {
  const { appId, appSecret } = getFacebookConfig()
  return graphGet<{ access_token?: string; token_type?: string; expires_in?: number }>('oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken,
  })
}

export const fetchManagedPages = async (userAccessToken: string): Promise<FacebookPageChoice[]> => {
  const result = await graphGet<{
    data?: Array<{
      id?: string
      name?: string
      link?: string
      access_token?: string
      tasks?: string[]
    }>
  }>('me/accounts', {
    fields: 'id,name,link,access_token,tasks',
    access_token: userAccessToken,
  })

  return (result.data || [])
    .map((page) => ({
      pageId: getString(page.id) || '',
      name: getString(page.name),
      link: getString(page.link),
      accessToken: getString(page.access_token) || '',
      tasks: Array.isArray(page.tasks) ? page.tasks.filter((task): task is string => typeof task === 'string') : [],
    }))
    .filter((page) => page.pageId && page.accessToken)
}

export const safeAdminReturnTo = (returnTo: string | null | undefined, repInfoId?: string) => {
  if (returnTo?.startsWith('/admin/')) return returnTo
  return repInfoId ? `/admin/collections/rep-info/${encodeURIComponent(repInfoId)}` : '/admin'
}
