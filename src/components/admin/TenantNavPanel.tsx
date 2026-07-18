'use client'

import React from 'react'
import TenantDropdown from './ModernTenantDropdown'

const TenantNavPanel: React.FC<{
  selectedTenantID?: string
  variant?: 'header' | 'sidebar'
}> = ({ selectedTenantID, variant = 'sidebar' }) => (
  <div className="tenant-nav-panel" data-variant={variant}>
    <TenantDropdown selectedTenantIDOverride={selectedTenantID} />
  </div>
)

export default TenantNavPanel
