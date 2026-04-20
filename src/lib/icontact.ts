/* eslint-disable @typescript-eslint/no-explicit-any */

type JsonRecord = Record<string, unknown>

export type IContactConfig = {
  appId: string
  username: string
  password: string
  baseUrl: string
  accountId?: string
}

export type IContactFieldMap = {
  emailFieldName: string
  firstNameFieldName: string
  lastNameFieldName: string
  mobileFieldName: string
  zipFieldName: string
}

export type IContactSyncResult = {
  status: 'success' | 'failed' | 'skipped'
  reason?: string
  error?: string
  accountId?: string
  clientFolderId?: string
  listIds?: string[]
  contactId?: string
}

export const defaultIContactFieldMap: IContactFieldMap = {
  emailFieldName: 'email',
  firstNameFieldName: 'firstname',
  lastNameFieldName: 'lastname',
  mobileFieldName: 'mobile',
  zipFieldName: 'zip',
}

const sanitize = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

const sanitizePhone = (value: unknown) => sanitize(value).replace(/[^\d+]/gu, '')

const errorText = (error: unknown) => {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return String(error || '')
}

const looksLikeDuplicateIContactError = (message: string) =>
  /already exists|already subscribed|duplicate|conflict|409/i.test(message)

const logIContact = (
  level: 'info' | 'warn' | 'error',
  message: string,
  details: Record<string, unknown> = {},
) => {
  console[level](`[iContact] ${message}`, details)
}

export const getIContactConfigFromEnv = (): IContactConfig | null => {
  const appId = sanitize(process.env.ICONTACT_APP_ID)
  const username = sanitize(process.env.ICONTACT_USERNAME)
  const password = process.env.ICONTACT_PASSWORD || ''
  const baseUrl = sanitize(process.env.ICONTACT_API_BASE) || 'https://app.icontact.com'
  const accountId = sanitize(process.env.ICONTACT_ACCOUNT_ID)

  if (!appId || !username || !password) return null

  return {
    appId,
    username,
    password,
    baseUrl: baseUrl.replace(/\/+$/u, ''),
    accountId: accountId || undefined,
  }
}

const getHeaders = (cfg: IContactConfig) => ({
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'API-Version': '2.2',
  'API-AppId': cfg.appId,
  'API-Username': cfg.username,
  'API-Password': cfg.password,
})

const safeJson = (text: string): any => {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export const iContactFetch = async (
  cfg: IContactConfig,
  path: string,
  init: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown } = {},
) => {
  const url = `${cfg.baseUrl}${path}`
  const res = await fetch(url, {
    method: init.method || 'GET',
    headers: getHeaders(cfg),
    body: typeof init.body === 'undefined' ? undefined : JSON.stringify(init.body),
  })

  const raw = await res.text()
  const data = raw ? safeJson(raw) : null
  return { ok: res.ok, status: res.status, data, url }
}

export const resolveIContactAccountId = async (cfg: IContactConfig, preferred?: string) => {
  const preferredId = sanitize(preferred) || sanitize(cfg.accountId)
  if (preferredId) return preferredId

  const accountsRes = await iContactFetch(cfg, '/icp/a')
  if (!accountsRes.ok || !accountsRes.data || typeof accountsRes.data !== 'object') {
    throw new Error('Unable to resolve iContact account ID from /icp/a.')
  }
  const accounts = Array.isArray((accountsRes.data as JsonRecord).accounts) ? ((accountsRes.data as JsonRecord).accounts as any[]) : []
  const first = accounts[0]
  const accountId = sanitize(first?.accountId)
  if (!accountId) throw new Error('No iContact accounts available for this credential set.')
  return accountId
}

export const listIContactClientFolders = async (cfg: IContactConfig, accountId: string) => {
  const limit = 200
  let offset = 0
  let total: number | null = null
  const folders: any[] = []

  while (true) {
    const res = await iContactFetch(cfg, `/icp/a/${accountId}/c?offset=${offset}&limit=${limit}`)
    if (!res.ok) {
      throw new Error(`Failed to list iContact client folders (${res.status}).`)
    }
    const payload = (res.data && typeof res.data === 'object' ? res.data : {}) as JsonRecord
    const batch = Array.isArray(payload.clientfolders) ? (payload.clientfolders as any[]) : []
    const batchTotal = typeof payload.total === 'number' ? payload.total : null
    if (total === null && batchTotal !== null) total = batchTotal

    folders.push(...batch)
    if (batch.length === 0) break
    if (total !== null && folders.length >= total) break
    if (batch.length < limit) break
    offset += limit
  }

  return {
    total: total ?? folders.length,
    clientfolders: folders,
  }
}

export const listIContactLists = async (cfg: IContactConfig, accountId: string, clientFolderId: string) => {
  const res = await iContactFetch(cfg, `/icp/a/${accountId}/c/${clientFolderId}/lists`)
  if (!res.ok) {
    const message = typeof res.data === 'object' ? JSON.stringify(res.data) : String(res.data || '')
    throw new Error(`Failed to list iContact lists for folder ${clientFolderId} (${res.status}): ${message}`)
  }
  const payload = (res.data && typeof res.data === 'object' ? res.data : {}) as JsonRecord
  const lists = Array.isArray(payload.lists) ? (payload.lists as any[]) : []
  return { total: lists.length, lists }
}

const toSubmissionMap = (submissionData: unknown) => {
  const map = new Map<string, string>()
  const rows = Array.isArray(submissionData) ? (submissionData as any[]) : []
  for (const row of rows) {
    const key = sanitize(row?.field).toLowerCase()
    if (!key) continue
    if (Array.isArray(row?.value)) {
      map.set(key, row.value.map((v: unknown) => sanitize(v)).filter(Boolean).join(', '))
      continue
    }
    map.set(key, sanitize(row?.value))
  }
  return map
}

const pickFieldValue = (map: Map<string, string>, configuredFieldName: string, fallbackFieldName: string) => {
  const firstKey = sanitize(configuredFieldName || fallbackFieldName).toLowerCase()
  const fallbackKey = sanitize(fallbackFieldName).toLowerCase()
  return map.get(firstKey) || map.get(fallbackKey) || ''
}

const normalizeListIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return value
    .map((row) => {
      if (!row) return ''
      if (typeof row === 'string') return row.trim()
      if (typeof row === 'object') {
        return sanitize((row as any).listId || (row as any).id || (row as any).value)
      }
      return ''
    })
    .filter(Boolean)
}

const toRelationshipId = (value: unknown): string => {
  if (!value) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'object') {
    const id = (value as any)?.id ?? (value as any)?._id ?? (value as any)?.value
    return typeof id === 'string' ? id.trim() : ''
  }
  return ''
}

const resolveFolderAndListTargets = async (args: {
  formDoc: any
  payload?: any
  req?: any
}) => {
  const formDoc = args.formDoc || {}

  let clientFolderId = sanitize(formDoc.iContactClientFolderId)
  let listIds = normalizeListIds(formDoc.iContactListIds)

  const folderRel = formDoc.iContactFolder
  const folderRelId = toRelationshipId(folderRel)
  if (!clientFolderId && folderRel && typeof folderRel === 'object' && sanitize((folderRel as any).clientFolderId)) {
    clientFolderId = sanitize((folderRel as any).clientFolderId)
  }
  if (!clientFolderId && folderRelId && args.payload) {
    const folderDoc = await args.payload.findByID({
      collection: 'icontact-folders',
      id: folderRelId,
      depth: 0,
      overrideAccess: true,
      req: args.req,
    }).catch(() => null)
    clientFolderId = sanitize((folderDoc as any)?.clientFolderId)
  }

  if (listIds.length === 0 && Array.isArray(formDoc.iContactLists)) {
    const relRows = formDoc.iContactLists as any[]
    for (const row of relRows) {
      if (row && typeof row === 'object' && sanitize((row as any).listId)) {
        listIds.push(sanitize((row as any).listId))
        continue
      }
      const relId = toRelationshipId(row)
      if (!relId || !args.payload) continue
      const listDoc = await args.payload.findByID({
        collection: 'icontact-lists',
        id: relId,
        depth: 0,
        overrideAccess: true,
        req: args.req,
      }).catch(() => null)
      const listId = sanitize((listDoc as any)?.listId)
      if (listId) listIds.push(listId)
    }
  }

  listIds = Array.from(new Set(listIds.filter(Boolean)))

  return { clientFolderId, listIds }
}

const getFormFieldMap = (formDoc: any): IContactFieldMap => {
  const custom = (formDoc?.iContactFieldMap || {}) as Partial<IContactFieldMap>
  return {
    emailFieldName: sanitize(custom.emailFieldName) || defaultIContactFieldMap.emailFieldName,
    firstNameFieldName: sanitize(custom.firstNameFieldName) || defaultIContactFieldMap.firstNameFieldName,
    lastNameFieldName: sanitize(custom.lastNameFieldName) || defaultIContactFieldMap.lastNameFieldName,
    mobileFieldName: sanitize(custom.mobileFieldName) || defaultIContactFieldMap.mobileFieldName,
    zipFieldName: sanitize(custom.zipFieldName) || defaultIContactFieldMap.zipFieldName,
  }
}

const getExistingContact = async (cfg: IContactConfig, accountId: string, clientFolderId: string, email: string) => {
  const query = encodeURIComponent(email)
  const res = await iContactFetch(cfg, `/icp/a/${accountId}/c/${clientFolderId}/contacts?email=${query}`)
  if (!res.ok || !res.data || typeof res.data !== 'object') return null
  const contacts = Array.isArray((res.data as JsonRecord).contacts) ? ((res.data as JsonRecord).contacts as any[]) : []
  const found = contacts.find((c) => sanitize(c?.email).toLowerCase() === email.toLowerCase()) || contacts[0]
  return found || null
}

const createContact = async (
  cfg: IContactConfig,
  accountId: string,
  clientFolderId: string,
  payload: {
    email: string
    firstName: string
    lastName: string
    phone: string
    postalCode: string
  },
) => {
  const body = {
    contact: {
      email: payload.email,
      firstName: payload.firstName || '',
      lastName: payload.lastName || '',
      phone: payload.phone || '',
      postalCode: payload.postalCode || '',
      status: 'normal',
    },
  }
  const res = await iContactFetch(cfg, `/icp/a/${accountId}/c/${clientFolderId}/contacts`, { method: 'POST', body })
  if (!res.ok || !res.data || typeof res.data !== 'object') {
    const message = typeof res.data === 'object' ? JSON.stringify(res.data) : String(res.data || '')
    throw new Error(`Failed to create contact (${res.status}): ${message}`)
  }
  const contacts = Array.isArray((res.data as JsonRecord).contacts) ? ((res.data as JsonRecord).contacts as any[]) : []
  const created = contacts[0]
  const contactId = sanitize(created?.contactId)
  if (!contactId) throw new Error('iContact create contact did not return a contactId.')
  return { contactId, raw: created }
}

const subscribeContactToList = async (
  cfg: IContactConfig,
  accountId: string,
  clientFolderId: string,
  contactId: string,
  listId: string,
) => {
  const body = {
    subscription: {
      contactId,
      listId,
      status: 'normal',
    },
  }
  const res = await iContactFetch(cfg, `/icp/a/${accountId}/c/${clientFolderId}/subscriptions`, { method: 'POST', body })
  if (!res.ok) {
    const message = typeof res.data === 'object' ? JSON.stringify(res.data) : String(res.data || '')
    throw new Error(`Failed to subscribe contact ${contactId} to list ${listId} (${res.status}): ${message}`)
  }
  return res.data
}

export const syncSubmissionToIContact = async (args: {
  formDoc: any
  submissionData: unknown
  accountIdOverride?: string
  payload?: any
  req?: any
}): Promise<IContactSyncResult> => {
  const formDoc = args.formDoc || {}
  const formId = sanitize(formDoc?.id)
  const formTitle = sanitize(formDoc?.title)
  if (formDoc.enableIContactSync !== true) {
    logIContact('warn', 'Skipping submission sync because iContact is disabled for the form.', {
      formId,
      formTitle,
      reason: 'sync-disabled',
    })
    return { status: 'skipped', reason: 'sync-disabled' }
  }

  const targets = await resolveFolderAndListTargets({
    formDoc,
    payload: args.payload,
    req: args.req,
  })
  const clientFolderId = targets.clientFolderId
  const listIds = targets.listIds
  if (!clientFolderId) {
    logIContact('warn', 'Skipping submission sync because the form has no resolved iContact folder.', {
      formId,
      formTitle,
      reason: 'missing-client-folder',
      configuredFolder: formDoc?.iContactFolder || null,
      configuredLists: formDoc?.iContactLists || null,
    })
    return { status: 'skipped', reason: 'missing-client-folder' }
  }
  if (!listIds.length) {
    logIContact('warn', 'Skipping submission sync because the form has no resolved iContact list IDs.', {
      formId,
      formTitle,
      reason: 'missing-list-ids',
      clientFolderId,
      configuredLists: formDoc?.iContactLists || null,
    })
    return { status: 'skipped', reason: 'missing-list-ids' }
  }

  const cfg = getIContactConfigFromEnv()
  if (!cfg) {
    logIContact('error', 'Cannot sync submission because iContact credentials are missing from environment.', {
      formId,
      formTitle,
      clientFolderId,
      listIds,
    })
    return { status: 'failed', error: 'Missing iContact env credentials.' }
  }

  const accountId = await resolveIContactAccountId(cfg, args.accountIdOverride)
  const submissionMap = toSubmissionMap(args.submissionData)
  const fieldMap = getFormFieldMap(formDoc)

  const email = pickFieldValue(submissionMap, fieldMap.emailFieldName, defaultIContactFieldMap.emailFieldName).toLowerCase()
  if (!email || !email.includes('@')) {
    logIContact('warn', 'Skipping submission sync because no valid email field was found in submission data.', {
      formId,
      formTitle,
      reason: 'missing-email',
      accountId,
      clientFolderId,
      listIds,
      configuredFieldMap: fieldMap,
      submissionFields: Array.from(submissionMap.keys()),
    })
    return { status: 'skipped', reason: 'missing-email', accountId, clientFolderId, listIds }
  }
  const firstName = pickFieldValue(submissionMap, fieldMap.firstNameFieldName, defaultIContactFieldMap.firstNameFieldName)
  const lastName = pickFieldValue(submissionMap, fieldMap.lastNameFieldName, defaultIContactFieldMap.lastNameFieldName)
  const phone = sanitizePhone(pickFieldValue(submissionMap, fieldMap.mobileFieldName, defaultIContactFieldMap.mobileFieldName))
  const postalCode = pickFieldValue(submissionMap, fieldMap.zipFieldName, defaultIContactFieldMap.zipFieldName)

  let contactId = ''
  try {
    const existing = await getExistingContact(cfg, accountId, clientFolderId, email)
    if (existing?.contactId) {
      contactId = sanitize(existing.contactId)
    } else {
      try {
        const created = await createContact(cfg, accountId, clientFolderId, {
          email,
          firstName,
          lastName,
          phone,
          postalCode,
        })
        contactId = created.contactId
      } catch (createError) {
        const retryExisting = await getExistingContact(cfg, accountId, clientFolderId, email)
        if (retryExisting?.contactId) {
          contactId = sanitize(retryExisting.contactId)
        } else {
          throw createError
        }
      }
    }

    for (const listId of listIds) {
      try {
        await subscribeContactToList(cfg, accountId, clientFolderId, contactId, listId)
      } catch (subscribeError) {
        const message = errorText(subscribeError)
        if (looksLikeDuplicateIContactError(message)) {
          logIContact('info', 'Contact was already subscribed to an iContact list; continuing.', {
            formId,
            formTitle,
            accountId,
            clientFolderId,
            listId,
            contactId,
            email,
            message,
          })
          continue
        }
        throw subscribeError
      }
    }

    logIContact('info', 'Submission synced to iContact successfully.', {
      formId,
      formTitle,
      accountId,
      clientFolderId,
      listIds,
      contactId,
      email,
      configuredFieldMap: fieldMap,
      submissionFields: Array.from(submissionMap.keys()),
    })
    return {
      status: 'success',
      accountId,
      clientFolderId,
      listIds,
      contactId,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logIContact('error', 'Submission sync to iContact failed.', {
      formId,
      formTitle,
      accountId,
      clientFolderId,
      listIds,
      contactId: contactId || undefined,
      email,
      configuredFieldMap: fieldMap,
      submissionFields: Array.from(submissionMap.keys()),
      error: message,
    })
    return {
      status: 'failed',
      accountId,
      clientFolderId,
      listIds,
      contactId: contactId || undefined,
      error: message,
    }
  }
}

export const refreshIContactCache = async (args: {
  payload: any
  req?: any
  accountIdOverride?: string
}) => {
  const cfg = getIContactConfigFromEnv()
  if (!cfg) throw new Error('Missing iContact env credentials.')

  const accountId = await resolveIContactAccountId(cfg, args.accountIdOverride)
  const foldersPayload = await listIContactClientFolders(cfg, accountId)
  const folders = (foldersPayload.clientfolders || []) as any[]
  const nowIso = new Date().toISOString()

  const folderResults: Array<Record<string, unknown>> = []

  const upsertFolder = async (row: any) => {
    const clientFolderId = sanitize(row?.clientFolderId)
    const existing = await args.payload.find({
      collection: 'icontact-folders',
      where: { clientFolderId: { equals: clientFolderId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req: args.req,
    })
    const patch = {
      clientFolderId,
      name: sanitize(row?.name) || clientFolderId,
      accountId,
      accessible: true,
      listCount: 0,
      lastSyncStatus: 'ok',
      lastSyncError: undefined,
      lastSyncedAt: nowIso,
    }
    if (existing.docs?.[0]?.id) {
      return args.payload.update({
        collection: 'icontact-folders',
        id: existing.docs[0].id,
        data: patch,
        overrideAccess: true,
        req: args.req,
      })
    }
    return args.payload.create({
      collection: 'icontact-folders',
      data: patch,
      overrideAccess: true,
      req: args.req,
    })
  }

  const upsertList = async (folderDocId: string, clientFolderId: string, list: any) => {
    const listId = sanitize(list?.listId)
    if (!listId) return null
    const uniqueKey = `${clientFolderId}:${listId}`
    const existing = await args.payload.find({
      collection: 'icontact-lists',
      where: { uniqueKey: { equals: uniqueKey } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req: args.req,
    })
    const patch = {
      uniqueKey,
      listId,
      name: sanitize(list?.name) || listId,
      description: sanitize(list?.description),
      clientFolder: folderDocId,
      clientFolderId,
      accountId,
      lastSyncedAt: nowIso,
    }
    if (existing.docs?.[0]?.id) {
      return args.payload.update({
        collection: 'icontact-lists',
        id: existing.docs[0].id,
        data: patch,
        overrideAccess: true,
        req: args.req,
      })
    }
    return args.payload.create({
      collection: 'icontact-lists',
      data: patch,
      overrideAccess: true,
      req: args.req,
    })
  }

  for (const row of folders) {
    const clientFolderId = sanitize(row?.clientFolderId)
    if (!clientFolderId) continue
    const folderDoc: any = await upsertFolder(row)
    const folderDocId = sanitize(folderDoc?.id)

    try {
      const listsPayload = await listIContactLists(cfg, accountId, clientFolderId)
      const lists = (listsPayload.lists || []) as any[]

      for (const list of lists) {
        if (!folderDocId) continue
        await upsertList(folderDocId, clientFolderId, list)
      }

      await args.payload.update({
        collection: 'icontact-folders',
        id: folderDocId,
        data: {
          listCount: lists.length,
          accessible: true,
          lastSyncStatus: 'ok',
          lastSyncError: undefined,
          lastSyncedAt: nowIso,
        },
        overrideAccess: true,
        req: args.req,
      })

      folderResults.push({
        clientFolderId,
        name: sanitize(row?.name),
        accessible: true,
        listCount: lists.length,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (folderDocId) {
        await args.payload.update({
          collection: 'icontact-folders',
          id: folderDocId,
          data: {
            accessible: false,
            lastSyncStatus: 'error',
            lastSyncError: message,
            lastSyncedAt: nowIso,
          },
          overrideAccess: true,
          req: args.req,
        })
      }
      folderResults.push({
        clientFolderId,
        name: sanitize(row?.name),
        accessible: false,
        error: message,
      })
    }
  }

  return {
    accountId,
    totalFolders: folders.length,
    accessibleFolders: folderResults.filter((row) => row.accessible === true).length,
    inaccessibleFolders: folderResults.filter((row) => row.accessible === false).length,
    results: folderResults,
  }
}
