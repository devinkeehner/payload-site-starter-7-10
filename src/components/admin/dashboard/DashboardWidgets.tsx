import type { CollectionSlug, PayloadRequest, WidgetServerProps } from 'payload'
import type React from 'react'
import { formatAdminURL } from 'payload/shared'
import {
  Bell,
  BookOpen,
  Building2,
  ClipboardList,
  Facebook,
  FileText,
  FolderTree,
  House,
  ImageIcon,
  Inbox,
  KeyRound,
  LayoutTemplate,
  ListChecks,
  Mail,
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
  collectionHelperText,
  getQuickTasks,
  getSelectedTenantID,
  type AdminTask,
} from './adminDashboardMeta'

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
  editHomepage: House,
  editHeader: PanelTop,
  editFooter: PanelBottom,
  createForm: ClipboardList,
  editBoomBar: Bell,
  facebookSettings: Facebook,
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
  if (!Array.isArray(selected)) return null

  const slugs = selected.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
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
      const label = getLocalizedLabel(adminCollection.labels?.plural, slug)
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
            const item = doc as unknown as Record<string, unknown> & { id: string | number; updatedAt?: string }
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
            const item = doc as unknown as Record<string, unknown> & { id: string | number; updatedAt?: string }
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
  const Icon = taskIcons[task.key]

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
              {collectionHelperText[item.collection] ? `${item.collection} · ` : ''}
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
          <h2>Admin Collections</h2>
          <p>Everything visible here is available to your role.</p>
        </div>
        <BookOpen aria-hidden className="campaign-dashboard-widget__header-icon" size={30} strokeWidth={1.8} />
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
  const tasks = await getQuickTasks(props.req)

  return (
    <section className="campaign-dashboard-widget campaign-dashboard-widget--tasks">
      <div className="campaign-dashboard-widget__header campaign-dashboard-widget__header--launcher">
        <div>
          <h2>Common Tasks</h2>
          <p>Start the admin workflows editors use most.</p>
        </div>
        <ClipboardList
          aria-hidden
          className="campaign-dashboard-widget__header-icon"
          size={30}
          strokeWidth={1.8}
        />
      </div>
      <div className="campaign-dashboard-widget__task-grid">
        {tasks.map((task) => (
          <TaskCard key={task.key} task={task} />
        ))}
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
