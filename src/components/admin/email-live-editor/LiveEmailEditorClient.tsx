'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PuckBlockSchema } from '@/lib/puck/types'
import type { PageDocument } from '@/lib/live-editor/document'

const Editor = dynamic(() => import('../live-editor/LiveEmailEditor').then(module => module.LiveEmailEditor), { ssr: false })
type EditorDraft = PageDocument & { id: string | number; title?: string; updatedAt: string; status?: string; tenantId?: string | null; tenantName?: string }
type EditorPayload = { email?: EditorDraft; post?: EditorDraft; schemas: PuckBlockSchema[] }
async function readResponse(response: Response): Promise<EditorPayload> {
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || 'Unable to load this draft.')
  return body as EditorPayload
}
export function LiveEmailEditorClient({ emailId, ...props }: {
  emailId: string
  focusBlock?: string
  focusField?: string
  returnToReview?: boolean
}) {
  return <LiveEditorDocumentClient id={emailId} kind="email" {...props} />
}

export function LiveEditorDocumentClient({ id, kind, focusBlock, focusField, returnToReview }: {
  id: string
  kind: 'email' | 'post'
  focusBlock?: string
  focusField?: string
  returnToReview?: boolean
}) {
  const [loaded, setLoaded] = useState<{ draft: EditorDraft; schemas: PuckBlockSchema[] } | null>(null)
  const [error, setError] = useState('')
  const revision = useRef('')
  const saving = useRef(false)
  const generation = useRef(0)
  const adminURL = `/admin/collections/${kind}s/${encodeURIComponent(id)}`
  const apiURL = `/api/live-editor/${kind}s/${encodeURIComponent(id)}`
  useEffect(() => {
    const controller = new AbortController()
    generation.current++
    void fetch(apiURL, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
      .then(readResponse).then(payload => {
        if (controller.signal.aborted) return
        const draft = payload[kind]
        if (!draft) throw new Error('The editor could not load this draft.')
        revision.current = draft.updatedAt
        setLoaded({ draft, schemas: payload.schemas })
      }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Unable to load the draft.') })
    return () => { generation.current++; controller.abort() }
  }, [apiURL, kind])
  const save = useCallback(async (email: PageDocument) => {
    if (saving.current) throw new Error('A draft save is already in progress.')
    saving.current = true
    const started = generation.current
    const isCurrent = () => started === generation.current
    try {
      const keys = kind === 'post' ? ['layout', 'title'] : ['layout', 'title', 'subject', 'preheader', 'replyTo']
      const payload = await readResponse(await fetch(apiURL, { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [kind]: Object.fromEntries(keys.filter(key => Object.hasOwn(email, key)).map(key => [key, email[key]])), expectedUpdatedAt: revision.current }) }))
      const draft = payload[kind]
      if (!draft) throw new Error('The editor could not confirm this save.')
      if (isCurrent()) revision.current = draft.updatedAt
    } finally { if (isCurrent()) saving.current = false }
  }, [apiURL, kind])
  const homeURL = kind === 'post' ? adminURL : `${adminURL}/campaign`
  const createPost = async () => {
    const response = await fetch(`/api/emails/${encodeURIComponent(id)}/create-post`, { method: 'POST' })
    const body = await response.json().catch(() => null)
    if (!response.ok || typeof body?.adminUrl !== 'string') throw new Error(body?.error || 'Unable to create a post draft.')
    return body.adminUrl as string
  }
  if (error) return <main className="live-editor-message" role="alert"><h1>Live Editor</h1><p>{error}</p><a href={homeURL}>Back to {kind === 'post' ? 'post' : 'campaign'}</a></main>
  if (!loaded) return <main className="live-editor-message" role="status">Loading Live Editor…</main>
  if (loaded.draft.status === 'delivery_unknown') return <main className="live-editor-message"><h1>Delivery outcome unknown</h1><p>Investigate the existing iContact send before editing this campaign.</p><a href={homeURL}>View campaign</a></main>
  if (['scheduled', 'queued', 'sending', 'sent'].includes(loaded.draft.status || '')) return <main className="live-editor-message"><h1>This campaign is locked</h1><p>Cancel its schedule or duplicate the campaign before editing its content.</p><a href={homeURL}>Back to campaign</a></main>
  return <Editor key={id} initialPage={loaded.draft} schemas={loaded.schemas} onSave={save}
    focusBlock={focusBlock} focusField={focusField}
    tenantName={loaded.draft.tenantName}
    apiURL={apiURL} kind={kind}
    storageLabel={kind === 'post' ? 'Layout' : 'Compose'}
    onCreatePost={kind === 'email' ? createPost : undefined}
    previewURL={kind === 'post' ? `${apiURL}/preview` : `/live-editor/emails/${encodeURIComponent(id)}/preview`}
    backToPayloadURL={adminURL}
    nextStage={kind === 'email' ? {
      label: returnToReview ? 'Return to Review & Test' : 'Continue to Audience',
      url: `${adminURL}/${returnToReview ? 'review' : 'audience'}`,
    } : undefined} />
}
