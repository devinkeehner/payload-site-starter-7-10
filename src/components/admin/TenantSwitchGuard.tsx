"use client"

import React, { useEffect, useRef } from 'react'

// Best-effort read of current tenant selection from cookies set by the multi-tenant plugin
function readSelectedTenantIDFromCookies(): string | undefined {
  if (typeof document === 'undefined') return undefined
  try {
    const cookies = document.cookie.split(';').map((c) => c.trim())
    // Most common cookie name used by Payload multi-tenant plugin
    const preferred = cookies.find((c) => c.startsWith('payload-tenant='))
    if (preferred) return decodeURIComponent(preferred.split('=')[1] || '').trim() || undefined
    // Fallback guesses
    const guesses = ['tenant', 'selectedTenant', 'currentTenant']
    for (const key of guesses) {
      const found = cookies.find((c) => c.startsWith(key + '='))
      if (found) return decodeURIComponent(found.split('=')[1] || '').trim() || undefined
    }
  } catch {}
  return undefined
}

function getEditRouteInfo(pathname: string): { isEdit: boolean; collection?: string } {
  // Matches /admin/collections/<slug>/<id>
  const m = pathname.match(/\/admin\/collections\/([^/]+)\/([^/]+)(?:$|\/)/)
  if (m && m[1] && m[2]) {
    return { isEdit: true, collection: m[1] }
  }
  return { isEdit: false }
}

const TenantSwitchGuard: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const lastTenantRef = useRef<string | undefined>(undefined)
  const armedRef = useRef(false)

  useEffect(() => {
    lastTenantRef.current = readSelectedTenantIDFromCookies()

    const timer = window.setInterval(() => {
      const currentTenant = readSelectedTenantIDFromCookies()
      if (!armedRef.current) {
        // Arm after first read to avoid firing on initial mount
        armedRef.current = true
        lastTenantRef.current = currentTenant
        return
      }

      if (currentTenant && currentTenant !== lastTenantRef.current) {
        const { isEdit, collection } = getEditRouteInfo(window.location.pathname)
        lastTenantRef.current = currentTenant
        if (isEdit && collection) {
          // Automatically navigate to the list for the same collection in the newly selected tenant.
          window.location.href = `/admin/collections/${collection}`
        }
      }
    }, 600)

    return () => window.clearInterval(timer)
  }, [])

  return <>{children}</>
}

export default TenantSwitchGuard
