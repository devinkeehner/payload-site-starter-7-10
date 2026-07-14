'use client'

import type { NavGroupType } from '@payloadcms/ui/shared'

import { Link, Logout, NavGroup, useConfig, useNav, useTranslation } from '@payloadcms/ui'
import { EntityType } from '@payloadcms/ui/shared'
import {
  Bell,
  Building2,
  ClipboardList,
  Facebook,
  FileText,
  FolderTree,
  Globe2,
  ImageIcon,
  Inbox,
  KeyRound,
  LayoutTemplate,
  ListChecks,
  Mail,
  PanelBottom,
  PanelTop,
  Palette,
  Plus,
  Route,
  Search,
  Tags,
  UserRoundPlus,
  Users,
  type LucideIcon,
  X,
} from 'lucide-react'
import { usePathname } from 'next/navigation'
import { formatAdminURL } from 'payload/shared'
import React from 'react'

import { type AdminTask } from '@/components/admin/dashboard/adminDashboardShared'
import {
  ADMIN_WORKSPACE_SECTIONS,
  getAdminWorkspaceLabel,
} from '@/components/admin/adminWorkspace'
import {
  applyAdminPalette,
  getStoredAdminPalette,
  storeAdminPalette,
  type AdminPalette,
} from '@/components/admin/theme/adminPalette'

import './campaign-admin-nav.scss'

type Props = {
  afterNav?: React.ReactNode
  afterNavLinks?: React.ReactNode
  beforeNav?: React.ReactNode
  beforeNavLinks?: React.ReactNode
  groups: NavGroupType[]
  tasks: AdminTask[]
}

const baseClass = 'nav'

const entityIcons: Record<string, LucideIcon> = {
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
  'graphic-designs': Palette,
  header: PanelTop,
  media: ImageIcon,
  navbars: PanelTop,
  pages: LayoutTemplate,
  'payload-mcp-api-keys': KeyRound,
  posts: FileText,
  'rep-info': Building2,
  redirects: Route,
  search: Search,
  'site-seo': Search,
  'standard-media': ImageIcon,
  tenants: Building2,
  users: Users,
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
  if (type !== EntityType.collection) return Globe2
  return entityIcons[slug] || FolderTree
}

function NavLinkIcon({ Icon }: { Icon: LucideIcon }) {
  return (
    <span className="campaign-admin-nav__link-icon">
      <Icon aria-hidden="true" size={15} strokeWidth={2} />
    </span>
  )
}

export function CampaignAdminNavClient({
  afterNav,
  afterNavLinks,
  beforeNav,
  beforeNavLinks,
  groups,
  tasks,
}: Props) {
  const pathname = usePathname()
  const { config } = useConfig()
  const { navOpen, navRef, hydrated, setNavOpen, shouldAnimate } = useNav()
  const { i18n } = useTranslation()
  const [adminPalette, setAdminPalette] = React.useState<AdminPalette>('default')
  const adminRoute = config.routes.admin
  const navClasses = [
    baseClass,
    'campaign-admin-nav',
    navOpen && `${baseClass}--nav-open`,
    shouldAnimate && `${baseClass}--nav-animate`,
    hydrated && `${baseClass}--nav-hydrated`,
  ]
    .filter(Boolean)
    .join(' ')

  React.useEffect(() => {
    const storedPalette = getStoredAdminPalette()
    setAdminPalette(storedPalette)
    applyAdminPalette(storedPalette)
  }, [])

  const toggleAdminPalette = () => {
    const nextPalette: AdminPalette = adminPalette === 'color' ? 'default' : 'color'
    setAdminPalette(nextPalette)
    storeAdminPalette(nextPalette)
    applyAdminPalette(nextPalette)
    window.dispatchEvent(new CustomEvent('admin-palette-change', { detail: nextPalette }))
  }

  const closeNav = React.useCallback(() => {
    setNavOpen(false)
  }, [setNavOpen])

  const closeNavOnSmallScreen = React.useCallback(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) {
      closeNav()
    }
  }, [closeNav])

  React.useEffect(() => {
    if (!navOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeNav()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeNav, navOpen])

  const createPostTask = tasks.find((task) => task.key === 'createPost')

  return (
    <>
      <button
        aria-hidden={!navOpen}
        className="campaign-admin-nav__scrim"
        data-open={navOpen ? 'true' : 'false'}
        onClick={closeNav}
        tabIndex={navOpen ? 0 : -1}
        type="button"
      />
      <aside className={navClasses} inert={!navOpen ? true : undefined}>
        <div className={`${baseClass}__scroll`} ref={navRef}>
          <div className="campaign-admin-nav__mobile-header">
            <strong>Workspace</strong>
            <button aria-label="Close menu" onClick={closeNav} type="button">
              <X aria-hidden="true" size={18} strokeWidth={2} />
            </button>
          </div>
          {beforeNav}
          <nav className={`${baseClass}__wrap`}>
            {beforeNavLinks}
            {createPostTask ? (
              <Link
                className="campaign-admin-nav__create"
                href={createPostTask.href}
                onClick={closeNavOnSmallScreen}
                prefetch={false}
              >
                <Plus aria-hidden="true" size={17} strokeWidth={2.25} />
                <span>New post</span>
              </Link>
            ) : null}

            {groups.map(({ entities, label }) => {
              const workspaceSection = ADMIN_WORKSPACE_SECTIONS.find((section) => section.label === label)

              return (
                <NavGroup isOpen={workspaceSection?.defaultOpen} label={label} key={label}>
                  {entities.map(({ slug, type, label: entityLabel }, index) => {
                    const href =
                      type === EntityType.collection
                        ? formatAdminURL({ adminRoute, path: `/collections/${slug}` })
                        : formatAdminURL({ adminRoute, path: `/globals/${slug}` })
                    const isActive =
                      pathname.startsWith(href) && ['/', undefined].includes(pathname[href.length])
                    const Icon = getEntityIcon(String(slug), type)
                    const rawLabel = getEntityLabel(entityLabel, i18n?.language)
                    const content = (
                      <>
                        {isActive ? <div className={`${baseClass}__link-indicator`} /> : null}
                        <NavLinkIcon Icon={Icon} />
                        <span className={`${baseClass}__link-label campaign-admin-nav__link-label`}>
                          {getAdminWorkspaceLabel(String(slug), rawLabel)}
                        </span>
                      </>
                    )

                    if (pathname === href) {
                      return (
                        <div
                          className={`${baseClass}__link campaign-admin-nav__link`}
                          id={`nav-${slug}`}
                          key={`${slug}-${index}`}
                        >
                          {content}
                        </div>
                      )
                    }

                    return (
                      <Link
                        className={`${baseClass}__link campaign-admin-nav__link`}
                        href={href}
                        id={`nav-${slug}`}
                        key={`${slug}-${index}`}
                        onClick={closeNavOnSmallScreen}
                        prefetch={false}
                      >
                        {content}
                      </Link>
                    )
                  })}
                </NavGroup>
              )
            })}
            {afterNavLinks}
            <div className={`${baseClass}__controls campaign-admin-nav__controls`}>
              <button
                aria-pressed={adminPalette === 'color'}
                className="campaign-admin-nav__palette-toggle"
                onClick={toggleAdminPalette}
                title={adminPalette === 'color' ? 'Use the standard palette' : 'Add color accents'}
                type="button"
              >
                <Palette aria-hidden="true" size={16} strokeWidth={2} />
                <span>{adminPalette === 'color' ? 'Accents on' : 'Color accents'}</span>
              </button>
              <Logout />
            </div>
          </nav>
          {afterNav}
        </div>
      </aside>
    </>
  )
}
