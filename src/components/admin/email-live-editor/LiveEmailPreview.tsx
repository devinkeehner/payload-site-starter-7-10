'use client'
import { useEffect, useState } from 'react'
export function LiveEmailPreview({ emailId }: { emailId: string }) {
  const [content, setContent] = useState<{ html: string; text: string } | null>(null)
  const [error, setError] = useState('')
  const [text, setText] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    void fetch(`/api/emails/${encodeURIComponent(emailId)}/preview`, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(await response.text()); return response.json() })
      .then(value => { if (!controller.signal.aborted) setContent(value) })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Preview failed.') })
    return () => controller.abort()
  }, [emailId])
  function downloadHTML() {
    if (!content) return
    const url = URL.createObjectURL(new Blob([content.html], { type: 'text/html' }))
    const link = document.createElement('a'); link.href = url; link.download = `email-${emailId}.html`; link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <main className="live-editor-preview"><header><a href={`/live-editor/emails/${encodeURIComponent(emailId)}`}>Back to Live Editor</a><h1>Email preview</h1><button disabled={!content} onClick={() => setText(value => !value)}>{text ? 'Show HTML preview' : 'Show plain text'}</button><button disabled={!content} onClick={downloadHTML}>Download HTML</button></header>
    {error ? <p role="alert">{error}</p> : !content ? <p role="status">Rendering saved email…</p> : text ? <pre>{content.text}</pre> : <iframe title="Rendered email HTML" sandbox="" srcDoc={content.html} />}</main>
}
