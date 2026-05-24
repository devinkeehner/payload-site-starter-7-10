import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'

import { isSuperUser } from '@/lib/access/isSuperUser'
import { convertEmailToPost } from '@/lib/email/convertEmailToPost'

type EmailDoc = {
  layout?: unknown[] | null
  preheader?: string | null
  subject?: string | null
  title?: string | null
}

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
    const email = (await payload.findByID({
      collection: 'emails',
      depth: 2,
      draft: true,
      id,
      overrideAccess: false,
      req: payloadReq,
    })) as EmailDoc
    const title = email.subject?.trim() || email.title?.trim() || 'Email update'
    const converted = convertEmailToPost(email.layout, email.preheader || title)

    return Response.json({
      content: converted.content,
      layout: converted.layout,
      meta: {
        description: email.preheader || '',
        title,
      },
      title,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to render post preview'
    return new Response(message, { status: 500 })
  }
}
