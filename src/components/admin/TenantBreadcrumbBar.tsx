'use client'

import Link from 'next/link'
import React from 'react'

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
  tenantSelector?: React.ReactNode
}

export const TenantBreadcrumbBar: React.FC<TenantBreadcrumbBarProps> = ({
  collectionLabel,
  collectionHref,
  docLabel,
  tenantSelector,
}) => {
  const { tenantID, tenantName } = useActiveTenant()
  const crumbs: BreadcrumbCrumb[] = []
  const collectionIsActiveTenant = collectionLabel === tenantName || collectionLabel === tenantID
  if (collectionLabel && !collectionIsActiveTenant) {
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
      {tenantSelector}
      {crumbs.map((crumb, index) => {
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
