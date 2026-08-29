// Keep specific dynamic endpoints beside Payload's REST catch-all so Next routes them first.
import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'

import { canUseEmailFeatures } from '@/lib/access/isSuperUser'
import { sendIContactTestEmail } from '@/lib/email/iContactEmail'
import { prepareEmailLayoutForRender } from '@/lib/email/footerContext'
import {
  canSendEmailTest,
  getEmailCampaignStatus,
  updateEmailIfStatus,
} from '@/lib/email/lifecycle'
import { getEmailRelationshipId } from '@/lib/email/recipients'
import { getBlockingEmailLinks, getEmailReadiness } from '@/lib/email/readiness'
import { renderEmail } from '@/lib/email/renderEmail'
import { computeEmailRenderedContentRevision } from '@/lib/email/revision'
import { getTenantEmailSenderSettings } from '@/lib/email/sender'
import { getEmailWebVersionUrl } from '@/lib/email/webVersion'
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

function getOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function assertValidEmail(value: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error('Enter a valid test recipient email.')
  }
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
  contentRevision,
  id,
  message,
  payload,
  recipientEmail,
  status,
}: {
  contentRevision: string
  id: string
  message: string
  payload: Awaited<ReturnType<typeof getAuthenticatedPayloadRequest>>['payload']
  recipientEmail: string
  status: 'failed' | 'sent'
}) {
  await updateEmailIfStatus({
    allowedStatuses: ['draft', 'failed'],
    data: {
      lastSend: {
        contentRevision,
        message,
        recipientEmail,
        sentAt: new Date().toISOString(),
        status,
      },
    },
    emailId: id,
    payload,
  })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { payload, req: payloadReq, user } = await getAuthenticatedPayloadRequest(req)

  if (!user || !canUseEmailFeatures(user)) {
    return new Response('Unauthorized', { status: 403 })
  }

  let contentRevision = ''
  let recipientEmail = ''

  try {
    const body = (await req.json().catch(() => ({}))) as { recipientEmail?: unknown }
    const email = (await payload.findByID({
      collection: 'emails',
      id,
      draft: true,
      depth: 2,
      overrideAccess: false,
      req: payloadReq,
    })) as Email
    if (!canSendEmailTest(getEmailCampaignStatus(email.status))) {
      const statusError = new Error('Duplicate this campaign before sending another test.')
      ;(statusError as Error & { status?: number }).status = 409
      throw statusError
    }
    const readiness = await getEmailReadiness({
      emailId: id,
      payload,
      req: payloadReq,
    })
    contentRevision = readiness.contentRevision
    const blockingLinks = getBlockingEmailLinks(readiness.quality?.links)

    if (blockingLinks.length) {
      const failures = blockingLinks
        .map((link) => `${link.label || 'Link'}: ${link.href || 'Missing URL'}${link.remoteStatus ? ` (HTTP ${link.remoteStatus})` : link.reason ? ` (${link.reason})` : ''}`)
        .join('\n')

      throw new Error(`Fix malformed or missing links before sending a test:\n${failures}`)
    }

    recipientEmail = getRequiredString(
      getOptionalString(body.recipientEmail) || email.recipientEmail,
      'Test recipient email',
    )
    assertValidEmail(recipientEmail)
    const subject = getRequiredString(email.subject, 'Subject')
    const preheader = typeof email.preheader === 'string' ? email.preheader : ''
    const senderSettings = await getTenantEmailSenderSettings({
      email: email as unknown as Record<string, unknown>,
      payload,
      req: payloadReq,
    })
    const replyTo = typeof email.replyTo === 'string' && email.replyTo.trim()
      ? email.replyTo.trim()
      : senderSettings.replyTo

    if (!hasSendableLayout(email.layout)) {
      throw new Error('Email content is required before sending a test.')
    }

    const prepared = await prepareEmailLayoutForRender({
      email: email as unknown as Record<string, unknown>,
      payload,
      req: payloadReq,
    })
    const origin = getRequestOrigin(req)
    const { html, text } = await renderEmail({
      layout: prepared.layout,
      origin,
      preheader,
      subject,
      webVersionUrl: getEmailWebVersionUrl(String(id), origin),
    })
    contentRevision = computeEmailRenderedContentRevision({
      audienceListId: getEmailRelationshipId(email.emailList),
      fromEmail: senderSettings.fromEmail,
      fromName: senderSettings.fromName,
      html,
      origin,
      preheader,
      replyTo,
      subject,
      tenantId: getEmailRelationshipId(email.tenant),
      text,
    })

    // Recheck the lifecycle immediately before the irreversible provider call.
    // The post-send write is also conditional, so a concurrent delivery
    // confirmation cannot make this campaign look like it was tested later.
    await updateEmailIfStatus({
      allowedStatuses: ['draft', 'failed'],
      data: {},
      emailId: id,
      payload,
    })

    const result = await sendIContactTestEmail({
      campaignId: senderSettings.iContactCampaignId,
      fromEmail: senderSettings.fromEmail,
      html,
      preheader,
      recipientEmail,
      subject,
      text,
    })

    const message = result.sendId
      ? `Test email sent to ${recipientEmail}. iContact send ID: ${result.sendId}`
      : `Test email sent to ${recipientEmail}.`

    await updateLastTestSend({
      contentRevision,
      id,
      message,
      payload,
      recipientEmail,
      status: 'sent',
    })

    return Response.json({
      contentRevision,
      id: result.sendId,
      message,
      recipientEmail,
      status: 'sent',
      testedRevisionHash: contentRevision,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to send test email'

    if (recipientEmail) {
      try {
        await updateLastTestSend({
          contentRevision,
          id,
          message,
          payload,
          recipientEmail,
          status: 'failed',
        })
      } catch {
        // Keep the original send/render error as the response.
      }
    }

    const status = error && typeof error === 'object' && 'status' in error &&
      typeof error.status === 'number'
      ? error.status
      : 500
    return new Response(message, { status })
  }
}
