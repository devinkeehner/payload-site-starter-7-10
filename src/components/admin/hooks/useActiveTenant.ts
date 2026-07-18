'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type TenantInfo = {
  id: string
  name?: string | null
  slug?: string | null
}

type StorageTenantShape = {
  id?: unknown
  value?: unknown
  slug?: unknown
}

const ID_KEYS = ['payload-tenant', 'payload-tenant-id', 'tenant', 'tenantId', 'selectedTenant', 'currentTenant']

export const readSelectedTenantIDFromCookies = (): string | undefined => {
  if (typeof document === 'undefined') return undefined
  try {
    const cookies = document.cookie.split(';').map((c) => c.trim())
    for (const key of ID_KEYS) {
      const found = cookies.find((c) => c.startsWith(`${key}=`))
      if (!found) continue
      const value = decodeURIComponent(found.split('=')[1] || '').trim()
      if (value) return value
    }
  } catch {
    // ignore
  }
  return undefined
}

export const readSelectedTenantIDFromStorage = (): string | undefined => {
  if (typeof window === 'undefined') return undefined
  try {
    for (const key of ID_KEYS) {
      const raw = window.localStorage.getItem(key)
      if (!raw) continue
      if (raw[0] !== '{' && raw[0] !== '[') {
        const trimmed = raw.trim()
        if (trimmed) return trimmed
        continue
      }
      try {
        const parsed = JSON.parse(raw)
        if (typeof parsed === 'string' && parsed.trim()) return parsed.trim()
        if (parsed && typeof parsed === 'object') {
          const typed = parsed as StorageTenantShape
          const candidate = typed.id || typed.value || typed.slug
          if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
        }
      } catch {
        // ignore JSON parse errors
      }
    }
  } catch {
    // ignore storage errors
  }
  return undefined
}

export const getSelectedTenantID = (): string | undefined => {
  return readSelectedTenantIDFromStorage() || readSelectedTenantIDFromCookies()
}

const tenantCache = new Map<string, TenantInfo>()
const tenantRequests = new Map<string, Promise<TenantInfo>>()

const waitForTenantRequest = (
  request: Promise<TenantInfo>,
  signal: AbortSignal,
): Promise<TenantInfo | null> => {
  if (signal.aborted) return Promise.resolve(null)

  return new Promise((resolve, reject) => {
    const handleAbort = () => {
      resolve(null)
    }

    signal.addEventListener('abort', handleAbort, { once: true })
    request.then(
      (tenant) => {
        signal.removeEventListener('abort', handleAbort)
        resolve(tenant)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', handleAbort)
        reject(error)
      },
    )
  })
}

const fetchTenantInfo = async (id: string | undefined, signal: AbortSignal): Promise<TenantInfo | null> => {
  if (!id) return null
  if (tenantCache.has(id)) return tenantCache.get(id) ?? null

  let request = tenantRequests.get(id)
  if (!request) {
    request = (async () => {
      try {
        const res = await fetch(`/api/tenants/${id}`, { credentials: 'include' })
        if (!res.ok) throw new Error('Failed to load tenant')
        const json = (await res.json()) as TenantInfo
        tenantCache.set(id, json)
        return json
      } finally {
        tenantRequests.delete(id)
      }
    })()
    tenantRequests.set(id, request)
  }

  try {
    return await waitForTenantRequest(request, signal)
  } catch (err) {
    if ((err as Error).name === 'AbortError') return null
    return null
  }
}

export const useActiveTenant = () => {
  const [tenantID, setTenantID] = useState<string | undefined>(() => getSelectedTenantID())
  const [tenant, setTenant] = useState<TenantInfo | null>(null)
  const [loading, setLoading] = useState(false)

  const tenantIDRef = useRef<string | undefined>(tenantID)

  const syncTenantID = useCallback(() => {
    const next = getSelectedTenantID()
    if (next !== tenantIDRef.current) {
      tenantIDRef.current = next
      setTenantID(next)
    }
    return next
  }, [])

  useEffect(() => {
    tenantIDRef.current = tenantID
  }, [tenantID])

  useEffect(() => {
    let cancelled = false
    let retryTimer: number | undefined
    const controller = new AbortController()

    const resolve = async (id: string | undefined, attempt = 0) => {
      if (cancelled) return
      if (!id) {
        setTenant(null)
        setLoading(false)
        return
      }

      setLoading(true)
      const info = await fetchTenantInfo(id, controller.signal)
      if (!cancelled) {
        if (info) {
          setTenant(info)
          setLoading(false)
          return
        }

        setTenant(null)
        retryTimer = window.setTimeout(
          () => void resolve(id, attempt + 1),
          Math.min(10_000, 750 * 2 ** attempt),
        )
      }
    }

    resolve(tenantID)

    return () => {
      cancelled = true
      if (retryTimer !== undefined) window.clearTimeout(retryTimer)
      controller.abort()
    }
  }, [tenantID])

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (!event.key) return
      if (event.key.toLowerCase().includes('tenant')) syncTenantID()
    }

    const handleLocation = () => {
      syncTenantID()
    }

    const interval = window.setInterval(syncTenantID, 750)

    window.addEventListener('storage', handleStorage)
    window.addEventListener('payload:locationchange', handleLocation)
    window.addEventListener('popstate', handleLocation)

    syncTenantID()

    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('payload:locationchange', handleLocation)
      window.removeEventListener('popstate', handleLocation)
      window.clearInterval(interval)
    }
  }, [syncTenantID])

  const tenantName = useMemo(() => tenant?.name || tenant?.slug || tenantID, [tenant, tenantID])

  return {
    tenant,
    tenantID,
    tenantName,
    loading,
    refresh: syncTenantID,
  }
}
