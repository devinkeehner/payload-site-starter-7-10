import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'

import { canUseEmailFeatures } from '@/lib/access/isSuperUser'
import { getEmailWorkflow } from '@/lib/email/workflow'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const req = await createPayloadRequest({
    canSetHeaders: false,
    config: configPromise,
    request,
  })

  if (!req.user || !canUseEmailFeatures(req.user)) {
    return new Response('Unauthorized', { status: 403 })
  }

  try {
    return Response.json(
      await getEmailWorkflow({
        emailId: id,
        payload: req.payload,
        req,
      }),
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load the email workflow.'
    return new Response(message, { status: 500 })
  }
}
