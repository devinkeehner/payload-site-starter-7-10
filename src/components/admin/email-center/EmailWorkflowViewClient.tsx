'use client'

import { Link, useConfig } from '@payloadcms/ui'
import { formatAdminURL } from 'payload/shared'
import React, { useEffect, useMemo, useState } from 'react'

import './email-center.scss'

type ReadinessItem = {
  key: string
  label: string
  message: string
  status: 'fail' | 'pass' | 'warn'
}

type Readiness = {
  audience?: {
    active: number
    bounced: number
    doNotContact: number
    inactive: number
    listName: string
    total: number
    unsubscribed: number
  }
  canSend: boolean
  failures: number
  items: ReadinessItem[]
  warnings: number
}

type EmailPreview = {
  html: string
  text: string
}

type PostPreview = {
  layout: unknown[]
  title: string
}

export function EmailWorkflowViewClient({
  emailId,
  title,
}: {
  emailId: string
  title: string
}) {
  const {
    config: {
      routes: { admin: adminRoute },
    },
  } = useConfig()
  const [readiness, setReadiness] = useState<Readiness | null>(null)
  const [emailPreview, setEmailPreview] = useState<EmailPreview | null>(null)
  const [postPreview, setPostPreview] = useState<PostPreview | null>(null)
  const [status, setStatus] = useState<'creatingPost' | 'error' | 'idle' | 'loading' | 'sending' | 'sent'>('loading')
  const [message, setMessage] = useState<string | null>(null)
  const editURL = useMemo(() => formatAdminURL({ adminRoute, path: `/collections/emails/${emailId}` }), [adminRoute, emailId])
  const builderURL = `${editURL}/visual`

  async function loadWorkflow() {
    setStatus('loading')
    setMessage(null)
    try {
      const [readinessRes, previewRes, postRes] = await Promise.all([
        fetch(`/api/emails/${emailId}/readiness`, { cache: 'no-store' }),
        fetch(`/api/emails/${emailId}/preview`, { cache: 'no-store' }),
        fetch(`/api/emails/${emailId}/post-preview`, { cache: 'no-store' }),
      ])
      if (!readinessRes.ok) throw new Error(await readinessRes.text())
      if (!previewRes.ok) throw new Error(await previewRes.text())
      if (!postRes.ok) throw new Error(await postRes.text())

      setReadiness((await readinessRes.json()) as Readiness)
      setEmailPreview((await previewRes.json()) as EmailPreview)
      setPostPreview((await postRes.json()) as PostPreview)
      setStatus('idle')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Unable to load workflow')
    }
  }

  useEffect(() => {
    void loadWorkflow()
  }, [emailId])

  async function createPostDraft() {
    setStatus('creatingPost')
    setMessage(null)
    try {
      const res = await fetch(`/api/emails/${emailId}/create-post`, { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      const payload = (await res.json()) as { adminUrl?: string }
      if (payload.adminUrl) {
        window.location.href = payload.adminUrl
        return
      }
      setStatus('idle')
      setMessage('Post draft created.')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Unable to create post draft')
    }
  }

  async function sendCampaign() {
    if (!readiness?.canSend) {
      setMessage('Resolve readiness failures before sending.')
      return
    }
    if (!window.confirm(`Send "${title}" to ${readiness.audience?.active || 0} subscribed recipients?`)) return

    setStatus('sending')
    setMessage(null)
    try {
      const res = await fetch(`/api/emails/${emailId}/send`, { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      const payload = (await res.json()) as { message?: string }
      setStatus('sent')
      setMessage(payload.message || 'Campaign sent.')
      void loadWorkflow()
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Unable to send campaign')
    }
  }

  return (
    <main className="email-workflow">
      <section className="email-workflow__hero">
        <div>
          <h2>{title}</h2>
          <p>Move this campaign through setup, builder, preview, post conversion, and final send from one place.</p>
        </div>
        <div className="email-workflow__actions">
          <Link className="email-workflow__button" href={builderURL}>Open Builder</Link>
          <Link className="email-workflow__button" href={editURL}>Advanced Fields</Link>
          <button className="email-workflow__button" type="button" onClick={() => void loadWorkflow()}>Refresh</button>
        </div>
      </section>

      <section className="email-workflow__layout">
        <aside className="email-workflow__panel">
          <h3>Readiness</h3>
          {readiness ? (
            <>
              <div className="email-workflow__meta">
                <span>{readiness.failures} failures</span>
                <span>{readiness.warnings} warnings</span>
                <span>{readiness.audience?.active || 0} recipients</span>
              </div>
              <div className="email-workflow__checklist">
                {readiness.items.map((item) => (
                  <div className="email-workflow__check" key={item.key}>
                    <span className="email-workflow__pill" data-status={item.status}>{item.status}</span>
                    <strong>{item.label}</strong>
                    <span>{item.message}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p>{status === 'loading' ? 'Loading readiness...' : 'No readiness data.'}</p>
          )}
          <div className="email-workflow__panel-actions">
            <button className="email-workflow__button" type="button" onClick={() => void createPostDraft()}>
              {status === 'creatingPost' ? 'Creating...' : 'Create Post Draft'}
            </button>
            <button className="email-workflow__button email-workflow__button--dark" disabled={!readiness?.canSend || status === 'sending'} type="button" onClick={() => void sendCampaign()}>
              {status === 'sending' ? 'Sending...' : 'Send Campaign'}
            </button>
          </div>
          {message ? <p className="email-workflow__meta">{message}</p> : null}
        </aside>

        <section className="email-workflow__panel">
          <h3>Email Preview</h3>
          <div className="email-workflow__preview">
            {emailPreview?.html ? <iframe title="Email preview" srcDoc={emailPreview.html} /> : null}
          </div>
        </section>
      </section>

      <section className="email-workflow__panel">
        <h3>Post Conversion Preview</h3>
        <div className="email-workflow__meta">
          <span>Title: {postPreview?.title || title}</span>
          <span>Blocks: {postPreview?.layout?.length ?? 0}</span>
        </div>
        <p className="email-workflow__meta">
          This preview checks conversion structure before creating the draft. The post editor remains the final visual review surface.
        </p>
      </section>
    </main>
  )
}
