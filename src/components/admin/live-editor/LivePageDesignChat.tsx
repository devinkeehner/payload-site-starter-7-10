'use client'

import { useEffect, useRef } from 'react'
import { ArrowUp, Check, Paperclip, Square, X } from 'lucide-react'
import { MAX_CHAT_MESSAGE } from '@/lib/live-editor/designChatProtocol'
import { designChatFileAccept } from './designChatAttachments'
import type { usePageDesignChat } from './usePageDesignChat'
import styles from './live-editor-chat.module.css'

export function LivePageDesignChat({ chat }: { chat: ReturnType<typeof usePageDesignChat> }) {
  const picker = useRef<HTMLInputElement>(null)
  const transcript = useRef<HTMLDivElement>(null)
  const working = Boolean(chat.activity)
  useEffect(() => {
    const element = transcript.current
    if (element) element.scrollTop = element.scrollHeight
  }, [chat.messages, chat.reply, chat.activity, chat.edits])

  return <section className={styles.panel} aria-label="Design chat">
    <header className={styles.header}>
      <h2>Design a section</h2>
      <button type="button" onClick={chat.clear} disabled={!chat.available || !chat.messages.length}>New chat</button>
    </header>
    <div className={styles.transcript} ref={transcript} aria-label="Conversation">
      {!chat.messages.length && !chat.loading && !chat.error && <p className={styles.intro}>Describe a section, ask for an edit, or attach a reference. Changes appear on the draft canvas.</p>}
      {chat.messages.map(message => <article key={message.id} data-role={message.role}>
        <strong>{message.role === 'user' ? 'You' : 'Design assistant'}</strong>
        {message.content && <p>{message.content}</p>}
        {message.attachments?.length ? <small>{[...new Set(message.attachments.map(file => file.name))].join(' · ')}</small> : null}
      </article>)}
      {chat.reply && <article data-role="assistant"><strong>Design assistant</strong><p>{chat.reply}</p></article>}
      {chat.edits.length > 0 && <ol className={styles.edits} aria-label="Draft changes" aria-live="polite">
        {chat.edits.map((edit, index) => <li key={index}><Check size={14} aria-hidden="true" />{edit}</li>)}
      </ol>}
      {chat.loading && <p className={styles.activity} role="status">Loading conversation…</p>}
      {chat.busyElsewhere && <p className={styles.activity} role="status">This conversation is waiting for another turn to finish…</p>}
      {chat.activity && <p className={styles.activity} role="status">{chat.activity}…</p>}
      {chat.error && <p className={styles.error} role="alert">{chat.error}{!chat.available && !chat.loading && !working && !chat.busyElsewhere &&
        <> <button type="button" onClick={chat.retry}>Reload conversation</button></>}</p>}
    </div>
    <form className={styles.composer} onSubmit={event => { event.preventDefault(); void chat.send() }}
      onDragOver={event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault() }}
      onDrop={event => { if (event.dataTransfer.files.length) { event.preventDefault(); chat.addFiles(Array.from(event.dataTransfer.files)) } }}>
      {chat.files.length > 0 && <ul className={styles.files} aria-label="Attachments">
        {chat.files.map(item => <li key={item.id}>
          <span title={item.file.name}>{item.file.name}</span>
          <button type="button" aria-label={`Remove ${item.file.name}`} onClick={() => chat.removeFile(item.id)} disabled={working}><X size={14} /></button>
          {item.uploaded ? <small>Added to the site library</small> : item.kind === 'video' ? <small>Will be added to the site library</small> : item.kind !== 'text' &&
            <label><input type="checkbox" checked={item.useInDraft} disabled={working}
              onChange={event => chat.useInDraft(item.id, event.target.checked)} /> Add to site media library</label>}
        </li>)}
      </ul>}
      <textarea rows={3} maxLength={MAX_CHAT_MESSAGE} aria-label="Message the design assistant"
        placeholder="Describe a section or an edit…" value={chat.draft} onChange={event => chat.setDraft(event.target.value)}
        onPaste={event => {
          const images = Array.from(event.clipboardData.files).filter(file => file.type.startsWith('image/'))
          if (images.length) { event.preventDefault(); chat.addFiles(images) }
        }}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault(); void chat.send()
          }
        }} />
      <div className={styles.actions}>
        <input type="file" ref={picker} hidden multiple accept={designChatFileAccept} onChange={event => {
          chat.addFiles(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ''
        }} />
        <button type="button" disabled={working} onClick={() => picker.current?.click()} aria-label="Attach files" title="Attach files"><Paperclip size={17} /></button>
        {working ? <button type="button" onClick={chat.stop} aria-label="Stop response" title="Stop response"><Square size={15} /></button>
          : <button type="submit" className={styles.send} aria-label="Send message" title="Send message"
            disabled={!chat.available || (!chat.draft.trim() && !chat.files.length)}><ArrowUp size={17} /></button>}
      </div>
      <small className={styles.notice}>Relevant draft content, canvas images, and references go to OpenAI when you chat.</small>
    </form>
  </section>
}
