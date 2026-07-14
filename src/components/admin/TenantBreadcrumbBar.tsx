'use client'

import Link from 'next/link'
import React, { useEffect, useState } from 'react'

import AdminIcon from './brand/Icon'
import { useActiveTenant } from './hooks/useActiveTenant'

export type BreadcrumbCrumb = {
  label: React.ReactNode
  href?: string
  current?: boolean
}

export interface TenantBreadcrumbBarProps {
  collectionLabel?: string
  collectionHref?: string
  docLabel?: string
}

export const TenantBreadcrumbBar: React.FC<TenantBreadcrumbBarProps> = ({ collectionLabel, collectionHref, docLabel }) => {
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

  return (
    <nav aria-label="Breadcrumb" className="hro-admin-header__breadcrumbs">
      <Link aria-label="Admin home" className="hro-admin-header__home" href="/admin">
        <AdminIcon />
      </Link>
      {mounted && crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1
        const node = crumb.href && !isLast ? (
          <Link className="hro-admin-header__crumb" key={index} href={crumb.href}>
            {crumb.label}
          </Link>
        ) : (
          <span
            className="hro-admin-header__crumb hro-admin-header__crumb--current"
            key={index}
          >
            {crumb.label}
          </span>
        )

        return (
          <React.Fragment key={`crumb-${index}`}>
            {index > 0 && <span aria-hidden="true" className="hro-admin-header__separator">/</span>}
            {node}
          </React.Fragment>
        )
      })}
    </nav>
  )
}
