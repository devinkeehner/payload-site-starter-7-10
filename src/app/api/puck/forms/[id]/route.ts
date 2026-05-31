import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'

import { formToPuckData, puckDataToFormPatch } from '@/lib/puck/converters'
import type { PuckFormDoc, PuckPageData } from '@/lib/puck/types'

async function getAuthenticatedPayloadRequest(req: Request) {
  const payloadReq = await createPayloadRequest({
    canSetHeaders: false,
    config: configPromise,
    request: req,
  })

  return { payload: payloadReq.payload, req: payloadReq, user: payloadReq.user }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { payload, req: payloadReq, user } = await getAuthenticatedPayloadRequest(req)

  if (!user) {
    return new Response('Unauthorized', { status: 403 })
  }

  try {
    const form = await payload.findByID({
      collection: 'forms',
      id,
      depth: 2,
      overrideAccess: false,
      req: payloadReq,
    }) as unknown as PuckFormDoc

    return Response.json({ data: formToPuckData(form), form })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load form'
    return new Response(message, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { payload, req: payloadReq, user } = await getAuthenticatedPayloadRequest(req)

  if (!user) {
    return new Response('Unauthorized', { status: 403 })
  }

  try {
    const body = (await req.json()) as { data?: PuckPageData }
    if (!body.data || typeof body.data !== 'object') {
      return new Response('Missing Puck data', { status: 400 })
    }

    const patch = puckDataToFormPatch(body.data)
    const form = await payload.update({
      collection: 'forms',
      id,
      data: patch,
      depth: 2,
      overrideAccess: false,
      overrideLock: false,
      req: payloadReq,
    }) as unknown as PuckFormDoc

    return Response.json({ data: formToPuckData(form), form })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save form'
    return new Response(message, { status: 500 })
  }
}
