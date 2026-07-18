export type DashboardNavbarLinkState = 'missing' | 'unsafe' | 'valid'

export type DashboardNavbarLink = {
  depth: number
  displayHref: string
  href: string | null
  id: string
  label: string
  state: DashboardNavbarLinkState
}

export type DashboardNavbarURLContext = {
  publicSiteBase: string
  tenantSlug?: string | null
}

type ResolvedDestination = Pick<DashboardNavbarLink, 'displayHref' | 'href' | 'state'>

const WEB_PROTOCOLS = new Set(['http:', 'https:'])
const UNSAFE_SCHEME = /^[a-z][a-z\d+.-]*:/iu

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

const getString = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : null

const normalizeSiteBase = (value: string) => {
  const trimmed = value.trim().replace(/\/+$/u, '')
  return trimmed || 'https://www.cthousegop.com'
}

const tenantHomePath = (tenantSlug?: string | null) =>
  tenantSlug && tenantSlug !== 'main' ? `/${tenantSlug}` : '/'

const unavailableDestination = (
  state: Exclude<DashboardNavbarLinkState, 'valid'>,
): ResolvedDestination => ({
  displayHref: state === 'unsafe' ? 'Unsafe destination' : 'No destination',
  href: null,
  state,
})

export function getDashboardPublicSiteBase(
  environment: Record<string, string | undefined> = process.env,
) {
  return normalizeSiteBase(
    environment.NEXT_PUBLIC_SITE_URL ||
      environment.PREVIEW_FRONTEND_ORIGIN ||
      environment.FRONTEND_SERVER_URL ||
      environment.NEXT_PUBLIC_SERVER_URL ||
      'https://www.cthousegop.com',
  )
}

export function resolveCustomDashboardURL(
  rawURL: unknown,
  context: DashboardNavbarURLContext,
): ResolvedDestination {
  const value = getString(rawURL)
  if (!value) return unavailableDestination('missing')

  const publicSiteBase = normalizeSiteBase(context.publicSiteBase)

  if (value.startsWith('//')) return unavailableDestination('unsafe')

  if (UNSAFE_SCHEME.test(value)) {
    try {
      const parsed = new URL(value)
      if (!WEB_PROTOCOLS.has(parsed.protocol)) return unavailableDestination('unsafe')
      return { displayHref: value, href: value, state: 'valid' }
    } catch {
      return unavailableDestination('unsafe')
    }
  }

  try {
    const homePath = tenantHomePath(context.tenantSlug)
    const base = new URL(`${publicSiteBase}${homePath}${homePath.endsWith('/') ? '' : '/'}`)
    const href = new URL(value, base).toString()
    return { displayHref: href, href, state: 'valid' }
  } catch {
    return unavailableDestination('unsafe')
  }
}

export function resolveReferenceDashboardURL(
  relationTo: unknown,
  referencedValue: unknown,
  context: DashboardNavbarURLContext,
): ResolvedDestination {
  if (relationTo !== 'pages' && relationTo !== 'posts') {
    return unavailableDestination('missing')
  }
  if (!isRecord(referencedValue)) return unavailableDestination('missing')

  const slug = getString(referencedValue.slug)
  if (!slug) return unavailableDestination('missing')

  const referencedTenant = isRecord(referencedValue.tenant) ? referencedValue.tenant : null
  const tenantSlug = getString(referencedTenant?.slug) || context.tenantSlug || null
  const rootTenant = !tenantSlug || tenantSlug === 'main'
  let path: string

  if (relationTo === 'pages') {
    path =
      slug === 'home'
        ? rootTenant
          ? '/'
          : `/${tenantSlug}`
        : rootTenant
          ? `/${slug}`
          : `/${tenantSlug}/${slug}`
  } else {
    path = rootTenant ? `/post/${slug}` : `/${tenantSlug}/${slug}`
  }

  const href = `${normalizeSiteBase(context.publicSiteBase)}${path}`
  return { displayHref: href, href, state: 'valid' }
}

function resolveDashboardNavbarItem(
  value: unknown,
  context: DashboardNavbarURLContext,
): Omit<DashboardNavbarLink, 'depth' | 'id'> {
  if (!isRecord(value)) {
    return {
      label: 'Untitled link',
      ...unavailableDestination('missing'),
    }
  }

  const label = getString(value.label)
  const type = getString(value.type)
  const reference = isRecord(value.reference) ? value.reference : null
  const referencedValue = reference?.value
  const referencedDoc = isRecord(referencedValue) ? referencedValue : null
  const referenceLabel =
    getString(referencedDoc?.title) ||
    getString(referencedDoc?.name) ||
    getString(referencedDoc?.pageName) ||
    getString(referencedDoc?.slug)

  if (type === 'reference' || (!type && reference)) {
    return {
      label: label || referenceLabel || 'Untitled link',
      ...resolveReferenceDashboardURL(reference?.relationTo, referencedValue, context),
    }
  }

  const rawURL = getString(value.url)
  return {
    label: label || rawURL || 'Untitled link',
    ...resolveCustomDashboardURL(rawURL, context),
  }
}

export function flattenDashboardNavbarItems(
  items: unknown,
  context: DashboardNavbarURLContext,
  depth = 0,
  prefix = 'nav',
): DashboardNavbarLink[] {
  if (!Array.isArray(items)) return []

  return items.flatMap((item, index) => {
    if (!isRecord(item)) return []
    const link = resolveDashboardNavbarItem(item.link, context)
    const id = String(item.id || `${prefix}-${index}`)
    const children = [
      ...flattenDashboardNavbarItems(item.subNav, context, depth + 1, `${id}-sub`),
      ...flattenDashboardNavbarItems(item.subSubNav, context, depth + 1, `${id}-tertiary`),
    ]

    return [{ ...link, depth, id }, ...children]
  })
}
