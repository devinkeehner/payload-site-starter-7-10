import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import type { PayloadRequest } from 'payload'
import configPromise from '@payload-config'

import {
  appSecretProof,
  getFacebookConfig,
  getString,
  normalizeGraphVersion,
  sanitizePageIdentifier,
} from '@/lib/facebook'

export const runtime = 'nodejs'
export const revalidate = 300

const fields = [
  'id',
  'message',
  'permalink_url',
  'created_time',
  'full_picture',
  'attachments{media_type,media_url,type,url,target}',
].join(',')

const jsonError = (error: string, status: number) =>
  NextResponse.json({ error }, { status, headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=120' } })

const fetchFacebook = async <T>(url: URL): Promise<T> => {
  const response = await fetch(url.toString(), { next: { revalidate: 300 } })
  const text = await response.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }

  if (!response.ok) {
    const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
    const errorRecord =
      record.error && typeof record.error === 'object' ? (record.error as Record<string, unknown>) : {}
    const message =
      (typeof errorRecord.message === 'string' && errorRecord.message) ||
      (typeof body === 'string' && body) ||
      `Facebook request failed with status ${response.status}.`
    throw new Error(message)
  }

  return body as T
}

export async function GET(req: NextRequest) {
  const tenantSlug = req.nextUrl.searchParams.get('tenant') || 'main'
  const graphVersion = normalizeGraphVersion(req.nextUrl.searchParams.get('version'))
  const payload = await getPayload({ config: configPromise })

  const repInfoResult = await payload.find({
    collection: 'rep-info',
    where: { 'tenant.slug': { equals: tenantSlug } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
    req: req as unknown as PayloadRequest,
  })
  const repInfo = repInfoResult.docs?.[0] as Record<string, unknown> | undefined

  if (!repInfo) return jsonError('Facebook feed is not configured for this tenant.', 404)

  const token = getString(repInfo.facebookPageAccessToken)
  const rawPage = getString(repInfo.facebookPageId) || getString(repInfo.facebook) || ''
  const page = sanitizePageIdentifier(rawPage)
  if (!token || !page) return jsonError('Facebook feed is not connected for this tenant.', 404)

  const { appSecret } = getFacebookConfig()
  const proof = appSecret ? appSecretProof(token, appSecret) : undefined

  try {
    const feedParams = new URLSearchParams({ fields, limit: '25', access_token: token })
    if (proof) feedParams.set('appsecret_proof', proof)
    const feedUrl = new URL(`https://graph.facebook.com/${graphVersion}/${encodeURIComponent(page)}/posts`)
    feedParams.forEach((value, key) => feedUrl.searchParams.set(key, value))

    const posts = await fetchFacebook<Record<string, unknown>>(feedUrl)

    let pageInfo: { name?: string; link?: string; avatarUrl?: string } | undefined
    try {
      const pageInfoParams = new URLSearchParams({
        fields: 'name,link,picture.type(large){url}',
        access_token: token,
      })
      if (proof) pageInfoParams.set('appsecret_proof', proof)
      const pageInfoUrl = new URL(`https://graph.facebook.com/${graphVersion}/${encodeURIComponent(page)}`)
      pageInfoParams.forEach((value, key) => pageInfoUrl.searchParams.set(key, value))

      const response = await fetchFacebook<Record<string, unknown>>(pageInfoUrl)
      const picture =
        response.picture && typeof response.picture === 'object'
          ? (response.picture as Record<string, unknown>)
          : {}
      const pictureData =
        picture.data && typeof picture.data === 'object'
          ? (picture.data as Record<string, unknown>)
          : {}
      pageInfo = {
        name: getString(response.name),
        link: getString(response.link),
        avatarUrl: getString(pictureData.url),
      }
    } catch {
      pageInfo = undefined
    }

    return NextResponse.json(pageInfo ? { ...posts, pageInfo } : posts, {
      headers: {
        'Cache-Control': 's-maxage=300, stale-while-revalidate=600',
        'Content-Type': 'application/json; charset=utf-8',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Facebook fetch failed.'
    payload.logger.warn({ err: error, tenantSlug, page }, 'Facebook feed fetch failed')
    return jsonError(message, 502)
  }
}
