import { getClientSideURL } from './getURL'

const EXTERNAL_MEDIA_REGEX = /^https?:\/\//i

export function isExternalMediaUrl(url: string): boolean {
  return EXTERNAL_MEDIA_REGEX.test(url)
}

export type MediaWithFocal = {
  url?: string | null
  alt?: string | null
  focalX?: number | null
  focalY?: number | null
}

type MediaNormalizationSource = {
  url?: unknown
  alt?: unknown
  focalX?: unknown
  focalY?: unknown
  mimeType?: unknown
  updatedAt?: unknown
  width?: unknown
  height?: unknown
}

export type NormalizedMedia = MediaWithFocal & {
  mimeType?: string | null
  updatedAt?: string
  width?: number | null
  height?: number | null
}

export function resolveMediaUrl(url?: string | null): string | undefined {
  if (!url) return undefined
  if (isExternalMediaUrl(url)) return url
  return url
}

export function resolveAbsoluteMediaUrl(url?: string | null, origin = getClientSideURL()): string | undefined {
  if (!url) return undefined
  if (isExternalMediaUrl(url)) return url

  const normalizedOrigin = origin.replace(/\/+$/, '')
  if (!normalizedOrigin) return url

  return `${normalizedOrigin}${url.startsWith('/') ? '' : '/'}${url}`
}

export function appendMediaCacheTag(url?: string | null, cacheTag?: string | null): string | undefined {
  if (!url) return undefined

  const tag = typeof cacheTag === 'string' ? cacheTag.trim() : ''
  if (!tag) return url

  try {
    const isExternal = isExternalMediaUrl(url)
    const parsed = isExternal ? new URL(url) : new URL(url, 'http://media.local')
    parsed.searchParams.set('v', tag)

    if (isExternal) {
      return parsed.toString()
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(tag)}`
  }
}

export function normalizeMediaResource(media: unknown): NormalizedMedia | null {
  if (!media || typeof media !== 'object' || !('url' in media)) {
    return null
  }

  const source = media as MediaNormalizationSource
  const rawUrl = typeof source.url === 'string' ? source.url : null
  const updatedAt = typeof source.updatedAt === 'string' ? source.updatedAt : undefined
  const resolvedUrl = rawUrl ? resolveMediaUrl(rawUrl) ?? rawUrl : null

  return {
    url: resolvedUrl ? appendMediaCacheTag(resolvedUrl, updatedAt) ?? resolvedUrl : null,
    alt: typeof source.alt === 'string' ? source.alt : null,
    focalX: typeof source.focalX === 'number' ? source.focalX : null,
    focalY: typeof source.focalY === 'number' ? source.focalY : null,
    mimeType: typeof source.mimeType === 'string' ? source.mimeType : null,
    updatedAt,
    width: typeof source.width === 'number' ? source.width : null,
    height: typeof source.height === 'number' ? source.height : null,
  }
}

/**
 * Convert Payload media focal point to CSS object-position string.
 * Payload stores focalX / focalY typically as percentages 0-100.
 */
export function getObjectPositionFromFocal(media?: Partial<MediaWithFocal> | null): string | undefined {
  if (!media) return undefined
  const { focalX, focalY } = media as { focalX?: number | null; focalY?: number | null }
  if (typeof focalX === 'number' && typeof focalY === 'number') {
    const toPct = (n: number) => {
      // If values look like 0..1, convert to 0..100
      const v = n >= 0 && n <= 1 ? n * 100 : n
      const clamped = Math.max(0, Math.min(100, v))
      return clamped
    }
    const x = toPct(focalX)
    const y = toPct(focalY)
    return `${x}% ${y}%`
  }
  return undefined
}
