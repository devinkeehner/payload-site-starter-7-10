'use client'

import { ArrowUp, ImagePlus, MessageSquarePlus, Paperclip, Square, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useConfig } from '@payloadcms/ui'
import { useTenantSelection } from '@payloadcms/plugin-multi-tenant/client'
import { assistantEndpoint, assistantSiteHeader, MAX_ASSISTANT_MESSAGE, type DashboardChatEvent } from '@/lib/dashboard-assistant/protocol'
import type { DesignChatThread } from '@/lib/live-editor/designChatProtocol'
import { ChatMessageContent } from '../ChatMessageContent'
import styles from './dashboard-assistant.module.css'

const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
const examples = [
  'Review the links in my site’s navigation.',
  'Help me change the homepage banner.',
  'Draft a press release for my assigned representatives.',
]

async function request(url: string, signal: AbortSignal, init?: RequestInit) {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', signal, ...init })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || 'The dashboard assistant is unavailable.')
  }
  return response
}

async function readReply(response: Response, onEvent: (event: DashboardChatEvent) => void) {
  if (!response.body) throw new Error('The connection closed before the reply arrived.')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) throw new Error('The connection closed before the reply finished.')
      buffer += decoder.decode(value, { stream: true })
      let split: number
      while ((split = buffer.indexOf('\n')) >= 0) {
        const event: DashboardChatEvent = JSON.parse(buffer.slice(0, split))
        buffer = buffer.slice(split + 1)
        if (event.type === 'error') throw new Error(event.message)
        onEvent(event)
        if (event.type === 'done') return
      }
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}

export function DashboardAssistant({ openedPostId, publicSiteBase }: { openedPostId?: string; publicSiteBase?: string } = {}) {
  const { selectedTenantID } = useTenantSelection()
  const siteId = selectedTenantID == null ? '' : String(selectedTenantID)
  return <Conversation key={siteId} siteId={siteId} openedPostId={openedPostId} publicSiteBase={publicSiteBase} />
}

function Conversation({ siteId, openedPostId, publicSiteBase }: { siteId: string; openedPostId?: string; publicSiteBase?: string }) {
  const { config } = useConfig()
  const [siteLabel, setSiteLabel] = useState('')
  const [thread, setThread] = useState<DesignChatThread | null>(null)
  const [draft, setDraft] = useState('')
  const [image, setImage] = useState<{ file: File; mediaId?: string } | null>(null)
  const [reply, setReply] = useState('')
  const [activity, setActivity] = useState('')
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const active = useRef<AbortController | null>(null)
  const turnId = useRef<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const composer = useRef<HTMLTextAreaElement>(null)
  const transcript = useRef<HTMLDivElement>(null)
  const busy = Boolean(activity || thread?.busy)
  const load = useCallback(() => setReload(version => version + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const sync = async () => {
      try {
        const response = await request(assistantEndpoint, controller.signal, { headers: { [assistantSiteHeader]: siteId } })
        const current = await response.json() as DesignChatThread & { site: { id: string; name: string } | null }
        if (controller.signal.aborted || active.current) return
        setSiteLabel(current.site?.name || 'My assigned sites')
        setThread(current)
        if (current.busy) timer = setTimeout(sync, 1_500)
      } catch (cause) {
        if (!controller.signal.aborted) setError((cause as Error).message)
      }
    }
    void sync()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [reload, siteId])
  useEffect(() => () => active.current?.abort(), [])
  useEffect(() => {
    const pane = transcript.current
    if (pane) pane.scrollTop = pane.scrollHeight
  }, [reply, thread, activity])

  const changeDraft = (value: string) => { turnId.current = null; setDraft(value) }
  const attach = async (file?: File) => {
    if (!file || busy || active.current) return
    setError('')
    turnId.current = null
    if (imageTypes.includes(file.type) && file.size > 0 && file.size <= 10 * 1024 * 1024) {
      setImage({ file })
    } else if (/\.(txt|md)$/i.test(file.name) && file.size > 0 && file.size <= MAX_ASSISTANT_MESSAGE * 4) {
      const source = await file.text()
      if ([draft, source].join('\n\n').length > MAX_ASSISTANT_MESSAGE) setError('The release is too long for one message.')
      else setDraft(value => [value, source].filter(Boolean).join('\n\n'))
    } else setError('Attach a text release or a JPEG, PNG, WebP, GIF, or AVIF image up to 10 MB.')
  }

  const send = async () => {
    if (!thread || busy || active.current || (!draft.trim() && !image)) return
    const controller = new AbortController()
    active.current = controller
    const { signal } = controller
    const content = draft.trim()
    const submittedTurn = turnId.current ?? crypto.randomUUID()
    turnId.current = submittedTurn
    setError(''); setReply(''); setActivity('Reading your request…')
    try {
      let imageId = image?.mediaId ?? null
      if (image && !imageId) {
        setActivity('Adding your image to the site gallery…')
        const data = new FormData()
        data.set('file', image.file)
        data.set('alt', image.file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '))
        const response = await request(`${assistantEndpoint}/media`, signal, {
          method: 'POST', headers: { 'X-Assistant-Chat': thread.id, [assistantSiteHeader]: siteId }, body: data,
        })
        const media = await response.json() as { id: string }
        imageId = media.id
        setImage({ ...image, mediaId: media.id })
      }
      const response = await request(assistantEndpoint, signal, { method: 'POST', headers: { 'Content-Type': 'application/json', [assistantSiteHeader]: siteId },
        body: JSON.stringify({ chatId: thread.id, turnId: submittedTurn, content, imageId, openedPostId }) })
      setThread({ ...thread, messages: [...thread.messages, { id: submittedTurn, role: 'user', content,
        attachments: image && imageId ? [{ kind: 'media', mediaType: 'image', mediaId: imageId, name: image.file.name }] : [] }] })
      setDraft(''); setImage(null); turnId.current = null
      await readReply(response, event => {
        if (event.type === 'activity') setActivity(event.name.replace(/^dashboard_/, '').replaceAll('_', ' ') + '…')
        if (event.type === 'text') { setReply(current => current + event.delta); setActivity('Writing…') }
        if (event.type === 'done') setThread(event.thread)
      })
    } catch (cause) {
      if (!signal.aborted) setError((cause as Error).message)
    } finally {
      if (active.current === controller) {
        active.current = null
        setReply(''); setActivity(''); load()
      }
    }
  }

  const reset = async () => {
    if (!thread || active.current || busy || !window.confirm('Clear this conversation and start a new chat?')) return
    const controller = new AbortController()
    active.current = controller
    setError(''); setActivity('Starting a new chat…')
    try {
      const response = await request(`${assistantEndpoint}/reset`, controller.signal, { method: 'POST',
        headers: { 'Content-Type': 'application/json', [assistantSiteHeader]: siteId }, body: JSON.stringify({ chatId: thread.id }) })
      setThread(await response.json()); setReply(''); setImage(null); changeDraft('')
    } catch (cause) { if (!controller.signal.aborted) setError((cause as Error).message) }
    finally { active.current = null; setActivity(''); load() }
  }

  return <main className={styles.workspace}>
    <header className={styles.header}>
      <div><h1>Website assistant</h1>{siteLabel && <p>{siteLabel}</p>}</div>
      <button type="button" onClick={reset} disabled={!thread?.messages.length || busy}><MessageSquarePlus size={16} /> New chat</button>
    </header>
    <div className={styles.transcript} ref={transcript} aria-label="Conversation">
      {!thread && !error && <p role="status">Loading conversation…</p>}
      {thread && !thread.messages.length && <div className={styles.welcome}><h2>What would you like to change?</h2>
        <div>{examples.map(example => <button type="button" key={example} disabled={busy} onClick={() => {
          changeDraft(example); composer.current?.focus()
        }}>{example}</button>)}</div></div>}
      {thread?.messages.map(message => <article key={message.id} data-role={message.role}>
        <strong>{message.role === 'user' ? 'You' : 'Website assistant'}</strong>
        <ChatMessageContent content={message.content} plain={message.role === 'user'} adminRoute={config.routes.admin} publicSiteBase={publicSiteBase} />
        {message.attachments?.map((file, index) => <small key={index}><ImagePlus size={14} />{file.name}</small>)}
      </article>)}
      {reply && <article data-role="assistant"><strong>Website assistant</strong><ChatMessageContent content={reply} adminRoute={config.routes.admin} publicSiteBase={publicSiteBase} /></article>}
    </div>
    {(activity || thread?.busy) && <p className={styles.status} role="status">{activity || 'A response is in progress…'}</p>}
    {error && <p role="alert" className={styles.error}>{error} <button type="button" onClick={() => { setError(''); load() }}>Reload conversation</button></p>}
    <form className={styles.composer} onSubmit={event => { event.preventDefault(); void send() }}
      onDragOver={event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault() }}
      onDrop={event => { if (event.dataTransfer.files.length) { event.preventDefault(); void attach(event.dataTransfer.files[0]) } }}>
      {image && <div className={styles.attachment}><ImagePlus size={16} /><span>{image.file.name} · {image.mediaId ? 'Added to gallery' : 'Add to site gallery on send'}</span>
        <button type="button" disabled={busy} aria-label="Remove image" onClick={() => { setImage(null); turnId.current = null }}><X size={15} /></button></div>}
      <textarea ref={composer} aria-label="Message the website assistant" placeholder="Ask for a change or paste a press release…" rows={3}
        value={draft} maxLength={MAX_ASSISTANT_MESSAGE} disabled={busy} onChange={event => changeDraft(event.target.value)}
        onPaste={event => { const file = event.clipboardData.files[0]; if (file?.type.startsWith('image/')) { event.preventDefault(); void attach(file) } }}
        onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send() } }} />
      <div className={styles.actions}>
        <input ref={input} hidden type="file" accept={[...imageTypes, '.txt', '.md'].join(',')} onChange={event => { void attach(event.target.files?.[0]); event.target.value = '' }} />
        <button type="button" disabled={busy} onClick={() => input.current?.click()}><Paperclip size={16} /> Attach</button>
        {activity ? <button type="button" onClick={() => active.current?.abort()}><Square size={14} /> Stop</button>
          : <button type="submit" disabled={!thread || busy || (!draft.trim() && !image)}><ArrowUp size={16} /> Send</button>}
      </div>
    </form>
    <small className={styles.privacy}>Messages and requested site content are processed by OpenAI. Navbar and banner edits go live when saved. Post edits are saved as drafts.</small>
  </main>
}
