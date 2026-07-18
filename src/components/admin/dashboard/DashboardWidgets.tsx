import type { CollectionSlug, PayloadRequest, WidgetServerProps } from 'payload'
import type React from 'react'
import { formatAdminURL } from 'payload/shared'
import {
  Bell,
  BookOpen,
  Building2,
  ClipboardList,
  ExternalLink,
  Facebook,
  FileText,
  FolderTree,
  ImageIcon,
  Inbox,
  KeyRound,
  LayoutTemplate,
  ListChecks,
  Mail,
  Palette,
  PanelBottom,
  PanelTop,
  Plus,
  Route,
  Search,
  Tags,
  UserRoundPlus,
  Users,
  type LucideIcon,
} from 'lucide-react'

import { canAccessCollection } from '@/lib/access/roles'
import {
  getAdminWorkspaceLabel,
  getDashboardWorkspaceSlugs,
} from '@/components/admin/adminWorkspace'
import {
  DashboardBannerWidgetClient,
  type DashboardMediaAsset,
} from '@/components/admin/dashboard/DashboardWebsiteImagesWidgetClient'
import {
  MySitesWidgetClient,
  type DashboardSiteOption,
} from '@/components/admin/dashboard/MySitesWidgetClient'

import {
  collectionHelperText,
  getDashboardQuickTasks,
  getSelectedTenantID,
  getWebsiteShortcutTasks,
} from './adminDashboardMeta'
import type { AdminTask } from './adminDashboardShared'
import {
  flattenDashboardNavbarItems,
  getDashboardPublicSiteBase,
  type DashboardNavbarLink,
} from './dashboardNavbarLinks'

import './dashboard-widgets.scss'

type ActivityItem = {
  collection: string
  href: string
  id: string
  title: string
  updatedAt?: string
}

const activityCollections = ['posts', 'pages', 'forms', 'emails'] as const

const activityLimit = 5

type DashboardUser = Parameters<typeof canAccessCollection>[0]

type CollectionCard = {
  createHref?: string
  description: string
  href: string
  label: string
  slug: string
}

const collectionIcons: Record<string, LucideIcon> = {
  alerts: Bell,
  'api-keys': KeyRound,
  categories: Tags,
  contacts: UserRoundPlus,
  emails: Mail,
  'email-lists': ListChecks,
  'facebook-connections': Facebook,
  'facebook-pages': Facebook,
  'graphic-designs': Palette,
  footer: PanelBottom,
  forms: ClipboardList,
  'form-submissions': Inbox,
  header: PanelTop,
  media: ImageIcon,
  pages: LayoutTemplate,
  'payload-mcp-api-keys': KeyRound,
  posts: FileText,
  redirects: Route,
  search: Search,
  tenants: Building2,
  users: Users,
}

const taskIcons: Record<AdminTask['key'], LucideIcon> = {
  createPost: FileText,
  viewPosts: FileText,
  createForm: ClipboardList,
  uploadMedia: ImageIcon,
  createPage: LayoutTemplate,
  changeHomePageBanner: ImageIcon,
  updateSocialMedia: Facebook,
  editTowns: Building2,
  editNavbar: PanelTop,
}

type AdminCollectionConfig = {
  admin?: {
    hidden?: boolean | ((args: { user?: PayloadRequest['user'] }) => boolean)
  }
  labels?: {
    plural?: Record<string, string> | string
    singular?: Record<string, string> | string
  }
  slug: string
}

function adminURL(req: PayloadRequest, path: `/${string}`) {
  return formatAdminURL({
    adminRoute: req.payload.config.routes.admin,
    path,
  })
}

function getLocalizedLabel(label: unknown, fallback: string) {
  if (typeof label === 'string' && label.trim()) return label
  if (label && typeof label === 'object') {
    const values = Object.values(label as Record<string, unknown>)
    const localized = values.find((value) => typeof value === 'string' && value.trim())
    if (localized) return String(localized)
  }
  return fallback
}

function getMeaningfulString(value: unknown, id?: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (typeof id === 'string' && trimmed === id) return null
  if (/^[a-f0-9]{24}$/i.test(trimmed)) return null
  return trimmed
}

function getDocTitle(collection: string, doc: Record<string, unknown>) {
  const primaryCandidates =
    collection === 'emails'
      ? [doc.title, doc.subject, doc.preheader, doc.name, doc.pageName, doc.filename, doc.alt]
      : [doc.title, doc.name, doc.pageName, doc.filename, doc.alt]

  const title = primaryCandidates
    .map((candidate) => getMeaningfulString(candidate, doc.id))
    .find((candidate): candidate is string => Boolean(candidate))
  if (title) return String(title)

  if (collection === 'header') return 'Header'
  if (collection === 'footer') return 'Footer'
  if (collection === 'alerts') return 'Boom Bar'

  return getMeaningfulString(doc.id) || 'Untitled'
}

function formatUpdatedAt(value?: string) {
  if (!value) return null
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function canReadActivityCollection(props: WidgetServerProps, slug: string) {
  return canAccessCollection(props.req.user as DashboardUser, slug)
}

function isHiddenCollection(collection: AdminCollectionConfig, user: PayloadRequest['user']) {
  if (typeof collection.admin?.hidden === 'boolean') return collection.admin.hidden
  if (typeof collection.admin?.hidden === 'function') {
    return collection.admin.hidden({ user })
  }

  return false
}

function getSelectedCollectionSlugs(props: WidgetServerProps) {
  const selected = props.widgetData?.collections
  if (!Array.isArray(selected)) return new Set(getDashboardWorkspaceSlugs())

  const slugs = selected.filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  )
  return slugs.length ? new Set(slugs) : null
}

function getCollectionCards(props: WidgetServerProps): CollectionCard[] {
  const selectedSlugs = getSelectedCollectionSlugs(props)

  return props.req.payload.config.collections
    .filter((collection) => {
      const slug = String(collection.slug)
      return (
        (!selectedSlugs || selectedSlugs.has(slug)) &&
        canAccessCollection(props.req.user as DashboardUser, slug) &&
        !isHiddenCollection(collection as AdminCollectionConfig, props.req.user)
      )
    })
    .map((collection) => {
      const slug = String(collection.slug)
      const adminCollection = collection as AdminCollectionConfig
      const payloadLabel = getLocalizedLabel(adminCollection.labels?.plural, slug)
      const label = getAdminWorkspaceLabel(slug, payloadLabel)
      const description = collectionHelperText[slug] || `View and manage ${label.toLowerCase()}.`

      return {
        createHref: adminURL(props.req, `/collections/${slug}/create`),
        description,
        href: adminURL(props.req, `/collections/${slug}`),
        label,
        slug,
      }
    })
}

async function findRecentActivity(props: WidgetServerProps): Promise<ActivityItem[]> {
  const { req } = props
  const tenantID = getSelectedTenantID(req)
  if (!tenantID) return []

  const groups = await Promise.all(
    activityCollections
      .filter((collection) => canReadActivityCollection(props, collection))
      .map(async (collection) => {
        try {
          const result = await req.payload.find({
            collection: collection as CollectionSlug,
            depth: 0,
            limit: activityLimit,
            overrideAccess: false,
            pagination: false,
            req,
            sort: '-updatedAt',
            where: {
              tenant: {
                equals: tenantID,
              },
            },
          })

          return result.docs.map((doc) => {
            const item = doc as unknown as Record<string, unknown> & {
              id: string | number
              updatedAt?: string
            }
            return {
              collection,
              href: adminURL(req, `/collections/${collection}/${item.id}`),
              id: String(item.id),
              title: getDocTitle(collection, item),
              updatedAt: item.updatedAt,
            } satisfies ActivityItem
          })
        } catch {
          return []
        }
      }),
  )

  return groups
    .flat()
    .sort((a, b) => {
      return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
    })
    .slice(0, activityLimit)
}

async function findDrafts(props: WidgetServerProps): Promise<ActivityItem[]> {
  const { req } = props
  const tenantID = getSelectedTenantID(req)
  if (!tenantID) return []

  const groups = await Promise.all(
    activityCollections
      .filter((collection) => canReadActivityCollection(props, collection))
      .map(async (collection) => {
        try {
          const result = await req.payload.find({
            collection: collection as CollectionSlug,
            depth: 0,
            draft: true,
            limit: activityLimit,
            overrideAccess: false,
            pagination: false,
            req,
            sort: '-updatedAt',
            where: {
              _status: {
                equals: 'draft',
              },
              tenant: {
                equals: tenantID,
              },
            },
          })

          return result.docs.map((doc) => {
            const item = doc as unknown as Record<string, unknown> & {
              id: string | number
              updatedAt?: string
            }
            return {
              collection,
              href: adminURL(req, `/collections/${collection}/${item.id}`),
              id: String(item.id),
              title: getDocTitle(collection, item),
              updatedAt: item.updatedAt,
            } satisfies ActivityItem
          })
        } catch {
          return []
        }
      }),
  )

  return groups
    .flat()
    .sort((a, b) => {
      return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
    })
    .slice(0, activityLimit)
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="campaign-dashboard-widget__empty">{children}</p>
}

function TaskCard({ task }: { task: AdminTask }) {
  const Icon = taskIcons[task.key] || FileText

  return (
    <a className="campaign-dashboard-widget__task" href={task.href}>
      <span className="campaign-dashboard-widget__task-mark">
        <Icon aria-hidden size={21} strokeWidth={1.9} />
      </span>
      <span className="campaign-dashboard-widget__task-copy">
        <span className="campaign-dashboard-widget__task-label">{task.label}</span>
        <span className="campaign-dashboard-widget__task-description">{task.description}</span>
      </span>
    </a>
  )
}

function CollectionCard({ collection }: { collection: CollectionCard }) {
  return (
    <div className="campaign-dashboard-widget__collection-card">
      <a className="campaign-dashboard-widget__collection-main" href={collection.href}>
        <span className="campaign-dashboard-widget__collection-label">{collection.label}</span>
        <span className="campaign-dashboard-widget__collection-description">
          {collection.description}
        </span>
      </a>
      {collection.createHref ? (
        <a className="campaign-dashboard-widget__collection-create" href={collection.createHref}>
          Create
        </a>
      ) : null}
    </div>
  )
}

function IconCollectionCard({ collection }: { collection: CollectionCard }) {
  const Icon = collectionIcons[collection.slug] || FolderTree

  return (
    <div className="campaign-dashboard-widget__icon-card">
      <a className="campaign-dashboard-widget__icon-card-body" href={collection.href}>
        <span className="campaign-dashboard-widget__icon-card-mark">
          <Icon aria-hidden size={24} strokeWidth={1.9} />
        </span>
        <span className="campaign-dashboard-widget__icon-card-copy">
          <span className="campaign-dashboard-widget__icon-card-label">{collection.label}</span>
          <span className="campaign-dashboard-widget__icon-card-description">
            {collection.description}
          </span>
        </span>
      </a>
      {collection.createHref ? (
        <a
          aria-label={`Create ${collection.label}`}
          className="campaign-dashboard-widget__icon-card-action"
          href={collection.createHref}
        >
          <Plus aria-hidden size={13} strokeWidth={2.4} />
          <span>Create</span>
        </a>
      ) : null}
    </div>
  )
}

function ActivityList({ items }: { items: ActivityItem[] }) {
  return (
    <ul className="campaign-dashboard-widget__list">
      {items.map((item) => (
        <li className="campaign-dashboard-widget__list-item" key={`${item.collection}-${item.id}`}>
          <a href={item.href}>
            <span className="campaign-dashboard-widget__list-title">{item.title}</span>
            <span className="campaign-dashboard-widget__list-meta">
              {getAdminWorkspaceLabel(item.collection, item.collection)} ·{' '}
              {formatUpdatedAt(item.updatedAt) || 'Recently updated'}
            </span>
          </a>
        </li>
      ))}
    </ul>
  )
}

export async function CollectionLinksWidget(props: WidgetServerProps) {
  const collections = getCollectionCards(props)

  return (
    <section className="campaign-dashboard-widget">
      <div className="campaign-dashboard-widget__header">
        <h2>Collections</h2>
        <p>Open each content area with plain-language notes about what it controls.</p>
      </div>
      {collections.length ? (
        <div className="campaign-dashboard-widget__collection-grid">
          {collections.map((collection) => (
            <CollectionCard collection={collection} key={collection.slug} />
          ))}
        </div>
      ) : (
        <EmptyState>No collections are available for this role.</EmptyState>
      )}
    </section>
  )
}

export async function IconCollectionLauncherWidget(props: WidgetServerProps) {
  const collections = getCollectionCards(props)

  return (
    <section className="campaign-dashboard-widget campaign-dashboard-widget--launcher">
      <div className="campaign-dashboard-widget__header campaign-dashboard-widget__header--launcher">
        <div>
          <h2>Workspace Areas</h2>
          <p>Common content and communication areas. Technical records stay in Advanced.</p>
        </div>
        <BookOpen
          aria-hidden
          className="campaign-dashboard-widget__header-icon"
          size={30}
          strokeWidth={1.8}
        />
      </div>
      {collections.length ? (
        <div className="campaign-dashboard-widget__icon-grid">
          {collections.map((collection) => (
            <IconCollectionCard collection={collection} key={collection.slug} />
          ))}
        </div>
      ) : (
        <EmptyState>No collections are available for this role.</EmptyState>
      )}
    </section>
  )
}

export async function QuickTasksWidget(props: WidgetServerProps) {
  const primaryTasks = getDashboardQuickTasks(props.req)

  return (
    <section
      aria-labelledby="campaign-dashboard-quick-actions"
      className="campaign-dashboard-widget campaign-dashboard-widget--tasks campaign-dashboard-widget--quick-actions"
    >
      <h1 className="campaign-dashboard-widget__sr-only">Dashboard</h1>
      <h2 className="campaign-dashboard-widget__sr-only" id="campaign-dashboard-quick-actions">
        Quick actions
      </h2>
      <div className="campaign-dashboard-widget__task-grid">
        {primaryTasks.map((task) => (
          <TaskCard key={task.key} task={task} />
        ))}
      </div>
    </section>
  )
}

type StandardMediaDashboardDoc = {
  bannerImage?: unknown
  defaultFeaturedImage?: unknown
  heroImageHorizontalAlign?: unknown
  heroImageVerticalAlign?: unknown
  heroTextAlign?: unknown
  heroTextSize?: unknown
  id?: number | string
  mobileHeadshot?: unknown
}

type DashboardSite = {
  archived: boolean
  id: string
  name: string
  slug: string
}

type DashboardNavbarDoc = {
  id?: number | string
  name?: unknown
  navItems?: unknown
  tenant?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function getString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeDashboardSite(value: unknown): DashboardSite | null {
  if (!isRecord(value)) return null
  const id = value.id ?? value._id
  const name = getString(value.name)
  const slug = getString(value.slug)
  if ((typeof id !== 'number' && typeof id !== 'string') || !name || !slug) return null

  return {
    archived: value.archived === true,
    id: String(id),
    name,
    slug,
  }
}

async function findAssignedSites(props: WidgetServerProps): Promise<DashboardSite[]> {
  const userID = (props.req.user as { id?: unknown } | null)?.id
  if (typeof userID !== 'number' && typeof userID !== 'string') return []

  try {
    const user = await props.req.payload.findByID({
      collection: 'users',
      id: String(userID),
      depth: 1,
      overrideAccess: false,
      req: props.req,
    })
    const tenantAssignments = (user as unknown as { tenants?: unknown }).tenants
    const rows = Array.isArray(tenantAssignments) ? tenantAssignments : []
    const relations = rows
      .map((row) => (isRecord(row) ? row.tenant : null))
      .filter((tenant): tenant is NonNullable<typeof tenant> => tenant != null)
    const hydrated = relations
      .map(normalizeDashboardSite)
      .filter((site): site is DashboardSite => Boolean(site))
    const hydratedByID = new Map(hydrated.map((site) => [site.id, site]))
    const missingIDs = relations
      .filter((tenant) => !normalizeDashboardSite(tenant))
      .map((tenant) => String(tenant))

    if (missingIDs.length) {
      const result = await props.req.payload.find({
        collection: 'tenants',
        depth: 0,
        limit: missingIDs.length,
        overrideAccess: false,
        pagination: false,
        req: props.req,
        where: { id: { in: missingIDs } },
      })
      for (const doc of result.docs) {
        const site = normalizeDashboardSite(doc)
        if (site) hydratedByID.set(site.id, site)
      }
    }

    return relations
      .map((tenant) => {
        const direct = normalizeDashboardSite(tenant)
        return direct || hydratedByID.get(String(tenant)) || null
      })
      .filter((site): site is DashboardSite => Boolean(site))
  } catch {
    return []
  }
}

async function findAvailableSites(props: WidgetServerProps): Promise<DashboardSite[]> {
  try {
    const result = await props.req.payload.find({
      collection: 'tenants',
      depth: 0,
      limit: 500,
      overrideAccess: false,
      pagination: false,
      req: props.req,
      sort: 'name',
    })

    return result.docs
      .map(normalizeDashboardSite)
      .filter((site): site is DashboardSite => Boolean(site))
  } catch {
    return []
  }
}

async function findNavbarForDashboard(props: WidgetServerProps) {
  const tenantID = getSelectedTenantID(props.req)
  if (!tenantID) return { doc: null, links: [], tenantID }

  try {
    const [result, tenant] = await Promise.all([
      props.req.payload.find({
        collection: 'navbars',
        depth: 2,
        limit: 1,
        overrideAccess: false,
        pagination: false,
        req: props.req,
        where: { tenant: { equals: tenantID } },
      }),
      props.req.payload
        .findByID({
          collection: 'tenants',
          depth: 0,
          id: tenantID,
          overrideAccess: false,
          req: props.req,
        })
        .catch(() => null),
    ])
    const doc = (result.docs[0] || null) as DashboardNavbarDoc | null
    const navbarTenant = isRecord(doc?.tenant) ? doc.tenant : null
    const tenantSlug =
      (isRecord(tenant) ? getString(tenant.slug) : null) || getString(navbarTenant?.slug)
    const links: DashboardNavbarLink[] = flattenDashboardNavbarItems(doc?.navItems, {
      publicSiteBase: getDashboardPublicSiteBase(),
      tenantSlug,
    })
    return { doc, links, tenantID }
  } catch {
    return { doc: null, links: [], tenantID }
  }
}

function getPublicSiteURL(slug: string) {
  const base = getDashboardPublicSiteBase()
  return slug === 'main' ? base : `${base}/${slug}`
}

function normalizeDashboardMedia(value: unknown): DashboardMediaAsset | null {
  if (!value || typeof value !== 'object') return null
  const resource = value as Record<string, unknown>
  const id = resource.id ?? resource._id
  if (typeof id !== 'number' && typeof id !== 'string') return null

  return {
    alt: typeof resource.alt === 'string' ? resource.alt : null,
    filename: typeof resource.filename === 'string' ? resource.filename : null,
    id,
    mimeType: typeof resource.mimeType === 'string' ? resource.mimeType : null,
    url: typeof resource.url === 'string' ? resource.url : null,
  }
}

async function findStandardMediaForDashboard(props: WidgetServerProps) {
  const tenantID = getSelectedTenantID(props.req)
  if (!tenantID) return { doc: null, tenantID }

  try {
    const result = await props.req.payload.find({
      collection: 'standard-media',
      depth: 1,
      limit: 1,
      overrideAccess: false,
      pagination: false,
      req: props.req,
      where: {
        tenant: {
          equals: tenantID,
        },
      },
    })

    return {
      doc: (result.docs[0] || null) as StandardMediaDashboardDoc | null,
      tenantID,
    }
  } catch {
    return { doc: null, tenantID }
  }
}

function withTenant(href: string, tenantID: string | null) {
  if (!tenantID) return href
  const separator = href.includes('?') ? '&' : '?'
  return `${href}${separator}tenant=${encodeURIComponent(tenantID)}`
}

function getChoice<Value extends string>(
  value: unknown,
  choices: readonly Value[],
  fallback: Value,
): Value {
  return choices.includes(value as Value) ? (value as Value) : fallback
}

function StandardMediaEmptyState({
  description,
  props,
  tenantID,
  title,
}: {
  description: string
  props: WidgetServerProps
  tenantID: string | null
  title: string
}) {
  return (
    <section className="campaign-dashboard-widget campaign-dashboard-widget--media-empty">
      <div className="campaign-dashboard-widget__header">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {!tenantID ? (
        <EmptyState>Select a site to see its shared images.</EmptyState>
      ) : (
        <a
          className="campaign-dashboard-widget__primary-link"
          href={withTenant(adminURL(props.req, '/collections/standard-media/create'), tenantID)}
        >
          Set up website images
        </a>
      )}
    </section>
  )
}

export async function HomepageBannerWidget(props: WidgetServerProps) {
  if (!canAccessCollection(props.req.user as DashboardUser, 'standard-media')) {
    return null
  }

  const { doc, tenantID } = await findStandardMediaForDashboard(props)
  if (!doc?.id) {
    return (
      <StandardMediaEmptyState
        description="Add the hero image and its homepage display settings."
        props={props}
        tenantID={tenantID}
        title="Homepage Banner"
      />
    )
  }

  const editHref = withTenant(
    adminURL(props.req, `/collections/standard-media/${doc.id}`),
    tenantID,
  )

  return (
    <DashboardBannerWidgetClient
      documentId={String(doc.id)}
      editHref={editHref}
      initialBanner={normalizeDashboardMedia(doc.bannerImage)}
      initialDefaultFeaturedImage={normalizeDashboardMedia(doc.defaultFeaturedImage)}
      initialMobileHeadshot={normalizeDashboardMedia(doc.mobileHeadshot)}
      initialSettings={{
        heroImageHorizontalAlign: getChoice(
          doc.heroImageHorizontalAlign,
          ['left', 'center', 'right'] as const,
          'center',
        ),
        heroImageVerticalAlign: getChoice(
          doc.heroImageVerticalAlign,
          ['top', 'center', 'bottom'] as const,
          'center',
        ),
        heroTextAlign: getChoice(doc.heroTextAlign, ['left', 'right'] as const, 'left'),
        heroTextSize: getChoice(
          doc.heroTextSize,
          ['small', 'default', 'large'] as const,
          'default',
        ),
      }}
      tenantId={tenantID}
    />
  )
}

export async function NavbarLinksWidget(props: WidgetServerProps) {
  if (!canAccessCollection(props.req.user as DashboardUser, 'navbars')) {
    return null
  }

  const { doc, links, tenantID } = await findNavbarForDashboard(props)
  const editHref = doc?.id
    ? adminURL(props.req, `/collections/navbars/${doc.id}`)
    : withTenant(adminURL(props.req, '/collections/navbars/create'), tenantID)

  return (
    <section className="campaign-dashboard-widget campaign-dashboard-widget--site-panel">
      <div className="campaign-dashboard-widget__header campaign-dashboard-widget__header--media">
        <div>
          <h2>Navbar Links</h2>
          <p>Review the current site navigation without opening the full navbar editor.</p>
        </div>
        {tenantID ? <a href={editHref}>{doc?.id ? 'Edit navbar' : 'Create navbar'}</a> : null}
      </div>
      {!tenantID ? (
        <EmptyState>Select a site to see its navbar links.</EmptyState>
      ) : links.length ? (
        <ul className="campaign-dashboard-widget__navbar-links">
          {links.map((link) => (
            <li
              className="campaign-dashboard-widget__navbar-link"
              data-depth={Math.min(link.depth, 2)}
              data-state={link.state}
              key={link.id}
            >
              {link.href ? (
                <a
                  aria-label={`${link.label}: ${link.displayHref} (opens in a new tab)`}
                  href={link.href}
                  rel="noopener noreferrer"
                  target="_blank"
                  title={link.displayHref}
                >
                  <strong>{link.label}</strong>
                  <span title={link.displayHref}>{link.displayHref}</span>
                  <ExternalLink aria-hidden size={15} strokeWidth={1.9} />
                </a>
              ) : (
                <div aria-disabled="true" title={link.displayHref}>
                  <strong>{link.label}</strong>
                  <span>{link.displayHref}</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>
          {doc?.id ? 'This navbar has no links yet.' : 'No navbar has been created for this site.'}
        </EmptyState>
      )}
    </section>
  )
}

export async function MySitesWidget(props: WidgetServerProps) {
  const [assignedSites, availableSites] = await Promise.all([
    findAssignedSites(props),
    findAvailableSites(props),
  ])
  const selectedTenantID = getSelectedTenantID(props.req)
  const canEditSiteSettings = canAccessCollection(props.req.user as DashboardUser, 'tenants')
  const sitesByID = new Map(availableSites.map((site) => [site.id, site]))
  for (const site of assignedSites) sitesByID.set(site.id, site)
  const sites: DashboardSiteOption[] = Array.from(sitesByID.values()).map((site) => ({
    ...site,
    editHref: `${adminURL(props.req, '/collections/pages')}?tenant=${encodeURIComponent(site.id)}`,
    settingsHref: canEditSiteSettings
      ? adminURL(props.req, `/collections/tenants/${site.id}`)
      : null,
    viewHref: getPublicSiteURL(site.slug),
  }))

  return (
    <MySitesWidgetClient
      initialAssignedIDs={assignedSites.map((site) => site.id)}
      selectedTenantID={selectedTenantID}
      sites={sites}
    />
  )
}

export async function SiteManagementWidget(props: WidgetServerProps) {
  const [navbarLinks, mySites] = await Promise.all([NavbarLinksWidget(props), MySitesWidget(props)])

  if (!navbarLinks && !mySites) return null

  return (
    <div className="campaign-dashboard-widget-stack">
      {navbarLinks}
      {mySites}
    </div>
  )
}

export async function WebsiteShortcutsWidget(props: WidgetServerProps) {
  const shortcuts = await getWebsiteShortcutTasks(props.req)

  return (
    <section className="campaign-dashboard-widget campaign-dashboard-widget--shortcuts">
      <div className="campaign-dashboard-widget__header">
        <h2>Website Shortcuts</h2>
        <p>Jump directly to common website-wide updates.</p>
      </div>
      <div className="campaign-dashboard-widget__shortcut-list">
        {shortcuts.map((task) => {
          const Icon = taskIcons[task.key] || FileText
          return (
            <a className="campaign-dashboard-widget__shortcut" href={task.href} key={task.key}>
              <span className="campaign-dashboard-widget__shortcut-mark">
                <Icon aria-hidden size={19} strokeWidth={1.9} />
              </span>
              <span>
                <strong>{task.label}</strong>
                <small>{task.description}</small>
              </span>
              <span aria-hidden className="campaign-dashboard-widget__shortcut-arrow">
                →
              </span>
            </a>
          )
        })}
      </div>
    </section>
  )
}

export async function RecentActivityWidget(props: WidgetServerProps) {
  const tenantID = getSelectedTenantID(props.req)
  const items = await findRecentActivity(props)

  return (
    <section className="campaign-dashboard-widget">
      <div className="campaign-dashboard-widget__header">
        <h2>Recent Activity</h2>
        <p>Continue from the latest edited docs in this tenant.</p>
      </div>
      {!tenantID ? (
        <EmptyState>Select a tenant to see recent activity.</EmptyState>
      ) : items.length ? (
        <ActivityList items={items} />
      ) : (
        <EmptyState>No recent tenant activity yet.</EmptyState>
      )}
    </section>
  )
}

export async function DraftsWidget(props: WidgetServerProps) {
  const tenantID = getSelectedTenantID(props.req)
  const drafts = await findDrafts(props)

  return (
    <section className="campaign-dashboard-widget">
      <div className="campaign-dashboard-widget__header">
        <h2>Drafts Needing Publish</h2>
        <p>Tenant drafts that are not live yet.</p>
      </div>
      {!tenantID ? (
        <EmptyState>Select a tenant to see drafts.</EmptyState>
      ) : drafts.length ? (
        <ActivityList items={drafts} />
      ) : (
        <EmptyState>No draft posts, pages, forms, or emails are waiting to publish.</EmptyState>
      )}
    </section>
  )
}

export async function PublishingOverviewWidget(props: WidgetServerProps) {
  const tenantID = getSelectedTenantID(props.req)
  const [items, drafts] = await Promise.all([findRecentActivity(props), findDrafts(props)])

  return (
    <section className="campaign-dashboard-widget campaign-dashboard-widget--publishing">
      <div className="campaign-dashboard-widget__split">
        <div className="campaign-dashboard-widget__split-section">
          <div className="campaign-dashboard-widget__header">
            <h2>Continue Editing</h2>
            <p>Recently updated content in this site workspace.</p>
          </div>
          {!tenantID ? (
            <EmptyState>Select a site to see recent activity.</EmptyState>
          ) : items.length ? (
            <ActivityList items={items} />
          ) : (
            <EmptyState>No recent activity yet.</EmptyState>
          )}
        </div>
        <div className="campaign-dashboard-widget__split-section">
          <div className="campaign-dashboard-widget__header">
            <h2>Drafts to Review</h2>
            <p>Unpublished work that may be ready for another look.</p>
          </div>
          {!tenantID ? (
            <EmptyState>Select a site to see drafts.</EmptyState>
          ) : drafts.length ? (
            <ActivityList items={drafts} />
          ) : (
            <EmptyState>No drafts are waiting for review.</EmptyState>
          )}
        </div>
      </div>
    </section>
  )
}
