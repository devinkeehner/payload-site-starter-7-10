import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { randomToken } from '@/lib/chatgpt-oauth'

type RegistrationBody = {
  client_name?: string
  grant_types?: string[]
  redirect_uris?: string[]
  response_types?: string[]
  token_endpoint_auth_method?: string
  [key: string]: unknown
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Origin': '*',
  }
}

function isValidRedirectURI(uri: string): boolean {
  try {
    const parsed = new URL(uri)
    return parsed.protocol === 'https:' || parsed.hostname === 'localhost'
  } catch {
    return false
  }
}

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as RegistrationBody | null
  const redirectUris = Array.isArray(body?.redirect_uris)
    ? body.redirect_uris.filter((uri): uri is string => typeof uri === 'string' && isValidRedirectURI(uri))
    : []

  if (redirectUris.length === 0) {
    return Response.json(
      { error: 'invalid_client_metadata', error_description: 'redirect_uris is required.' },
      { headers: corsHeaders(), status: 400 },
    )
  }

  const payload = await getPayload({ config: configPromise })
  const clientId = `chatgpt_${randomToken(24)}`
  const clientName =
    typeof body?.client_name === 'string' && body.client_name.trim()
      ? body.client_name.trim()
      : 'ChatGPT Connector'

  await payload.create({
    collection: 'chatgpt-oauth-clients',
    data: {
      clientId,
      clientName,
      redirectUris: redirectUris.map((uri) => ({ uri })),
      rawMetadata: body || {},
    },
    overrideAccess: true,
  })

  return Response.json(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: clientName,
      grant_types: ['authorization_code', 'refresh_token'],
      redirect_uris: redirectUris,
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    },
    { headers: corsHeaders(), status: 201 },
  )
}

export function OPTIONS() {
  return new Response(null, {
    headers: corsHeaders(),
    status: 204,
  })
}
