import { NativeDraftError } from './emailDraft'
import { LiveEditorAccessError } from './emailAccess'
const headers = { 'Cache-Control': 'private, no-store' }
export function editorFailure(error: unknown, fallback = 'Unable to access this email draft.') {
  const status = error instanceof NativeDraftError || error instanceof LiveEditorAccessError ? error.status :
    error && typeof error === 'object' && 'status' in error && typeof error.status === 'number' && error.status >= 400 && error.status < 500 ? error.status : 500
  return Response.json({ error: status < 500 && error instanceof Error ? error.message : fallback }, { status, headers })
}
