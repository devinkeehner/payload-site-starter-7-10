'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PuckBlockSchema } from '@/lib/puck/types'
import type { PageDocument } from '@/lib/live-editor/document'
import { reconcileSavedFormNames } from '@/lib/live-editor/formFieldNames'
import { liveEditorVariants, type LiveEditorKind } from './editorVariants'

const Editor = dynamic(() => import('./LiveDocumentEditor').then(module => module.LiveDocumentEditor), { ssr: false })
type EditorDraft = PageDocument & { id: string | number; title?: string; updatedAt: string; status?: string; tenantId?: string | null; tenantName?: string }
type EditorPayload = { email?: EditorDraft; post?: EditorDraft; form?: EditorDraft; schemas: PuckBlockSchema[] }
async function readResponse(response: Response): Promise<EditorPayload> {
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || 'Unable to load this draft.')
  return body as EditorPayload
}
export function LiveEditorDocumentClient({ id, kind, focusBlock, focusField, returnToReview }: {
  id: string
  kind: LiveEditorKind
  focusBlock?: string
  focusField?: string
  returnToReview?: boolean
}) {
  const [loaded, setLoaded] = useState<{ draft: EditorDraft; schemas: PuckBlockSchema[] } | null>(null)
  const [error, setError] = useState('')
  const revision = useRef('')
  const saving = useRef(false)
  const generation = useRef(0)
  const variant = liveEditorVariants[kind]
  const collectionURL = `/admin/collections/${variant.collection}`
  const adminURL = `${collectionURL}/${encodeURIComponent(id)}`
  const apiURL = `/api/live-editor/${variant.collection}/${encodeURIComponent(id)}`
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
  const save = useCallback(async (document: PageDocument) => {
    if (saving.current) throw new Error('A draft save is already in progress.')
    saving.current = true
    const started = generation.current
    const isCurrent = () => started === generation.current
    try {
      const keys = liveEditorVariants[kind].saveKeys
      const payload = await readResponse(await fetch(apiURL, { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [kind]: Object.fromEntries(keys.filter(key => Object.hasOwn(document, key)).map(key => [key, document[key]])), expectedUpdatedAt: revision.current }) }))
      const draft = payload[kind]
      if (!draft) throw new Error('The editor could not confirm this save.')
      if (isCurrent()) {
        revision.current = draft.updatedAt
        if (kind === 'form') return reconcileSavedFormNames(document, draft)
      }
    } finally { if (isCurrent()) saving.current = false }
  }, [apiURL, kind])
  const homeURL = kind === 'email' ? `${adminURL}/campaign` : kind === 'form' ? collectionURL : adminURL
  const createPost = async () => {
    const response = await fetch(`/api/emails/${encodeURIComponent(id)}/create-post`, { method: 'POST' })
    const body = await response.json().catch(() => null)
    if (!response.ok || typeof body?.adminUrl !== 'string') throw new Error(body?.error || 'Unable to create a post draft.')
    return body.adminUrl as string
  }
  if (error) return <main className="live-editor-message" role="alert"><h1>Live Editor</h1><p>{error}</p><a href={homeURL}>Back to {kind === 'email' ? 'campaign' : kind === 'form' ? 'forms' : 'post'}</a></main>
  if (!loaded) return <main className="live-editor-message" role="status">Loading Live Editor…</main>
  if (kind === 'email' && loaded.draft.status === 'delivery_unknown') return <main className="live-editor-message"><h1>Delivery outcome unknown</h1><p>Investigate the existing iContact send before editing this campaign.</p><a href={homeURL}>View campaign</a></main>
  if (kind === 'email' && ['scheduled', 'queued', 'sending', 'sent'].includes(loaded.draft.status || '')) return <main className="live-editor-message"><h1>This campaign is locked</h1><p>Cancel its schedule or duplicate the campaign before editing its content.</p><a href={homeURL}>Back to campaign</a></main>
  return <Editor key={id} initialPage={loaded.draft} schemas={loaded.schemas} onSave={save}
    focusBlock={focusBlock} focusField={focusField}
    tenantName={loaded.draft.tenantName}
    apiURL={apiURL} kind={kind}
    onCreatePost={kind === 'email' ? createPost : undefined}
    previewURL={kind === 'post' ? `${apiURL}/preview` : kind === 'email' ? `/live-editor/emails/${encodeURIComponent(id)}/preview` : null}
    backToPayloadURL={kind === 'form' ? collectionURL : adminURL}
    advancedURL={kind === 'form' ? `${adminURL}/advanced` : undefined}
    nextStage={kind === 'email' ? {
      label: returnToReview ? 'Return to Review & Test' : 'Continue to Audience',
      url: `${adminURL}/${returnToReview ? 'review' : 'audience'}`,
    } : undefined} />
}
