import type { PayloadRequest } from 'payload'
import { formatAdminURL } from 'payload/shared'
import { getTenantFromCookie } from '@payloadcms/plugin-multi-tenant/utilities'

import { CONTENT_EDITOR_COLLECTIONS, canAccessCollection } from '@/lib/access/roles'
import {
  ADMIN_WORKSPACE_ENTRIES,
  getAdminWorkspaceDescription,
} from '@/components/admin/adminWorkspace'
import {
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
  'media-canvas': 'Manage saved media canvas scenes.',
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
  collectionHelperText[entry.slug] = getAdminWorkspaceDescription(entry.slug, collectionHelperText[entry.slug] || '')
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

async function findTenantDocument(req: PayloadRequest, collection: 'navbars' | 'rep-info' | 'standard-media' | 'site-seo') {
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

export async function getQuickTasks(req: PayloadRequest): Promise<AdminTask[]> {
  const tenantID = getSelectedTenantID(req)

  const tasks: AdminTask[] = [
    {
      description: quickTaskDescriptions.createPost,
      href: appendTenantQuery(adminURL(req, '/collections/posts/create'), tenantID),
      key: 'createPost',
      label: 'Create Post',
    },
    {
      description: quickTaskDescriptions.createForm,
      href: appendTenantQuery(adminURL(req, '/collections/forms/create'), tenantID),
      key: 'createForm',
      label: 'Build a Form',
    },
    {
      description: quickTaskDescriptions.uploadMedia,
      href: appendTenantQuery(adminURL(req, '/collections/media/create'), tenantID),
      key: 'uploadMedia',
      label: 'Upload Media',
    },
    {
      description: quickTaskDescriptions.createPage,
      href: appendTenantQuery(adminURL(req, '/collections/pages/create'), tenantID),
      key: 'createPage',
      label: 'Create Page',
    },
    {
      description: quickTaskDescriptions.changeHomePageBanner,
      href: `${await singletonTaskURL(req, 'standard-media')}#field-bannerImage`,
      key: 'changeHomePageBanner',
      label: 'Change Home Page Banner',
    },
    {
      description: quickTaskDescriptions.updateSocialMedia,
      href: appendEditTarget(await singletonTaskURL(req, 'rep-info'), 'Social & Facebook', 'field-facebook'),
      key: 'updateSocialMedia',
      label: 'Update Social Media',
    },
    {
      description: quickTaskDescriptions.editTowns,
      href: appendEditTarget(await singletonTaskURL(req, 'rep-info'), 'Profile & Towns', 'field-towns'),
      key: 'editTowns',
      label: 'Edit Towns',
    },
    {
      description: quickTaskDescriptions.editNavbar,
      href: await singletonTaskURL(req, 'navbars'),
      key: 'editNavbar',
      label: 'Edit Navbar',
    },
  ]

  return tasks.filter((task) => {
    const user = req.user as DashboardUser
    if (task.key === 'createPost') return canAccessCollection(user, 'posts')
    if (task.key === 'createForm') return canAccessCollection(user, 'forms')
    if (task.key === 'uploadMedia') return canAccessCollection(user, 'media')
    if (task.key === 'createPage') return canAccessCollection(user, 'pages')
    if (task.key === 'changeHomePageBanner') return canAccessCollection(user, 'standard-media')
    if (task.key === 'updateSocialMedia') return canAccessCollection(user, 'rep-info')
    if (task.key === 'editTowns') return canAccessCollection(user, 'rep-info')
    if (task.key === 'editNavbar') return canAccessCollection(user, 'navbars')
    return false
  })
}

export function getRoleCollectionSlugs(user: PayloadRequest['user']) {
  if (!user) return []
  return CONTENT_EDITOR_COLLECTIONS.filter((slug) => canAccessCollection(user as DashboardUser, slug))
}
