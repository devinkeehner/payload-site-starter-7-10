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
  failedLists?: number
  importedContacts: number
  jobId: string
  listCount?: number
  listName: string
  listResults?: Array<ImportResult & { listId: string; status: 'completed' | 'failed' }>
  statusDebug?: {
    sampleSize?: number
    samples?: Array<{
      email?: string
      keys?: string
      mappedStatus?: string
      statusValues?: Record<string, unknown>
    }>
    subscriptionFetchError?: string
    subscriptionRecords?: number
    unknownStatusCount?: number
  }
  statusCounts?: {
    bounced?: number
    doNotContact?: number
    inactive?: number
    subscribed?: number
    unsubscribed?: number
  }
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
  const [importScope, setImportScope] = useState<'folder' | 'list'>('list')
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
          scope: importScope,
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
      setMessage(
        dryRun
          ? importScope === 'folder'
            ? 'Folder dry run completed. Review totals before importing all lists.'
            : 'Dry run completed. Review totals before importing.'
          : importScope === 'folder'
            ? 'Folder import completed.'
            : 'Import completed.',
      )
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Unable to run iContact import')
    }
  }

  const canRun = Boolean(
    tenantId &&
      clientFolderId &&
      (importScope === 'folder' || listId) &&
      status !== 'loading' &&
      status !== 'dryRun' &&
      status !== 'importing',
  )

  return (
    <Gutter className="email-flow">
      <div className="email-flow__header">
        <p className="email-flow__eyebrow">Email Marketing</p>
        <h1>Import from iContact</h1>
        <p>Choose a site and iContact folder. Import one list or every list in the folder after a dry-run.</p>
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

        <label className="email-flow__field">
          <span>Import mode</span>
          <select
            onChange={(event) => {
              setImportScope(event.target.value === 'folder' ? 'folder' : 'list')
              setResult(null)
            }}
            value={importScope}
          >
            <option value="list">Single list</option>
            <option value="folder">All lists in folder</option>
          </select>
        </label>

        <label className="email-flow__field">
          <span>iContact list</span>
          <select disabled={importScope === 'folder'} onChange={(event) => { setListId(event.target.value); setResult(null) }} value={listId}>
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
            {status === 'dryRun' ? 'Checking...' : importScope === 'folder' ? 'Run folder dry-run' : 'Run dry-run'}
          </Button>
          <Button buttonStyle="primary" disabled={!canRun} onClick={() => void runImport(false)} type="button">
            {status === 'importing' ? 'Importing...' : importScope === 'folder' ? 'Import all lists' : 'Import contacts'}
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
            {result.listCount ? (
              <p>{result.listCount} lists processed{result.failedLists ? `, ${result.failedLists} failed` : ''}.</p>
            ) : null}
          </div>
          <div className="email-flow__import-metrics">
            <div><strong>{result.totalContacts}</strong><span>Total</span></div>
            <div><strong>{result.importedContacts}</strong><span>New</span></div>
            <div><strong>{result.updatedContacts}</strong><span>Updated</span></div>
            <div><strong>{result.failedContacts}</strong><span>Skipped/failed</span></div>
          </div>
          {result.statusCounts ? (
            <div className="email-flow__import-metrics">
              <div><strong>{result.statusCounts.subscribed || 0}</strong><span>Subscribed</span></div>
              <div><strong>{result.statusCounts.unsubscribed || 0}</strong><span>Unsubscribed</span></div>
              <div><strong>{result.statusCounts.bounced || 0}</strong><span>Bounced</span></div>
              <div><strong>{result.statusCounts.doNotContact || 0}</strong><span>Do not contact</span></div>
            </div>
          ) : null}
          {result.statusDebug?.samples?.length ? (
            <details className="email-flow__details">
              <summary>Status debug samples ({result.statusDebug.sampleSize || result.statusDebug.samples.length}, subscription records: {result.statusDebug.subscriptionRecords || 0}, unknown fields: {result.statusDebug.unknownStatusCount || 0})</summary>
              {result.statusDebug.subscriptionFetchError ? (
                <p>Subscription fetch failed: {result.statusDebug.subscriptionFetchError}</p>
              ) : null}
              <ul>
                {result.statusDebug.samples.slice(0, 20).map((sample, index) => (
                  <li key={`${sample.email || 'sample'}-${index}`}>
                    <strong>{sample.email || 'No email'}</strong>: {sample.mappedStatus || 'unknown'}
                    <pre>{JSON.stringify({ keys: sample.keys, statusValues: sample.statusValues }, null, 2)}</pre>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {result.listResults?.length ? (
            <details className="email-flow__details">
              <summary>View list results</summary>
              <div className="email-flow__list-results">
                {result.listResults.map((listResult) => (
                  <div key={listResult.listId}>
                    <strong>{listResult.listName}</strong>
                    <span>{listResult.status}</span>
                    <span>{listResult.totalContacts} total</span>
                    <span>{listResult.importedContacts} new</span>
                    <span>{listResult.updatedContacts} updated</span>
                    <span>{listResult.failedContacts} skipped/failed</span>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
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
