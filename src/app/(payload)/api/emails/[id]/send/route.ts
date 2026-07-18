// Keep specific dynamic endpoints beside Payload's REST catch-all so Next routes them first.
import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'

import { canUseEmailFeatures } from '@/lib/access/isSuperUser'
import { requestEmailSendNow } from '@/lib/email/delivery'
import { getEmailReadiness } from '@/lib/email/readiness'
import { getEmailWorkflow } from '@/lib/email/workflow'

function getUserId(user: unknown): string | undefined {
  if (!user || typeof user !== 'object' || !('id' in user)) return undefined
  const id = user.id
  return typeof id === 'string' || typeof id === 'number' ? String(id) : undefined
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const req = await createPayloadRequest({
    canSetHeaders: false,
    config: configPromise,
    request,
  })
  if (!req.user || !canUseEmailFeatures(req.user)) {
    return new Response('Unauthorized', { status: 403 })
  }

  try {
    const body = await request.json().catch(() => ({})) as { expectedRevision?: unknown }
    const currentRevision = (await getEmailReadiness({
      emailId: id,
      payload: req.payload,
      req,
    })).contentRevision
    const result = await requestEmailSendNow({
      emailId: id,
      expectedRevision: typeof body.expectedRevision === 'string'
        ? body.expectedRevision
        : currentRevision,
      payload: req.payload,
      req,
      request,
      userId: getUserId(req.user),
    })
    const workflow = await getEmailWorkflow({
      emailId: id,
      payload: req.payload,
      req,
    })

    return Response.json({
      jobId: result.jobId,
      message: 'Campaign queued for delivery.',
      status: 'queued',
      workflow,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to queue this campaign.'
    const status = error && typeof error === 'object' && 'status' in error &&
      typeof error.status === 'number'
      ? error.status
      : 400
    return new Response(message, { status })
  }
}
