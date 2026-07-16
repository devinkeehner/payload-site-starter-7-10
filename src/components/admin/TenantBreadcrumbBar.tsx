'use client'

import Image from 'next/image'
import Link from 'next/link'
import React, { useEffect, useState } from 'react'
import { useTheme } from '@payloadcms/ui'

import { useActiveTenant } from './hooks/useActiveTenant'

export type BreadcrumbCrumb = {
  label: React.ReactNode
  href?: string
  current?: boolean
}

const getTenantColor = (theme: 'light' | 'dark') => (theme === 'dark' ? '#facc15' : '#dc2626')

export interface TenantBreadcrumbBarProps {
  collectionLabel?: string
  collectionHref?: string
  docLabel?: string
}

export const TenantBreadcrumbBar: React.FC<TenantBreadcrumbBarProps> = ({ collectionLabel, collectionHref, docLabel }) => {
  const { theme } = useTheme()
  const { tenant, tenantID } = useActiveTenant()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const tenantCrumb: BreadcrumbCrumb | null = tenant || tenantID
    ? {
        label: tenant?.name || tenant?.slug || tenantID || 'Site',
        href: '/admin',
      }
    : null

  const crumbs: BreadcrumbCrumb[] = []
  if (mounted && tenantCrumb) crumbs.push(tenantCrumb)
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
        <Image
          src="/brand/icon-light.svg"
          alt="Admin Home"
          width={40}
          height={40}
          style={{
            borderRadius: '50%',
            objectFit: 'contain',
            background: 'var(--theme-elevation-50)',
            padding: '0.4rem',
          }}
        />
      </Link>
      {mounted && crumbs.map((crumb, index) => {
        const isTenant = index === 0
        const isLast = index === crumbs.length - 1
        const color = isTenant ? tenantColor : 'var(--theme-text)'
        const node = crumb.href && !isLast ? (
          <Link
            key={index}
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
            key={index}
            style={{
              color,
              fontWeight: isTenant || isLast ? 700 : 500,
            }}
          >
            {crumb.label}
          </span>
        )

        return (
          <React.Fragment key={`crumb-${index}`}>
            {index > 0 && <span style={{ opacity: 0.5 }}>›</span>}
            {node}
          </React.Fragment>
        )
      })}
    </nav>
  )
}
