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

type FieldState = {
  value?: unknown
  initialValue?: unknown
}

type FormFields = Record<string, FieldState | undefined> & {
  _id?: FieldState
}

type TenantAssignment = {
  tenant?: string | { id?: string; value?: string } | null
}

type MeUser = {
  roles?: unknown
  tenants?: TenantAssignment[]
}

const asFormFields = (fields: unknown): FormFields =>
  (typeof fields === 'object' && fields !== null ? (fields as FormFields) : {})

const asRecord = (value: unknown): Record<string, unknown> =>
  (typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {})

const readIdField = (fields: unknown): string | undefined => {
  const map = asFormFields(fields)
  const fromId = map.id?.value ?? map.id?.initialValue
  if (typeof fromId === 'string') return fromId
  const fromUnderscoreId = map._id?.value ?? map._id?.initialValue
  if (typeof fromUnderscoreId === 'string') return fromUnderscoreId
  return undefined
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

const deriveCollectionSlugFromPath = (): string | undefined => {
  if (typeof window === 'undefined') return undefined
  try {
    const parts = window.location.pathname.split('/').filter(Boolean)
    const i = parts.findIndex((p) => p === 'collections')
    if (i !== -1 && parts[i + 1]) return parts[i + 1]
  } catch {
    // no-op
  }
  return undefined
}

interface ShareCopyFieldProps {
  collectionSlug?: string
}

const ShareCopyField: React.FC<ShareCopyFieldProps> = ({ collectionSlug }) => {
  const effectiveCollectionSlug = collectionSlug || deriveCollectionSlugFromPath() || 'posts'
  const docInfo = useDocumentInfo() as { id?: string } | null
  const infoId = docInfo?.id
  const fieldId = useFormFields(([fields]) => readIdField(fields))
  const resolvedId = infoId || fieldId || deriveIdFromPath()
  // Pull the source post's tenant from the form (added by multi-tenant plugin)
  const tenantField = useFormFields(
    ([fields]) => {
      const map = asFormFields(fields)
      return map.tenant?.value ?? map.tenant?.initialValue
    },
  )
  const sourceTenantID = useMemo(() => {
    if (!tenantField) return undefined
    if (typeof tenantField === 'string') return tenantField
    if (typeof tenantField === 'object') {
      const tenantRecord = asRecord(tenantField)
      const id = tenantRecord.id
      const value = tenantRecord.value
      if (typeof id === 'string') return id
      if (typeof value === 'string') return value
    }
    return undefined
  }, [tenantField])

  const [tenants, setTenants] = useState<Tenant[]>([])
  const [myTenantIDs, setMyTenantIDs] = useState<string[] | null>(null)
  const [isSuper, setIsSuper] = useState<boolean>(false)
  const [selected, setSelected] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [statusDetails, setStatusDetails] = useState<string[]>([])

  useEffect(() => {
    let ignore = false
    const run = async () => {
      try {
        // Load current user to determine assigned tenants
        try {
          const meRes = await fetch('/api/users/me?depth=1', { credentials: 'include' })
          const meJson = await meRes.json()
          const user = (asRecord(meJson).user ?? meJson) as MeUser
          const roles = Array.isArray(user?.roles) ? (user.roles as string[]) : []
          if (!ignore) setIsSuper(roles.includes('super'))
          const assigned: string[] = Array.isArray(user?.tenants)
            ? user.tenants
                .map((t) => (typeof t?.tenant === 'string' ? t.tenant : t?.tenant?.id))
                .filter((tenantId): tenantId is string => typeof tenantId === 'string' && tenantId.length > 0)
            : []
          if (!ignore) setMyTenantIDs(assigned)
        } catch (_e) {
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
    // Exclude the current tenant of the post (we don't need to share to itself)
    const withoutSource = tenants.filter((t) => !sourceTenantID || t.id !== sourceTenantID)
    if (isSuper) return withoutSource
    if (!myTenantIDs || myTenantIDs.length === 0) return withoutSource
    const set = new Set(myTenantIDs)
    return withoutSource.filter((t) => set.has(t.id))
  }, [tenants, myTenantIDs, isSuper, sourceTenantID])

  const allSelectableIDs = useMemo(() => filteredTenants.map((t) => t.id).filter(Boolean), [filteredTenants])
  const allSelected = selected.length > 0 && selected.length === allSelectableIDs.length

  const tenantLabelById = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of tenants) {
      if (!t?.id) continue
      const label = String(t.name || t.slug || t.id)
      map.set(t.id, label)
    }
    return map
  }, [tenants])

  // Keep selection in sync with filtered list
  useEffect(() => {
    setSelected((prev) => prev.filter((id) => allSelectableIDs.includes(id)))
  }, [allSelectableIDs])

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
    setStatusDetails([])
    try {
      // Sanitize selection: only allow IDs present in filteredTenants (excludes current tenant)
      const shareTargets = selected.filter((id) => allSelectableIDs.includes(id))
      const qs = new URLSearchParams()
      if (shareTargets.length) qs.set('tenantIDs', shareTargets.join(','))
      if (sourceTenantID) qs.set('sourceTenantID', sourceTenantID)
      const url = `/api/${effectiveCollectionSlug}/${resolvedId}/share?${qs.toString()}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tenantIDs: shareTargets, sourceTenantID }),
      })
      const contentType = res.headers.get('content-type') || ''
      const rawText = await res.text()
      let data: ShareResponse | null = null
      try {
        data = rawText ? (JSON.parse(rawText) as ShareResponse) : null
      } catch {
        data = null
      }
      if (!res.ok) {
        const serverMsg = data?.error
          ? String(data.error)
          : rawText
            ? rawText.slice(0, 500)
            : '(empty response)'
        const msg = `Share failed (status ${res.status})`
        setStatus(msg)
        setStatusDetails([
          `Collection: ${effectiveCollectionSlug}`,
          `Post ID: ${resolvedId}`,
          `Content-Type: ${contentType || '(missing)'}`,
          `Error: ${serverMsg}`,
        ])
        alert(msg)
        return
      }
      const successCount = data?.results?.filter((r) => !r.skipped && !r.error).length ?? data?.count ?? 0
      const skipped = data?.results?.filter((r) => r.skipped)?.length ?? 0
      const failed = data?.results?.filter((r) => !!r.error)?.length ?? 0
      setStatus(`Created ${successCount} draft copie(s). Skipped: ${skipped}. Failed: ${failed}.`)

      const details: string[] = []
      if (!data) {
        details.push('Warning: server response was not JSON; unable to show per-tenant details.')
      } else if (Array.isArray(data.results) && data.results.length) {
        for (const r of data.results) {
          const tenantID = String(r.tenantID || '')
          const tenantLabel = tenantLabelById.get(tenantID) || tenantID || '(unknown tenant)'
          if (r.error) {
            details.push(`${tenantLabel}: FAILED - ${String(r.error)}`)
          } else if (r.skipped) {
            details.push(`${tenantLabel}: skipped`)
          } else {
            const createdId = r.id ? `id=${r.id}` : ''
            const createdSlug = r.slug ? `slug=${r.slug}` : ''
            const extra = [createdId, createdSlug].filter(Boolean).join(', ')
            details.push(`${tenantLabel}: created${extra ? ` (${extra})` : ''}`)
          }
        }
      } else {
        details.push('No per-tenant results returned from server.')
      }
      setStatusDetails(details)
    } catch (e) {
      console.error(e)
      setStatus('Unexpected error while sharing')
      setStatusDetails([String(asRecord(e).message || e)])
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

      {statusDetails.length ? (
        <div style={{ marginTop: 8 }}>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {statusDetails.map((d, i) => (
              <li key={i}>
                <small>{d}</small>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

export { ShareCopyField }
