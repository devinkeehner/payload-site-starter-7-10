import { isSuperUser } from '@/lib/access/isSuperUser'
import { TinyURLError, destinationValue } from './client'
export function relationshipID(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string')
    return value.id
  return undefined
}
export function siteIDs(user: unknown): string[] {
  if (!user || typeof user !== 'object' || !('tenants' in user) || !Array.isArray(user.tenants))
    return []
  return user.tenants
    .map((entry) => relationshipID(entry?.tenant))
    .filter((id): id is string => Boolean(id))
}
export function assertSiteEditor(user: unknown, tenant: string): void {
  if (!user || (!isSuperUser(user) && !siteIDs(user).includes(tenant)))
    throw new TinyURLError('You cannot edit short links for this site.', 403)
}
export function canonicalURL(
  collection: 'posts' | 'pages',
  slug: unknown,
  tenantSlug: unknown,
  base = process.env.NEXT_PUBLIC_SITE_URL,
): string {
  if (
    typeof slug !== 'string' ||
    !slug ||
    slug.includes('/') ||
    typeof tenantSlug !== 'string' ||
    !tenantSlug ||
    tenantSlug.includes('/')
  )
    throw new TinyURLError('Save a valid slug and site before creating a short link.')
  if (!base)
    throw new TinyURLError('Configure NEXT_PUBLIC_SITE_URL with the public frontend URL.', 503)
  const origin = new URL(destinationValue(base))
  if (
    origin.search ||
    origin.hash ||
    !['', '/'].includes(origin.pathname) ||
    ['localhost', '127.0.0.1', '::1'].includes(origin.hostname)
  )
    throw new TinyURLError('NEXT_PUBLIC_SITE_URL must be the public frontend origin.', 503)
  const root = tenantSlug === 'main'
  const path =
    collection === 'pages' && slug === 'home'
      ? root
        ? '/'
        : `/${encodeURIComponent(tenantSlug)}`
      : root
        ? `${collection === 'posts' ? '/post' : ''}/${encodeURIComponent(slug)}`
        : `/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(slug)}`
  return `${origin.origin}${path}`
}
export function assertRemoteUnchanged(
  remote: { url: string; archived?: boolean } | null,
  originalURL: string,
): void {
  if (!remote || remote.archived || destinationValue(remote.url) !== destinationValue(originalURL))
    throw new TinyURLError(
      'The TinyURL link changed outside this website or is archived. Import again and review it before editing.',
      409,
    )
}
