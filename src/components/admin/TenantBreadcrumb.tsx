'use client'

import React from 'react'
import Link from 'next/link'
import { useTenantSelection } from '@payloadcms/plugin-multi-tenant/client'

export const TenantBreadcrumb = ({ children }: { children?: React.ReactNode }) => {
  const { selectedTenantID, options } = useTenantSelection()
  const label = options.find((o) => o.value === selectedTenantID)?.label

  if (!label) {
    return <>{children}</>
  }

  return (
    <>
      <li>
        <Link href="/admin">{label}</Link>
      </li>
      {children}
    </>
  )
}

export default TenantBreadcrumb
