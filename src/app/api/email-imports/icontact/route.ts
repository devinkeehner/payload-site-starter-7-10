import configPromise from '@payload-config'
import { createPayloadRequest, type PayloadRequest } from 'payload'

import { isSuperUser } from '@/lib/access/isSuperUser'
import { importIContactList } from '@/lib/email/importIContact'

async function getAuthenticatedPayloadRequest(req: Request) {
  const payloadReq = await createPayloadRequest({
    canSetHeaders: false,
    config: configPromise,
    request: req,
  })

  return { payload: payloadReq.payload, req: payloadReq, user: payloadReq.user }
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function getBatchReq(req: PayloadRequest, tenantId: string): PayloadRequest & { tenant: string } {
  const batchReq = { ...req, tenant: tenantId } as PayloadRequest & { tenant: string; transactionID?: unknown }
  delete batchReq.transactionID
  return batchReq
}

export async function POST(req: Request) {
  const { payload, req: payloadReq, user } = await getAuthenticatedPayloadRequest(req)

  if (!user || !isSuperUser(user)) {
    return new Response('Unauthorized', { status: 403 })
  }

  try {
    const body = (await req.json()) as Record<string, unknown>
    const tenantId = getString(body.tenantId)
    const clientFolderId = getString(body.clientFolderId)
    const listId = getString(body.listId)
    const dryRun = body.dryRun !== false

    if (!tenantId) return new Response('tenantId is required', { status: 400 })
    if (!clientFolderId) return new Response('clientFolderId is required', { status: 400 })
    if (!listId) return new Response('listId is required', { status: 400 })

    const scopedReq = getBatchReq(payloadReq, tenantId)
    const startedAt = new Date().toISOString()
    const job = await payload.create({
      collection: 'email-import-jobs',
      data: {
        dryRun,
        iContactClientFolderId: clientFolderId,
        iContactListId: listId,
        source: 'icontact',
        startedAt,
        status: 'running',
        tenant: tenantId,
      },
      disableTransaction: true,
      overrideAccess: false,
      req: scopedReq,
    })

    try {
      const result = await importIContactList({
        clientFolderId,
        dryRun,
        listId,
        payload,
        req: scopedReq,
        tenantId,
      })

      const completedAt = new Date().toISOString()
      await payload.update({
        collection: 'email-import-jobs',
        data: {
          completedAt,
          errors: result.errors,
          failedContacts: result.failedContacts,
          importedContacts: result.importedContacts,
          message: dryRun ? 'Dry run completed.' : 'Import completed.',
          status: 'completed',
          statusCounts: result.statusCounts,
          statusDebug: result.statusDebug,
          totalContacts: result.totalContacts,
          updatedContacts: result.updatedContacts,
        },
        disableTransaction: true,
        id: String(job.id),
        overrideAccess: false,
        overrideLock: false,
        req: scopedReq,
      })

      return Response.json({
        jobId: job.id,
        status: 'completed',
        ...result,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'iContact import failed'
      await payload.update({
        collection: 'email-import-jobs',
        data: {
          completedAt: new Date().toISOString(),
          message,
          status: 'failed',
        },
        disableTransaction: true,
        id: String(job.id),
        overrideAccess: false,
        overrideLock: false,
        req: scopedReq,
      })
      throw error
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to import iContact list'
    return new Response(message, { status: 500 })
  }
}
