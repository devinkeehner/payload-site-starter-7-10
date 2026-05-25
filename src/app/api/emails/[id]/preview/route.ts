import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'

import { isSuperUser } from '@/lib/access/isSuperUser'
import { prepareEmailLayoutForRender } from '@/lib/email/footerContext'
import { renderEmail } from '@/lib/email/renderEmail'

type EmailDoc = {
  emailList?: unknown
  layout?: unknown[] | null
  preheader?: string | null
  subject?: string | null
}

async function getAuthenticatedPayloadRequest(req: Request) {
  const payloadReq = await createPayloadRequest({
    canSetHeaders: false,
    config: configPromise,
    request: req,
  })

  return { payload: payloadReq.payload, req: payloadReq, user: payloadReq.user }
}

function getRequestOrigin(req: Request): string {
  const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const host = forwardedHost || req.headers.get('host')?.split(',')[0]?.trim()
  const forwardedProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const requestUrl = new URL(req.url)
  const protocol = forwardedProto || requestUrl.protocol.replace(':', '') || 'https'

  return host ? `${protocol}://${host}` : requestUrl.origin
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
    const prepared = await prepareEmailLayoutForRender({
      email: email as Record<string, unknown>,
      payload,
      req: payloadReq,
    })
    const rendered = await renderEmail({
      layout: prepared.layout,
      origin: getRequestOrigin(req),
      preheader: email.preheader || '',
      subject: email.subject || 'Email preview',
    })

    return Response.json(rendered)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to render email preview'
    return new Response(message, { status: 500 })
  }
}
