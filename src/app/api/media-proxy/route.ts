import type { NextRequest } from 'next/server'

const ALLOWED_HOSTS = new Set<string>([
  'media.cthousegop.com',
])

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const urlParam = searchParams.get('url')
  if (!urlParam) {
    return new Response('Missing url', { status: 400 })
  }

  let target: URL
  try {
    target = new URL(urlParam)
  } catch {
    return new Response('Invalid url', { status: 400 })
  }

  if (!ALLOWED_HOSTS.has(target.hostname)) {
    return new Response('Forbidden host', { status: 403 })
  }

  try {
    const upstream = await fetch(target.toString(), {
      // We want fresh content in admin; tune cache if desired
      cache: 'no-store',
      // Cloudflare/R2 doesn't require special headers for public objects
      // but you can forward them if needed.
    })

    if (!upstream.ok) {
      return new Response(`Upstream error: ${upstream.status}`, { status: upstream.status })
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
    const buffer = await upstream.arrayBuffer()

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        // Small cache since these are static assets; adjust as needed
        'Cache-Control': 'public, max-age=60, s-maxage=60',
      },
    })
  } catch (_e) {
    return new Response('Proxy fetch error', { status: 502 })
  }
}
