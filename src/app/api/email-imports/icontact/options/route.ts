import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'

import { isSuperUser } from '@/lib/access/isSuperUser'
import {
  getIContactConfigFromEnv,
  listIContactClientFolders,
  listIContactLists,
  resolveIContactAccountId,
} from '@/lib/icontact'

type UnknownRecord = Record<string, unknown>

function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

async function getAuthenticatedPayloadRequest(req: Request) {
  const payloadReq = await createPayloadRequest({
    canSetHeaders: false,
    config: configPromise,
    request: req,
  })

  return { payload: payloadReq.payload, req: payloadReq, user: payloadReq.user }
}

function mapFolder(value: UnknownRecord) {
  return {
    clientFolderId: getString(value.clientFolderId),
    name: getString(value.name) || `Folder ${getString(value.clientFolderId)}`,
  }
}

function mapList(value: UnknownRecord) {
  return {
    description: getString(value.description),
    listId: getString(value.listId),
    name: getString(value.name) || `List ${getString(value.listId)}`,
  }
}

export async function GET(req: Request) {
  const { payload, req: payloadReq, user } = await getAuthenticatedPayloadRequest(req)

  if (!user || !isSuperUser(user)) {
    return new Response('Unauthorized', { status: 403 })
  }

  try {
    const url = new URL(req.url)
    const clientFolderId = url.searchParams.get('clientFolderId')?.trim() || ''
    const accountIdOverride = url.searchParams.get('accountId')?.trim() || undefined
    const cfg = getIContactConfigFromEnv()

    const tenants = await payload.find({
      collection: 'tenants',
      depth: 0,
      limit: 500,
      overrideAccess: false,
      req: payloadReq,
      sort: 'name',
      where: {
        archived: {
          not_equals: true,
        },
      },
    })

    if (!cfg) {
      return Response.json({
        accountId: '',
        error: 'iContact credentials are not configured in environment variables.',
        folders: [],
        lists: [],
        tenants: tenants.docs.map((tenant) => ({
          id: String(tenant.id),
          name: getString(tenant.name) || getString(tenant.slug) || String(tenant.id),
          slug: getString(tenant.slug),
        })),
      }, { status: 400 })
    }

    const accountId = await resolveIContactAccountId(cfg, accountIdOverride)
    const foldersPayload = await listIContactClientFolders(cfg, accountId)
    const folders = ((foldersPayload.clientfolders || []) as UnknownRecord[]).map(mapFolder)
    const listsPayload = clientFolderId ? await listIContactLists(cfg, accountId, clientFolderId) : null
    const lists = ((listsPayload?.lists || []) as UnknownRecord[]).map(mapList)

    return Response.json({
      accountId,
      folders,
      lists,
      tenants: tenants.docs.map((tenant) => ({
        id: String(tenant.id),
        name: getString(tenant.name) || getString(tenant.slug) || String(tenant.id),
        slug: getString(tenant.slug),
      })),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load iContact import options'
    return new Response(message, { status: 500 })
  }
}
