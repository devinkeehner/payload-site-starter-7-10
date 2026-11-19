'use client'

import { Button } from '@payloadcms/ui'
import {
  ArrowUpRight,
  ContactRound,
  Image,
  Link2,
  Mail,
  Menu,
  Search,
  Settings,
  UsersRound,
} from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { setSelectedTenantCookie } from '@/components/admin/hooks/useActiveTenant'
import { siteSettingsDocumentURL, siteSettingsURL, type SiteSettingsSection } from './sections'
import styles from './site-settings.module.scss'

const icons = {
  profile: ContactRound,
  images: Image,
  social: UsersRound,
  search: Search,
  navigation: Menu,
  email: Mail,
  links: Link2,
  administration: Settings,
}

export function CreateSettingsRecordButton({ href, tenant }: { href: string; tenant: string }) {
  return (
    <Button
      buttonStyle="secondary"
      onClick={() => {
        setSelectedTenantCookie(tenant)
        window.location.assign(href)
      }}
    >
      Create settings record
    </Button>
  )
}

export type SiteSettingsLayoutProps = {
  adminRoute: string
  section: SiteSettingsSection
  sections: readonly SiteSettingsSection[]
  site: { id: string; name: string; website: string } | null
  recordID?: string
}

export function SiteSettingsLayout({
  adminRoute,
  section,
  sections,
  site,
  recordID,
  children,
}: SiteSettingsLayoutProps & {
  children?: ReactNode
}) {
  return (
    <div className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <p className={styles.siteLabel}>{site?.name || 'Choose a site'}</p>
          <h1>Site settings</h1>
        </div>
        {site && (
          <a className={styles.website} href={site.website} target="_blank" rel="noreferrer">
            View website <ArrowUpRight size={16} aria-hidden />
          </a>
        )}
      </header>
      <nav
        className={styles.sections}
        aria-label="Site settings sections"
        style={{ '--section-count': sections.length } as CSSProperties}
      >
        {sections.map((item) => {
          const Icon = icons[item.key]
          const href =
            site && recordID && item.owner === section.owner
              ? siteSettingsDocumentURL(adminRoute, site.id, item, recordID)
              : siteSettingsURL(adminRoute, site?.id, item.key)
          return (
            <a
              key={item.key}
              href={href}
              aria-current={item.key === section.key ? 'page' : undefined}
            >
              <Icon size={17} strokeWidth={1.8} aria-hidden />
              {item.label}
            </a>
          )
        })}
      </nav>
      <div className={styles.sectionHeading}>
        <h2>{section.label}</h2>
        <p>{section.description}</p>
      </div>
      {children}
    </div>
  )
}
