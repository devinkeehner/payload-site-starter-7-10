'use client'

import Link from 'next/link'
import React from 'react'
import { useTheme } from '@payloadcms/ui'

import { useActiveTenant } from './useActiveTenant'

export type BreadcrumbCrumb = {
  label: React.ReactNode
  href?: string
  current?: boolean
}

function useTenantCrumb(): BreadcrumbCrumb | null {
  const { tenant, tenantID } = useActiveTenant()
  if (!tenant && !tenantID) return null

  return {
    label: tenant?.name || tenant?.slug || tenantID || 'Site',
    href: '/admin',
  }
}

const getTenantColor = (theme: 'light' | 'dark') => (theme === 'dark' ? '#facc15' : '#dc2626')

export interface TenantBreadcrumbBarProps {
  collectionLabel?: string
  collectionHref?: string
  docLabel?: string
}

export const TenantBreadcrumbBar: React.FC<TenantBreadcrumbBarProps> = ({ collectionLabel, collectionHref, docLabel }) => {
  const { theme } = useTheme()
  const tenantCrumb = useTenantCrumb()

  const crumbs: BreadcrumbCrumb[] = []
  if (tenantCrumb) crumbs.push(tenantCrumb)
  if (collectionLabel) {
    crumbs.push({ label: collectionLabel, href: collectionHref })
  }
  if (docLabel) {
    crumbs.push({ label: docLabel, current: true })
  }

  const tenantColor = getTenantColor(theme === 'dark' ? 'dark' : 'light')

  return (
    <nav
      aria-label="breadcrumb"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.65rem',
        fontSize: '1.05rem',
        fontWeight: 600,
      }}
    >
      <Link
        href="/admin"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.75rem',
          textDecoration: 'none',
          color: 'var(--theme-text)',
        }}
      >
        <img
          src="/brand/icon-light.svg"
          alt="Admin Home"
          style={{
            height: 40,
            width: 40,
            borderRadius: '50%',
            objectFit: 'contain',
            background: 'var(--theme-elevation-50)',
            padding: '0.4rem',
          }}
        />
      </Link>
      {crumbs.map((crumb, index) => {
        const isTenant = index === 0
        const isLast = index === crumbs.length - 1
        const color = isTenant ? tenantColor : 'var(--theme-text)'
        const node = crumb.href && !isLast ? (
          <Link
            href={crumb.href}
            style={{
              color,
              fontWeight: isTenant || isLast ? 700 : 500,
              textDecoration: 'none',
            }}
          >
            {crumb.label}
          </Link>
        ) : (
          <span
            style={{
              color,
              fontWeight: isTenant || isLast ? 700 : 500,
            }}
          >
            {crumb.label}
          </span>
        )

        return (
          <React.Fragment key={index}>
            {index > 0 && <span style={{ opacity: 0.5 }}>›</span>}
            {node}
          </React.Fragment>
        )
      })}
    </nav>
  )
}
