'use client'

import { Banner, Button, Gutter, Pill, useConfig } from '@payloadcms/ui'
import { formatAdminURL } from 'payload/shared'
import React, { useCallback, useEffect, useMemo, useState } from 'react'

import '../email-center/email-center.scss'

type TenantOption = {
  id: string
  name: string
  slug: string
}

type FolderOption = {
  clientFolderId: string
  name: string
}

type ListOption = {
  description: string
  listId: string
  name: string
}

type OptionsPayload = {
  accountId: string
  folders: FolderOption[]
  lists: ListOption[]
  tenants: TenantOption[]
}

type ImportResult = {
  dryRun: boolean
  emailListId?: string | null
  errors?: Array<{ email?: string; message: string }>
  failedContacts: number
  importedContacts: number
  jobId: string
  listName: string
  totalContacts: number
  updatedContacts: number
}

export function IContactImportViewClient() {
  const {
    config: {
      routes: { admin: adminRoute },
    },
  } = useConfig()
  const [accountId, setAccountId] = useState('')
  const [tenants, setTenants] = useState<TenantOption[]>([])
  const [folders, setFolders] = useState<FolderOption[]>([])
  const [lists, setLists] = useState<ListOption[]>([])
  const [tenantId, setTenantId] = useState('')
  const [clientFolderId, setClientFolderId] = useState('')
  const [listId, setListId] = useState('')
  const [status, setStatus] = useState<'dryRun' | 'error' | 'idle' | 'importing' | 'loading' | 'ready'>('loading')
  const [message, setMessage] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const emailListsURL = useMemo(() => formatAdminURL({ adminRoute, path: '/collections/email-lists' }), [adminRoute])
  const importedListURL = result?.emailListId
    ? formatAdminURL({ adminRoute, path: `/collections/email-lists/${result.emailListId}/profile` })
    : emailListsURL

  const loadOptions = useCallback(async (folderId = '') => {
    setStatus('loading')
    setMessage(null)
    try {
      const query = folderId ? `?clientFolderId=${encodeURIComponent(folderId)}` : ''
      const res = await fetch(`/api/email-imports/icontact/options${query}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(await res.text())
      const payload = (await res.json()) as OptionsPayload
      setAccountId(payload.accountId)
      setTenants(payload.tenants)
      setFolders(payload.folders)
      setLists(payload.lists)
      setStatus('ready')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Unable to load iContact options')
    }
  }, [])

  useEffect(() => {
    void loadOptions()
  }, [loadOptions])

  async function loadLists(folderId: string) {
    setClientFolderId(folderId)
    setListId('')
    setResult(null)
    await loadOptions(folderId)
  }

  async function runImport(dryRun: boolean) {
    setStatus(dryRun ? 'dryRun' : 'importing')
    setMessage(null)

    try {
      const res = await fetch('/api/email-imports/icontact', {
        body: JSON.stringify({
          clientFolderId,
          dryRun,
          listId,
          tenantId,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      })

      if (!res.ok) throw new Error(await res.text())
      const payload = (await res.json()) as ImportResult
      setResult(payload)
      setStatus('ready')
      setMessage(dryRun ? 'Dry run completed. Review totals before importing.' : 'Import completed.')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Unable to run iContact import')
    }
  }

  const canRun = Boolean(tenantId && clientFolderId && listId && status !== 'loading' && status !== 'dryRun' && status !== 'importing')

  return (
    <Gutter className="email-flow">
      <div className="email-flow__header">
        <p className="email-flow__eyebrow">Email Marketing</p>
        <h1>Import from iContact</h1>
        <p>Choose a site, iContact folder, and iContact list. Run a dry-run first, then import contacts into Payload.</p>
      </div>

      {message ? <Banner type={status === 'error' ? 'error' : 'success'}>{message}</Banner> : null}

      <section className="email-flow__summary">
        <Pill pillStyle={accountId ? 'success' : 'warning'}>Account {accountId || 'not loaded'}</Pill>
        <span>{tenants.length} sites available</span>
        <span>{folders.length} folders loaded</span>
        <span>{lists.length} lists loaded</span>
      </section>

      <section className="email-flow__panel email-flow__form-grid">
        <label className="email-flow__field">
          <span>Site</span>
          <select onChange={(event) => setTenantId(event.target.value)} value={tenantId}>
            <option value="">Select a site</option>
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name}{tenant.slug ? ` (${tenant.slug})` : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="email-flow__field">
          <span>iContact folder</span>
          <select onChange={(event) => void loadLists(event.target.value)} value={clientFolderId}>
            <option value="">Select a folder</option>
            {folders.map((folder) => (
              <option key={folder.clientFolderId} value={folder.clientFolderId}>
                {folder.name} ({folder.clientFolderId})
              </option>
            ))}
          </select>
        </label>

        <label className="email-flow__field email-flow__field--wide">
          <span>iContact list</span>
          <select onChange={(event) => { setListId(event.target.value); setResult(null) }} value={listId}>
            <option value="">Select a list</option>
            {lists.map((list) => (
              <option key={list.listId} value={list.listId}>
                {list.name} ({list.listId})
              </option>
            ))}
          </select>
        </label>

        <div className="email-flow__actions email-flow__field--wide">
          <Button buttonStyle="secondary" disabled={!canRun} onClick={() => void runImport(true)} type="button">
            {status === 'dryRun' ? 'Checking...' : 'Run dry-run'}
          </Button>
          <Button buttonStyle="primary" disabled={!canRun} onClick={() => void runImport(false)} type="button">
            {status === 'importing' ? 'Importing...' : 'Import contacts'}
          </Button>
          <Button buttonStyle="secondary" el="link" to={emailListsURL} type="button">
            Email lists
          </Button>
        </div>
      </section>

      {result ? (
        <section className="email-flow__panel">
          <div className="email-flow__header">
            <p className="email-flow__eyebrow">{result.dryRun ? 'Dry run result' : 'Import result'}</p>
            <h2>{result.listName}</h2>
          </div>
          <div className="email-flow__import-metrics">
            <div><strong>{result.totalContacts}</strong><span>Total</span></div>
            <div><strong>{result.importedContacts}</strong><span>New</span></div>
            <div><strong>{result.updatedContacts}</strong><span>Updated</span></div>
            <div><strong>{result.failedContacts}</strong><span>Skipped/failed</span></div>
          </div>
          {result.emailListId ? (
            <Button buttonStyle="secondary" el="link" to={importedListURL} type="button">
              Open audience profile
            </Button>
          ) : null}
          {result.errors?.length ? (
            <details className="email-flow__details">
              <summary>View errors</summary>
              <ul>
                {result.errors.slice(0, 25).map((error, index) => (
                  <li key={`${error.email || 'error'}-${index}`}>
                    {error.email ? `${error.email}: ` : ''}{error.message}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      ) : null}
    </Gutter>
  )
}
