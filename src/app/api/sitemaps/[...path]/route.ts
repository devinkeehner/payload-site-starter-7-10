import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { getSitemapArtifact } from '@/lib/sitemaps'

const cacheHeaders = {
  'Content-Type': 'application/xml; charset=utf-8',
  'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const resolvedParams = await params
  const pathSegments = Array.isArray(resolvedParams.path) ? resolvedParams.path : []
  const key = pathSegments.join('/').replace(/^\/+/, '')

  if (!key) {
    return new Response('Not found', { status: 404 })
  }

  const payload = await getPayload({ config: configPromise })
  const artifact = await getSitemapArtifact(payload, key, false)

  if (!artifact?.xml) {
    return new Response('Not found', { status: 404 })
  }

  return new Response(artifact.xml, {
    status: 200,
    headers: cacheHeaders,
  })
}
