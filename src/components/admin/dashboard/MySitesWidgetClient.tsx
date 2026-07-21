'use client'

import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { useTenantSelection } from '@payloadcms/plugin-multi-tenant/client'

import {
  clearAdminUnsavedChanges,
  setAdminUnsavedChanges,
} from '@/components/admin/adminUnsavedChanges'

export type DashboardSiteOption = {
  archived: boolean
  editHref: string
  id: string
  name: string
  settingsHref?: string | null
  slug: string
  viewHref: string
}

function setTenantCookie(tenantID: string) {
  document.cookie = `payload-tenant=${encodeURIComponent(tenantID)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
}

export function MySitesWidgetClient({
  initialAssignedIDs,
  selectedTenantID,
  sites,
}: {
  initialAssignedIDs: string[]
  selectedTenantID: string | null
  sites: DashboardSiteOption[]
}) {
  const { options: tenantOptions = [], selectedTenantID: activeTenantID, setTenant } = useTenantSelection()
  const [assignedIDs, setAssignedIDs] = useState(initialAssignedIDs)
  const [savedIDs, setSavedIDs] = useState(initialAssignedIDs)
  const [siteToAdd, setSiteToAdd] = useState('')
  const [status, setStatus] = useState<'error' | 'idle' | 'saved' | 'saving'>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const sitesByID = useMemo(() => new Map(sites.map((site) => [site.id, site])), [sites])
  const assignedSites = assignedIDs
    .map((id) => sitesByID.get(id))
    .filter((site): site is DashboardSiteOption => Boolean(site))
  const availableSites = sites.filter((site) => !site.archived && !assignedIDs.includes(site.id))
  const changed = JSON.stringify(assignedIDs) !== JSON.stringify(savedIDs)
  const unsavedSource = 'dashboard-my-sites'

  useEffect(() => {
    setAdminUnsavedChanges(unsavedSource, changed)
    return () => clearAdminUnsavedChanges(unsavedSource)
  }, [changed, unsavedSource])

  const clearStatus = () => {
    setStatus('idle')
    setMessage(null)
  }

  const addSite = () => {
    if (!siteToAdd || assignedIDs.includes(siteToAdd)) return
    setAssignedIDs((current) => [...current, siteToAdd])
    setSiteToAdd('')
    clearStatus()
  }

  const removeSite = (siteID: string) => {
    setAssignedIDs((current) => current.filter((id) => id !== siteID))
    clearStatus()
  }

  const editSite = (event: MouseEvent<HTMLAnchorElement>, site: DashboardSiteOption) => {
    event.preventDefault()

    if (String(activeTenantID ?? '') !== site.id) {
      const isKnownTenant = tenantOptions.some((option) => String(option.value) === site.id)
      if (isKnownTenant) {
        setTenant({ id: site.id })
      } else {
        setTenantCookie(site.id)
      }
    }

    window.location.assign(site.editHref)
  }

  const save = async () => {
    setStatus('saving')
    setMessage(null)

    try {
      const response = await fetch('/api/admin/my-sites', {
        body: JSON.stringify({ siteIds: assignedIDs }),
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
      })
      const result = (await response.json().catch(() => null)) as {
        error?: string
        siteIds?: string[]
      } | null
      if (!response.ok) throw new Error(result?.error || 'Site assignments could not be saved.')

      const persistedIDs = Array.isArray(result?.siteIds) ? result.siteIds : assignedIDs
      setAssignedIDs(persistedIDs)
      setSavedIDs(persistedIDs)
      setStatus('saved')
      setMessage('Site assignments updated.')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Site assignments could not be saved.')
    }
  }

  return (
    <section
      className="campaign-dashboard-widget campaign-dashboard-widget--site-panel"
      id="my-sites"
    >
      <div className="campaign-dashboard-widget__header campaign-dashboard-widget__header--media">
        <div>
          <h2>My Sites</h2>
          <p>Add or remove the websites assigned to your account.</p>
        </div>
        <button
          className="campaign-dashboard-widget__save-button"
          disabled={!changed || status === 'saving'}
          onClick={() => void save()}
          type="button"
        >
          {status === 'saving' ? 'Saving…' : 'Save sites'}
        </button>
      </div>
      <div
        aria-live="polite"
        className="campaign-dashboard-widget__save-status"
        data-status={status}
        role="status"
      >
        {message}
      </div>

      <div className="campaign-dashboard-widget__site-assignment-controls">
        <label>
          <span>Add a site</span>
          <select onChange={(event) => setSiteToAdd(event.target.value)} value={siteToAdd}>
            <option value="">Choose an available site</option>
            {availableSites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </label>
        <button disabled={!siteToAdd} onClick={addSite} type="button">
          Add site
        </button>
      </div>

      {assignedSites.length ? (
        <div className="campaign-dashboard-widget__site-grid">
          {assignedSites.map((site) => (
            <article className="campaign-dashboard-widget__site-card" key={site.id}>
              <div className="campaign-dashboard-widget__site-card-heading">
                <strong>{site.name}</strong>
                {selectedTenantID === site.id ? <small>Current</small> : null}
                {site.archived ? <small data-status="archived">Archived</small> : null}
              </div>
              <div className="campaign-dashboard-widget__site-actions">
                <a href={site.editHref} onClick={(event) => editSite(event, site)}>
                  Edit site
                </a>
                <a href={site.viewHref} rel="noreferrer" target="_blank">
                  View site
                </a>
                {site.settingsHref ? <a href={site.settingsHref}>Settings</a> : null}
                <button onClick={() => removeSite(site.id)} type="button">
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="campaign-dashboard-widget__empty">No sites are assigned to this account.</p>
      )}
    </section>
  )
}
