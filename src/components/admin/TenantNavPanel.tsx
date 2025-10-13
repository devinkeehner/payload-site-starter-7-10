'use client'

import React, { useMemo } from 'react'
import { useTenantSelection } from '@payloadcms/plugin-multi-tenant/client'
import TenantDropdown from './TenantDropdown'

const TenantNavPanel: React.FC = () => {
  const { options = [] } = useTenantSelection()

  const hasTenants = useMemo(() => Array.isArray(options) && options.length > 1, [options])

  if (!hasTenants) return null

  return (
    <div
      className="tenant-nav-panel"
      style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingBottom: '0.25rem', width: '100%' }}
    >
      <TenantDropdown />
    </div>
  )
}

export default TenantNavPanel
