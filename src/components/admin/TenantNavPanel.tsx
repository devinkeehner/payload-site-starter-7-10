'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useTenantSelection } from '@payloadcms/plugin-multi-tenant/client'
import TenantDropdown, { type TenantOption } from './ModernTenantDropdown'

type TenantDocument = {
  archived?: unknown
  id?: unknown
  name?: unknown
  slug?: unknown
  title?: unknown
}

let cachedSiteOptions: TenantOption[] | undefined
let siteOptionsRequest: Promise<TenantOption[]> | undefined

const normalizeTenantOptions = (docs: unknown): TenantOption[] => {
  if (!Array.isArray(docs)) return []

  return docs
    .map((doc): TenantOption | null => {
      if (!doc || typeof doc !== 'object') return null
      const tenant = doc as TenantDocument
      if (tenant.archived === true) return null
      if (tenant.id == null) return null

      const value = String(tenant.id)
      const label = String(tenant.name ?? tenant.title ?? tenant.slug ?? value).trim()
      return { label: label || value, value }
    })
    .filter((option): option is TenantOption => Boolean(option))
}

const loadSiteOptions = async (): Promise<TenantOption[]> => {
  if (cachedSiteOptions) return cachedSiteOptions
  if (siteOptionsRequest) return siteOptionsRequest

  siteOptionsRequest = fetch('/api/admin/my-sites', { credentials: 'include' })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Unable to load sites (${response.status})`)
      const result = (await response.json()) as { sites?: TenantDocument[] }
      const sites = normalizeTenantOptions(result.sites)
      cachedSiteOptions = sites
      return sites
    })
    .finally(() => {
      siteOptionsRequest = undefined
    })

  return siteOptionsRequest
}

const TenantNavPanel: React.FC<{
  selectedTenantID?: string
  variant?: 'header' | 'sidebar'
}> = ({ selectedTenantID, variant = 'sidebar' }) => {
  const { options = [] } = useTenantSelection()
  const [allSiteOptions, setAllSiteOptions] = useState<TenantOption[]>(cachedSiteOptions || [])
  const [isHydrated, setIsHydrated] = useState(false)
  const [loadState, setLoadState] = useState<'error' | 'loading' | 'ready'>(
    cachedSiteOptions ? 'ready' : 'loading',
  )
  const [retryKey, setRetryKey] = useState(0)

  const pluginHasMultipleTenants = useMemo(
    () => Array.isArray(options) && options.length > 1,
    [options],
  )
  useEffect(() => {
    setIsHydrated(true)
  }, [])

  useEffect(() => {
    let isCurrent = true

    const loadTenantOptions = async () => {
      setLoadState(cachedSiteOptions ? 'ready' : 'loading')
      try {
        const sites = await loadSiteOptions()
        if (!isCurrent) return
        setAllSiteOptions(sites)
        setLoadState('ready')
      } catch {
        if (!isCurrent) return
        setLoadState('error')
      }
    }

    void loadTenantOptions()
    return () => {
      isCurrent = false
    }
  }, [retryKey])

  if (!isHydrated) return null
  const optionsOverride = allSiteOptions.length > 1 ? allSiteOptions : undefined
  const hasOptions = Boolean(optionsOverride) || pluginHasMultipleTenants

  return (
    <div className="tenant-nav-panel" data-variant={variant}>
      {hasOptions ? (
        <TenantDropdown
          optionsOverride={optionsOverride}
          selectedTenantIDOverride={selectedTenantID}
        />
      ) : (
        <div className="tenant-nav-panel__status" aria-live="polite">
          <span>{loadState === 'error' ? 'Sites could not load.' : 'Loading sites…'}</span>
          {loadState === 'error' ? (
            <button onClick={() => setRetryKey((current) => current + 1)} type="button">
              Retry
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}

export default TenantNavPanel
