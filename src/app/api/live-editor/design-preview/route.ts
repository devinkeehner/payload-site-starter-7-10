import config from '@payload-config'
import { getPayload } from 'payload'
import { takeDesignSitePreview } from '@/lib/live-editor/designSitePreview'

export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' }

export async function POST(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer ([\w-]{43})$/)?.[1]
  if (!token) return new Response(null, { status: 404, headers })
  const snapshot = await takeDesignSitePreview(await getPayload({ config }), token)
  return snapshot ? Response.json(snapshot, { headers }) : new Response(null, { status: 404, headers })
}
