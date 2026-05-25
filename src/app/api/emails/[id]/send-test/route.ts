import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'

import { sendElasticMarketingEmail } from '@/lib/email/elasticEmail'
import { prepareEmailLayoutForRender } from '@/lib/email/footerContext'
import { renderEmail } from '@/lib/email/renderEmail'
import type { Email } from '@/payload-types'

async function getAuthenticatedPayloadRequest(req: Request) {
  const payloadReq = await createPayloadRequest({
    canSetHeaders: false,
    config: configPromise,
    request: req,
  })

  return { payload: payloadReq.payload, req: payloadReq, user: payloadReq.user }
}

function getRequiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required.`)
  }

  return value.trim()
}

function hasSendableLayout(value: unknown): value is Array<Record<string, unknown>> {
  return Array.isArray(value) && value.some((block) => block && typeof block === 'object')
}

function getRequestOrigin(req: Request): string {
  const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const host = forwardedHost || req.headers.get('host')?.split(',')[0]?.trim()
  const forwardedProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const requestUrl = new URL(req.url)
  const protocol = forwardedProto || requestUrl.protocol.replace(':', '') || 'https'

  return host ? `${protocol}://${host}` : requestUrl.origin
}

async function updateLastTestSend({
  id,
  message,
  payload,
  payloadReq,
  recipientEmail,
  status,
}: {
  id: string
  message: string
  payload: Awaited<ReturnType<typeof getAuthenticatedPayloadRequest>>['payload']
  payloadReq: Awaited<ReturnType<typeof getAuthenticatedPayloadRequest>>['req']
  recipientEmail: string
  status: 'failed' | 'sent'
}) {
  await payload.update({
    collection: 'emails',
    id,
    data: {
      lastSend: {
        message,
        recipientEmail,
        sentAt: new Date().toISOString(),
        status,
      },
    },
    draft: true,
    overrideAccess: false,
    overrideLock: false,
    req: payloadReq,
  })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { payload, req: payloadReq, user } = await getAuthenticatedPayloadRequest(req)

  if (!user) {
    return new Response('Unauthorized', { status: 403 })
  }

  let recipientEmail = ''

  try {
    const email = (await payload.findByID({
      collection: 'emails',
      id,
      draft: true,
      depth: 2,
      overrideAccess: false,
      req: payloadReq,
    })) as Email

    recipientEmail = getRequiredString(email.recipientEmail, 'Test recipient email')
    const subject = getRequiredString(email.subject, 'Subject')
    const preheader = typeof email.preheader === 'string' ? email.preheader : ''
    const replyTo = typeof email.replyTo === 'string' && email.replyTo.trim() ? email.replyTo.trim() : undefined

    if (!hasSendableLayout(email.layout)) {
      throw new Error('Email content is required before sending a test.')
    }

    const prepared = await prepareEmailLayoutForRender({
      email: email as unknown as Record<string, unknown>,
      payload,
      req: payloadReq,
    })
    const { html, text } = await renderEmail({
      layout: prepared.layout,
      origin: getRequestOrigin(req),
      preheader,
      subject,
    })

    const result = await sendElasticMarketingEmail({
      html,
      replyTo,
      subject,
      text,
      to: recipientEmail,
    })

    const message = result.id
      ? `Test email sent successfully. Elastic Email ID: ${result.id}`
      : 'Test email sent successfully.'

    await updateLastTestSend({
      id,
      message,
      payload,
      payloadReq,
      recipientEmail,
      status: 'sent',
    })

    return Response.json({
      id: result.id,
      message,
      status: 'sent',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to send test email'

    if (recipientEmail) {
      try {
        await updateLastTestSend({
          id,
          message,
          payload,
          payloadReq,
          recipientEmail,
          status: 'failed',
        })
      } catch {
        // Keep the original send/render error as the response.
      }
    }

    return new Response(message, { status: 500 })
  }
}
