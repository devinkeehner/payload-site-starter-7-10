'use client'

import { Button, useConfig } from '@payloadcms/ui'
import {
  ArrowRight,
  Check,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  Link2,
  MailCheck,
  RefreshCw,
  Send,
  TriangleAlert,
  UsersRound,
  X,
} from 'lucide-react'
import { formatAdminURL } from 'payload/shared'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { EmailWorkflowLinkCheck } from '@/lib/email/workflowTypes'

import { EmailCampaignShell } from './EmailCampaignShell'
import { useEmailWorkflow } from './useEmailWorkflow'

type EmailPreview = {
  html: string
  text: string
}

function LinkStateIcon({ state }: { state: EmailWorkflowLinkCheck['status'] }) {
  if (state === 'invalid') return <X aria-hidden="true" />
  if (state === 'warning') return <TriangleAlert aria-hidden="true" />
  return <Check aria-hidden="true" />
}

export function EmailReviewStageViewClient({
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
  const {
    error: workflowError,
    isLoading: workflowLoading,
    refresh: refreshWorkflow,
    workflow,
  } = useEmailWorkflow(emailId)
  const [preview, setPreview] = useState<EmailPreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(true)
  const [testRecipientDraft, setTestRecipientDraft] = useState<string | null>(null)
  const [state, setState] = useState<'error' | 'idle' | 'refreshing' | 'sendingTest' | 'sent'>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const loadVersion = useRef(0)
  const baseURL = useMemo(
    () => formatAdminURL({ adminRoute, path: `/collections/emails/${emailId}` }),
    [adminRoute, emailId],
  )
  const builderURL = `${baseURL}/visual`
  const audienceURL = `${baseURL}/audience`
  const deliveryURL = `${baseURL}/delivery`
  const testRecipient = testRecipientDraft ?? workflow?.email.recipientEmail ?? ''

  const loadPreview = useCallback(async () => {
    const version = ++loadVersion.current

    try {
      const response = await fetch(`/api/emails/${encodeURIComponent(emailId)}/preview`, {
        cache: 'no-store',
        credentials: 'include',
      })
      if (!response.ok) throw new Error(await response.text())
      const nextPreview = await response.json() as EmailPreview
      if (loadVersion.current !== version) return
      setPreviewError(null)
      setPreview(nextPreview)
    } catch (loadError) {
      if (loadVersion.current !== version) return
      setPreviewError(loadError instanceof Error ? loadError.message : 'Unable to load email preview')
    } finally {
      if (loadVersion.current === version) setPreviewLoading(false)
    }
  }, [emailId])

  useEffect(() => {
    void loadPreview()
  }, [loadPreview])

  async function refreshReview() {
    setState('refreshing')
    setMessage(null)
    await Promise.all([
      refreshWorkflow({ quiet: true }),
      loadPreview(),
    ])
    setState('idle')
  }

  async function sendTest() {
    const recipientEmail = testRecipient.trim()
    if (!recipientEmail) {
      setState('error')
      setMessage('Enter the email address that should receive the test.')
      return
    }

    setState('sendingTest')
    setMessage(null)

    try {
      const response = await fetch(`/api/emails/${encodeURIComponent(emailId)}/send-test`, {
        body: JSON.stringify({ recipientEmail }),
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      })
      if (!response.ok) throw new Error(await response.text())
      const payload = await response.json() as {
        contentRevision?: string
        message?: string
        recipientEmail?: string
        testedRevisionHash?: string
      }
      await refreshWorkflow({ quiet: true })
      setState('sent')
      setMessage(payload.message || `Test sent to ${payload.recipientEmail || recipientEmail}.`)
    } catch (sendError) {
      setState('error')
      setMessage(sendError instanceof Error ? sendError.message : 'Unable to send test email')
    }
  }

  async function confirmLink(link: EmailWorkflowLinkCheck) {
    setState('refreshing')
    setMessage(null)

    try {
      const response = await fetch(`/api/emails/${encodeURIComponent(emailId)}/link-review`, {
        body: JSON.stringify({
          href: link.href,
          label: link.label,
          reason: link.reason || (link.remoteStatus ? `Remote check returned ${link.remoteStatus}` : undefined),
        }),
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      })
      if (!response.ok) throw new Error(await response.text())
      await refreshWorkflow({ quiet: true })
      setState('idle')
      setMessage('Link warning confirmed.')
    } catch (confirmError) {
      setState('error')
      setMessage(confirmError instanceof Error ? confirmError.message : 'Unable to confirm link')
    }
  }

  const readiness = workflow?.readiness || null
  const audience = workflow?.audience || readiness?.audience || null
  const links = readiness?.quality?.links || []
  const checklist = useMemo(() => {
    const order = { fail: 0, warn: 1, pass: 2 } as const
    return [...(readiness?.items || [])].sort((left, right) => order[left.status] - order[right.status])
  }, [readiness?.items])
  const invalidLinks = links.filter((link) => link.status === 'invalid')
  const testMatches = workflow?.test.state === 'current'
  const canContinue = Boolean(testMatches && readiness?.canSend)
  const editingLocked = workflow?.email.readOnly || false

  return (
    <EmailCampaignShell
      activeStage="review"
      description="Confirm the message, links, and audience, then test this exact version."
      emailId={emailId}
      error={workflowError || previewError}
      isLoading={workflowLoading}
      title={title}
      workflow={workflow}
    >
      <main className="email-stage email-stage--review">
        {message ? (
          <div aria-live="polite" className="email-stage__notice" data-state={state === 'error' ? 'error' : 'success'}>
            {message}
          </div>
        ) : null}

        <div className="email-stage__review-layout">
          <section className="email-stage__preview-panel">
            <div className="email-stage__section-heading">
              <div>
                <h2>Email preview</h2>
                <p>Rendered from the latest saved content.</p>
              </div>
              <Button
                buttonStyle="secondary"
                disabled={state === 'refreshing'}
                onClick={() => void refreshReview()}
                size="small"
                type="button"
              >
                <RefreshCw aria-hidden="true" />
                {state === 'refreshing' ? 'Refreshing…' : 'Refresh'}
              </Button>
            </div>
            <div className="email-stage__preview">
              {preview?.html ? (
                <iframe sandbox="" srcDoc={preview.html} title={`Preview of ${title}`} />
              ) : (
                <div className="email-stage__preview-loading">
                  {previewLoading ? 'Rendering preview…' : 'Preview is unavailable.'}
                </div>
              )}
            </div>
          </section>

          <aside className="email-stage__review-sidebar">
            <section className="email-stage__panel">
              <div className="email-stage__section-heading">
                <div>
                  <h2>Message</h2>
                  <p>What recipients will see in their inbox.</p>
                </div>
                <MailCheck aria-hidden="true" />
              </div>
              <dl className="email-stage__summary-list">
                <div><dt>Subject</dt><dd>{workflow?.email.subject || 'Missing subject'}</dd></div>
                <div><dt>Preheader</dt><dd>{workflow?.email.preheader || 'No preheader'}</dd></div>
                <div><dt>Reply-to</dt><dd>{workflow?.email.replyTo || 'Default sender'}</dd></div>
              </dl>
              {!editingLocked ? <a className="email-stage__text-link" href={builderURL}>Edit message</a> : null}
            </section>

            <section className="email-stage__panel">
              <div className="email-stage__section-heading">
                <div>
                  <h2>Audience</h2>
                  <p>Final send eligibility.</p>
                </div>
                <UsersRound aria-hidden="true" />
              </div>
              {audience ? (
                <dl className="email-stage__summary-list">
                  <div><dt>List</dt><dd>{audience.listName}</dd></div>
                  <div><dt>Eligible</dt><dd>{audience.eligible.toLocaleString()}</dd></div>
                  <div><dt>Excluded</dt><dd>{Math.max(0, audience.total - audience.eligible).toLocaleString()}</dd></div>
                </dl>
              ) : <p className="email-stage__empty">No audience selected.</p>}
              {!editingLocked ? <a className="email-stage__text-link" href={audienceURL}>Edit audience</a> : null}
            </section>

            <section className="email-stage__panel email-stage__test-panel" data-state={workflow?.test.state || 'never'}>
              <div className="email-stage__section-heading">
                <div>
                  <h2>Send a test</h2>
                  <p>A successful test only approves the current content version.</p>
                </div>
                <Send aria-hidden="true" />
              </div>
              <div className="email-stage__test-state">
                {testMatches ? <CheckCircle2 aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
                <span>
                  {workflow?.test.state === 'current'
                    ? `Current version tested${workflow.test.sentAt ? ` ${new Date(workflow.test.sentAt).toLocaleString()}` : ''}.`
                    : workflow?.test.state === 'stale'
                      ? 'The message changed after the last successful test.'
                      : workflow?.test.state === 'failed'
                        ? 'The last test failed. Send another test.'
                        : 'This version has not been tested yet.'}
                </span>
              </div>
              <label className="email-stage__field">
                <span>Test recipient</span>
                <input
                  autoComplete="email"
                  disabled={editingLocked || state === 'sendingTest'}
                  inputMode="email"
                  onChange={(event) => setTestRecipientDraft(event.target.value)}
                  placeholder="name@example.com"
                  type="email"
                  value={testRecipient}
                />
              </label>
              <Button
                buttonStyle="primary"
                disabled={editingLocked || invalidLinks.length > 0 || state === 'sendingTest'}
                onClick={() => void sendTest()}
                type="button"
              >
                {state === 'sendingTest' ? 'Sending test…' : 'Send Test Email'}
              </Button>
            </section>
          </aside>
        </div>

        <section className="email-stage__panel email-stage__checklist-panel">
          <div className="email-stage__section-heading">
            <div>
              <h2>Readiness checklist</h2>
              <p>One consolidated view of everything required before delivery.</p>
            </div>
            <span className="email-stage__readiness-count">
              {readiness ? `${readiness.failures} blocking · ${readiness.warnings} warnings` : 'Checking…'}
            </span>
          </div>
          <div className="email-stage__checklist">
            {checklist.map((item) => (
              <div data-state={item.status} key={item.key}>
                <span className="email-stage__check-icon">
                  {item.status === 'pass'
                    ? <Check aria-hidden="true" />
                    : item.status === 'warn'
                      ? <TriangleAlert aria-hidden="true" />
                      : <X aria-hidden="true" />}
                </span>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.message}</small>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="email-stage__panel email-stage__links-panel">
          <div className="email-stage__section-heading">
            <div>
              <h2>Links</h2>
              <p>Destinations found in the rendered email.</p>
            </div>
            <span className="email-stage__readiness-count">
              <Link2 aria-hidden="true" />
              {links.length} checked
            </span>
          </div>
          {links.length ? (
            <div className="email-stage__link-list">
              {links.map((link, index) => (
                <div data-state={link.status} key={`${link.href}-${index}`}>
                  <span className="email-stage__link-state"><LinkStateIcon state={link.status} /></span>
                  <span className="email-stage__link-copy">
                    <strong>{link.label || 'Link'}</strong>
                    {link.status === 'invalid' || !link.href ? (
                      <small>{link.href || 'Missing destination'}</small>
                    ) : (
                      <a href={link.href} rel="noopener noreferrer" target="_blank">
                        {link.href}
                        <ExternalLink aria-hidden="true" />
                      </a>
                    )}
                  </span>
                  <span className="email-stage__link-note">
                    {link.confirmed ? 'Confirmed' : link.remoteStatus ? `HTTP ${link.remoteStatus}` : link.reason || link.status}
                  </span>
                  {link.status === 'warning' && !link.confirmed ? (
                    <button disabled={state === 'refreshing'} onClick={() => void confirmLink(link)} type="button">
                      Confirm
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : <p className="email-stage__empty">No links were found in this email.</p>}
        </section>

        <footer className="email-stage__footer email-stage__footer--review">
          <div>
            {canContinue ? (
              <>
                <CheckCircle2 aria-hidden="true" />
                <span>This exact version is tested and ready for delivery.</span>
              </>
            ) : (
              <>
                <CircleAlert aria-hidden="true" />
                <span>Resolve blocking checks and send a successful test to continue.</span>
              </>
            )}
          </div>
          <Button
            buttonStyle="primary"
            disabled={!canContinue}
            el="link"
            to={deliveryURL}
            type="button"
          >
            Continue to Delivery
            <ArrowRight aria-hidden="true" />
          </Button>
        </footer>
      </main>
    </EmailCampaignShell>
  )
}
