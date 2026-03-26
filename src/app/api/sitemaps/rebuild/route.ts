import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { regenerateAndPersistSitemaps } from '@/lib/sitemaps'

const isAuthorized = (request: Request): boolean => {
  const configuredSecret =
    process.env.SITEMAP_REBUILD_SECRET ||
    process.env.CRON_SECRET ||
    process.env.PAYLOAD_SECRET ||
    ''

  if (!configuredSecret) return false

  const authHeader = request.headers.get('authorization') || ''
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : ''
  const url = new URL(request.url)
  const querySecret = url.searchParams.get('secret') || ''

  return bearerToken === configuredSecret || querySecret === configuredSecret
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const payload = await getPayload({ config: configPromise })
  const paths = await regenerateAndPersistSitemaps(payload)

  return Response.json({
    ok: true,
    count: paths.length,
    paths,
  })
}
