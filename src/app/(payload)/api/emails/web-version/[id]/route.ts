// Keep specific dynamic endpoints beside Payload's REST catch-all so Next routes them first.
import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'

import { prepareEmailLayoutForRender } from '@/lib/email/footerContext'
import { getEmailRelationshipId } from '@/lib/email/recipients'
import { renderEmail } from '@/lib/email/renderEmail'
import { getEmailSnapshotHTML } from '@/lib/email/snapshot'
import { verifyEmailWebVersionToken } from '@/lib/email/webVersion'

type EmailDoc = {
  deliveryJob?: unknown
  layout?: unknown[] | null
  preheader?: string | null
  status?: string | null
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
    const immutableStatus = ['failed', 'queued', 'scheduled', 'sending', 'sent'].includes(
      email.status || '',
    )
    if (immutableStatus) {
      let jobId = getEmailRelationshipId(email.deliveryJob)
      if (!jobId && email.status === 'sent') {
        const completed = await payload.find({
          collection: 'email-send-jobs' as never,
          depth: 0,
          limit: 1,
          overrideAccess: true,
          req: payloadReq,
          sort: '-completedAt',
          where: {
            and: [
              { email: { equals: id } },
              { status: { equals: 'completed' } },
            ],
          },
        })
        jobId = getEmailRelationshipId(completed.docs[0])
      }
      if (!jobId) return new Response('Not found', { status: 404 })

      const job = await payload.findByID({
        collection: 'email-send-jobs' as never,
        depth: 0,
        id: jobId,
        overrideAccess: true,
        req: payloadReq,
      })
      const jobRecord = job as unknown as Record<string, unknown>
      if (getEmailRelationshipId(jobRecord.email) !== id) {
        return new Response('Not found', { status: 404 })
      }
      const snapshotHTML = getEmailSnapshotHTML(jobRecord.snapshot)
      if (!snapshotHTML) return new Response('Not found', { status: 404 })

      return new Response(snapshotHTML, {
        headers: {
          'Cache-Control': 'public, max-age=300',
          'Content-Type': 'text/html; charset=utf-8',
        },
      })
    }

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
