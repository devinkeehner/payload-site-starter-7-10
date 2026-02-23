/**
 * Export iContact accounts, client folders, and lists to local JSON files.
 *
 * Usage:
 *   pnpm tsx scripts/export-icontact-folders-and-lists.ts [--out <dir>] [--account <id>] [--client-folder <id>]
 *
 * Required env:
 *   ICONTACT_APP_ID
 *   ICONTACT_USERNAME
 *   ICONTACT_PASSWORD
 *
 * Optional env:
 *   ICONTACT_API_BASE (default: https://app.icontact.com)
 *   ICONTACT_ACCOUNT_ID (used when --account is not provided)
 *   ICONTACT_CLIENT_FOLDER_ID (used when --client-folder is not provided)
 */

import dotenv from 'dotenv'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

type JsonObject = Record<string, unknown>

interface CliOpts {
  outDir: string
  accountId?: string
  clientFolderId?: string
}

function parseArgs(): CliOpts {
  const get = (flag: string) => {
    const i = process.argv.findIndex((a) => a === flag)
    return i === -1 ? undefined : process.argv[i + 1]
  }

  return {
    outDir: get('--out') || 'tmp/icontact-export',
    accountId: get('--account'),
    clientFolderId: get('--client-folder'),
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value.trim()
}

async function fetchJson(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { method: 'GET', headers })
  const bodyText = await res.text()

  let body: unknown = null
  if (bodyText) {
    try {
      body = JSON.parse(bodyText)
    } catch {
      body = bodyText
    }
  }

  if (!res.ok) {
    throw new Error(`Request failed (${res.status}) for ${url}: ${typeof body === 'string' ? body : JSON.stringify(body)}`)
  }

  if (!body || typeof body !== 'object') {
    return {} as JsonObject
  }

  return body as JsonObject
}

async function fetchJsonAllowErrors(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { method: 'GET', headers })
  const bodyText = await res.text()
  let body: unknown = null
  if (bodyText) {
    try {
      body = JSON.parse(bodyText)
    } catch {
      body = bodyText
    }
  }
  return {
    ok: res.ok,
    status: res.status,
    body,
  }
}

async function fetchAllClientFolders(base: string, accountId: string, headers: Record<string, string>) {
  const limit = 200
  let offset = 0
  let total: number | null = null
  const all: JsonObject[] = []

  while (true) {
    const url = `${base}/icp/a/${accountId}/c?offset=${offset}&limit=${limit}`
    const payload = await fetchJson(url, headers)
    const batch = Array.isArray(payload.clientfolders) ? (payload.clientfolders as JsonObject[]) : []
    const batchTotal = typeof payload.total === 'number' ? payload.total : null
    if (total === null && batchTotal !== null) total = batchTotal

    all.push(...batch)

    if (batch.length === 0) break
    if (total !== null && all.length >= total) break
    if (batch.length < limit) break

    offset += limit
  }

  return {
    clientfolders: all,
    total: total ?? all.length,
  }
}

;(async () => {
  dotenv.config()
  dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

  const opts = parseArgs()
  const appId = requireEnv('ICONTACT_APP_ID')
  const username = requireEnv('ICONTACT_USERNAME')
  const password = requireEnv('ICONTACT_PASSWORD')

  const base = (process.env.ICONTACT_API_BASE || 'https://app.icontact.com').replace(/\/+$/u, '')
  const accountFilter = (opts.accountId || process.env.ICONTACT_ACCOUNT_ID || '').trim()
  const clientFolderFilter = (opts.clientFolderId || process.env.ICONTACT_CLIENT_FOLDER_ID || '').trim()

  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'API-Version': '2.2',
    'API-AppId': appId,
    'API-Username': username,
    'API-Password': password,
  }

  const outDir = path.resolve(process.cwd(), opts.outDir)
  await fs.mkdir(outDir, { recursive: true })

  const accountsUrl = `${base}/icp/a`
  const accountsPayload = await fetchJson(accountsUrl, headers)
  const accounts = Array.isArray(accountsPayload.accounts) ? (accountsPayload.accounts as JsonObject[]) : []

  const targetAccounts = accountFilter
    ? accounts.filter((a) => String(a.accountId || '') === accountFilter)
    : accounts

  if (!targetAccounts.length) {
    throw new Error(accountFilter ? `No account found for accountId=${accountFilter}` : 'No accounts returned from iContact.')
  }

  const exportSummary: Array<Record<string, unknown>> = []

  await fs.writeFile(path.join(outDir, 'accounts.json'), JSON.stringify(accountsPayload, null, 2))

  for (const account of targetAccounts) {
    const accountId = String(account.accountId || '')
    if (!accountId) continue

    const clientFoldersPayload = await fetchAllClientFolders(base, accountId, headers)
    const clientFolders = Array.isArray(clientFoldersPayload.clientfolders)
      ? (clientFoldersPayload.clientfolders as JsonObject[])
      : []

    const targetFolders = clientFolderFilter
      ? clientFolders.filter((f) => String(f.clientFolderId || '') === clientFolderFilter)
      : clientFolders

    await fs.writeFile(
      path.join(outDir, `account-${accountId}-clientfolders.json`),
      JSON.stringify(clientFoldersPayload, null, 2),
    )

    const folderSummaries: Array<Record<string, unknown>> = []
    const folderAccess: Array<Record<string, unknown>> = []

    for (const folder of targetFolders) {
      const clientFolderId = String(folder.clientFolderId || '')
      if (!clientFolderId) continue

      const listsUrl = `${base}/icp/a/${accountId}/c/${clientFolderId}/lists`
      const listsResponse = await fetchJsonAllowErrors(listsUrl, headers)

      if (listsResponse.ok) {
        const payload =
          listsResponse.body && typeof listsResponse.body === 'object'
            ? (listsResponse.body as JsonObject)
            : ({} as JsonObject)
        const lists = Array.isArray(payload.lists) ? (payload.lists as JsonObject[]) : []

        await fs.writeFile(
          path.join(outDir, `account-${accountId}-folder-${clientFolderId}-lists.json`),
          JSON.stringify(payload, null, 2),
        )

        folderSummaries.push({
          clientFolderId,
          folderName: String(folder.name || ''),
          listCount: lists.length,
        })
        folderAccess.push({
          clientFolderId,
          folderName: String(folder.name || ''),
          status: listsResponse.status,
          accessible: true,
          listCount: lists.length,
        })
      } else {
        folderAccess.push({
          clientFolderId,
          folderName: String(folder.name || ''),
          status: listsResponse.status,
          accessible: false,
          error: typeof listsResponse.body === 'string' ? listsResponse.body : listsResponse.body,
        })
      }
    }

    await fs.writeFile(
      path.join(outDir, `account-${accountId}-folder-access.json`),
      JSON.stringify({ accountId, folders: folderAccess }, null, 2),
    )

    exportSummary.push({
      accountId,
      companyName: String(account.companyName || ''),
      clientFolderCount: targetFolders.length,
      folders: folderSummaries,
      inaccessibleFolderCount: folderAccess.filter((f) => f.accessible === false).length,
    })
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    baseUrl: base,
    accountFilter: accountFilter || null,
    clientFolderFilter: clientFolderFilter || null,
    outputDir: outDir,
    summary: exportSummary,
  }

  await fs.writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2))

  console.log(`Export complete: ${outDir}`)
  console.log(JSON.stringify(manifest, null, 2))
})().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
})
