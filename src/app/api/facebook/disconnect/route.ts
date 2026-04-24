import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import type { PayloadRequest } from 'payload'
import configPromise from '@payload-config'

import { authenticatePayloadUser, getRepInfoForUser, getString } from '@/lib/facebook'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const payload = await getPayload({ config: configPromise })
  const user = await authenticatePayloadUser(payload, req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    const parsed = await req.json()
    body = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    body = {}
  }

  const repInfoId = getString(body.repInfoId)
  if (!repInfoId) return NextResponse.json({ error: 'Missing repInfoId.' }, { status: 400 })

  const repResult = await getRepInfoForUser({
    payload,
    req: req as unknown as PayloadRequest,
    repInfoId,
    user,
  })
  if ('error' in repResult) {
    return NextResponse.json({ error: repResult.error }, { status: repResult.status })
  }

  await payload.update({
    collection: 'rep-info',
    id: repInfoId,
    data: {
      facebookPageAccessToken: null,
      facebookConnectionStatus: 'disconnected',
      facebookLastError: null,
    },
    overrideAccess: true,
    req: req as unknown as PayloadRequest,
  })

  return NextResponse.json({ ok: true })
}
