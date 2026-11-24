// Keep specific dynamic endpoints beside Payload's REST catch-all so Next routes them first.
import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'

import { canUseEmailFeatures } from '@/lib/access/isSuperUser'
import { prepareEmailLayoutForRender } from '@/lib/email/footerContext'
import {
  getIContactAutomationTestTarget,
  sendIContactAutomationTestEmail,
} from '@/lib/email/iContactAutomationTest'
import {
  advanceAutomationPilotRun,
  beginAutomationPilotRun,
  confirmAutomationPilotReceipt,
  getAutomationPilotRun,
  releaseUntriggeredAutomationPilotRun,
} from '@/lib/email/iContactAutomationPilotRun'
import { prepareIContactTestEmail, sendIContactTestEmail } from '@/lib/email/iContactEmail'
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

async function getTestClientFolderId({
  email,
  optional = false,
  payload,
  req,
}: {
  email: Email
  optional?: boolean
  payload: Awaited<ReturnType<typeof getAuthenticatedPayloadRequest>>['payload']
  req: Awaited<ReturnType<typeof getAuthenticatedPayloadRequest>>['req']
}): Promise<string> {
  const relationship = email.emailList
  if (relationship && typeof relationship === 'object') {
    const clientFolderId = getOptionalString(relationship.iContactClientFolderId)
    if (clientFolderId) return clientFolderId
  }

  const emailListId = getEmailRelationshipId(relationship)
  if (!emailListId) {
    if (optional) return ''
    throw new Error('Choose an iContact-backed audience before sending a test email.')
  }
  const emailList = await payload.findByID({
    collection: 'email-lists',
    id: emailListId,
    depth: 0,
    overrideAccess: false,
    req,
  })
  if (optional) return getOptionalString(emailList.iContactClientFolderId) || ''
  return getRequiredString(
    emailList.iContactClientFolderId,
    'The selected audience’s iContact client folder',
  )
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

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { payload, req: payloadReq, user } = await getAuthenticatedPayloadRequest(req)
  if (!user || !canUseEmailFeatures(user)) return new Response('Unauthorized', { status: 403 })

  if (!process.env.ICONTACT_TEST_AUTOMATIONS?.trim()) return Response.json(null)

  try {
    const email = await payload.findByID({
      collection: 'emails', id, draft: true, depth: 1, overrideAccess: false, req: payloadReq,
    })
    const folderId = await getTestClientFolderId({ email, optional: true, payload, req: payloadReq })
    const target = getIContactAutomationTestTarget(folderId)
    if (!target) return Response.json(null)

    const run = await getAutomationPilotRun(payload, folderId)
    const confirmable = run && run.emailId === id && ['triggered', 'uncertain'].includes(run.phase)

    return Response.json({
      busy: Boolean(run),
      pending: confirmable ? { runId: run.runId, subject: run.subject } : null,
      recipientEmail: target.recipientEmail,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return new Response(error instanceof Error ? error.message : 'Unable to load the automation pilot.', { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { payload, req: payloadReq, user } = await getAuthenticatedPayloadRequest(req)

  if (!user || !canUseEmailFeatures(user)) {
    return new Response('Unauthorized', { status: 403 })
  }

  let contentRevision = ''
  let isAutomationPilot = false
  let isDryRun = false
  let recipientEmail = ''

  try {
    const body = (await req.json().catch(() => ({}))) as {
      automationPilot?: unknown
      confirmAutomationRunId?: unknown
      dryRun?: unknown
      preparedListId?: unknown
      recipientEmail?: unknown
      expectedRevision?: unknown
    }
    const confirmationRunId = getOptionalString(body.confirmAutomationRunId)
    isAutomationPilot = body.automationPilot === true || Boolean(confirmationRunId)
    isDryRun = body.dryRun === true
    const email = (await payload.findByID({
      collection: 'emails',
      id,
      draft: true,
      depth: 2,
      overrideAccess: false,
      req: payloadReq,
    })) as Email

    const clientFolderId = await getTestClientFolderId({ email, payload, req: payloadReq })
    const automationTarget = getIContactAutomationTestTarget(clientFolderId)
    if (isAutomationPilot && !automationTarget) {
      throw new Error('This iContact folder has no automation test configuration.')
    }
    if (confirmationRunId) {
      await confirmAutomationPilotReceipt({ emailId: id, folderId: clientFolderId, payload, runId: confirmationRunId })
      return Response.json({ message: 'Automation test receipt confirmed.', status: 'received' })
    }

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
    const expectedRevision = getOptionalString(body.expectedRevision)
    if (expectedRevision && expectedRevision !== contentRevision) {
      return new Response('The campaign changed. Refresh the review and prepare the test again.', { status: 409 })
    }
    const blockingLinks = getBlockingEmailLinks(readiness.quality?.links)

    if (blockingLinks.length) {
      const failures = blockingLinks
        .map((link) => `${link.label || 'Link'}: ${link.href || 'Missing URL'}${link.remoteStatus ? ` (HTTP ${link.remoteStatus})` : link.reason ? ` (${link.reason})` : ''}`)
        .join('\n')

      throw new Error(`Fix malformed or missing links before sending a test:\n${failures}`)
    }

    recipientEmail = getRequiredString(
      isAutomationPilot ? automationTarget?.recipientEmail : getOptionalString(body.recipientEmail) || email.recipientEmail,
      'Test recipient email',
    )
    assertValidEmail(recipientEmail)
    // Preparing an ordinary test list can subscribe the recipient. For this list,
    // subscribing is already a delivery operation owned by the automation pilot.
    if (!isAutomationPilot && automationTarget?.recipientEmail === recipientEmail.toLowerCase()) {
      isAutomationPilot = true
      throw Object.assign(new Error('Use Send Automation Test for the configured pilot inbox.'), { status: 409 })
    }
    if (isAutomationPilot && isDryRun) throw new Error('Submit an automation test without dry-run mode.')
    const subject = getRequiredString(email.subject, 'Subject')
    const preheader = typeof email.preheader === 'string' ? email.preheader : ''
    const senderSettings = await getTenantEmailSenderSettings({
      email: email as unknown as Record<string, unknown>,
      payload,
      req: payloadReq,
    })
    if (isDryRun) {
      const preparation = await prepareIContactTestEmail({
        blockedListId: automationTarget?.listId,
        clientFolderId,
        recipientEmail,
      })
      const message = `Verified exactly one active recipient (${preparation.recipientEmail}) in iContact list “${preparation.listName}” (list ${preparation.listId}, folder ${preparation.clientFolderId}). No email was sent.`
      return Response.json({
        ...preparation,
        contentRevision,
        message,
        status: 'verified',
      })
    }
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

    if (expectedRevision && expectedRevision !== contentRevision) {
      return new Response('The campaign changed. Refresh the review and prepare the test again.', { status: 409 })
    }

    if (isAutomationPilot && automationTarget) {
      const run = await beginAutomationPilotRun({ emailId: id, folderId: clientFolderId, payload, subject })
      let triggerStarted = false

      try {
        await sendIContactAutomationTestEmail({
          beforeTrigger: async () => {
            await updateEmailIfStatus({ allowedStatuses: ['draft', 'failed'], data: {}, emailId: id, payload })
            await advanceAutomationPilotRun(payload, run, 'preparing', 'triggering')
            triggerStarted = true
          },
          clientFolderId,
          expectedCampaignId: senderSettings.iContactCampaignId,
          html,
          preheader,
          recipientEmail,
          subject: run.subject,
          target: automationTarget,
          text,
        })
        await advanceAutomationPilotRun(payload, run, 'triggering', 'triggered')
      } catch (error) {
        if (triggerStarted) {
          await advanceAutomationPilotRun(payload, run, 'triggering', 'uncertain')
            .catch(() => undefined)
          const detail = error instanceof Error ? error.message : 'Subscription outcome unavailable.'
          throw new Error(`iContact may have triggered the automation. Check for “${run.subject}” before confirming receipt. ${detail}`)
        }
        await releaseUntriggeredAutomationPilotRun(payload, run)
        throw error
      }

      return Response.json({
        message: `Automation triggered for ${recipientEmail}. Look for “${run.subject}”.`,
        status: 'triggered',
      })
    }

    // Recheck the lifecycle immediately before dispatch. The post-send write
    // is also conditional in case delivery is confirmed concurrently.
    await updateEmailIfStatus({
      allowedStatuses: ['draft', 'failed'],
      data: {},
      emailId: id,
      payload,
    })

    const result = await sendIContactTestEmail({
      blockedListId: automationTarget?.listId,
      campaignId: senderSettings.iContactCampaignId,
      clientFolderId,
      fromEmail: senderSettings.fromEmail,
      html,
      preheader,
      preparedListId: getRequiredString(body.preparedListId, 'Prepared iContact test list ID'),
      recipientEmail,
      replyTo,
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

    if (recipientEmail && !isDryRun && !isAutomationPilot) {
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
