// Keep specific dynamic endpoints beside Payload's REST catch-all so Next routes them first.
import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'

import { emailToPuckData, puckDataToLayoutPatch } from '@/lib/puck/converters'
import type { PuckEmailDoc, PuckPageData } from '@/lib/puck/types'

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
    const email = await payload.findByID({
      collection: 'emails',
      id,
      draft: true,
      depth: 2,
      overrideAccess: false,
      req: payloadReq,
    }) as PuckEmailDoc

    return Response.json({ data: emailToPuckData(email), email })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load email'
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

    const patch = puckDataToLayoutPatch(body.data)
    const email = await payload.update({
      collection: 'emails',
      id,
      data: patch,
      draft: true,
      depth: 2,
      overrideAccess: false,
      overrideLock: false,
      req: payloadReq,
    }) as PuckEmailDoc

    return Response.json({ data: emailToPuckData(email), email })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save email'
    return new Response(message, { status: 500 })
  }
}
