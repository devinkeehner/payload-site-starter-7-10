'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useTenantSelection } from '@payloadcms/plugin-multi-tenant/client'
import TenantDropdown from './TenantDropdown'

const TenantNavPanel: React.FC = () => {
  const { options = [] } = useTenantSelection()

  const hasTenants = useMemo(() => Array.isArray(options) && options.length > 1, [options])
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  if (!isHydrated) return null
  if (!hasTenants) return null

  return (
    <div
      className="tenant-nav-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem',
        paddingBottom: '0.15rem',
        marginBottom: '1.2rem',
        borderBottom: '1px solid var(--theme-elevation-150)',
        width: '100%',
      }}
    >
      <TenantDropdown />
    </div>
  )
}

export default TenantNavPanel
