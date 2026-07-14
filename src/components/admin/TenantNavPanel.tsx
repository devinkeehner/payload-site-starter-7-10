'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useTenantSelection } from '@payloadcms/plugin-multi-tenant/client'
import TenantDropdown, { type TenantOption } from './TenantDropdown'

type TenantDocument = {
  id?: unknown
  name?: unknown
  slug?: unknown
  title?: unknown
}

type TenantAssignment = {
  tenant?: unknown
}

const normalizeTenantOptions = (docs: unknown): TenantOption[] => {
  if (!Array.isArray(docs)) return []

  return docs
    .map((doc): TenantOption | null => {
      if (!doc || typeof doc !== 'object') return null
      const tenant = doc as TenantDocument
      if (tenant.id == null) return null

      const value = String(tenant.id)
      const label = String(tenant.name ?? tenant.title ?? tenant.slug ?? value).trim()
      return { label: label || value, value }
    })
    .filter((option): option is TenantOption => Boolean(option))
}

const TenantNavPanel: React.FC<{
  selectedTenantID?: string
  variant?: 'header' | 'sidebar'
}> = ({ selectedTenantID, variant = 'sidebar' }) => {
  const { options = [] } = useTenantSelection()
  const [accountOptions, setAccountOptions] = useState<TenantOption[]>([])
  const [isHydrated, setIsHydrated] = useState(false)

  const pluginHasMultipleTenants = useMemo(
    () => Array.isArray(options) && options.length > 1,
    [options],
  )
  useEffect(() => {
    setIsHydrated(true)
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    const loadAccountTenants = async () => {
      try {
        const response = await fetch('/api/users/me', {
          credentials: 'include',
          signal: controller.signal,
        })
        if (!response.ok) return

        const result = (await response.json()) as {
          user?: { tenants?: TenantAssignment[] }
        }
        const assignments = Array.isArray(result.user?.tenants) ? result.user.tenants : []
        setAccountOptions(normalizeTenantOptions(assignments.map((assignment) => assignment?.tenant)))
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setAccountOptions([])
        }
      }
    }

    void loadAccountTenants()
    return () => controller.abort()
  }, [])

  if (!isHydrated) return null
  if (accountOptions.length <= 1 && !pluginHasMultipleTenants) return null

  const optionsOverride = accountOptions.length > 1 ? accountOptions : undefined

  return (
    <div className="tenant-nav-panel" data-variant={variant}>
      <TenantDropdown
        optionsOverride={optionsOverride}
        selectedTenantIDOverride={selectedTenantID}
      />
    </div>
  )
}

export default TenantNavPanel
