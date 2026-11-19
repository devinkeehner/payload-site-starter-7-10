import type { PayloadRequest } from 'payload'
import { formatAdminURL } from 'payload/shared'
import { getTenantFromCookie } from '@payloadcms/plugin-multi-tenant/utilities'

import { CONTENT_EDITOR_COLLECTIONS, canAccessCollection } from '@/lib/access/roles'
import { siteSettingsURL } from '@/components/admin/site-settings/sections'
import {
  ADMIN_WORKSPACE_ENTRIES,
  getAdminWorkspaceDescription,
} from '@/components/admin/adminWorkspace'
import {
  DASHBOARD_PRIMARY_TASK_ORDER,
  WEBSITE_SHORTCUT_TASK_ORDER,
  orderAdminTasks,
  quickTaskDescriptions,
  type AdminTask,
} from './adminDashboardShared'

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

type DashboardUser = Parameters<typeof canAccessCollection>[0]

function adminURL(req: PayloadRequest, path: `/${string}`) {
  return formatAdminURL({
    adminRoute: getAdminRoute(req),
    path,
  })
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

export function getDashboardQuickTasks(req: PayloadRequest): AdminTask[] {
  const tenantID = getSelectedTenantID(req)
  const user = req.user as DashboardUser
  const canReadPosts = canAccessCollection(user, 'posts')
  const tasks: AdminTask[] = [
    ...(canReadPosts
      ? [
          {
            description: quickTaskDescriptions.createPost,
            href: appendTenantQuery(adminURL(req, '/collections/posts/create'), tenantID),
            key: 'createPost' as const,
            label: 'Create Post',
          },
          {
            description: quickTaskDescriptions.viewPosts,
            href: appendTenantQuery(adminURL(req, '/collections/posts'), tenantID),
            key: 'viewPosts' as const,
            label: 'Posts',
          },
        ]
      : []),
    ...(canAccessCollection(user, 'forms')
      ? [
          {
            description: quickTaskDescriptions.createForm,
            href: appendTenantQuery(adminURL(req, '/collections/forms/create'), tenantID),
            key: 'createForm' as const,
            label: 'Create a Form',
          },
        ]
      : []),
    ...(canAccessCollection(user, 'media')
      ? [
          {
            description: quickTaskDescriptions.uploadMedia,
            href: appendTenantQuery(adminURL(req, '/collections/media/create'), tenantID),
            key: 'uploadMedia' as const,
            label: 'Add Media',
          },
        ]
      : []),
  ]

  return orderAdminTasks(tasks, DASHBOARD_PRIMARY_TASK_ORDER)
}

const websiteShortcutTasksByRequest = new WeakMap<PayloadRequest, Promise<AdminTask[]>>()

async function buildWebsiteShortcutTasks(req: PayloadRequest): Promise<AdminTask[]> {
  const user = req.user as DashboardUser
  const tenantID = getSelectedTenantID(req)
  const adminRoute = getAdminRoute(req)
  const canChangeHomePageBanner = canAccessCollection(user, 'standard-media')
  const canUpdateRepInfo = canAccessCollection(user, 'rep-info')
  const canEditNavbar = canAccessCollection(user, 'navbars')

  return orderAdminTasks(
    [
      ...(canChangeHomePageBanner
        ? [
            {
              description: quickTaskDescriptions.changeHomePageBanner,
              href: siteSettingsURL(adminRoute, tenantID, 'images'),
              key: 'changeHomePageBanner' as const,
              label: 'Update Home Page Images',
            },
          ]
        : []),
      ...(canUpdateRepInfo
        ? [
            {
              description: quickTaskDescriptions.updateSocialMedia,
              href: siteSettingsURL(adminRoute, tenantID, 'social'),
              key: 'updateSocialMedia' as const,
              label: 'Update Social Media',
            },
            {
              description: quickTaskDescriptions.editTowns,
              href: siteSettingsURL(adminRoute, tenantID, 'profile'),
              key: 'editTowns' as const,
              label: 'Edit Towns',
            },
          ]
        : []),
      ...(canEditNavbar
        ? [
            {
              description: quickTaskDescriptions.editNavbar,
              href: siteSettingsURL(adminRoute, tenantID, 'navigation'),
              key: 'editNavbar' as const,
              label: 'Edit Navbar',
            },
          ]
        : []),
    ],
    WEBSITE_SHORTCUT_TASK_ORDER,
  )
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
