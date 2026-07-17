import type { PayloadComponent, PayloadRequest, SanitizedPermissions, ServerProps } from 'payload'

import { RenderServerComponent } from '@payloadcms/ui/elements/RenderServerComponent'
import { EntityType, getVisibleEntities, groupNavItems } from '@payloadcms/ui/shared'
import { formatAdminURL } from 'payload/shared'
import React from 'react'

import { getQuickTasks, getSelectedTenantID } from '@/components/admin/dashboard/adminDashboardMeta'
import {
  ADMIN_WORKSPACE_NAV_AREAS,
  type AdminWorkspaceNavAreaKey,
} from '@/components/admin/adminWorkspace'
import { canAccessCollection } from '@/lib/access/roles'

import { CampaignAdminNavClient } from './CampaignAdminWorkspaceNavClient'

type Props = ServerProps & {
  documentSubViewType?: string
  permissions?: SanitizedPermissions
  req?: PayloadRequest
  viewType?: string
}

type NavDocument = {
  id?: number | string
  slug?: string | null
  title?: string | null
}

type NavQuickLink = {
  action?: 'bulkUpload'
  description?: string
  href: string
  label: string
}

const adminURL = (req: PayloadRequest, path: `/${string}`) =>
  formatAdminURL({
    adminRoute: req.payload.config.routes.admin,
    path,
  })

const withTenant = (href: string, tenantID: string | null) => {
  if (!tenantID) return href
  return `${href}${href.includes('?') ? '&' : '?'}tenant=${encodeURIComponent(tenantID)}`
}

async function getSidebarQuickLinks(
  req: PayloadRequest,
): Promise<Partial<Record<AdminWorkspaceNavAreaKey, NavQuickLink[]>>> {
  const tenantID = getSelectedTenantID(req)
  const canReadPosts = canAccessCollection(req.user, 'posts')
  const canReadPages = canAccessCollection(req.user, 'pages')
  const mediaHref = withTenant(adminURL(req, '/collections/media'), tenantID)
  const pagesHref = withTenant(adminURL(req, '/collections/pages'), tenantID)

  const [recentPostsResult, aboutResult, contactResult] = await Promise.all([
    canReadPosts
      ? req.payload.find({
          collection: 'posts',
          depth: 0,
          limit: 3,
          pagination: false,
          req,
          sort: '-updatedAt',
          where: tenantID ? { tenant: { equals: tenantID } } : undefined,
        })
      : Promise.resolve(null),
    canReadPages
      ? req.payload.find({
          collection: 'pages',
          depth: 0,
          limit: 1,
          pagination: false,
          req,
          where: tenantID
            ? { and: [{ tenant: { equals: tenantID } }, { slug: { equals: 'about' } }] }
            : { slug: { equals: 'about' } },
        })
      : Promise.resolve(null),
    canReadPages
      ? req.payload.find({
          collection: 'pages',
          depth: 0,
          limit: 1,
          pagination: false,
          req,
          where: tenantID
            ? { and: [{ tenant: { equals: tenantID } }, { slug: { equals: 'contact' } }] }
            : { slug: { equals: 'contact' } },
        })
      : Promise.resolve(null),
  ])

  const recentPosts = Array.isArray(recentPostsResult?.docs)
    ? (recentPostsResult.docs as NavDocument[])
    : []
  const aboutPage = aboutResult?.docs?.[0] as NavDocument | undefined
  const contactPage = contactResult?.docs?.[0] as NavDocument | undefined

  return {
    media: [
      { href: mediaHref, label: 'Media Gallery' },
      {
        action: 'bulkUpload',
        description: 'Add several images or files at once.',
        href: mediaHref,
        label: 'Bulk Upload',
      },
    ],
    pages: [
      { href: pagesHref, label: 'Pages' },
      {
        href: aboutPage?.id
          ? withTenant(adminURL(req, `/collections/pages/${aboutPage.id}`), tenantID)
          : `${pagesHref}?where[slug][equals]=about`,
        label: 'About Page',
      },
      {
        href: contactPage?.id
          ? withTenant(adminURL(req, `/collections/pages/${contactPage.id}`), tenantID)
          : `${pagesHref}?where[slug][equals]=contact`,
        label: 'Contact Page',
      },
    ],
    posts: recentPosts.map((post) => ({
      href: post.id
        ? withTenant(adminURL(req, `/collections/posts/${post.id}`), tenantID)
        : withTenant(adminURL(req, '/collections/posts'), tenantID),
      label: String(post.title || post.slug || 'Untitled post'),
    })),
  }
}

export async function CampaignAdminNav(props: Props) {
  const {
    documentSubViewType,
    i18n,
    locale,
    params,
    payload,
    permissions,
    req,
    searchParams,
    user,
    viewType,
  } = props

  if (!payload?.config || !permissions || !req) return null

  const adminComponents = (payload.config.admin.components || {}) as {
    afterNav?: PayloadComponent | PayloadComponent[]
    afterNavLinks?: PayloadComponent | PayloadComponent[]
    beforeNav?: PayloadComponent | PayloadComponent[]
    beforeNavLinks?: PayloadComponent | PayloadComponent[]
  }
  const { afterNav, afterNavLinks } = adminComponents
  const { collections, globals } = payload.config

  const visibleEntities = getVisibleEntities({ req })

  const payloadGroups = groupNavItems(
    [
      ...collections
        .filter(
          ({ slug }) =>
            visibleEntities.collections.includes(slug) && canAccessCollection(req.user, slug),
        )
        .map((collection) => ({
          entity: collection,
          type: EntityType.collection,
        })),
      ...globals
        .filter(({ slug }) => visibleEntities.globals.includes(slug))
        .map((global) => ({
          entity: global,
          type: EntityType.global,
        })),
    ] as Parameters<typeof groupNavItems>[0],
    permissions,
    i18n,
  )
  const visibleNavEntities = payloadGroups.flatMap((group) => group.entities)
  const entityBySlug = new Map(visibleNavEntities.map((entity) => [String(entity.slug), entity]))
  const assignedSlugs = new Set<string>()
  const sidebarQuickLinks = await getSidebarQuickLinks(req)
  const areas: Array<{
    description: string
    entities: typeof visibleNavEntities
    key: AdminWorkspaceNavAreaKey
    label: string
    primaryTaskKey?: 'createForm' | 'createPage' | 'createPost' | 'uploadMedia'
    quickLinks?: NavQuickLink[]
    suppressEntityLinks?: boolean
  }> = ADMIN_WORKSPACE_NAV_AREAS.map((area) => {
    const entities = area.slugs
      .map((slug) => entityBySlug.get(slug))
      .filter((entity): entity is (typeof visibleNavEntities)[number] => Boolean(entity))

    entities.forEach((entity) => assignedSlugs.add(String(entity.slug)))

    return {
      description: area.description,
      entities,
      key: area.key,
      label: area.label,
      primaryTaskKey: 'primaryTaskKey' in area ? area.primaryTaskKey : undefined,
      quickLinks: sidebarQuickLinks[area.key],
      suppressEntityLinks: 'suppressEntityLinks' in area ? area.suppressEntityLinks : false,
    }
  }).filter((area) => area.entities.length > 0)

  const remainingEntities = visibleNavEntities.filter(
    (entity) => !assignedSlugs.has(String(entity.slug)),
  )
  if (remainingEntities.length > 0) {
    const advancedArea = areas.find((area) => area.key === 'advanced')
    if (advancedArea) {
      advancedArea.entities.push(...remainingEntities)
    } else {
      areas.push({
        description: 'Supporting records and technical tools.',
        entities: remainingEntities,
        key: 'advanced',
        label: 'More',
        primaryTaskKey: undefined,
        quickLinks: undefined,
        suppressEntityLinks: false,
      })
    }
  }
  const tasks = await getQuickTasks(req)
  const serverProps = {
    i18n,
    locale,
    params,
    payload,
    permissions,
    req,
    searchParams,
    user,
  }
  const clientProps = {
    documentSubViewType,
    viewType,
  }

  return (
    <CampaignAdminNavClient
      afterNav={RenderServerComponent({
        clientProps,
        Component: afterNav,
        importMap: payload.importMap,
        serverProps,
      })}
      afterNavLinks={RenderServerComponent({
        clientProps,
        Component: afterNavLinks,
        importMap: payload.importMap,
        serverProps,
      })}
      areas={areas}
      tasks={tasks}
    />
  )
}
