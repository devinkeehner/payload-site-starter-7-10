import configPromise from '@payload-config'
import { getPayload, type PayloadRequest } from 'payload'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const NEXT_CSS_PATTERN = /(?:https?:\/\/[^"'<>\s]+)?\/_next\/static\/css\/[^"'<>\s\]]+?\.css(?:\?[^"'<>\s\]]*)?/g

function getFrontendOrigin(): string | null {
  const configured = process.env.PREVIEW_FRONTEND_ORIGIN
    || process.env.NEXT_PUBLIC_SITE_URL
    || process.env.FRONTEND_SERVER_URL
    || ''

  if (!configured) return null
  try {
    const url = new URL(configured)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null
  } catch {
    return null
  }
}

function readPreviewAssets(html: string, origin: string) {
  const hrefs = new Set<string>()
  const linkTags = html.match(/<link\b[^>]*>/gi) || []

  linkTags.forEach((tag) => {
    if (!/\brel\s*=\s*["'][^"']*stylesheet/i.test(tag)) return
    const match = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)
    if (!match?.[1] || !match[1].includes('/_next/static/css/')) return
    hrefs.add(new URL(match[1], origin).toString())
  })

  for (const match of html.matchAll(NEXT_CSS_PATTERN)) {
    if (match[0]) hrefs.add(new URL(match[0], origin).toString())
  }

  const bodyTag = html.match(/<body\b[^>]*>/i)?.[0] || ''
  const bodyStyle = bodyTag.match(/\bstyle\s*=\s*["']([^"']*)["']/i)?.[1]

  return { bodyStyle: bodyStyle || undefined, hrefs: Array.from(hrefs) }
}

export async function GET(req: Request): Promise<Response> {
  const payload = await getPayload({ config: configPromise })
  const user = await payload.auth({ headers: req.headers, req: req as unknown as PayloadRequest })
  if (!user) return Response.json({ message: 'Unauthorized' }, { status: 401 })

  const origin = getFrontendOrigin()
  if (!origin) return Response.json({ hrefs: [] })

  try {
    const response = await fetch(origin, {
      cache: 'no-store',
      headers: { Accept: 'text/html' },
    })
    if (!response.ok) return Response.json({ hrefs: [] })
    return Response.json(readPreviewAssets(await response.text(), origin))
  } catch (error) {
    payload.logger.warn({ err: error }, 'Unable to load frontend styles for the Post builder preview')
    return Response.json({ hrefs: [] })
  }
}
