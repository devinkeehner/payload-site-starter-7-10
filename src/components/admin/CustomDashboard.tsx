'use client'

import React, { useEffect, useMemo, useState } from 'react';
import { CONTENT_COLLECTIONS } from './collectionGroups';

// Dashboard groups mirror sidebar order
const GROUPS: Record<string, { slug: string; label: string }[]> = {
  Content: CONTENT_COLLECTIONS,
  'Site Settings': [
    { slug: 'rep-info', label: 'Rep & District Settings' },
    { slug: 'navbars', label: 'Navbar' },
    { slug: 'standard-media', label: 'Banners and Social Images' },
    { slug: 'site-seo', label: 'Site SEO' },
  ],
  'Forms & Submissions': [
    { slug: 'forms', label: 'Forms' },
    { slug: 'form-submissions', label: 'Form Submissions' },
  ],
  Admin: [
    { slug: 'categories', label: 'Categories' },
    { slug: 'users', label: 'Users' },
    { slug: 'tenants', label: 'Sites' },
  ],
  Misc: [
    { slug: 'authors', label: 'Authors' },
    { slug: 'tags', label: 'Tags' },
  ],
};

// Minimal tenant type
type Tenant = { id: string; name?: string | null; slug?: string | null }

// Best-effort read of current tenant selection from cookies set by the multi-tenant plugin
const readSelectedTenantIDFromCookies = (): string | undefined => {
  if (typeof document === 'undefined') return undefined
  try {
    const cookies = document.cookie.split(';').map((c) => c.trim())
    const guesses = ['payload-tenant', 'tenant', 'selectedTenant', 'currentTenant']
    for (const key of guesses) {
      const found = cookies.find((c) => c.startsWith(key + '='))
      if (found) return decodeURIComponent(found.split('=')[1] || '').trim() || undefined
    }
  } catch {}
  return undefined
}

const TenantBreadcrumb: React.FC = () => {
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

const CustomDashboard = () => {
  const [tenant, setTenant] = useState<Tenant | null>(null)

  useEffect(() => {
    const id = readSelectedTenantIDFromCookies()
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

  const selectedTenantSlug = tenant?.slug || null

  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ margin: 0, marginBottom: '1rem' }}>Custom Dashboard</h1>
      <TenantBreadcrumb />
      {Object.entries(GROUPS).map(([group, links]) => {
        const visibleLinks = links.filter(({ slug }) => slug !== 'bad-bills' || selectedTenantSlug === 'main')
        if (!visibleLinks.length) return null

        return (
          <section key={group} style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>{group}</h2>
            <ul style={{ listStyle: 'disc', paddingLeft: '1.5rem' }}>
              {visibleLinks.map(({ slug, label }) => (
                <li key={slug}>
                  <a href={`/admin/collections/${slug}`}>{label}</a>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
};

export default CustomDashboard;
