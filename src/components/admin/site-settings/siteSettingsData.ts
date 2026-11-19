import type { PayloadRequest, SanitizedPermissions } from 'payload'
import { canAccessCollection } from '@/lib/access/roles'
import { isSuperUser } from '@/lib/access/isSuperUser'
import { getDashboardPublicSiteBase } from '@/components/admin/dashboard/dashboardNavbarLinks'
import { SITE_SETTINGS_SECTIONS } from './sections'

export function availableSiteSettings(req: PayloadRequest, permissions: SanitizedPermissions) {
  return SITE_SETTINGS_SECTIONS.filter(
    ({ owner }) =>
      canAccessCollection(req.user, owner) &&
      permissions.collections?.[owner]?.read &&
      (owner !== 'site-seo' || isSuperUser(req.user)),
  )
}

export async function loadSiteSettingsIdentity(req: PayloadRequest, tenantID: string) {
  const tenant = await req.payload.findByID({
    collection: 'tenants',
    id: tenantID,
    depth: 0,
    overrideAccess: false,
    req,
    disableErrors: true,
    select: { name: true, slug: true },
  })
  if (!tenant) return null
  const base = getDashboardPublicSiteBase()
  return {
    id: String(tenant.id),
    name: tenant.name,
    website: tenant.slug === 'main' ? base : `${base}/${encodeURIComponent(tenant.slug)}`,
  }
}
