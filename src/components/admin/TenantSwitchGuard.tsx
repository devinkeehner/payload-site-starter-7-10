"use client"

import React, { useEffect, useRef } from 'react'

import { getSelectedTenantID } from './hooks/useActiveTenant'

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
    lastTenantRef.current = getSelectedTenantID()

    const timer = window.setInterval(() => {
      const currentTenant = getSelectedTenantID()
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
