import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'

import { canUseEmailFeatures } from '@/lib/access/isSuperUser'
import { sendProductionEmailCampaign } from '@/lib/email/campaignSend'

async function getAuthenticatedPayloadRequest(req: Request) {
  const payloadReq = await createPayloadRequest({
    canSetHeaders: false,
    config: configPromise,
    request: req,
  })

  return { payload: payloadReq.payload, req: payloadReq, user: payloadReq.user }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { payload, req: payloadReq, user } = await getAuthenticatedPayloadRequest(req)

  if (!user || !canUseEmailFeatures(user)) {
    return new Response('Unauthorized', { status: 403 })
  }

  try {
    const result = await sendProductionEmailCampaign({
      emailId: id,
      payload,
      req: payloadReq,
      request: req,
      userId: typeof user.id === 'string' || typeof user.id === 'number' ? String(user.id) : undefined,
    })

    return Response.json({
      ...result,
      message: result.message,
      status: 'sent',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to send production email'

    try {
      await payload.update({
        collection: 'emails',
        data: {
          sendSummary: {
            sendError: message,
          },
          status: 'failed',
        },
        draft: true,
        id,
        overrideAccess: false,
        overrideLock: false,
        req: payloadReq,
      })
    } catch {
      // Preserve the original send error.
    }

    return new Response(message, { status: 500 })
  }
}
