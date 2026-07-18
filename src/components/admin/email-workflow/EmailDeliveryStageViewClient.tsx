'use client'

import { Button, useConfig } from '@payloadcms/ui'
import {
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Send,
  ShieldCheck,
  UsersRound,
  X,
} from 'lucide-react'
import { formatAdminURL } from 'payload/shared'
import React, { useEffect, useMemo, useRef, useState } from 'react'

import type {
  EmailDeliveryPostRequest,
  EmailDeliveryMutationResponse,
  EmailScheduleRequest,
} from '@/lib/email/workflowTypes'

import { EmailCampaignShell } from './EmailCampaignShell'
import {
  formatDateTimeForZone,
  zonedLocalDateTimeToISO,
} from './deliveryTime'
import { useEmailWorkflow } from './useEmailWorkflow'

const DELIVERY_TIME_ZONE = 'America/New_York'

type DeliveryChoice = 'schedule' | 'sendNow'

type PendingConfirmation = {
  choice: DeliveryChoice
  scheduledAt: string | null
}

function DeliveryConfirmationDialog({
  audienceName,
  onCancel,
  onConfirm,
  pending,
  recipientCount,
  submitting,
  title,
}: {
  audienceName: string
  onCancel: () => void
  onConfirm: () => void
  pending: PendingConfirmation
  recipientCount: number
  submitting: boolean
  title: string
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()

    function handleDialogKeys(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submitting) onCancel()
      if (event.key !== 'Tab') return

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ) || [],
      )
      if (!focusable.length) return

      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleDialogKeys)
    return () => document.removeEventListener('keydown', handleDialogKeys)
  }, [onCancel, submitting])

  return (
    <div className="email-delivery-dialog__backdrop">
      <section
        aria-describedby="delivery-confirm-description"
        aria-labelledby="delivery-confirm-title"
        aria-modal="true"
        className="email-delivery-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <button
          aria-label="Close confirmation"
          className="email-delivery-dialog__close"
          disabled={submitting}
          onClick={onCancel}
          type="button"
        >
          <X aria-hidden="true" />
        </button>
        <span className="email-delivery-dialog__icon"><ShieldCheck aria-hidden="true" /></span>
        <h2 id="delivery-confirm-title">
          {pending.choice === 'sendNow' ? 'Send this campaign now?' : 'Confirm this schedule?'}
        </h2>
        <p id="delivery-confirm-description">
          This locks the reviewed version of “{title}” and its approved recipient candidates.
        </p>
        <dl>
          <div><dt>Audience</dt><dd>{audienceName}</dd></div>
          <div><dt>Eligible recipients</dt><dd>{recipientCount.toLocaleString()}</dd></div>
          <div>
            <dt>Delivery</dt>
            <dd>
              {pending.choice === 'sendNow'
                ? 'Queue immediately'
                : pending.scheduledAt
                  ? new Intl.DateTimeFormat('en-US', {
                      dateStyle: 'full',
                      timeStyle: 'short',
                      timeZone: DELIVERY_TIME_ZONE,
                    }).format(new Date(pending.scheduledAt))
                  : ''}
            </dd>
          </div>
          <div><dt>Timezone</dt><dd>Eastern Time (America/New_York)</dd></div>
        </dl>
        <div className="email-delivery-dialog__actions">
          <Button
            buttonStyle="secondary"
            disabled={submitting}
            onClick={onCancel}
            ref={cancelRef}
            type="button"
          >
            Go back
          </Button>
          <Button
            buttonStyle="primary"
            disabled={submitting}
            onClick={onConfirm}
            type="button"
          >
            {submitting
              ? 'Confirming…'
              : pending.choice === 'sendNow'
                ? 'Confirm and Send'
                : 'Confirm Schedule'}
          </Button>
        </div>
      </section>
    </div>
  )
}

export function EmailDeliveryStageViewClient({
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
    refresh,
    setWorkflow,
    workflow,
  } = useEmailWorkflow(emailId)
  const [choice, setChoice] = useState<DeliveryChoice>('sendNow')
  const [scheduleDraft, setScheduleDraft] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingConfirmation | null>(null)
  const [state, setState] = useState<'canceling' | 'error' | 'idle' | 'submitting' | 'success'>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [minimumSchedule, setMinimumSchedule] = useState('')
  const baseURL = useMemo(
    () => formatAdminURL({ adminRoute, path: `/collections/emails/${emailId}` }),
    [adminRoute, emailId],
  )
  const reviewURL = `${baseURL}/review`
  const resultsURL = `${baseURL}/results`
  const scheduledValue = scheduleDraft ?? formatDateTimeForZone(
    workflow?.delivery.scheduledAt,
    DELIVERY_TIME_ZONE,
  )
  const actions = new Set(workflow?.availableActions || [])
  const hasCurrentTest = workflow?.test.state === 'current'
  const hasReadiness = Boolean(workflow?.readiness.canSend)
  const canSendNow = actions.has('sendNow') || actions.has('retry')
  const canSchedule = actions.has('schedule') || actions.has('reschedule')
  const canCancel = actions.has('cancelSchedule')
  const isScheduled = workflow?.delivery.mode === 'scheduled'
  const effectiveChoice: DeliveryChoice = isScheduled ? 'schedule' : choice
  const audience = workflow?.audience

  function chooseSchedule() {
    setChoice('schedule')
    setMinimumSchedule(formatDateTimeForZone(
      new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      DELIVERY_TIME_ZONE,
    ))
  }

  function prepareConfirmation() {
    setMessage(null)

    if (!workflow) return
    if (!hasCurrentTest || !hasReadiness) {
      setState('error')
      setMessage('Return to Review & Test and successfully test the current version before delivery.')
      return
    }

    if (effectiveChoice === 'sendNow') {
      if (!canSendNow) {
        setState('error')
        setMessage('This campaign cannot be queued for immediate delivery in its current state.')
        return
      }
      setPending({ choice: effectiveChoice, scheduledAt: null })
      return
    }

    if (!canSchedule) {
      setState('error')
      setMessage('This campaign cannot be scheduled in its current state.')
      return
    }

    const converted = zonedLocalDateTimeToISO(scheduledValue, DELIVERY_TIME_ZONE)
    if (!converted.iso) {
      setState('error')
      setMessage(converted.error)
      return
    }
    if (new Date(converted.iso).getTime() <= Date.now()) {
      setState('error')
      setMessage('Scheduled delivery must be in the future.')
      return
    }

    setPending({ choice: effectiveChoice, scheduledAt: converted.iso })
  }

  async function confirmDelivery() {
    if (!pending || !workflow) return

    setState('submitting')
    setMessage(null)

    try {
      const isSendNow = pending.choice === 'sendNow'
      const isReschedule = !isSendNow && workflow.delivery.mode === 'scheduled'
      const body: EmailDeliveryPostRequest | EmailScheduleRequest = isSendNow
        ? {
            expectedRevision: workflow.email.contentRevision,
            mode: 'sendNow',
          }
        : {
            expectedRevision: workflow.email.contentRevision,
            ...(isReschedule ? {} : { mode: 'schedule' as const }),
            scheduledAt: pending.scheduledAt || '',
            timeZone: DELIVERY_TIME_ZONE,
          }
      const response = await fetch(`/api/emails/${encodeURIComponent(emailId)}/delivery`, {
        body: JSON.stringify(body),
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        method: isReschedule ? 'PATCH' : 'POST',
      })

      if (!response.ok) {
        const responseMessage = await response.text()
        if (response.status === 409) {
          await refresh({ quiet: true })
          throw new Error(responseMessage || 'The campaign changed. Review the latest version before confirming again.')
        }
        throw new Error(responseMessage || 'Unable to confirm delivery')
      }

      const payload = await response.json() as EmailDeliveryMutationResponse
      setWorkflow(payload.workflow)
      setPending(null)
      setState('success')

      if (isSendNow) {
        window.location.assign(resultsURL)
      } else {
        setMessage('Campaign scheduled successfully.')
        setScheduleDraft(null)
      }
    } catch (deliveryError) {
      setPending(null)
      setState('error')
      setMessage(deliveryError instanceof Error ? deliveryError.message : 'Unable to confirm delivery')
    }
  }

  async function cancelSchedule() {
    if (!workflow || !canCancel) return
    if (!window.confirm('Cancel this scheduled delivery and return the campaign to draft?')) return

    setState('canceling')
    setMessage(null)

    try {
      const response = await fetch(`/api/emails/${encodeURIComponent(emailId)}/delivery`, {
        body: JSON.stringify({ expectedRevision: workflow.email.contentRevision }),
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'DELETE',
      })
      if (!response.ok) throw new Error(await response.text())
      const payload = await response.json() as EmailDeliveryMutationResponse
      setWorkflow(payload.workflow)
      setScheduleDraft(null)
      setState('success')
      setMessage('Scheduled delivery canceled. The campaign is editable again.')
    } catch (cancelError) {
      setState('error')
      setMessage(cancelError instanceof Error ? cancelError.message : 'Unable to cancel scheduled delivery')
    }
  }

  return (
    <EmailCampaignShell
      activeStage="delivery"
      description="Choose when to deliver the exact version you reviewed and tested."
      emailId={emailId}
      error={workflowError}
      isLoading={isLoading}
      title={title}
      workflow={workflow}
    >
      <main className="email-stage email-stage--delivery">
        {message ? (
          <div aria-live="polite" className="email-stage__notice" data-state={state === 'error' ? 'error' : 'success'}>
            {message}
          </div>
        ) : null}

        {!hasCurrentTest && workflow ? (
          <div className="email-stage__delivery-gate" data-state="blocked">
            <CircleAlert aria-hidden="true" />
            <div>
              <h2>Test the current version before delivery</h2>
              <p>The last successful test does not match this content, or this campaign has not been tested yet.</p>
            </div>
            <Button buttonStyle="primary" el="link" to={reviewURL} type="button">
              Return to Review & Test
            </Button>
          </div>
        ) : null}

        {isScheduled ? (
          <section className="email-stage__scheduled-summary">
            <span><CalendarClock aria-hidden="true" /></span>
            <div>
              <h2>Campaign scheduled</h2>
              <p>
                {workflow?.delivery.scheduledAt
                  ? new Intl.DateTimeFormat('en-US', {
                      dateStyle: 'full',
                      timeStyle: 'short',
                      timeZone: DELIVERY_TIME_ZONE,
                    }).format(new Date(workflow.delivery.scheduledAt))
                  : 'Scheduled time unavailable'} Eastern Time
              </p>
            </div>
            {canCancel ? (
              <Button
                buttonStyle="secondary"
                disabled={state === 'canceling'}
                onClick={() => void cancelSchedule()}
                type="button"
              >
                {state === 'canceling' ? 'Canceling…' : 'Cancel schedule'}
              </Button>
            ) : null}
          </section>
        ) : null}

        <div className="email-stage__delivery-layout">
          <section className="email-stage__panel email-stage__delivery-options">
            <div className="email-stage__section-heading">
              <div>
                <h2>{isScheduled ? 'Reschedule delivery' : 'Delivery timing'}</h2>
                <p>All times are shown in Eastern Time.</p>
              </div>
              <Clock3 aria-hidden="true" />
            </div>

            <fieldset className="email-stage__delivery-choice">
              <legend className="email-stage__sr-only">Choose delivery timing</legend>
              {!isScheduled ? (
                <label data-selected={choice === 'sendNow'}>
                  <input
                    checked={choice === 'sendNow'}
                    disabled={!canSendNow}
                    name="deliveryChoice"
                    onChange={() => setChoice('sendNow')}
                    type="radio"
                  />
                  <span><Send aria-hidden="true" /></span>
                  <span>
                    <strong>Send now</strong>
                    <small>Lock this version and place it in the delivery queue immediately.</small>
                  </span>
                </label>
              ) : null}
              <label data-selected={choice === 'schedule' || isScheduled}>
                <input
                  checked={choice === 'schedule' || isScheduled}
                  disabled={!canSchedule}
                  name="deliveryChoice"
                  onChange={chooseSchedule}
                  type="radio"
                />
                <span><CalendarClock aria-hidden="true" /></span>
                <span>
                  <strong>{isScheduled ? 'Choose a new time' : 'Schedule for later'}</strong>
                  <small>Deliver at a specific date and time in America/New_York.</small>
                </span>
              </label>
            </fieldset>

            {choice === 'schedule' || isScheduled ? (
              <label className="email-stage__field">
                <span>Delivery date and time</span>
                <input
                   disabled={!canSchedule}
                   min={minimumSchedule}
                  onChange={(event) => {
                    setScheduleDraft(event.target.value)
                    setChoice('schedule')
                    setMessage(null)
                    setState('idle')
                   }}
                   onFocus={() => {
                     if (!minimumSchedule) chooseSchedule()
                   }}
                  type="datetime-local"
                  value={scheduledValue}
                />
                <small>Eastern Time (America/New_York). Daylight saving time is handled automatically.</small>
              </label>
            ) : null}

            <Button
              buttonStyle="primary"
              disabled={
                state === 'submitting' ||
                !hasCurrentTest ||
                !hasReadiness ||
                (effectiveChoice === 'sendNow' ? !canSendNow : !canSchedule)
              }
              onClick={prepareConfirmation}
              type="button"
            >
              {effectiveChoice === 'sendNow' ? 'Review Send Now' : 'Review Schedule'}
            </Button>
          </section>

          <aside className="email-stage__panel email-stage__delivery-summary">
            <div className="email-stage__section-heading">
              <div>
                <h2>Approved campaign</h2>
                <p>Rechecked again when you confirm.</p>
              </div>
              <ShieldCheck aria-hidden="true" />
            </div>
            <dl className="email-stage__summary-list">
              <div><dt>Subject</dt><dd>{workflow?.email.subject || 'Missing subject'}</dd></div>
              <div><dt>Audience</dt><dd>{audience?.listName || 'No audience'}</dd></div>
              <div><dt>Eligible recipients</dt><dd>{(audience?.eligible || 0).toLocaleString()}</dd></div>
              <div>
                <dt>Test status</dt>
                <dd className={hasCurrentTest ? 'email-stage__success-text' : ''}>
                  {hasCurrentTest ? <CheckCircle2 aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
                  {hasCurrentTest ? 'Current version tested' : 'Test required'}
                </dd>
              </div>
            </dl>
            <div className="email-stage__delivery-note">
              <UsersRound aria-hidden="true" />
              <p>
                Confirmation freezes this content and candidate audience. Suppressions are checked once more at execution.
              </p>
            </div>
          </aside>
        </div>

        {workflow?.delivery.requiresScheduleConfirmation ? (
          <div className="email-stage__notice" data-state="warning">
            This legacy schedule has no valid immutable snapshot. Review and reconfirm it before delivery.
          </div>
        ) : null}
      </main>

      {pending ? (
        <DeliveryConfirmationDialog
          audienceName={audience?.listName || 'Selected audience'}
          onCancel={() => setPending(null)}
          onConfirm={() => void confirmDelivery()}
          pending={pending}
          recipientCount={audience?.eligible || 0}
          submitting={state === 'submitting'}
          title={workflow?.email.subject || title}
        />
      ) : null}
    </EmailCampaignShell>
  )
}
