'use client'

import type { NavGroupType } from '@payloadcms/ui/shared'

import { Link, useConfig, useTranslation } from '@payloadcms/ui'
import { EntityType } from '@payloadcms/ui/shared'
import { usePathname } from 'next/navigation'
import { formatAdminURL } from 'payload/shared'
import React from 'react'

import type {
  AdminWorkspaceFlyoutEntryKind,
  AdminWorkspaceNavAreaKey,
} from '@/components/admin/adminWorkspace'
import {
  getAdminWorkspaceDescription,
  getAdminWorkspaceLabel,
} from '@/components/admin/adminWorkspace'
import { type AdminTask } from '@/components/admin/dashboard/adminDashboardShared'
import './campaign-admin-nav.scss'

type AdminNavArea = {
  description: string
  entities: NavGroupType['entities']
  key: AdminWorkspaceNavAreaKey
  label: string
  primaryTaskKey?: AdminTask['key']
  quickLinks?: Array<{
    action?: 'bulkUpload'
    description?: string
    heading?: string
    href: string
    kind: AdminWorkspaceFlyoutEntryKind
    label: string
    slug?: string
  }>
  suppressEntityLinks?: boolean
}

type Props = {
  afterNav?: React.ReactNode
  afterNavLinks?: React.ReactNode
  areas?: AdminNavArea[]
  tasks?: AdminTask[]
}

const baseClass = 'nav'
const mediaBulkUploadRequestKey = 'campaign-admin-open-media-bulk-upload'

type NavGlyphName =
  | 'archive'
  | 'clipboard'
  | 'close'
  | 'folder'
  | 'globe'
  | 'grid'
  | 'home'
  | 'image'
  | 'logout'
  | 'mail'
  | 'more'
  | 'palette'
  | 'plus'
  | 'search'
  | 'settings'
  | 'users'

function NavGlyph({ name, size = 20 }: { name: NavGlyphName; size?: number }) {
  let content: React.ReactNode

  switch (name) {
    case 'archive':
      content = (
        <>
          <path d="M4 8h16v11H4z" />
          <path d="M3 4h18v4H3zM9 12h6" />
        </>
      )
      break
    case 'clipboard':
      content = (
        <>
          <rect x="5" y="4" width="14" height="17" rx="2" />
          <path d="M9 4V2h6v2M9 9h6M9 13h6M9 17h4" />
        </>
      )
      break
    case 'close':
      content = <path d="M6 6l12 12M18 6L6 18" />
      break
    case 'globe':
      content = (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
        </>
      )
      break
    case 'grid':
      content = (
        <>
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
        </>
      )
      break
    case 'home':
      content = (
        <>
          <path d="M3 11l9-8 9 8" />
          <path d="M5 10v11h14V10M9 21v-7h6v7" />
        </>
      )
      break
    case 'image':
      content = (
        <>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="M4 17l5-5 4 4 3-3 4 4" />
        </>
      )
      break
    case 'logout':
      content = (
        <>
          <path d="M10 4H4v16h6M14 8l4 4-4 4M8 12h10" />
        </>
      )
      break
    case 'mail':
      content = (
        <>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M4 7l8 6 8-6" />
        </>
      )
      break
    case 'more':
      content = <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth="3" />
      break
    case 'palette':
      content = (
        <>
          <path d="M12 3a9 9 0 100 18h2a2 2 0 000-4h-1a2 2 0 010-4h3a5 5 0 005-5c0-3-4-5-9-5z" />
          <circle cx="7" cy="10" r="1" fill="currentColor" />
          <circle cx="9" cy="6" r="1" fill="currentColor" />
          <circle cx="14" cy="6" r="1" fill="currentColor" />
        </>
      )
      break
    case 'plus':
      content = <path d="M12 5v14M5 12h14" />
      break
    case 'search':
      content = (
        <>
          <circle cx="10" cy="10" r="6" />
          <path d="M15 15l6 6" />
        </>
      )
      break
    case 'settings':
      content = (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
        </>
      )
      break
    case 'users':
      content = (
        <>
          <circle cx="9" cy="8" r="4" />
          <path d="M2 21c0-5 3-8 7-8s7 3 7 8M16 5a4 4 0 010 7M17 14c3 1 5 3 5 7" />
        </>
      )
      break
    default:
      content = (
        <>
          <path d="M3 6h7l2 2h9v12H3z" />
          <path d="M3 6V4h7l2 2" />
        </>
      )
  }

  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      {content}
    </svg>
  )
}

const areaIcons: Record<AdminWorkspaceNavAreaKey, NavGlyphName> = {
  advanced: 'more',
  canvas: 'palette',
  email: 'mail',
  forms: 'clipboard',
  media: 'image',
  pages: 'grid',
  posts: 'archive',
  website: 'globe',
}

const entityIcons: Record<string, NavGlyphName> = {
  contacts: 'users',
  emails: 'mail',
  'email-lists': 'users',
  forms: 'clipboard',
  'form-submissions': 'archive',
  'graphic-designs': 'palette',
  'graphic-templates': 'image',
  media: 'image',
  pages: 'grid',
  posts: 'archive',
  search: 'search',
  'site-seo': 'search',
  'standard-media': 'image',
  tenants: 'globe',
  users: 'users',
  'wordpress-posts': 'archive',
}

function getEntityLabel(label: unknown, locale?: string): string {
  if (typeof label === 'string') return label
  if (label && typeof label === 'object') {
    const labels = label as Record<string, unknown>
    const localized = locale ? labels[locale] : undefined
    if (typeof localized === 'string') return localized
    const fallback = Object.values(labels).find((value) => typeof value === 'string')
    if (typeof fallback === 'string') return fallback
  }
  return ''
}

function getEntityIcon(slug: string, type: EntityType) {
  if (type !== EntityType.collection) return 'globe' satisfies NavGlyphName
  return entityIcons[slug] || 'folder'
}

function isPathActive(pathname: string, href: string) {
  return pathname.startsWith(href) && ['/', undefined].includes(pathname[href.length])
}

export function CampaignAdminNavClient({ afterNav, afterNavLinks, areas = [], tasks = [] }: Props) {
  const pathname = usePathname()
  const { config } = useConfig()
  const { i18n } = useTranslation()
  const [openAreaKey, setOpenAreaKey] = React.useState<AdminWorkspaceNavAreaKey | null>(null)
  const railButtonRefs = React.useRef<
    Partial<Record<AdminWorkspaceNavAreaKey, HTMLButtonElement | null>>
  >({})
  const navAreas = React.useMemo(
    () =>
      Array.from(Array.isArray(areas) ? areas : [], (area) => ({
        ...area,
        entities: Array.from(Array.isArray(area?.entities) ? area.entities : []),
      })),
    [areas],
  )
  const navTasks = Array.isArray(tasks) ? tasks : []
  const adminRoute = config.routes.admin
  const homeHref = formatAdminURL({ adminRoute, path: '/' })
  const navClasses = [
    baseClass,
    'campaign-admin-nav',
    openAreaKey && 'campaign-admin-nav--panel-open',
    `${baseClass}--nav-open`,
    `${baseClass}--nav-hydrated`,
  ]
    .filter(Boolean)
    .join(' ')

  const activeAreaKey = React.useMemo(
    () =>
      navAreas.find((area) =>
        area.entities.some(({ slug, type }) => {
          const href =
            type === EntityType.collection
              ? formatAdminURL({ adminRoute, path: `/collections/${slug}` })
              : formatAdminURL({ adminRoute, path: `/globals/${slug}` })
          return isPathActive(pathname, href)
        }),
      )?.key || null,
    [adminRoute, navAreas, pathname],
  )
  const openArea = navAreas.find((area) => area.key === openAreaKey) || null
  const primaryTask = openArea?.primaryTaskKey
    ? navTasks.find((task) => task.key === openArea.primaryTaskKey)
    : null

  React.useEffect(() => {
    setOpenAreaKey(null)
  }, [pathname])

  const closePanel = React.useCallback(
    (returnFocus = false) => {
      const areaToFocus = openAreaKey
      setOpenAreaKey(null)
      if (returnFocus && areaToFocus) {
        window.requestAnimationFrame(() => railButtonRefs.current[areaToFocus]?.focus())
      }
    },
    [openAreaKey],
  )

  const openMediaBulkUpload = React.useCallback(
    (event?: React.SyntheticEvent) => {
      event?.preventDefault()
      event?.stopPropagation()
      const mediaHref = formatAdminURL({ adminRoute, path: '/collections/media' })
      window.sessionStorage.setItem(mediaBulkUploadRequestKey, '1')
      window.location.assign(mediaHref)
      closePanel()
    },
    [adminRoute, closePanel],
  )

  React.useEffect(() => {
    if (typeof window === 'undefined') return

    const url = new URL(window.location.href)
    const requestedFromURL = url.searchParams.get('openBulkUpload') === '1'
    const requestedFromNavigation = window.sessionStorage.getItem(mediaBulkUploadRequestKey) === '1'
    if (!requestedFromURL && !requestedFromNavigation) return

    let attempts = 0
    const openNativeBulkUpload = window.setInterval(() => {
      attempts += 1
      const bulkUploadButton = Array.from(
        document.querySelectorAll<HTMLButtonElement>('button'),
      ).find(
        (button) =>
          button.getAttribute('aria-label')?.trim().toLowerCase() === 'bulk upload' ||
          button.textContent?.trim().toLowerCase() === 'bulk upload',
      )

      if (bulkUploadButton) {
        window.clearInterval(openNativeBulkUpload)
        window.sessionStorage.removeItem(mediaBulkUploadRequestKey)
        bulkUploadButton.click()
        if (requestedFromURL) {
          url.searchParams.delete('openBulkUpload')
          window.history.replaceState(
            window.history.state,
            '',
            `${url.pathname}${url.search}${url.hash}`,
          )
        }
        return
      }

      if (attempts >= 1200) {
        window.clearInterval(openNativeBulkUpload)
        window.sessionStorage.removeItem(mediaBulkUploadRequestKey)
      }
    }, 100)

    return () => window.clearInterval(openNativeBulkUpload)
  }, [pathname])

  React.useEffect(() => {
    if (!openAreaKey) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      closePanel(true)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closePanel, openAreaKey])

  return (
    <>
      <button
        aria-label="Close navigation panel"
        aria-hidden={!openArea}
        className="campaign-admin-nav__panel-scrim"
        data-open={openArea ? 'true' : 'false'}
        onClick={() => closePanel(true)}
        tabIndex={openArea ? 0 : -1}
        type="button"
      />

      <aside className={navClasses}>
        <div className="campaign-admin-nav__shell">
          <nav aria-label="Admin workspace" className="campaign-admin-nav__rail">
            <div className="campaign-admin-nav__rail-main">
              <Link
                className="campaign-admin-nav__rail-item"
                data-active={pathname === homeHref ? 'true' : 'false'}
                href={homeHref}
                onClick={() => closePanel()}
                prefetch={false}
              >
                <NavGlyph name="home" size={25} />
                <span>Home</span>
              </Link>

              {Array.from(navAreas, (area) => {
                const icon = areaIcons[area.key]
                const isOpen = area.key === openAreaKey
                const isActive = area.key === activeAreaKey

                return (
                  <button
                    aria-controls={`campaign-admin-nav-panel-${area.key}`}
                    aria-expanded={isOpen}
                    className="campaign-admin-nav__rail-item"
                    data-active={isActive || isOpen ? 'true' : 'false'}
                    key={area.key}
                    onClick={() =>
                      setOpenAreaKey((current) => (current === area.key ? null : area.key))
                    }
                    ref={(element) => {
                      railButtonRefs.current[area.key] = element
                    }}
                    type="button"
                  >
                    <NavGlyph name={icon} size={25} />
                    <span>{area.label}</span>
                  </button>
                )
              })}
            </div>

            <div className="campaign-admin-nav__rail-footer">
              <Link
                className="campaign-admin-nav__rail-item"
                href={formatAdminURL({ adminRoute, path: '/logout' })}
                prefetch={false}
              >
                <NavGlyph name="logout" size={23} />
                <span>Log out</span>
              </Link>
            </div>
          </nav>

          {openArea ? (
            <section
              aria-label={`${openArea.label} navigation`}
              className="campaign-admin-nav__panel"
              id={`campaign-admin-nav-panel-${openArea.key}`}
            >
              <div className="campaign-admin-nav__panel-header">
                <div>
                  <h2>{openArea.label}</h2>
                  <p>{openArea.description}</p>
                </div>
                <button
                  aria-label={`Close ${openArea.label} panel`}
                  onClick={() => closePanel(true)}
                  type="button"
                >
                  <NavGlyph name="close" size={18} />
                </button>
              </div>

              {primaryTask ? (
                <Link
                  className="campaign-admin-nav__primary-action"
                  href={primaryTask.href}
                  onClick={() => closePanel()}
                  prefetch={false}
                >
                  <NavGlyph name="plus" size={18} />
                  <span>{primaryTask.label}</span>
                </Link>
              ) : null}

              <div className="campaign-admin-nav__panel-links">
                {openArea.quickLinks?.map((link) => {
                  const className = [
                    'campaign-admin-nav__panel-link',
                    `campaign-admin-nav__panel-link--${link.kind}`,
                  ].join(' ')
                  const icon =
                    link.kind === 'collection'
                      ? getEntityIcon(link.slug || '', EntityType.collection)
                      : 'plus'
                  const content = (
                    <>
                      {link.kind !== 'document' ? (
                        <span className="campaign-admin-nav__panel-link-icon">
                          <NavGlyph name={icon} size={link.kind === 'collection' ? 19 : 17} />
                        </span>
                      ) : null}
                      <span>
                        <strong>{link.label}</strong>
                        {link.description ? <small>{link.description}</small> : null}
                      </span>
                    </>
                  )

                  return (
                    <React.Fragment key={`${link.kind}-${link.href}-${link.label}`}>
                      {link.heading ? (
                        <p className="campaign-admin-nav__panel-section-label">{link.heading}</p>
                      ) : null}
                      {link.action === 'bulkUpload' ? (
                        <button
                          className={className}
                          onClick={openMediaBulkUpload}
                          onPointerDownCapture={openMediaBulkUpload}
                          type="button"
                        >
                          {content}
                        </button>
                      ) : (
                        <Link
                          className={className}
                          data-active={
                            link.kind === 'collection' &&
                            isPathActive(pathname, link.href.split('?')[0] || link.href)
                              ? 'true'
                              : 'false'
                          }
                          href={link.href}
                          onClick={() => closePanel()}
                          prefetch={false}
                        >
                          {content}
                        </Link>
                      )}
                    </React.Fragment>
                  )
                })}

                {!openArea.suppressEntityLinks &&
                  Array.from(openArea.entities, ({ slug, type, label: entityLabel }) => {
                    const entitySlug = String(slug)
                    const href =
                      type === EntityType.collection
                        ? formatAdminURL({ adminRoute, path: `/collections/${slug}` })
                        : formatAdminURL({ adminRoute, path: `/globals/${slug}` })
                    const icon = getEntityIcon(entitySlug, type)
                    const rawLabel = getEntityLabel(entityLabel, i18n?.language)
                    const label = getAdminWorkspaceLabel(entitySlug, rawLabel)

                    return (
                      <Link
                        className="campaign-admin-nav__panel-link"
                        data-active={isPathActive(pathname, href) ? 'true' : 'false'}
                        href={href}
                        id={`nav-${slug}`}
                        key={`${type}-${slug}`}
                        onClick={() => closePanel()}
                        prefetch={false}
                      >
                        <span className="campaign-admin-nav__panel-link-icon">
                          <NavGlyph name={icon} size={19} />
                        </span>
                        <span>
                          <strong>{label}</strong>
                          <small>
                            {getAdminWorkspaceDescription(entitySlug, `Open ${label}.`)}
                          </small>
                        </span>
                      </Link>
                    )
                  })}
              </div>

              {openArea.key === 'advanced' && (afterNavLinks || afterNav) ? (
                <div className="campaign-admin-nav__extensions">
                  {afterNavLinks}
                  {afterNav}
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      </aside>
    </>
  )
}
