'use client'

import { Button, useConfig } from '@payloadcms/ui'
import {
  ArrowRight,
  Check,
  CircleAlert,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  FileText,
  LoaderCircle,
  MailCheck,
  MousePointerClick,
  RefreshCw,
  Send,
  UsersRound,
} from 'lucide-react'
import { formatAdminURL } from 'payload/shared'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { EmailCampaignShell } from './EmailCampaignShell'
import { useEmailWorkflow } from './useEmailWorkflow'

type Report = {
  counts: Record<string, number>
  previousCampaigns?: Array<{
    id: string
    recipientCount: number
    sentAt?: string
    title?: string
  }>
  rates?: Record<string, number>
  recipientCount: number
  reconciliation?: {
    terminalRecipients: number
    unaccountedRecipients: number
  }
  topLinks: Array<{ count: number; url: string }>
}

const DELIVERY_PROGRESS = [
  { icon: Check, key: 'confirmed', label: 'Confirmed' },
  { icon: Clock3, key: 'queued', label: 'Queued' },
  { icon: Send, key: 'sending', label: 'Sending' },
  { icon: MailCheck, key: 'sent', label: 'Complete' },
] as const

function getProgressIndex(mode: string) {
  if (mode === 'sent') return 3
  if (mode === 'sending') return 2
  if (mode === 'queued') return 1
  if (mode === 'scheduled') return 0
  return mode === 'failed' ? 1 : -1
}

export function EmailResultsStageViewClient({
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
    isLoading,
    refresh: refreshWorkflow,
    workflow,
  } = useEmailWorkflow(emailId)
  const [report, setReport] = useState<Report | null>(null)
  const [reportLoading, setReportLoading] = useState(true)
  const [reportError, setReportError] = useState<string | null>(null)
  const [state, setState] = useState<'creatingPost' | 'duplicating' | 'error' | 'idle' | 'refreshing'>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const loadVersion = useRef(0)
  const baseURL = useMemo(
    () => formatAdminURL({ adminRoute, path: `/collections/emails/${emailId}` }),
    [adminRoute, emailId],
  )
  const deliveryURL = `${baseURL}/delivery`

  const loadReport = useCallback(async () => {
    const version = ++loadVersion.current

    try {
      const response = await fetch(`/api/emails/${encodeURIComponent(emailId)}/report`, {
        cache: 'no-store',
        credentials: 'include',
      })
      if (!response.ok) {
        if (response.status === 404) {
          if (loadVersion.current === version) setReport(null)
          return
        }
        throw new Error(await response.text())
      }
      const nextReport = await response.json() as Report
      if (loadVersion.current === version) {
        setReportError(null)
        setReport(nextReport)
      }
    } catch (loadError) {
      if (loadVersion.current !== version) return
      setReportError(loadError instanceof Error ? loadError.message : 'Unable to load campaign report')
    } finally {
      if (loadVersion.current === version) setReportLoading(false)
    }
  }, [emailId])

  useEffect(() => {
    void loadReport()
  }, [loadReport])

  async function refreshResults() {
    setState('refreshing')
    setMessage(null)
    await Promise.all([
      refreshWorkflow({ quiet: true }),
      loadReport(),
    ])
    setState('idle')
  }

  async function duplicateCampaign() {
    setState('duplicating')
    setMessage(null)

    try {
      const response = await fetch(`/api/emails/${encodeURIComponent(emailId)}/duplicate`, {
        credentials: 'include',
        method: 'POST',
      })
      if (!response.ok) throw new Error(await response.text())
      const payload = await response.json() as { adminUrl?: string }
      if (!payload.adminUrl) throw new Error('The duplicate was created but no editor URL was returned.')
      window.location.assign(payload.adminUrl)
    } catch (duplicateError) {
      setState('error')
      setMessage(duplicateError instanceof Error ? duplicateError.message : 'Unable to duplicate campaign')
    }
  }

  async function repurposeAsPost() {
    if (workflow?.email.relatedPost?.adminUrl) {
      window.location.assign(workflow.email.relatedPost.adminUrl)
      return
    }

    setState('creatingPost')
    setMessage(null)

    try {
      const response = await fetch(`/api/emails/${encodeURIComponent(emailId)}/create-post`, {
        credentials: 'include',
        method: 'POST',
      })
      if (!response.ok) throw new Error(await response.text())
      const payload = await response.json() as { adminUrl?: string; created?: boolean }
      if (!payload.adminUrl) throw new Error('The post is available but no editor URL was returned.')
      window.location.assign(payload.adminUrl)
    } catch (postError) {
      setState('error')
      setMessage(postError instanceof Error ? postError.message : 'Unable to repurpose campaign as a post')
    }
  }

  const deliveryMode = workflow?.delivery.mode || 'none'
  const progressIndex = getProgressIndex(deliveryMode)
  const failed = deliveryMode === 'failed'
  const reportCounts = report?.counts || {}
  const reportRates = report?.rates || {}

  return (
    <EmailCampaignShell
      activeStage="results"
      description="Monitor delivery and review campaign performance. Delivered content is locked."
      emailId={emailId}
      error={workflowError || reportError}
      isLoading={isLoading}
      title={title}
      workflow={workflow}
    >
      <main className="email-stage email-stage--results">
        {message ? (
          <div aria-live="polite" className="email-stage__notice" data-state={state === 'error' ? 'error' : 'success'}>
            {message}
          </div>
        ) : null}

        <section className="email-stage__result-hero" data-state={failed ? 'failed' : deliveryMode}>
          <div className="email-stage__result-hero-copy">
            <span className="email-stage__result-icon">
              {failed ? <CircleAlert aria-hidden="true" /> : deliveryMode === 'sent' ? <MailCheck aria-hidden="true" /> : <LoaderCircle aria-hidden="true" />}
            </span>
            <div>
              <h2>
                {failed
                  ? 'Delivery needs attention'
                  : deliveryMode === 'sent'
                    ? 'Campaign delivered'
                    : deliveryMode === 'sending'
                      ? 'Campaign is sending'
                      : deliveryMode === 'queued'
                        ? 'Campaign is queued'
                        : deliveryMode === 'scheduled'
                          ? 'Campaign is scheduled'
                          : 'Delivery has not started'}
              </h2>
              <p>
                {failed
                  ? workflow?.delivery.error || 'The delivery service reported a failure.'
                  : deliveryMode === 'sent'
                    ? `Sent to ${report?.recipientCount || workflow?.audience?.eligible || 0} recipients.`
                    : 'This page updates as the delivery service processes the immutable campaign snapshot.'}
              </p>
            </div>
          </div>
          <div className="email-stage__result-actions">
            <Button
              buttonStyle="secondary"
              disabled={state === 'refreshing'}
              onClick={() => void refreshResults()}
              type="button"
            >
              <RefreshCw aria-hidden="true" />
              {state === 'refreshing' ? 'Refreshing…' : 'Refresh'}
            </Button>
            {failed && workflow?.availableActions.includes('retry') ? (
              <Button buttonStyle="primary" el="link" to={deliveryURL} type="button">
                Review retry
                <ArrowRight aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        </section>

        <section className="email-stage__panel email-stage__progress-panel">
          <div className="email-stage__section-heading">
            <div>
              <h2>Delivery progress</h2>
              <p>Queue processing runs automatically.</p>
            </div>
            {workflow?.delivery.jobId ? <span className="email-stage__job-id">Job {workflow.delivery.jobId}</span> : null}
          </div>
          <ol className="email-stage__delivery-progress">
            {DELIVERY_PROGRESS.map((step, index) => {
              const StepIcon = step.icon
              const stepState = failed && index === progressIndex
                ? 'failed'
                : index < progressIndex
                  ? 'complete'
                  : index === progressIndex
                    ? 'active'
                    : 'pending'
              return (
                <li data-state={stepState} key={step.key}>
                  <span><StepIcon aria-hidden="true" /></span>
                  <strong>{step.label}</strong>
                </li>
              )
            })}
          </ol>
        </section>

        <section className="email-stage__panel email-stage__report-panel">
          <div className="email-stage__section-heading">
            <div>
              <h2>Campaign report</h2>
              <p>Delivery and engagement events reported by the email provider.</p>
            </div>
            <a className="email-stage__outline-link" href={`/api/emails/${emailId}/report?format=csv`}>
              <Download aria-hidden="true" />
              Export CSV
            </a>
          </div>

          {report ? (
            <>
              <div className="email-stage__metric-grid">
                <div><UsersRound aria-hidden="true" /><strong>{report.recipientCount.toLocaleString()}</strong><span>Recipients</span></div>
                <div><MailCheck aria-hidden="true" /><strong>{(reportCounts.delivered || 0).toLocaleString()}</strong><span>Delivered</span></div>
                <div><FileText aria-hidden="true" /><strong>{(reportCounts.opened || 0).toLocaleString()}</strong><span>Opened</span></div>
                <div><MousePointerClick aria-hidden="true" /><strong>{(reportCounts.clicked || 0).toLocaleString()}</strong><span>Clicked</span></div>
                <div><CircleAlert aria-hidden="true" /><strong>{(reportCounts.bounced || 0).toLocaleString()}</strong><span>Bounced</span></div>
                <div><UsersRound aria-hidden="true" /><strong>{(reportCounts.unsubscribed || 0).toLocaleString()}</strong><span>Unsubscribed</span></div>
              </div>

              {Object.keys(reportRates).length ? (
                <div className="email-stage__rate-grid">
                  {Object.entries(reportRates).map(([label, value]) => (
                    <div key={label}>
                      <span><strong>{label}</strong><em>{value}%</em></span>
                      <div><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>
                    </div>
                  ))}
                </div>
              ) : null}

              {report.topLinks.length ? (
                <div className="email-stage__top-links">
                  <h3>Top clicked links</h3>
                  {report.topLinks.map((link) => (
                    <a href={link.url} key={link.url} rel="noopener noreferrer" target="_blank">
                      <span>{link.url}</span>
                      <strong>{link.count.toLocaleString()} clicks</strong>
                      <ExternalLink aria-hidden="true" />
                    </a>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <div className="email-stage__empty">
              {reportLoading ? 'Loading campaign events…' : 'Reporting will appear as delivery events arrive.'}
            </div>
          )}
        </section>

        <section className="email-stage__panel email-stage__reuse-panel">
          <div className="email-stage__section-heading">
            <div>
              <h2>Reuse this campaign</h2>
              <p>Create new editable work without changing the delivered snapshot.</p>
            </div>
          </div>
          <div className="email-stage__reuse-actions">
            <button
              disabled={state === 'duplicating'}
              onClick={() => void duplicateCampaign()}
              type="button"
            >
              <span><Copy aria-hidden="true" /></span>
              <span>
                <strong>{state === 'duplicating' ? 'Duplicating…' : 'Duplicate Campaign'}</strong>
                <small>Start a new draft with the same content and settings.</small>
              </span>
              <ArrowRight aria-hidden="true" />
            </button>
            <button
              disabled={state === 'creatingPost'}
              onClick={() => void repurposeAsPost()}
              type="button"
            >
              <span><FileText aria-hidden="true" /></span>
              <span>
                <strong>
                  {state === 'creatingPost'
                    ? 'Creating post…'
                    : workflow?.email.relatedPost
                      ? 'Open Repurposed Post'
                      : 'Repurpose as Post'}
                </strong>
                <small>
                  {workflow?.email.relatedPost
                    ? 'Return to the post already created from this campaign.'
                    : 'Create an editable website post from this campaign.'}
                </small>
              </span>
              <ArrowRight aria-hidden="true" />
            </button>
          </div>
        </section>
      </main>
    </EmailCampaignShell>
  )
}
