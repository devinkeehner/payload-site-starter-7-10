'use client'

import { Button, useConfig } from '@payloadcms/ui'
import { ArrowRight, CheckCircle2, UsersRound } from 'lucide-react'
import { formatAdminURL } from 'payload/shared'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { EmailCampaignShell } from './EmailCampaignShell'
import { useEmailWorkflow } from './useEmailWorkflow'

type EmailSettings = {
  emailList: string
}

type EmailListOption = {
  active: number
  bounced: number
  contactBlocked: number
  doNotContact: number
  duplicates: number
  eligible: number
  id: string
  inactive: number
  invalid: number
  name: string
  total: number
  unsubscribed: number
}

type SettingsResponse = {
  email: { emailList: string | number | null }
  lists: EmailListOption[]
}

function normalizeList(list: Partial<EmailListOption> & Pick<EmailListOption, 'id' | 'name'>): EmailListOption {
  return {
    active: list.active || 0,
    bounced: list.bounced || 0,
    contactBlocked: list.contactBlocked || 0,
    doNotContact: list.doNotContact || 0,
    duplicates: list.duplicates || 0,
    eligible: list.eligible ?? list.active ?? 0,
    id: String(list.id),
    inactive: list.inactive || 0,
    invalid: list.invalid || 0,
    name: list.name || 'Untitled audience',
    total: list.total || 0,
    unsubscribed: list.unsubscribed || 0,
  }
}

export function EmailAudienceStageViewClient({
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
  const { error: workflowError, isLoading: workflowLoading, refresh: refreshWorkflow, workflow } = useEmailWorkflow(emailId)
  const [settings, setSettings] = useState<EmailSettings | null>(null)
  const [lists, setLists] = useState<EmailListOption[]>([])
  const [state, setState] = useState<'error' | 'idle' | 'loading' | 'saved' | 'saving'>('loading')
  const [message, setMessage] = useState<string | null>(null)
  const loadVersion = useRef(0)
  const reviewURL = useMemo(
    () => `${formatAdminURL({ adminRoute, path: `/collections/emails/${emailId}` })}/review`,
    [adminRoute, emailId],
  )
  const selectedList = useMemo(
    () => lists.find((list) => list.id === settings?.emailList) || null,
    [lists, settings?.emailList],
  )
  const editingLocked = workflow?.email.readOnly || false

  const loadSettings = useCallback(async () => {
    const version = ++loadVersion.current

    try {
      const response = await fetch(`/api/emails/${encodeURIComponent(emailId)}/settings`, {
        cache: 'no-store',
        credentials: 'include',
      })
      if (!response.ok) throw new Error(await response.text())
      const payload = await response.json() as SettingsResponse
      if (loadVersion.current !== version) return

      setSettings({
        emailList: payload.email.emailList ? String(payload.email.emailList) : '',
      })
      setLists(payload.lists.map(normalizeList))
      setState('idle')
    } catch (loadError) {
      if (loadVersion.current !== version) return
      setState('error')
      setMessage(loadError instanceof Error ? loadError.message : 'Unable to load audiences')
    }
  }, [emailId])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  async function saveAudience({ continueAfterSave = false } = {}) {
    if (!settings || editingLocked) return

    setState('saving')
    setMessage(null)

    try {
      const response = await fetch(`/api/emails/${encodeURIComponent(emailId)}/settings`, {
        body: JSON.stringify({
          emailList: settings.emailList || null,
        }),
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'PATCH',
      })
      if (!response.ok) throw new Error(await response.text())

      await refreshWorkflow({ quiet: true })
      setState('saved')
      setMessage('Audience saved. Eligibility was recalculated.')
      if (continueAfterSave) window.location.assign(reviewURL)
    } catch (saveError) {
      setState('error')
      setMessage(saveError instanceof Error ? saveError.message : 'Unable to save audience')
    }
  }

  function selectAudience(value: string) {
    setSettings((current) => current ? { ...current, emailList: value } : current)
    setState('idle')
    setMessage(null)
  }

  const audience = selectedList || workflow?.audience || null
  const audienceName = selectedList?.name || workflow?.audience?.listName || 'Audience summary'
  const excluded = audience ? Math.max(0, audience.total - audience.eligible) : 0

  return (
    <EmailCampaignShell
      activeStage="audience"
      description="Choose who should receive this campaign. Counts reflect final eligibility rules."
      emailId={emailId}
      error={workflowError}
      isLoading={workflowLoading}
      title={title}
      workflow={workflow}
    >
      <main className="email-stage email-stage--audience">
        {editingLocked ? (
          <div className="email-stage__notice" data-state="info">
            This campaign is {workflow?.email.status}. Its approved audience is locked.
          </div>
        ) : null}

        {message ? (
          <div aria-live="polite" className="email-stage__notice" data-state={state === 'error' ? 'error' : 'success'}>
            {message}
          </div>
        ) : null}

        <section className="email-stage__panel email-stage__panel--audience-picker">
          <div className="email-stage__section-heading">
            <div>
              <h2>Audience list</h2>
              <p>Select one list for this site. Suppressed and invalid contacts are excluded automatically.</p>
            </div>
            <UsersRound aria-hidden="true" />
          </div>

          {settings ? (
            <label className="email-stage__field">
              <span>Send to</span>
              <select
                disabled={editingLocked || state === 'saving'}
                onChange={(event) => selectAudience(event.target.value)}
                value={settings.emailList}
              >
                <option value="">Select an audience</option>
                {lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name} — {list.eligible.toLocaleString()} eligible
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="email-stage__muted">{state === 'loading' ? 'Loading available audiences…' : 'No audience settings found.'}</p>
          )}
        </section>

        <section className="email-stage__panel email-stage__panel--audience-summary" aria-live="polite">
          <div className="email-stage__section-heading">
            <div>
              <h2>{audienceName}</h2>
              <p>Exact eligible and excluded counts used by the delivery service.</p>
            </div>
            {audience ? <CheckCircle2 aria-hidden="true" /> : null}
          </div>

          {audience ? (
            <>
              <div className="email-stage__audience-total">
                <div>
                  <strong>{audience.eligible.toLocaleString()}</strong>
                  <span>Eligible recipients</span>
                </div>
                <div>
                  <strong>{excluded.toLocaleString()}</strong>
                  <span>Excluded</span>
                </div>
                <div>
                  <strong>{audience.total.toLocaleString()}</strong>
                  <span>Total contacts</span>
                </div>
              </div>

              <details className="email-stage__exclusions">
                <summary>See exclusion details</summary>
                <dl>
                  <div><dt>Unsubscribed</dt><dd>{audience.unsubscribed.toLocaleString()}</dd></div>
                  <div><dt>Bounced</dt><dd>{audience.bounced.toLocaleString()}</dd></div>
                  <div><dt>Do not contact</dt><dd>{audience.doNotContact.toLocaleString()}</dd></div>
                  <div><dt>Inactive</dt><dd>{audience.inactive.toLocaleString()}</dd></div>
                  <div><dt>Invalid address</dt><dd>{audience.invalid.toLocaleString()}</dd></div>
                  <div><dt>Contact blocked</dt><dd>{audience.contactBlocked.toLocaleString()}</dd></div>
                  <div><dt>Duplicates</dt><dd>{audience.duplicates.toLocaleString()}</dd></div>
                </dl>
              </details>
            </>
          ) : (
            <p className="email-stage__empty">Choose an audience to review its eligibility.</p>
          )}
        </section>

        <footer className="email-stage__footer">
          <Button
            buttonStyle="secondary"
            disabled={!settings?.emailList || editingLocked || state === 'saving'}
            onClick={() => void saveAudience()}
            type="button"
          >
            {state === 'saving' ? 'Saving…' : 'Save audience'}
          </Button>
          <Button
            buttonStyle="primary"
            disabled={!settings?.emailList || editingLocked || state === 'saving'}
            onClick={() => void saveAudience({ continueAfterSave: true })}
            type="button"
          >
            Continue to Review & Test
            <ArrowRight aria-hidden="true" />
          </Button>
        </footer>
      </main>
    </EmailCampaignShell>
  )
}
