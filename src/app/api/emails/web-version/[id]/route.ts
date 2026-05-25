import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'

import { prepareEmailLayoutForRender } from '@/lib/email/footerContext'
import { renderEmail } from '@/lib/email/renderEmail'
import { verifyEmailWebVersionToken } from '@/lib/email/webVersion'

type EmailDoc = {
  layout?: unknown[] | null
  preheader?: string | null
  subject?: string | null
}

async function getPayloadRequest(req: Request) {
  const payloadReq = await createPayloadRequest({
    canSetHeaders: false,
    config: configPromise,
    request: req,
  })

  return { payload: payloadReq.payload, req: payloadReq }
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
  const token = new URL(req.url).searchParams.get('token') || ''

  if (!verifyEmailWebVersionToken(id, token)) {
    return new Response('Not found', { status: 404 })
  }

  try {
    const { payload, req: payloadReq } = await getPayloadRequest(req)
    const email = (await payload.findByID({
      collection: 'emails',
      depth: 2,
      draft: true,
      id,
      overrideAccess: true,
      req: payloadReq,
    })) as EmailDoc

    const prepared = await prepareEmailLayoutForRender({
      email: email as Record<string, unknown>,
      overrideAccess: true,
      payload,
      req: payloadReq,
    })
    const { html } = await renderEmail({
      layout: prepared.layout,
      origin: getRequestOrigin(req),
      preheader: email.preheader || '',
      subject: email.subject || 'Email update',
    })

    return new Response(html, {
      headers: {
        'Cache-Control': 'public, max-age=300',
        'Content-Type': 'text/html; charset=utf-8',
      },
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
