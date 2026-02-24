import type { NextRequest } from 'next/server'

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'host',
])

function isAuthorizedPathSecret(secret: string) {
  const configured = process.env.PAYLOAD_MCP_PUBLIC_SECRET || ''
  if (!configured) return false
  return secret === configured
}

function getForwardHeaders(req: NextRequest) {
  const headers = new Headers()

  const accept = req.headers.get('accept')
  const contentType = req.headers.get('content-type')
  const lastEventId = req.headers.get('last-event-id')
  const mcpSessionId = req.headers.get('mcp-session-id')

  if (accept) headers.set('accept', accept)
  if (contentType) headers.set('content-type', contentType)
  if (lastEventId) headers.set('last-event-id', lastEventId)
  if (mcpSessionId) headers.set('mcp-session-id', mcpSessionId)

  const mcpApiKey = process.env.PAYLOAD_MCP_API_KEY || ''
  if (mcpApiKey) {
    headers.set('authorization', `Bearer ${mcpApiKey}`)
  }

  return headers
}

function buildResponseHeaders(upstream: Response) {
  const headers = new Headers()

  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value)
    }
  })

  return headers
}

async function forwardToMcp(req: NextRequest) {
  const upstreamURL = new URL('/api/mcp', req.nextUrl.origin)

  const headers = getForwardHeaders(req)
  const method = req.method.toUpperCase()
  const body = method === 'POST' ? await req.text() : undefined

  const upstream = await fetch(upstreamURL.toString(), {
    method,
    headers,
    body,
    cache: 'no-store',
  })

  return new Response(upstream.body, {
    status: upstream.status,
    headers: buildResponseHeaders(upstream),
  })
}

function requireEnabled() {
  if (process.env.PAYLOAD_ENABLE_MCP !== 'true') {
    return new Response(JSON.stringify({ message: 'MCP is disabled' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    })
  }

  if (!(process.env.PAYLOAD_MCP_API_KEY || '').trim()) {
    return new Response(JSON.stringify({ message: 'MCP proxy is not configured' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    })
  }

  return null
}

export async function GET(req: NextRequest, context: { params: { secret: string } }) {
  const guard = requireEnabled()
  if (guard) return guard

  const { secret } = context.params
  if (!isAuthorizedPathSecret(secret)) {
    return new Response(JSON.stringify({ message: 'Not found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    })
  }

  return forwardToMcp(req)
}

export async function POST(req: NextRequest, context: { params: { secret: string } }) {
  const guard = requireEnabled()
  if (guard) return guard

  const { secret } = context.params
  if (!isAuthorizedPathSecret(secret)) {
    return new Response(JSON.stringify({ message: 'Not found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    })
  }

  return forwardToMcp(req)
}
