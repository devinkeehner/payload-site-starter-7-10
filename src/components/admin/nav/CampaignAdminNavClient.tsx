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
  Route,
  Search,
  Tags,
  UserRoundPlus,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { usePathname } from 'next/navigation'
import { formatAdminURL } from 'payload/shared'
import React from 'react'

import { type AdminTask } from '@/components/admin/dashboard/adminDashboardShared'
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
  editHomepage: LayoutTemplate,
  editHeader: PanelTop,
  editFooter: PanelBottom,
  createForm: ClipboardList,
  editBoomBar: Bell,
  facebookSettings: Facebook,
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
  const { navOpen, navRef, hydrated, shouldAnimate } = useNav()
  const { i18n } = useTranslation()
  const [adminPalette, setAdminPalette] = React.useState<AdminPalette>('default')
  const adminRoute = config.routes.admin
  const navClasses = [
    baseClass,
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

  return (
    <aside className={navClasses} inert={!navOpen ? true : undefined}>
      <div className={`${baseClass}__scroll`} ref={navRef}>
        {beforeNav}
        <nav className={`${baseClass}__wrap`}>
          {beforeNavLinks}
          <NavGroup isOpen label="Common Tasks">
            {tasks.map((task) => {
              const isActive = pathname === task.href
              const Icon = taskIcons[task.key]
              const content = (
                <>
                  {isActive ? <div className={`${baseClass}__link-indicator`} /> : null}
                  <NavLinkIcon Icon={Icon} />
                  <span className={`${baseClass}__link-label campaign-admin-nav__link-label`}>
                    {task.label}
                  </span>
                </>
              )

              if (isActive) {
                return (
                  <div className={`${baseClass}__link campaign-admin-nav__link`} key={task.key}>
                    {content}
                  </div>
                )
              }

              return (
                <Link
                  className={`${baseClass}__link campaign-admin-nav__link`}
                  href={task.href}
                  key={task.key}
                  prefetch={false}
                >
                  {content}
                </Link>
              )
            })}
          </NavGroup>

          {groups.map(({ entities, label }) => {
            return (
              <NavGroup label={label} key={label}>
                {entities.map(({ slug, type, label: entityLabel }, index) => {
                  const href =
                    type === EntityType.collection
                      ? formatAdminURL({ adminRoute, path: `/collections/${slug}` })
                      : formatAdminURL({ adminRoute, path: `/globals/${slug}` })
                  const isActive =
                    pathname.startsWith(href) && ['/', undefined].includes(pathname[href.length])
                  const Icon = getEntityIcon(String(slug), type)
                  const content = (
                    <>
                      {isActive ? <div className={`${baseClass}__link-indicator`} /> : null}
                      <NavLinkIcon Icon={Icon} />
                      <span className={`${baseClass}__link-label campaign-admin-nav__link-label`}>
                        {getEntityLabel(entityLabel, i18n?.language)}
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
              title={adminPalette === 'color' ? 'Use standard admin palette' : 'Use colorful admin palette'}
              type="button"
            >
              <Palette aria-hidden="true" size={16} strokeWidth={2} />
              <span>{adminPalette === 'color' ? 'Color On' : 'Color Mode'}</span>
            </button>
            <Logout />
          </div>
        </nav>
        {afterNav}
      </div>
    </aside>
  )
}
