import { formatAdminURL } from 'payload/shared'

export const SITE_SETTINGS_SECTIONS = [
  {
    key: 'profile',
    owner: 'rep-info',
    label: 'Profile & district',
    tab: 'Profile & Towns',
    description: 'Public identity, represented towns, and website defaults.',
    save: 'Save profile and towns',
  },
  {
    key: 'images',
    owner: 'standard-media',
    label: 'Website images',
    description: 'Homepage artwork, image placements, and optional videos.',
    save: 'Save website images',
  },
  {
    key: 'social',
    owner: 'rep-info',
    label: 'Social accounts',
    tab: 'Social & Facebook',
    description: 'Public social profiles and the Facebook page powering the website feed.',
    save: 'Save social accounts',
  },
  {
    key: 'search',
    owner: 'site-seo',
    label: 'Search & sharing',
    description: 'How the homepage appears in search results and shared links.',
    save: 'Save search & sharing',
  },
  {
    key: 'navigation',
    owner: 'navbars',
    label: 'Navigation',
    description: 'Edit the labels, destinations, and nesting in the website menu.',
    save: 'Save navigation',
  },
  {
    key: 'email',
    owner: 'rep-info',
    label: 'Email defaults',
    tab: 'Email Defaults',
    description: 'Default sender, reply-to address, and mailing address.',
    save: 'Save email defaults',
  },
  {
    key: 'links',
    owner: 'rep-info',
    label: 'Short links',
    tab: 'TinyURL',
    description: 'Manage the site’s TinyURL domain and imported redirects.',
    save: 'Save domain',
  },
  {
    key: 'administration',
    owner: 'tenants',
    label: 'Site administration',
    description: 'Internal site details, routing, and public availability.',
    save: 'Save site details',
  },
] as const

export type SiteSettingsSection = (typeof SITE_SETTINGS_SECTIONS)[number]
export type SiteSettingsKey = SiteSettingsSection['key']

export const getSiteSettingsSection = (key: unknown) =>
  SITE_SETTINGS_SECTIONS.find((section) => section.key === key)

export const siteSettingsURL = (
  adminRoute: string,
  tenant?: string | null,
  section: SiteSettingsKey = 'profile',
) => {
  const params = new URLSearchParams({ section })
  if (tenant) params.set('tenant', tenant)
  return `${formatAdminURL({ adminRoute, path: '/site-settings' })}?${params}`
}

export const siteSettingsDocumentURL = (
  adminRoute: string,
  tenant: string,
  section: SiteSettingsSection,
  id: string,
) => {
  const path = formatAdminURL({
    adminRoute,
    path: `/collections/${section.owner}/${encodeURIComponent(id)}`,
  })
  const params = new URLSearchParams({ tenant, hroSettings: section.key })
  return `${path}?${params}`
}

export const siteSettingsEditComponent =
  '@/components/admin/site-settings/SiteSettingsEditView#default'
