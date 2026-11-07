import configPromise from '@payload-config'
import { createPayloadRequest } from 'payload'
import { getEditorOptions } from '@/lib/live-editor/emailService'
import { editorFailure } from '@/lib/live-editor/emailHttp'
export const runtime = 'nodejs'
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const req = await createPayloadRequest({ config: configPromise, request, canSetHeaders: false })
    return Response.json(await getEditorOptions(req, (await params).id, new URL(request.url)), { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return editorFailure(error) }
}
