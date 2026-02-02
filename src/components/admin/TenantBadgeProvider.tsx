'use client'

import React, { PropsWithChildren, useEffect, useMemo, useRef, useState } from 'react'

// Minimal tenant type
type Tenant = { id: string; name?: string | null; slug?: string | null }

const readSelectedTenantIDFromCookies = (): string | undefined => {
  if (typeof document === 'undefined') return undefined
  try {
    const cookies = document.cookie.split(';').map((c) => c.trim())
    const guesses = [
      'payload-tenant',
      'payload-tenant-id',
      'tenant',
      'tenantId',
      'selectedTenant',
      'currentTenant',
    ]
    for (const key of guesses) {
      const found = cookies.find((c) => c.startsWith(key + '='))
      if (found) return decodeURIComponent(found.split('=')[1] || '').trim() || undefined
    }
  } catch {}
  return undefined
}

const readSelectedTenantIDFromStorage = (): string | undefined => {
  if (typeof window === 'undefined') return undefined
  try {
    const guesses = [
      'payload-tenant',
      'payload-tenant-id',
      'tenant',
      'tenantId',
      'selectedTenant',
      'currentTenant',
    ]
    for (const key of guesses) {
      const raw = window.localStorage.getItem(key)
      if (!raw) continue
      // Try plain string first
      if (raw && raw[0] !== '{' && raw[0] !== '[') return raw.trim() || undefined
      try {
        const parsed = JSON.parse(raw)
        if (typeof parsed === 'string' && parsed) return parsed
        if (parsed && typeof parsed === 'object') {
          const record = parsed as { id?: unknown; value?: unknown; slug?: unknown }
          const candidate = record.id ?? record.value ?? record.slug
          if (typeof candidate === 'string' && candidate) return candidate
        }
      } catch {
        // ignore JSON parse errors
      }
    }
  } catch {}
  return undefined
}

const getSelectedTenantID = (): string | undefined => {
  return readSelectedTenantIDFromStorage() || readSelectedTenantIDFromCookies()
}

const TenantBadge: React.FC = () => {
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [tenantID, setTenantID] = useState<string | undefined>(undefined)
  const lastIDRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    let ignore = false

    const resolve = async (id: string | undefined) => {
      setTenantID(id)
      if (!id) {
        if (!ignore) setTenant(null)
        return
      }
      try {
        const res = await fetch(`/api/tenants/${id}`, { credentials: 'include' })
        if (!res.ok) return
        const json = await res.json()
        if (!ignore) setTenant(json)
      } catch {}
    }

    const check = () => {
      const id = getSelectedTenantID()
      if (id !== lastIDRef.current) {
        lastIDRef.current = id
        resolve(id)
      }
    }

    // Initial
    check()

    // Listen to storage changes (other tabs) and cookies via polling
    const onStorage = (e: StorageEvent) => {
      if (!e.key) return
      if (e.key.toLowerCase().includes('tenant')) check()
    }
    window.addEventListener('storage', onStorage)

    // Observe SPA route changes by patching history
    const patchHistory = () => {
      const fire = () => window.dispatchEvent(new Event('payload:locationchange'))
      const origPush = history.pushState.bind(history)
      const origReplace = history.replaceState.bind(history)
      if ((history.pushState as { __patched?: boolean }).__patched !== true) {
        history.pushState = ((...args: Parameters<History['pushState']>) => {
          const r = origPush(...args)
          fire()
          return r
        }) as History['pushState']
        ;(history.pushState as { __patched?: boolean }).__patched = true
      }
      if ((history.replaceState as { __patched?: boolean }).__patched !== true) {
        history.replaceState = ((...args: Parameters<History['replaceState']>) => {
          const r = origReplace(...args)
          fire()
          return r
        }) as History['replaceState']
        ;(history.replaceState as { __patched?: boolean }).__patched = true
      }
    }
    patchHistory()

    const onLoc = () => check()
    window.addEventListener('popstate', onLoc)
    window.addEventListener('payload:locationchange', onLoc)

    // Poll as a final fallback for in-tab changes (cookie/localStorage updates that don't emit events)
    const interval = window.setInterval(check, 750)

    return () => {
      ignore = true
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('popstate', onLoc)
      window.removeEventListener('payload:locationchange', onLoc)
      window.clearInterval(interval)
    }
  }, [])

  const label = useMemo(() => tenant?.name || tenant?.slug || tenantID, [tenant, tenantID])
  // Navigate to the main Admin dashboard
  const href = '/admin'

  // If we can't resolve any tenant signal, don't render noise
  if (!label) return null

  return (
    <a
      href={href}
      title="View current Site"
      style={{
        position: 'fixed',
        bottom: 12,
        right: 12,
        zIndex: 1000,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        background: 'var(--theme-elevation-100)',
        color: 'var(--theme-text)',
        border: '1px solid var(--theme-elevation-200)',
        borderRadius: 6,
        textDecoration: 'none',
        fontSize: 12,
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
      }}
    >
      <span style={{ opacity: 0.75 }}>Site:</span>
      <strong>{label}</strong>
    </a>
  )
}

const TenantBadgeProvider: React.FC<PropsWithChildren> = ({ children }) => {
  return (
    <>
      <TenantBadge />
      {children}
    </>
  )
}

export default TenantBadgeProvider
