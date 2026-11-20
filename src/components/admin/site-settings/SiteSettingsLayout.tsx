'use client'

import { Button } from '@payloadcms/ui'
import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { setSelectedTenantCookie } from '@/components/admin/hooks/useActiveTenant'
import { siteSettingsDocumentURL, siteSettingsURL, type SiteSettingsSection } from './sections'
import styles from './site-settings.module.scss'

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
  const links = sections.map((item) => {
    const href =
      site && recordID && item.owner === section.owner
        ? siteSettingsDocumentURL(adminRoute, site.id, item, recordID)
        : siteSettingsURL(adminRoute, site?.id, item.key)

    return (
      <a key={item.key} href={href} aria-current={item.key === section.key ? 'page' : undefined}>
        {item.label}
      </a>
    )
  })

  return (
    <div className={styles.workspace}>
      <header className={styles.header}>
        {recordID ? <h2>Site settings</h2> : <h1>Site settings</h1>}
        {!recordID && site && <span>{site.name}</span>}
      </header>
      <nav aria-label="Site settings sections">
        <div className={styles.sections}>{links}</div>
        <details className={styles.sectionMenu} key={section.key}>
          <summary>
            {section.label}
            <ChevronDown size={16} aria-hidden />
          </summary>
          <div>{links}</div>
        </details>
      </nav>
      {!recordID && <p className={styles.description}>{section.description}</p>}
      {children}
    </div>
  )
}
