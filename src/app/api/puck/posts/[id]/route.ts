import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'

import { isSuperUser } from '@/lib/access/isSuperUser'
import { postToPuckData, puckDataToPostPatch } from '@/lib/puck/converters'
import type { PuckPageData, PuckPostDoc } from '@/lib/puck/types'

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

  if (!user || !isSuperUser(user)) {
    return new Response('Unauthorized', { status: 403 })
  }

  try {
    const post = await payload.findByID({
      collection: 'posts',
      id,
      draft: true,
      depth: 2,
      overrideAccess: false,
      req: payloadReq,
    }) as unknown as PuckPostDoc

    return Response.json({
      data: postToPuckData(post),
      post,
      themeStyle: null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load post'
    return new Response(message, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { payload, req: payloadReq, user } = await getAuthenticatedPayloadRequest(req)

  if (!user || !isSuperUser(user)) {
    return new Response('Unauthorized', { status: 403 })
  }

  try {
    const body = (await req.json()) as { data?: PuckPageData }
    if (!body.data || typeof body.data !== 'object') {
      return new Response('Missing Puck data', { status: 400 })
    }

    const patch = puckDataToPostPatch(body.data)
    const post = await payload.update({
      collection: 'posts',
      id,
      data: patch,
      draft: true,
      depth: 2,
      overrideAccess: false,
      overrideLock: false,
      req: payloadReq,
    }) as unknown as PuckPostDoc

    return Response.json({
      data: postToPuckData(post),
      post,
      themeStyle: null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save post'
    return new Response(message, { status: 500 })
  }
}
