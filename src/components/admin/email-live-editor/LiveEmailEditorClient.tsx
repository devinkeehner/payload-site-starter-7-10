'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PuckBlockSchema } from '@/lib/puck/types'
import type { PageDocument } from '@/lib/live-editor/document'

const Editor = dynamic(() => import('../live-editor/LiveEmailEditor').then(module => module.LiveEmailEditor), { ssr: false })
type EmailDraft = PageDocument & { id: string | number; title?: string; updatedAt: string; status?: string; tenantId?: string | null }
type EditorPayload = { email: EmailDraft; schemas: PuckBlockSchema[] }
async function readResponse(response: Response): Promise<EditorPayload> {
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || 'Unable to load this email draft.')
  return body as EditorPayload
}
export function LiveEmailEditorClient({ emailId }: { emailId: string }) {
  const [loaded, setLoaded] = useState<EditorPayload | null>(null)
  const [error, setError] = useState('')
  const revision = useRef('')
  const saving = useRef(false)
  const generation = useRef(0)
  const apiURL = `/api/live-editor/emails/${encodeURIComponent(emailId)}`
  useEffect(() => {
    const controller = new AbortController()
    generation.current++
    void fetch(apiURL, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
      .then(readResponse).then(payload => {
        if (controller.signal.aborted) return
        revision.current = payload.email.updatedAt
        setLoaded(payload)
      }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Unable to load the draft.') })
    return () => { generation.current++; controller.abort() }
  }, [apiURL])
  const save = useCallback(async (email: PageDocument) => {
    if (saving.current) throw new Error('A draft save is already in progress.')
    saving.current = true
    const started = generation.current
    const isCurrent = () => started === generation.current
    try {
      const payload = await readResponse(await fetch(apiURL, { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: Object.fromEntries(['layout', 'title', 'subject', 'preheader', 'replyTo'].filter(key => Object.hasOwn(email, key)).map(key => [key, email[key]])), expectedUpdatedAt: revision.current }) }))
      if (isCurrent()) revision.current = payload.email.updatedAt
    } finally { if (isCurrent()) saving.current = false }
  }, [apiURL, emailId])
  const campaignURL = `/admin/collections/emails/${encodeURIComponent(emailId)}/campaign`
  if (error) return <main className="live-editor-message" role="alert"><h1>Live Editor</h1><p>{error}</p><a href={campaignURL}>Back to campaign</a></main>
  if (!loaded) return <main className="live-editor-message" role="status">Loading Live Editor…</main>
  if (['scheduled', 'queued', 'sending', 'sent'].includes(loaded.email.status || '')) return <main className="live-editor-message"><h1>This campaign is locked</h1><p>Cancel its schedule or duplicate the campaign before editing its content.</p><a href={campaignURL}>Back to campaign</a></main>
  return <Editor key={emailId} initialPage={loaded.email} schemas={loaded.schemas} onSave={save}
    emailId={emailId} tenantId={loaded.email.tenantId || undefined}
    previewURL={`/live-editor/emails/${encodeURIComponent(emailId)}/preview`}
    backToPayloadURL={`/admin/collections/emails/${encodeURIComponent(emailId)}`} audienceURL={`/admin/collections/emails/${encodeURIComponent(emailId)}/audience`} />
}
