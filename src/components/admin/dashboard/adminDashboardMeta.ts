import type { PayloadRequest } from 'payload'
import { formatAdminURL } from 'payload/shared'
import { getTenantFromCookie } from '@payloadcms/plugin-multi-tenant/utilities'

import { CONTENT_EDITOR_COLLECTIONS, canAccessCollection } from '@/lib/access/roles'

export type AdminTaskKey =
  | 'createPost'
  | 'editHomepage'
  | 'editHeader'
  | 'editFooter'
  | 'createForm'
  | 'editBoomBar'
  | 'facebookSettings'

export type AdminTask = {
  description: string
  disabled?: boolean
  href: string
  key: AdminTaskKey
  label: string
}

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

export const navGroupHelperText: Record<string, string> = {
  Collections: 'Content and settings available for your role.',
  Globals: 'Site-wide content that affects many pages.',
  Site: 'Tenant-wide header, footer, navigation, and SEO settings.',
  Email: 'Email drafting and sending tools.',
}

export const quickTaskDescriptions: Record<AdminTaskKey, string> = {
  createPost: 'Draft a new news update or announcement.',
  editHomepage: 'Open the homepage in the visual builder.',
  editHeader: 'Update navigation, logo, buttons, and header style.',
  editFooter: 'Update site-wide footer content.',
  createForm: 'Build a signup, contact, volunteer, or RSVP form.',
  editBoomBar: 'Open tenant navigation settings.',
  facebookSettings: 'Review tenant profile and domain settings.',
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

async function findHomepage(req: PayloadRequest) {
  const tenantID = getSelectedTenantID(req)

  try {
    const result = await req.payload.find({
      collection: 'pages',
      depth: 0,
      limit: 1,
      overrideAccess: false,
      pagination: false,
      req,
      where: {
        ...(tenantID
          ? {
              tenant: {
                equals: tenantID,
              },
            }
          : {}),
        slug: {
          equals: 'home',
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
  const homeID = await findHomepage(req)
  const homeFallback = adminURL(req, '/collections/pages?where[slug][equals]=home')
  const homeURL = homeID ? adminURL(req, `/collections/pages/${homeID}/visual`) : homeFallback

  const tasks: AdminTask[] = [
    {
      description: quickTaskDescriptions.createPost,
      href: appendTenantQuery(adminURL(req, '/collections/posts/create'), tenantID),
      key: 'createPost',
      label: 'Create Post',
    },
    {
      description: homeID
        ? quickTaskDescriptions.editHomepage
        : 'No homepage was found for this tenant. Review pages with slug home.',
      href: homeURL,
      key: 'editHomepage',
      label: 'Edit Homepage',
    },
    {
      description: quickTaskDescriptions.editHeader,
      href: adminURL(req, '/globals/header'),
      key: 'editHeader',
      label: 'Edit Header',
    },
    {
      description: quickTaskDescriptions.editFooter,
      href: adminURL(req, '/globals/footer'),
      key: 'editFooter',
      label: 'Edit Footer',
    },
    {
      description: quickTaskDescriptions.createForm,
      href: appendTenantQuery(adminURL(req, '/collections/forms/create'), tenantID),
      key: 'createForm',
      label: 'Create Form',
    },
    {
      description: quickTaskDescriptions.editBoomBar,
      href: await singletonTaskURL(req, 'navbars'),
      key: 'editBoomBar',
      label: 'Edit Navbar',
    },
    {
      description: quickTaskDescriptions.facebookSettings,
      href: tenantID
        ? adminURL(req, `/collections/tenants/${tenantID}`)
        : adminURL(req, '/collections/tenants'),
      key: 'facebookSettings',
      label: 'Tenant Settings',
    },
  ]

  return tasks.filter((task) => {
    const user = req.user as DashboardUser
    if (task.key === 'createForm') return canAccessCollection(user, 'forms')
    if (task.key === 'createPost') return canAccessCollection(user, 'posts')
    if (task.key === 'editHomepage') return canAccessCollection(user, 'pages')
    if (task.key === 'editHeader') return canAccessCollection(user, 'header')
    if (task.key === 'editFooter') return canAccessCollection(user, 'footer')
    if (task.key === 'editBoomBar') return canAccessCollection(user, 'navbars')
    if (task.key === 'facebookSettings') return canAccessCollection(user, 'tenants')
    return false
  })
}

export function getRoleCollectionSlugs(user: PayloadRequest['user']) {
  if (!user) return []
  return CONTENT_EDITOR_COLLECTIONS.filter((slug) => canAccessCollection(user as DashboardUser, slug))
}
