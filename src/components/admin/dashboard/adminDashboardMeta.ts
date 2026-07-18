import type { PayloadRequest } from 'payload'
import { formatAdminURL } from 'payload/shared'
import { getTenantFromCookie } from '@payloadcms/plugin-multi-tenant/utilities'

import { CONTENT_EDITOR_COLLECTIONS, canAccessCollection } from '@/lib/access/roles'
import {
  ADMIN_WORKSPACE_ENTRIES,
  getAdminWorkspaceDescription,
} from '@/components/admin/adminWorkspace'
import { quickTaskDescriptions, type AdminTask } from './adminDashboardShared'

export const collectionHelperText: Record<string, string> = {
  pages: 'Build pages and edit tenant homepages.',
  posts: 'Write news, updates, and announcements.',
  'bad-bills': 'Manage bad bill content and related issue pages.',
  'wordpress-posts': 'Review imported legacy WordPress posts.',
  media: 'Upload images, files, and reusable visuals.',
  tenants: 'Manage tenant identity, domains, and access.',
  forms: 'Create signup, contact, volunteer, and RSVP forms.',
  'form-submissions': 'Review messages and form responses.',
  header: 'Edit the site-wide navigation and header style.',
  footer: 'Edit the site-wide footer content.',
  navbars: 'Edit reusable tenant navigation bars.',
  categories: 'Organize posts by topic.',
  'article-types': 'Manage article type taxonomy.',
  authors: 'Manage post authors.',
  tags: 'Manage post tags.',
  'site-seo': 'Configure tenant SEO metadata.',
  'rep-info': 'Manage representative profile details.',
  'standard-media': 'Manage standard tenant media assets.',
  'graphic-templates': 'Manage reusable graphics templates.',
  'graphic-designs': 'Manage saved graphics designs.',
  'icontact-folders': 'Review cached iContact folders.',
  'icontact-lists': 'Review cached iContact lists.',
  'sitemap-artifacts': 'Inspect generated sitemap XML artifacts.',
  emails: 'Build, test, and organize campaign emails.',
  'email-lists': 'Manage campaign email audiences.',
  contacts: 'Store people who can be added to campaign email lists.',
  users: 'Manage admin accounts and roles.',
  search: 'Inspect generated search index records.',
  'chatgpt-oauth-clients': 'Manage ChatGPT OAuth connector clients.',
  'chatgpt-oauth-codes': 'Inspect short-lived ChatGPT OAuth authorization codes.',
  'chatgpt-oauth-tokens': 'Inspect and revoke ChatGPT OAuth tokens.',
}

for (const entry of ADMIN_WORKSPACE_ENTRIES) {
  collectionHelperText[entry.slug] = getAdminWorkspaceDescription(
    entry.slug,
    collectionHelperText[entry.slug] || '',
  )
}

export const navGroupHelperText: Record<string, string> = {
  Collections: 'Content and settings available for your role.',
  Globals: 'Site-wide content that affects many pages.',
  Site: 'Tenant-wide header, footer, navigation, and SEO settings.',
  Email: 'Email drafting and sending tools.',
}

function getAdminRoute(req: PayloadRequest) {
  return req.payload.config.routes.admin
}

export function getSelectedTenantID(req: PayloadRequest): string | null {
  const fromCookie = getTenantFromCookie(req.headers, 'text')
  if (fromCookie) return String(fromCookie)

  const tenantRows = (req.user as { tenants?: { tenant?: unknown }[] } | null | undefined)?.tenants
  if (!Array.isArray(tenantRows) || tenantRows.length !== 1) return null

  const tenant = tenantRows[0]?.tenant
  if (!tenant) return null
  if (typeof tenant === 'object' && 'id' in tenant) {
    return String((tenant as { id?: string | number }).id ?? '') || null
  }
  return String(tenant)
}

function appendTenantQuery(href: string, tenantID: string | null) {
  if (!tenantID) return href
  const separator = href.includes('?') ? '&' : '?'
  return `${href}${separator}tenant=${encodeURIComponent(tenantID)}`
}

function appendEditTarget(href: string, tab: string, field?: string) {
  const params = new URLSearchParams({ hroTab: tab })
  if (field) params.set('hroField', field)
  const separator = href.includes('?') ? '&' : '?'
  return `${href}${separator}${params.toString()}`
}

type DashboardUser = Parameters<typeof canAccessCollection>[0]

function adminURL(req: PayloadRequest, path: `/${string}`) {
  return formatAdminURL({
    adminRoute: getAdminRoute(req),
    path,
  })
}

async function findTenantDocument(
  req: PayloadRequest,
  collection: 'navbars' | 'rep-info' | 'standard-media' | 'site-seo',
) {
  const tenantID = getSelectedTenantID(req)
  if (!tenantID) return null

  try {
    const result = await req.payload.find({
      collection,
      depth: 0,
      limit: 1,
      overrideAccess: false,
      pagination: false,
      req,
      where: {
        tenant: {
          equals: tenantID,
        },
      },
    })

    const doc = result.docs[0] as { id?: string | number } | undefined
    return doc?.id ? String(doc.id) : null
  } catch {
    return null
  }
}

async function singletonTaskURL(
  req: PayloadRequest,
  collection: 'navbars' | 'rep-info' | 'standard-media' | 'site-seo',
) {
  const tenantID = getSelectedTenantID(req)
  const existingID = await findTenantDocument(req, collection)

  if (existingID) {
    return adminURL(req, `/collections/${collection}/${existingID}`)
  }

  return appendTenantQuery(adminURL(req, `/collections/${collection}/create`), tenantID)
}

export function getPrimaryQuickTasks(req: PayloadRequest): AdminTask[] {
  const tenantID = getSelectedTenantID(req)
  const user = req.user as DashboardUser
  const canCreatePost = canAccessCollection(user, 'posts')
  const canCreateForm = canAccessCollection(user, 'forms')
  const canUploadMedia = canAccessCollection(user, 'media')
  const canCreatePage = canAccessCollection(user, 'pages')

  return [
    ...(canCreatePost
      ? [
          {
            description: quickTaskDescriptions.createPost,
            href: appendTenantQuery(adminURL(req, '/collections/posts/create'), tenantID),
            key: 'createPost' as const,
            label: 'Create Post',
          },
        ]
      : []),
    ...(canCreateForm
      ? [
          {
            description: quickTaskDescriptions.createForm,
            href: appendTenantQuery(adminURL(req, '/collections/forms/create'), tenantID),
            key: 'createForm' as const,
            label: 'Create a Form',
          },
        ]
      : []),
    ...(canUploadMedia
      ? [
          {
            description: quickTaskDescriptions.uploadMedia,
            href: appendTenantQuery(adminURL(req, '/collections/media/create'), tenantID),
            key: 'uploadMedia' as const,
            label: 'Add Media',
          },
        ]
      : []),
    ...(canCreatePage
      ? [
          {
            description: quickTaskDescriptions.createPage,
            href: appendTenantQuery(adminURL(req, '/collections/pages/create'), tenantID),
            key: 'createPage' as const,
            label: 'Create Page',
          },
        ]
      : []),
  ]
}

const websiteShortcutTasksByRequest = new WeakMap<PayloadRequest, Promise<AdminTask[]>>()

async function buildWebsiteShortcutTasks(req: PayloadRequest): Promise<AdminTask[]> {
  const user = req.user as DashboardUser
  const canChangeHomePageBanner = canAccessCollection(user, 'standard-media')
  const canUpdateRepInfo = canAccessCollection(user, 'rep-info')
  const canEditNavbar = canAccessCollection(user, 'navbars')

  const [standardMediaURL, repInfoURL, navbarURL] = await Promise.all([
    canChangeHomePageBanner ? singletonTaskURL(req, 'standard-media') : null,
    canUpdateRepInfo ? singletonTaskURL(req, 'rep-info') : null,
    canEditNavbar ? singletonTaskURL(req, 'navbars') : null,
  ])

  return [
    ...(standardMediaURL
      ? [
          {
            description: quickTaskDescriptions.changeHomePageBanner,
            href: `${standardMediaURL}#field-bannerImage`,
            key: 'changeHomePageBanner' as const,
            label: 'Change Home Page Banner',
          },
        ]
      : []),
    ...(repInfoURL
      ? [
          {
            description: quickTaskDescriptions.updateSocialMedia,
            href: appendEditTarget(repInfoURL, 'Social & Facebook', 'field-facebook'),
            key: 'updateSocialMedia' as const,
            label: 'Update Social Media',
          },
          {
            description: quickTaskDescriptions.editTowns,
            href: appendEditTarget(repInfoURL, 'Profile & Towns', 'field-towns'),
            key: 'editTowns' as const,
            label: 'Edit Towns',
          },
        ]
      : []),
    ...(navbarURL
      ? [
          {
            description: quickTaskDescriptions.editNavbar,
            href: navbarURL,
            key: 'editNavbar' as const,
            label: 'Edit Navbar',
          },
        ]
      : []),
  ]
}

export function getWebsiteShortcutTasks(req: PayloadRequest): Promise<AdminTask[]> {
  const existing = websiteShortcutTasksByRequest.get(req)
  if (existing) return existing

  const tasks = buildWebsiteShortcutTasks(req)
  websiteShortcutTasksByRequest.set(req, tasks)
  return tasks
}

export function getRoleCollectionSlugs(user: PayloadRequest['user']) {
  if (!user) return []
  return CONTENT_EDITOR_COLLECTIONS.filter((slug) =>
    canAccessCollection(user as DashboardUser, slug),
  )
}
