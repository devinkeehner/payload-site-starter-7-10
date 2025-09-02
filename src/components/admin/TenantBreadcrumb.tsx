'use client'

<<<<<<< HEAD
import React, { useEffect, useMemo, useState } from 'react'

// Minimal tenant type
type Tenant = { id: string; name?: string | null; slug?: string | null }

// Attempt to read current tenant ID from cookies set by the multi-tenant plugin
const readSelectedTenantIDFromCookies = (): string | undefined => {
  if (typeof document === 'undefined') return undefined
  try {
    const cookies = document.cookie.split(';').map((c) => c.trim())
    // Heuristic: check common keys used by multi-tenant plugins
    const guesses = ['payload-tenant', 'tenant', 'selectedTenant', 'currentTenant']
    for (const key of guesses) {
      const found = cookies.find((c) => c.startsWith(key + '='))
      if (found) return decodeURIComponent(found.split('=')[1] || '').trim() || undefined
    }
  } catch {}
  return undefined
}

export const TenantBreadcrumb: React.FC = () => {
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [tenantID, setTenantID] = useState<string | undefined>(undefined)

  useEffect(() => {
    const id = readSelectedTenantIDFromCookies()
    setTenantID(id)
    if (!id) return
    let ignore = false
    const run = async () => {
      try {
        const res = await fetch(`/api/tenants/${id}`, { credentials: 'include' })
        if (!res.ok) return
        const json = await res.json()
        if (!ignore) setTenant(json)
      } catch {}
    }
    run()
    return () => {
      ignore = true
    }
  }, [])

  const label = useMemo(() => tenant?.name || tenant?.slug || tenantID, [tenant, tenantID])
  const href = tenantID ? `/admin/collections/tenants/${tenantID}` : `/admin/collections/tenants`

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem' }}>
      <nav aria-label="breadcrumbs" style={{ fontSize: '0.9rem', color: 'var(--theme-elevation-600)' }}>
        <span style={{ opacity: 0.8 }}>Site</span>
        <span style={{ margin: '0 6px' }}>/</span>
        <a href={href} style={{ textDecoration: 'none', color: 'var(--theme-text)' }}>
          {label || 'Sites'}
        </a>
      </nav>
    </div>
  )
}
=======
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
>>>>>>> c985fd99d0671ff6a542a62758171647f05cde66
