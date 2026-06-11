import type { NextRequest } from 'next/server'
import sharp from 'sharp'

export const runtime = 'nodejs'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_OUTPUT_WIDTH = 1280
const STATIC_ALLOWED_HOSTS = new Set(['img.youtube.com', 'i.ytimg.com', 'media.cthousegop.com'])
const SAME_HOST_MEDIA_PATHS = ['/api/media/file/', '/media/']

function getHost(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null

  try {
    return new URL(trimmed).hostname.toLowerCase()
  } catch {
    return trimmed.split('/')[0]?.split(':')[0]?.toLowerCase() || null
  }
}

function getAllowedHosts(req: NextRequest): Set<string> {
  const allowed = new Set(STATIC_ALLOWED_HOSTS)
  allowed.add(new URL(req.url).hostname.toLowerCase())

  const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0]
  const host = req.headers.get('host')?.split(',')[0]
  const publicServerUrl = process.env.NEXT_PUBLIC_SERVER_URL
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  const r2BaseUrl = process.env.R2_PUBLIC_BASE_URL

  ;[forwardedHost, host, publicServerUrl, vercelUrl, r2BaseUrl].forEach((value) => {
    const parsed = getHost(value)
    if (parsed) allowed.add(parsed)
  })

  return allowed
}

function isSameHostMediaPath(target: URL, req: NextRequest): boolean {
  const requestHost = new URL(req.url).hostname.toLowerCase()
  const forwardedHost = getHost(req.headers.get('x-forwarded-host')?.split(',')[0])
  const host = getHost(req.headers.get('host')?.split(',')[0])
  const targetHost = target.hostname.toLowerCase()
  const isSameHost =
    targetHost === requestHost || targetHost === forwardedHost || targetHost === host

  return isSameHost && SAME_HOST_MEDIA_PATHS.some((path) => target.pathname.startsWith(path))
}

function isAllowedSource(target: URL, req: NextRequest): boolean {
  if (target.protocol !== 'http:' && target.protocol !== 'https:') return false

  const targetHost = target.hostname.toLowerCase()
  if (!getAllowedHosts(req).has(targetHost)) return false

  if (
    targetHost === 'img.youtube.com' ||
    targetHost === 'i.ytimg.com' ||
    targetHost === 'media.cthousegop.com'
  ) {
    return true
  }

  const r2Host = getHost(process.env.R2_PUBLIC_BASE_URL)
  if (r2Host && targetHost === r2Host) return true

  return isSameHostMediaPath(target, req)
}

function getPlayOverlaySvg(width: number, height: number): string {
  const minSide = Math.max(1, Math.min(width, height))
  const size = Math.max(64, Math.min(142, Math.round(minSide * 0.22)))
  const radius = size / 2
  const centerX = width / 2
  const centerY = height / 2
  const stroke = Math.max(3, Math.round(size * 0.045))
  const triangleWidth = Math.round(size * 0.28)
  const triangleHeight = Math.round(size * 0.38)
  const left = centerX - Math.round(triangleWidth * 0.32)
  const top = centerY - triangleHeight / 2
  const bottom = centerY + triangleHeight / 2
  const right = left + triangleWidth

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <circle cx="${centerX}" cy="${centerY}" r="${radius}" fill="#0b1e3a" fill-opacity="0.86" stroke="#ffffff" stroke-width="${stroke}" />
      <path d="M ${left} ${top} L ${left} ${bottom} L ${right} ${centerY} Z" fill="#ffffff" />
    </svg>
  `
}

export async function GET(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url)
  const src = searchParams.get('src')
  if (!src) return new Response('Missing src', { status: 400 })

  let target: URL
  try {
    target = new URL(src)
  } catch {
    return new Response('Invalid src', { status: 400 })
  }

  if (!isAllowedSource(target, req)) {
    return new Response('Forbidden src', { status: 403 })
  }

  try {
    const upstream = await fetch(target.toString(), {
      cache: 'force-cache',
      redirect: 'follow',
    })

    if (!upstream.ok) {
      return new Response(`Upstream error: ${upstream.status}`, { status: upstream.status })
    }

    const contentType = upstream.headers.get('content-type') || ''
    if (!contentType.toLowerCase().startsWith('image/')) {
      return new Response('Source is not an image', { status: 415 })
    }

    const contentLength = Number(upstream.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
      return new Response('Image too large', { status: 413 })
    }

    const sourceBuffer = Buffer.from(await upstream.arrayBuffer())
    if (sourceBuffer.length > MAX_IMAGE_BYTES) {
      return new Response('Image too large', { status: 413 })
    }

    const metadata = await sharp(sourceBuffer, { animated: false }).rotate().metadata()
    const outputWidth =
      metadata.width && metadata.width > MAX_OUTPUT_WIDTH ? MAX_OUTPUT_WIDTH : undefined
    const normalizedPipeline = sharp(sourceBuffer, { animated: false }).rotate()
    if (outputWidth) normalizedPipeline.resize({ width: outputWidth })

    const { data: normalized, info } = await normalizedPipeline
      .jpeg({ mozjpeg: true, quality: 88 })
      .toBuffer({ resolveWithObject: true })

    const overlay = Buffer.from(getPlayOverlaySvg(info.width, info.height))
    const output = await sharp(normalized)
      .composite([{ input: overlay, left: 0, top: 0 }])
      .jpeg({ mozjpeg: true, quality: 88 })
      .toBuffer()

    return new Response(output, {
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800',
        'Content-Type': 'image/jpeg',
      },
    })
  } catch {
    return new Response('Unable to render thumbnail', { status: 502 })
  }
}
