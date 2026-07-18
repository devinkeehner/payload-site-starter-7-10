// Keep specific dynamic endpoints beside Payload's REST catch-all so Next routes them first.
import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'

import { canUseEmailFeatures } from '@/lib/access/isSuperUser'
import {
  cancelEmailSchedule,
  requestEmailSchedule,
  requestEmailSendNow,
} from '@/lib/email/delivery'
import { getEmailWorkflow } from '@/lib/email/workflow'
import type {
  EmailCancelScheduleRequest,
  EmailDeliveryPostRequest,
  EmailScheduleRequest,
} from '@/lib/email/workflowTypes'

async function getPayloadRequest(request: Request) {
  return createPayloadRequest({
    canSetHeaders: false,
    config: configPromise,
    request,
  })
}

async function readOptionalJSON<T>(request: Request): Promise<Partial<T>> {
  const text = await request.text()
  if (!text.trim()) return {}
  return JSON.parse(text) as Partial<T>
}

function getErrorStatus(error: unknown): number {
  if (
    error &&
    typeof error === 'object' &&
    'status' in error &&
    typeof error.status === 'number'
  ) {
    return error.status
  }
  return 400
}

function getUserId(user: unknown): string | undefined {
  if (!user || typeof user !== 'object' || !('id' in user)) return undefined
  const id = user.id
  return typeof id === 'string' || typeof id === 'number' ? String(id) : undefined
}

async function mutationResponse({
  emailId,
  job,
  req,
}: {
  emailId: string
  job?: { jobId: string; status: string }
  req: Awaited<ReturnType<typeof getPayloadRequest>>
}) {
  const workflow = await getEmailWorkflow({
    emailId,
    payload: req.payload,
    req,
  })

  return Response.json({
    ...(job
      ? {
          job: {
            id: job.jobId,
            status: job.status,
          },
        }
      : {}),
    ok: true,
    workflow,
  })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const req = await getPayloadRequest(request)
  if (!req.user || !canUseEmailFeatures(req.user)) {
    return new Response('Unauthorized', { status: 403 })
  }

  try {
    const body = await readOptionalJSON<EmailDeliveryPostRequest>(request)
    if (body.mode !== 'sendNow' && body.mode !== 'schedule') {
      return new Response('Choose sendNow or schedule.', { status: 400 })
    }
    const job = body.mode === 'schedule'
      ? await requestEmailSchedule({
          emailId: id,
          expectedRevision: body.expectedRevision,
          payload: req.payload,
          req,
          request,
          scheduledAt: body.scheduledAt,
          timeZone: body.timeZone,
          userId: getUserId(req.user),
        })
      : await requestEmailSendNow({
          emailId: id,
          expectedRevision: body.expectedRevision,
          payload: req.payload,
          req,
          request,
          userId: getUserId(req.user),
        })
    return mutationResponse({ emailId: id, job, req })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to queue this campaign.'
    return new Response(message, { status: getErrorStatus(error) })
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const req = await getPayloadRequest(request)
  if (!req.user || !canUseEmailFeatures(req.user)) {
    return new Response('Unauthorized', { status: 403 })
  }

  try {
    const body = await readOptionalJSON<EmailScheduleRequest>(request)
    const job = await requestEmailSchedule({
      emailId: id,
      expectedRevision: body.expectedRevision,
      payload: req.payload,
      req,
      request,
      rescheduleOnly: true,
      scheduledAt: body.scheduledAt,
      timeZone: body.timeZone,
      userId: getUserId(req.user),
    })
    return mutationResponse({ emailId: id, job, req })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to schedule this campaign.'
    return new Response(message, { status: getErrorStatus(error) })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const req = await getPayloadRequest(request)
  if (!req.user || !canUseEmailFeatures(req.user)) {
    return new Response('Unauthorized', { status: 403 })
  }

  try {
    const body = await readOptionalJSON<EmailCancelScheduleRequest>(request)
    await cancelEmailSchedule({
      emailId: id,
      expectedRevision: body.expectedRevision,
      payload: req.payload,
      req,
    })
    return mutationResponse({ emailId: id, req })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to cancel this schedule.'
    return new Response(message, { status: getErrorStatus(error) })
  }
}
