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
  quality?: {
    label: string
    links: Array<{ href: string; label: string; reason?: string; remoteStatus?: number; status: 'invalid' | 'merge' | 'ok' | 'warning' }>
    score: number
    warnings: string[]
  }
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

type Report = {
  counts: Record<string, number>
  previousCampaigns?: Array<{ id: string; recipientCount: number; sentAt?: string; title?: string }>
  rates?: Record<string, number>
  recipientCount: number
  reconciliation?: {
    terminalRecipients: number
    unaccountedRecipients: number
  }
  topLinks: Array<{ count: number; url: string }>
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
  const [report, setReport] = useState<Report | null>(null)
  const [status, setStatus] = useState<'creatingPost' | 'error' | 'idle' | 'loading' | 'sending' | 'sendingTest' | 'sent'>('loading')
  const [message, setMessage] = useState<string | null>(null)
  const editURL = useMemo(() => formatAdminURL({ adminRoute, path: `/collections/emails/${emailId}` }), [adminRoute, emailId])
  const builderURL = `${editURL}/visual`
  const audienceURL = `${editURL}/audience`
  const blockingLinks = useMemo(
    () => (readiness?.quality?.links || []).filter((link) => {
      if (link.status === 'invalid') return true
      if (typeof link.remoteStatus === 'number' && (link.remoteStatus < 200 || link.remoteStatus >= 400)) return true
      return false
    }),
    [readiness],
  )
  const sendChecklistItems = useMemo(() => {
    const priority = { fail: 0, warn: 1, pass: 2 } as const
    return [...(readiness?.items || [])].sort((a, b) => priority[a.status] - priority[b.status])
  }, [readiness])

  const loadWorkflow = useCallback(async () => {
    setStatus('loading')
    setMessage(null)
    try {
      const [readinessRes, previewRes, postRes, reportRes] = await Promise.all([
        fetch(`/api/emails/${emailId}/readiness`, { cache: 'no-store' }),
        fetch(`/api/emails/${emailId}/preview`, { cache: 'no-store' }),
        fetch(`/api/emails/${emailId}/post-preview`, { cache: 'no-store' }),
        fetch(`/api/emails/${emailId}/report`, { cache: 'no-store' }),
      ])
      if (!readinessRes.ok) throw new Error(await readinessRes.text())
      if (!previewRes.ok) throw new Error(await previewRes.text())
      if (!postRes.ok) throw new Error(await postRes.text())

      setReadiness((await readinessRes.json()) as Readiness)
      setEmailPreview((await previewRes.json()) as EmailPreview)
      setPostPreview((await postRes.json()) as PostPreview)
      setReport(reportRes.ok ? ((await reportRes.json()) as Report) : null)
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

  async function sendTestEmail() {
    setStatus('sendingTest')
    setMessage(null)
    try {
      const res = await fetch(`/api/emails/${emailId}/send-test`, { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      const payload = (await res.json()) as { message?: string }
      setStatus('sent')
      setMessage(payload.message || 'Test email sent.')
      void loadWorkflow()
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Unable to send test email')
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
      const payload = (await res.json()) as { message?: string; jobId?: string | null; status?: string }
      setStatus('sent')
      setMessage(payload.message || 'Campaign queued for sending.')
      void loadWorkflow()
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Unable to send campaign')
    }
  }

  return (
    <Gutter className="email-flow">
      <div className="email-flow__header">
        <p className="email-flow__eyebrow">Final Check</p>
        <h1>{title}</h1>
        <p>Resolve blocking issues, send a test email, preview the final email, then send the campaign when approved.</p>
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
          <h2>Send Checklist</h2>
          {readiness ? (
            <>
              <div className="email-flow__meta">
                <span>{readiness.failures} blocking issues</span>
                <span>{readiness.warnings} warnings</span>
                <span>{readiness.audience?.active || 0} recipients</span>
              </div>
              <div className="email-flow__checklist">
                {sendChecklistItems.map((item) => (
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
          {readiness?.quality ? (
            <div className={`email-flow__link-gate${blockingLinks.length ? ' email-flow__link-gate--error' : ''}`}>
              <div>
                <strong>Link Check</strong>
                <span>
                  {blockingLinks.length
                    ? `${blockingLinks.length} broken or malformed link${blockingLinks.length === 1 ? '' : 's'}`
                    : `${readiness.quality.links.length} link${readiness.quality.links.length === 1 ? '' : 's'} checked`}
                </span>
              </div>
              {blockingLinks.length ? (
                <ul>
                  {blockingLinks.slice(0, 4).map((link, index) => (
                    <li key={`${link.href}-${index}`}>
                      <strong>{link.label || 'Link'}:</strong> {link.href || 'Missing URL'}
                      {link.remoteStatus ? ` (HTTP ${link.remoteStatus})` : link.reason ? ` (${link.reason})` : ''}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          <p className="email-flow__muted">
            Test sends only go to the test recipient. Campaign sends go to the selected audience list.
          </p>
          <div className="email-flow__actions">
            <Button buttonStyle="primary" disabled={blockingLinks.length > 0 || status === 'sendingTest'} onClick={() => void sendTestEmail()} type="button">
              {status === 'sendingTest' ? 'Sending Test Email...' : 'Send Test Email'}
            </Button>
            <Button buttonStyle="secondary" disabled={status === 'creatingPost'} onClick={() => void createPostDraft()} type="button">
              {status === 'creatingPost' ? 'Creating...' : 'Create Post Draft'}
            </Button>
            <Button buttonStyle="primary" disabled={!readiness?.canSend || status === 'sending'} onClick={() => void sendCampaign()} type="button">
              {status === 'sending' ? 'Sending Campaign...' : 'Send Campaign'}
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
        <h2>Quality Check</h2>
        {readiness?.quality ? (
          <>
            <div className="email-flow__meta">
              <span>Spam risk: {readiness.quality.label}</span>
              <span>Score: {readiness.quality.score}/100</span>
              <span>{readiness.quality.links.length} links</span>
            </div>
            {readiness.quality.warnings.length ? (
              <ul className="email-flow__bullets">
                {readiness.quality.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            ) : <p className="email-flow__muted">No major quality warnings found.</p>}
            <h3>Link Checker</h3>
            <div className="email-flow__table">
              {readiness.quality.links.map((link, index) => (
                <div className="email-flow__row" key={`${link.href}-${index}`}>
                  <Pill pillStyle={link.status === 'ok' || link.status === 'merge' ? 'success' : link.status === 'warning' ? 'warning' : 'error'} size="small">
                    {link.status}
                  </Pill>
                  <strong>{link.label || 'Link'}</strong>
                  {link.status === 'invalid' ? (
                    <span>{link.href}</span>
                  ) : (
                    <a href={link.href} rel="noreferrer" target="_blank">{link.href}</a>
                  )}
                  <span>{link.remoteStatus ? `HTTP ${link.remoteStatus}` : link.reason || ''}</span>
                </div>
              ))}
            </div>
          </>
        ) : <p className="email-flow__muted">Quality check will run after the email can render.</p>}
      </section>

      {report ? (
        <section className="email-flow__panel">
          <div className="email-flow__section-header">
            <h2>Campaign Report</h2>
            <a className="email-flow__link-button" href={`/api/emails/${emailId}/report?format=csv`}>Export events CSV</a>
          </div>
          <div className="email-flow__stats">
            <div><strong>{report.recipientCount}</strong><span>Recipients</span></div>
            <div><strong>{report.counts.delivered || 0}</strong><span>Delivered</span></div>
            <div><strong>{report.counts.opened || 0}</strong><span>Opened</span></div>
            <div><strong>{report.counts.clicked || 0}</strong><span>Clicked</span></div>
            <div><strong>{report.counts.bounced || 0}</strong><span>Bounced</span></div>
            <div><strong>{report.counts.unsubscribed || 0}</strong><span>Unsubscribed</span></div>
          </div>
          <div className="email-flow__report-grid">
            <div>
              <h3>Rates</h3>
              <div className="email-flow__bars">
                {Object.entries(report.rates || {}).map(([label, value]) => (
                  <div className="email-flow__bar" key={label}>
                    <span>{label}</span>
                    <div><i style={{ width: `${Math.min(100, value)}%` }} /></div>
                    <strong>{value}%</strong>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3>Delivery Reconciliation</h3>
              <p className="email-flow__muted">
                {report.reconciliation?.terminalRecipients || 0} recipients have a terminal Elastic event. {report.reconciliation?.unaccountedRecipients || 0} are still unaccounted for.
              </p>
            </div>
          </div>
          {report.topLinks.length ? (
            <div>
              <h3>Top Clicked Links</h3>
              <div className="email-flow__table">
                {report.topLinks.map((link) => (
                  <div className="email-flow__row" key={link.url}>
                    <strong>{link.count} clicks</strong>
                    <a href={link.url} rel="noreferrer" target="_blank">{link.url}</a>
                    <span />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {report.previousCampaigns?.length ? (
            <div>
              <h3>Recent Sent Campaigns</h3>
              <div className="email-flow__table">
                {report.previousCampaigns.map((campaign) => (
                  <div className="email-flow__row" key={campaign.id}>
                    <strong>{campaign.title}</strong>
                    <span>{campaign.recipientCount} recipients</span>
                    <span>{campaign.sentAt ? new Date(campaign.sentAt).toLocaleString() : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

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
