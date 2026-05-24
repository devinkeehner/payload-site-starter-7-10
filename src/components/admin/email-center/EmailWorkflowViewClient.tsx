'use client'

import { Banner, Button, Gutter, Pill, useConfig } from '@payloadcms/ui'
import { formatAdminURL } from 'payload/shared'
import React, { useCallback, useEffect, useMemo, useState } from 'react'

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
  const audienceURL = `${editURL}/audience`

  const loadWorkflow = useCallback(async () => {
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
      setMessage(error instanceof Error ? error.message : 'Unable to load review')
    }
  }, [emailId])

  useEffect(() => {
    void loadWorkflow()
  }, [loadWorkflow])

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
    <Gutter className="email-flow">
      <div className="email-flow__header">
        <p className="email-flow__eyebrow">Review & Send</p>
        <h1>{title}</h1>
        <p>Check readiness, preview the email, create the matching post draft, then send the campaign.</p>
      </div>

      {message ? <Banner type={status === 'error' ? 'error' : 'info'}>{message}</Banner> : null}

      <section className="email-flow__toolbar">
        <Button buttonStyle="secondary" el="link" to={builderURL} type="button">
          Builder
        </Button>
        <Button buttonStyle="secondary" el="link" to={audienceURL} type="button">
          Audience
        </Button>
        <Button buttonStyle="secondary" onClick={() => void loadWorkflow()} type="button">
          Refresh
        </Button>
      </section>

      <section className="email-flow__review-grid">
        <aside className="email-flow__panel">
          <h2>Readiness</h2>
          {readiness ? (
            <>
              <div className="email-flow__meta">
                <span>{readiness.failures} failures</span>
                <span>{readiness.warnings} warnings</span>
                <span>{readiness.audience?.active || 0} recipients</span>
              </div>
              <div className="email-flow__checklist">
                {readiness.items.map((item) => (
                  <div className="email-flow__check" key={item.key}>
                    <Pill pillStyle={item.status === 'pass' ? 'success' : item.status === 'warn' ? 'warning' : 'error'} size="small">
                      {item.status}
                    </Pill>
                    <strong>{item.label}</strong>
                    <span>{item.message}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p>{status === 'loading' ? 'Loading readiness...' : 'No readiness data.'}</p>
          )}
          <div className="email-flow__actions">
            <Button buttonStyle="secondary" disabled={status === 'creatingPost'} onClick={() => void createPostDraft()} type="button">
              {status === 'creatingPost' ? 'Creating...' : 'Create Post Draft'}
            </Button>
            <Button buttonStyle="primary" disabled={!readiness?.canSend || status === 'sending'} onClick={() => void sendCampaign()} type="button">
              {status === 'sending' ? 'Sending...' : 'Send Campaign'}
            </Button>
          </div>
        </aside>

        <section className="email-flow__panel">
          <h2>Email Preview</h2>
          <div className="email-flow__preview">
            {emailPreview?.html ? <iframe title="Email preview" srcDoc={emailPreview.html} /> : null}
          </div>
        </section>
      </section>

      <section className="email-flow__panel">
        <h2>Post Conversion</h2>
        <div className="email-flow__meta">
          <span>Title: {postPreview?.title || title}</span>
          <span>Blocks: {postPreview?.layout?.length ?? 0}</span>
        </div>
        <p className="email-flow__muted">
          This preview checks conversion structure before creating the draft. The post editor remains the final visual review surface.
        </p>
      </section>
    </Gutter>
  )
}
