import { NextRequest, NextResponse } from 'next/server'
import { getPayload, type PayloadRequest } from 'payload'

import configPromise from '@payload-config'
import { getMailExportJob } from '@/lib/graphics/mail-export-jobs'

export const runtime = 'nodejs'

export async function GET(req: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const payload = await getPayload({ config: configPromise })
  const user = await payload.auth({ req: req as unknown as PayloadRequest, headers: req.headers }).catch(() => null)
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { jobId } = await context.params
  const job = getMailExportJob(jobId)
  if (!job) return new NextResponse('Job not found', { status: 404 })
  if (job.status !== 'complete' || !job.result) return new NextResponse('Job not ready', { status: 409 })

  return new NextResponse(job.result, {
    status: 200,
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${job.downloadName}"`,
    },
  })
}
