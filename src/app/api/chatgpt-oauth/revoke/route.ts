import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { hashOAuthToken } from '@/lib/chatgpt-oauth'

type RevokeParams = Record<string, string | undefined>

function corsHeaders() {
  return {
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Origin': '*',
  }
}

async function readRevokeParams(req: Request): Promise<RevokeParams> {
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

export async function POST(req: Request): Promise<Response> {
  const params = await readRevokeParams(req)
  const token = params.token?.trim()

  if (!token) {
    return new Response(null, { headers: corsHeaders(), status: 200 })
  }

  const payload = await getPayload({ config: configPromise })
  const secret = payload.secret || process.env.PAYLOAD_SECRET || ''
  const tokenHash = hashOAuthToken(token, secret)
  const result = await payload.find({
    collection: 'chatgpt-oauth-tokens',
    depth: 0,
    limit: 10,
    overrideAccess: true,
    where: {
      or: [
        {
          accessTokenHash: {
            equals: tokenHash,
          },
        },
        {
          refreshTokenHash: {
            equals: tokenHash,
          },
        },
      ],
    },
  })

  await Promise.all(
    result.docs.map((doc) =>
      payload.update({
        collection: 'chatgpt-oauth-tokens',
        id: doc.id,
        data: {
          revokedAt: new Date().toISOString(),
        },
        overrideAccess: true,
      }),
    ),
  )

  return new Response(null, { headers: corsHeaders(), status: 200 })
}

export function OPTIONS() {
  return new Response(null, {
    headers: corsHeaders(),
    status: 204,
  })
}
