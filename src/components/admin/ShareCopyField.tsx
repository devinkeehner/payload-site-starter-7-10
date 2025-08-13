'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Button, useDocumentInfo, useFormFields } from '@payloadcms/ui'

// Minimal types for API data
type Tenant = { id: string; name?: string | null; slug?: string | null; archived?: boolean | null }

type ShareResponse = {
  ok?: boolean
  count?: number
  results?: Array<{ tenantID: string; id?: string; slug?: string; _status?: string; skipped?: boolean; error?: string }>
  error?: string
}

const deriveIdFromPath = (): string | undefined => {
  if (typeof window === 'undefined') return undefined
  try {
    const parts = window.location.pathname.split('/').filter(Boolean)
    // Expect: /admin/collections/<slug>/<id>
    const i = parts.findIndex((p) => p === 'collections')
    if (i !== -1 && parts[i + 2] && parts[i + 2] !== 'create') return parts[i + 2]
  } catch {
    // no-op
  }
  return undefined
}

const ShareCopyField: React.FC = () => {
  const docInfo = useDocumentInfo() as { id?: string } | null
  const infoId = docInfo?.id
  const fieldId = useFormFields(
    ([fields]) =>
      (fields?.id?.value ?? (fields?.id as any)?.initialValue ?? (fields as any)?._id?.value ?? (fields as any)?._id?.initialValue) as
        | string
        | undefined,
  )
  const resolvedId = infoId || fieldId || deriveIdFromPath()
  // Pull the source post's tenant from the form (added by multi-tenant plugin)
  const tenantField = useFormFields(
    ([fields]) => ((fields as any)?.tenant?.value ?? (fields as any)?.tenant?.initialValue) as any,
  )
  const sourceTenantID = useMemo(() => {
    if (!tenantField) return undefined
    if (typeof tenantField === 'string') return tenantField
    if (typeof tenantField === 'object') return tenantField?.id || tenantField?.value
    return undefined
  }, [tenantField])

  const [tenants, setTenants] = useState<Tenant[]>([])
  const [myTenantIDs, setMyTenantIDs] = useState<string[] | null>(null)
  const [isSuper, setIsSuper] = useState<boolean>(false)
  const [selected, setSelected] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false
    const run = async () => {
      try {
        // Load current user to determine assigned tenants
        try {
          const meRes = await fetch('/api/users/me?depth=1', { credentials: 'include' })
          const meJson = await meRes.json()
          const user = (meJson?.user ?? meJson) as any
          const roles = Array.isArray(user?.roles) ? (user.roles as string[]) : []
          if (!ignore) setIsSuper(roles.includes('super'))
          const assigned: string[] = Array.isArray(user?.tenants)
            ? user.tenants
                .map((t: any) => (typeof t?.tenant === 'string' ? t.tenant : t?.tenant?.id))
                .filter(Boolean)
            : []
          if (!ignore) setMyTenantIDs(assigned)
        } catch (e) {
          // proceed without filtering if /me fails
          if (!ignore) {
            setIsSuper(false)
            setMyTenantIDs(null)
          }
        }

        // Load tenants list
        const params = new URLSearchParams({ limit: '1000', 'where[archived][equals]': 'false' })
        const res = await fetch(`/api/tenants?${params.toString()}`, { credentials: 'include' })
        const json = await res.json()
        const docs: Tenant[] = Array.isArray(json?.docs) ? json.docs : []
        if (!ignore) setTenants(docs)
      } catch (e) {
        console.error('[ShareCopyField] Failed to load tenants', e)
      }
    }
    run()
    return () => {
      ignore = true
    }
  }, [])

  const filteredTenants = useMemo(() => {
    if (isSuper) return tenants
    if (!myTenantIDs || myTenantIDs.length === 0) return tenants
    const set = new Set(myTenantIDs)
    return tenants.filter((t) => set.has(t.id))
  }, [tenants, myTenantIDs, isSuper])

  const allSelectableIDs = useMemo(() => filteredTenants.map((t) => t.id).filter(Boolean), [filteredTenants])
  const allSelected = selected.length > 0 && selected.length === allSelectableIDs.length

  // Keep selection in sync with filtered list
  useEffect(() => {
    setSelected((prev) => prev.filter((id) => allSelectableIDs.includes(id)))
  }, [allSelectableIDs.join(',')])

  const toggleSelectAll = () => {
    if (allSelected) setSelected([])
    else setSelected(allSelectableIDs)
  }

  const toggleOne = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const handleShare = async () => {
    if (!resolvedId) {
      alert('Save the post first, then try again.')
      return
    }
    if (selected.length === 0) {
      alert('Select at least one site to share to.')
      return
    }
    setLoading(true)
    setStatus(null)
    try {
      const qs = new URLSearchParams()
      if (selected.length) qs.set('tenantIDs', selected.join(','))
      if (sourceTenantID) qs.set('sourceTenantID', sourceTenantID)
      const url = `/api/posts/${resolvedId}/share?${qs.toString()}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tenantIDs: selected, sourceTenantID }),
      })
      let data: ShareResponse | null = null
      try {
        data = await res.json()
      } catch {
        /* no-op */
      }
      if (!res.ok) {
        const msg = data?.error || `Share failed (status ${res.status})`
        setStatus(msg)
        alert(msg)
        return
      }
      const successCount = data?.results?.filter((r) => !r.skipped && !r.error).length ?? data?.count ?? 0
      const skipped = data?.results?.filter((r) => r.skipped)?.length ?? 0
      const failed = data?.results?.filter((r) => !!r.error)?.length ?? 0
      setStatus(`Created ${successCount} draft copie(s). Skipped: ${skipped}. Failed: ${failed}.`)
    } catch (e) {
      console.error(e)
      setStatus('Unexpected error while sharing')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Button onClick={toggleSelectAll} buttonStyle="secondary" size="small">
          {allSelected ? 'Clear all' : 'Select all'}
        </Button>
        <Button onClick={handleShare} buttonStyle="primary" disabled={loading || !resolvedId || selected.length === 0}>
          {loading ? 'Sharing…' : 'Share Copy'}
        </Button>
      </div>

      {!resolvedId ? (
        <div style={{ marginBottom: 8 }}>
          <small>Save the post first to enable sharing.</small>
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6 }}>
        {filteredTenants.map((t) => {
          const checked = selected.includes(t.id)
          return (
            <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 6, border: '1px solid var(--theme-elevation-100)', borderRadius: 6 }}>
              <input type="checkbox" checked={checked} onChange={() => toggleOne(t.id)} />
              <span>{t.name || t.slug || t.id}</span>
            </label>
          )
        })}
      </div>

      {status ? (
        <div style={{ marginTop: 8 }}>
          <small>{status}</small>
        </div>
      ) : null}
    </div>
  )
}

export { ShareCopyField }
