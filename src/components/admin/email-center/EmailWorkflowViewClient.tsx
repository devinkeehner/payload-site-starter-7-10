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
    links: Array<{ confirmed?: boolean; confirmedAt?: string; href: string; label: string; reason?: string; remoteStatus?: number; status: 'invalid' | 'merge' | 'ok' | 'warning' }>
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
  const [status, setStatus] = useState<'creatingPost' | 'error' | 'idle' | 'loading' | 'processingQueue' | 'sending' | 'sendingTest' | 'sent'>('loading')
  const [message, setMessage] = useState<string | null>(null)
  const [testRecipient, setTestRecipient] = useState('')
  const editURL = useMemo(() => formatAdminURL({ adminRoute, path: `/collections/emails/${emailId}` }), [adminRoute, emailId])
  const builderURL = `${editURL}/visual`
  const audienceURL = `${editURL}/audience`
  const blockingLinks = useMemo(
    () => (readiness?.quality?.links || []).filter((link) => link.status === 'invalid'),
    [readiness],
  )
  const warningLinks = useMemo(
    () => (readiness?.quality?.links || []).filter((link) => link.status === 'warning'),
    [readiness],
  )
  const sendChecklistItems = useMemo(() => {
    const priority = { fail: 0, warn: 1, pass: 2 } as const
    return [...(readiness?.items || [])].sort((a, b) => priority[a.status] - priority[b.status])
  }, [readiness])
  const failingChecklistItems = useMemo(
    () => sendChecklistItems.filter((item) => item.status === 'fail'),
    [sendChecklistItems],
  )
  const warningChecklistItems = useMemo(
    () => sendChecklistItems.filter((item) => item.status === 'warn'),
    [sendChecklistItems],
  )
  const sendStatusItem = useMemo(
    () => sendChecklistItems.find((item) => item.key === 'send-status') || null,
    [sendChecklistItems],
  )
  const isQueuedForSending = Boolean(sendStatusItem?.message.toLowerCase().includes('queued'))

  const loadWorkflow = useCallback(async ({ clearMessage = true }: { clearMessage?: boolean } = {}) => {
    setStatus('loading')
    if (clearMessage) setMessage(null)
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
    const trimmedRecipient = testRecipient.trim()

    setStatus('sendingTest')
    setMessage(null)
    try {
      const res = await fetch(`/api/emails/${emailId}/send-test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(trimmedRecipient ? { recipientEmail: trimmedRecipient } : {}),
      })
      if (!res.ok) throw new Error(await res.text())
      const payload = (await res.json()) as { message?: string; recipientEmail?: string }
      setStatus('sent')
      setMessage(payload.message || `Test email sent${payload.recipientEmail ? ` to ${payload.recipientEmail}` : ''}.`)
      void loadWorkflow({ clearMessage: false })
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Unable to send test email')
    }
  }

  async function confirmLink(link: NonNullable<Readiness['quality']>['links'][number]) {
    setStatus('loading')
    setMessage(null)
    try {
      const res = await fetch(`/api/emails/${emailId}/link-review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          href: link.href,
          label: link.label,
          reason: link.reason || (link.remoteStatus ? `Remote check returned ${link.remoteStatus}` : undefined),
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      setMessage('Link confirmed.')
      void loadWorkflow({ clearMessage: false })
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Unable to confirm link')
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
      void loadWorkflow({ clearMessage: false })
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Unable to send campaign')
    }
  }

  async function processQueuedSend() {
    if (!isQueuedForSending) {
      setMessage('This campaign is not queued for sending.')
      return
    }
    if (!window.confirm(`Process the queued send job for "${title}" now?`)) return

    setStatus('processingQueue')
    setMessage(null)
    try {
      const res = await fetch('/api/emails/process-queue', {
        body: JSON.stringify({ emailId, limit: 1 }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      })
      if (!res.ok) throw new Error(await res.text())
      const payload = (await res.json()) as {
        processed?: Array<{ emailId?: string; error?: string; jobId: string; sent?: boolean }>
      }
      const result = payload.processed?.find((item) => item.emailId === emailId) || payload.processed?.[0]
      if (result?.error) throw new Error(result.error)
      setStatus('sent')
      setMessage(
        result?.sent
          ? 'Queued campaign processed. Elastic should show delivery activity shortly.'
          : 'No pending queued send was processed. It may already be running or completed.',
      )
      void loadWorkflow({ clearMessage: false })
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Unable to process queued send')
    }
  }

  return (
    <Gutter className="email-flow">
      <div className="email-flow__header">
        <p className="email-flow__eyebrow">Final Check</p>
        <h1>{title}</h1>
        <p>Confirm the email is safe to send, then run a test and send the campaign when approved.</p>
      </div>

      {message ? <Banner type={status === 'error' ? 'error' : 'info'}>{message}</Banner> : null}

      <section className="email-flow__priority-grid">
        <div
          className="email-flow__send-status"
          data-state={!readiness ? 'loading' : readiness.canSend ? 'ready' : 'blocked'}
        >
          <Pill pillStyle={!readiness ? 'warning' : readiness.canSend ? 'success' : isQueuedForSending ? 'warning' : 'error'} size="small">
            {!readiness ? 'checking' : readiness.canSend ? 'ready' : isQueuedForSending ? 'queued' : 'blocked'}
          </Pill>
          <div>
            <h2>{!readiness ? 'Running final checks' : readiness.canSend ? 'Ready to send' : isQueuedForSending ? 'Queued for sending' : 'Needs attention before sending'}</h2>
            <p>
              {!readiness
                ? 'Loading the latest email, audience, and link checks.'
                : readiness.canSend
                  ? `${readiness.audience?.active || 0} active recipients are ready. Send a test before the campaign.`
                  : isQueuedForSending
                    ? 'This campaign is waiting for the send queue processor.'
                  : `${readiness.failures} blocking issue${readiness.failures === 1 ? '' : 's'} must be fixed before sending.`}
            </p>
          </div>
        </div>

        <div
          className="email-flow__priority-panel"
          data-state={blockingLinks.length ? 'error' : warningLinks.length ? 'warning' : 'ok'}
        >
          <div className="email-flow__section-header">
            <div>
              <p className="email-flow__eyebrow">Links First</p>
              <h2>{blockingLinks.length ? 'Broken links need fixing' : warningLinks.length ? 'Review link warnings' : 'No broken links found'}</h2>
            </div>
            <Pill pillStyle={blockingLinks.length ? 'error' : warningLinks.length ? 'warning' : 'success'} size="small">
              {blockingLinks.length
                ? `${blockingLinks.length} broken`
                : warningLinks.length
                  ? `${warningLinks.length} warning${warningLinks.length === 1 ? '' : 's'}`
                  : `${readiness?.quality?.links.length || 0} checked`}
            </Pill>
          </div>

          {!readiness ? (
            <p className="email-flow__muted">Loading link check results...</p>
          ) : blockingLinks.length ? (
            <>
              <p>Fix these before sending. Test sends and campaign sends are blocked while malformed or missing links remain.</p>
              <div className="email-flow__issue-list">
                {blockingLinks.slice(0, 6).map((link, index) => (
                  <div className="email-flow__issue" key={`${link.href}-${index}`}>
                    <strong>{link.label || 'Link'}</strong>
                    <span>{link.href || 'Missing URL'}</span>
                    <em>{link.remoteStatus ? `HTTP ${link.remoteStatus}` : link.reason || 'Invalid link'}</em>
                  </div>
                ))}
              </div>
              {blockingLinks.length > 6 ? (
                <p className="email-flow__muted">Showing the first 6 broken links. The full link list is below.</p>
              ) : null}
            </>
          ) : warningLinks.length ? (
            <>
              <p>Warnings do not block test sends, but each should either be fixed or manually confirmed.</p>
              <div className="email-flow__issue-list">
                {warningLinks.slice(0, 6).map((link, index) => (
                  <div className="email-flow__issue email-flow__issue--action" key={`${link.href}-${index}`}>
                    <strong>{link.label || 'Link'}</strong>
                    <a href={link.href} rel="noreferrer" target="_blank">{link.href}</a>
                    <em>{link.remoteStatus ? `HTTP ${link.remoteStatus}` : link.reason || 'Needs review'}</em>
                    <button type="button" onClick={() => void confirmLink(link)}>
                      Confirm
                    </button>
                  </div>
                ))}
              </div>
              {warningLinks.length > 6 ? (
                <p className="email-flow__muted">Showing the first 6 warnings. The full link list is below.</p>
              ) : null}
            </>
          ) : (
            <p className="email-flow__muted">The rendered email has no malformed links. Keep an eye on the preview below before sending.</p>
          )}

          <div className="email-flow__actions">
            <Button buttonStyle={blockingLinks.length ? 'primary' : 'secondary'} el="link" to={builderURL} type="button">
              Open Builder
            </Button>
            <Button buttonStyle="secondary" onClick={() => void loadWorkflow()} type="button">
              Recheck
            </Button>
          </div>
        </div>
      </section>

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
          <div className="email-flow__section-header">
            <h2>Send Actions</h2>
            {readiness ? (
              <Pill pillStyle={readiness.canSend ? 'success' : 'error'} size="small">
                {readiness.canSend ? 'ready' : 'blocked'}
              </Pill>
            ) : null}
          </div>
          {readiness ? (
            <>
              <div className="email-flow__meta">
                <span>{readiness.failures} blocking issues</span>
                <span>{readiness.warnings} warnings</span>
                <span>{readiness.audience?.active || 0} recipients</span>
              </div>
              {failingChecklistItems.length || warningChecklistItems.length ? (
                <div className="email-flow__mini-list">
                  {failingChecklistItems.slice(0, 4).map((item) => (
                    <div key={item.key} data-state="fail">
                      <strong>{item.label}</strong>
                      <span>{item.message}</span>
                    </div>
                  ))}
                  {!failingChecklistItems.length
                    ? warningChecklistItems.slice(0, 3).map((item) => (
                        <div key={item.key} data-state="warn">
                          <strong>{item.label}</strong>
                          <span>{item.message}</span>
                        </div>
                      ))
                    : null}
                </div>
              ) : null}
            </>
          ) : (
            <p>{status === 'loading' ? 'Loading readiness...' : 'No readiness data.'}</p>
          )}
          <p className="email-flow__muted">
            Test sends use the recipient below or the saved test recipient. Campaign sends go to the selected audience list.
          </p>
          <label className="email-flow__field">
            <span>Test email recipient</span>
            <input
              disabled={status === 'sendingTest'}
              inputMode="email"
              placeholder="Leave blank to use saved test recipient"
              type="email"
              value={testRecipient}
              onChange={(event) => setTestRecipient(event.target.value)}
            />
          </label>
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
            {isQueuedForSending ? (
              <Button buttonStyle="secondary" disabled={status === 'processingQueue'} onClick={() => void processQueuedSend()} type="button">
                {status === 'processingQueue' ? 'Processing Queue...' : 'Process Queued Send'}
              </Button>
            ) : null}
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
        <div className="email-flow__section-header">
          <h2>Detailed Checklist</h2>
          {readiness ? <span className="email-flow__muted">{readiness.failures} blocking, {readiness.warnings} warnings</span> : null}
        </div>
        {readiness ? (
          <>
            <div className="email-flow__checklist email-flow__checklist--compact">
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
            <h3>All Links</h3>
            <div className="email-flow__table">
              {readiness.quality.links.map((link, index) => (
                <div className="email-flow__row" data-state={link.status} key={`${link.href}-${index}`}>
                  <Pill pillStyle={link.status === 'ok' || link.status === 'merge' ? 'success' : link.status === 'warning' ? 'warning' : 'error'} size="small">
                    {link.confirmed ? 'confirmed' : link.status}
                  </Pill>
                  <strong>{link.label || 'Link'}</strong>
                  {link.status === 'invalid' ? (
                    <span>{link.href || 'Missing URL'}</span>
                  ) : (
                    <a href={link.href} rel="noreferrer" target="_blank">{link.href}</a>
                  )}
                  <span>
                    {link.remoteStatus ? `HTTP ${link.remoteStatus}` : link.reason || ''}
                    {link.status === 'warning' ? (
                      <button className="email-flow__inline-button" type="button" onClick={() => void confirmLink(link)}>
                        Confirm link
                      </button>
                    ) : null}
                  </span>
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
