'use client'

import { Banner, Button, Gutter, useConfig } from '@payloadcms/ui'
import { formatAdminURL } from 'payload/shared'
import React, { useCallback, useEffect, useMemo, useState } from 'react'

import '../email-center/email-center.scss'

type EmailSettings = {
  emailList: string | number | null
  preheader: string
  recipientEmail: string
  replyTo: string
  scheduledAt: string
  subject: string
  title: string
}

type EmailListOption = {
  id: string
  name: string
}

function toDateTimeLocal(value: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60 * 1000)
  return local.toISOString().slice(0, 16)
}

function fromDateTimeLocal(value: string) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

export function EmailAudienceViewClient({
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
  const [settings, setSettings] = useState<EmailSettings | null>(null)
  const [lists, setLists] = useState<EmailListOption[]>([])
  const [status, setStatus] = useState<'error' | 'idle' | 'loading' | 'saved' | 'saving'>('loading')
  const [message, setMessage] = useState<string | null>(null)
  const baseURL = useMemo(() => formatAdminURL({ adminRoute, path: `/collections/emails/${emailId}` }), [adminRoute, emailId])
  const reviewURL = `${baseURL}/review`

  const loadSettings = useCallback(async () => {
    setStatus('loading')
    setMessage(null)
    try {
      const res = await fetch(`/api/emails/${emailId}/settings`, { cache: 'no-store' })
      if (!res.ok) throw new Error(await res.text())
      const payload = (await res.json()) as { email: EmailSettings; lists: EmailListOption[] }
      setSettings({
        ...payload.email,
        emailList: payload.email.emailList ? String(payload.email.emailList) : '',
        scheduledAt: toDateTimeLocal(payload.email.scheduledAt),
      })
      setLists(payload.lists)
      setStatus('idle')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Unable to load audience settings')
    }
  }, [emailId])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  async function saveSettings(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    if (!settings) return false

    setStatus('saving')
    setMessage(null)

    try {
      const res = await fetch(`/api/emails/${emailId}/settings`, {
        body: JSON.stringify({
          ...settings,
          scheduledAt: fromDateTimeLocal(settings.scheduledAt),
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'PATCH',
      })

      if (!res.ok) throw new Error(await res.text())
      setStatus('saved')
      setMessage('Audience settings saved.')
      return true
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Unable to save audience settings')
      return false
    }
  }

  async function saveAndContinue() {
    const saved = await saveSettings()
    if (saved) {
      window.location.href = reviewURL
    }
  }

  function updateField(field: keyof EmailSettings, value: string) {
    setSettings((current) => current ? { ...current, [field]: value } : current)
    if (status === 'saved') {
      setStatus('idle')
      setMessage(null)
    }
  }

  return (
    <Gutter className="email-flow">
      <div className="email-flow__header">
        <p className="email-flow__eyebrow">Audience</p>
        <h1>{title}</h1>
        <p>Set the subject line, test recipient, audience list, and send timing before review.</p>
      </div>

      {message ? <Banner type={status === 'error' ? 'error' : 'success'}>{message}</Banner> : null}

      <form className="email-flow__panel email-flow__form-grid" onSubmit={(event) => void saveSettings(event)}>
        {!settings ? (
          <p>{status === 'loading' ? 'Loading audience settings...' : 'No settings found.'}</p>
        ) : (
          <>
            <label className="email-flow__field email-flow__field--wide">
              <span>Subject line</span>
              <input
                onChange={(event) => updateField('subject', event.target.value)}
                placeholder="Your latest update"
                type="text"
                value={settings.subject}
              />
            </label>
            <label className="email-flow__field email-flow__field--wide">
              <span>Preheader</span>
              <textarea
                onChange={(event) => updateField('preheader', event.target.value)}
                placeholder="Short preview text shown in inboxes"
                rows={3}
                value={settings.preheader}
              />
            </label>
            <label className="email-flow__field">
              <span>Test recipient email</span>
              <input
                onChange={(event) => updateField('recipientEmail', event.target.value)}
                placeholder="name@example.com"
                type="email"
                value={settings.recipientEmail}
              />
            </label>
            <label className="email-flow__field">
              <span>Reply-to email</span>
              <input
                onChange={(event) => updateField('replyTo', event.target.value)}
                placeholder="reply@example.com"
                type="email"
                value={settings.replyTo}
              />
            </label>
            <label className="email-flow__field">
              <span>Audience list</span>
              <select
                onChange={(event) => updateField('emailList', event.target.value)}
                value={settings.emailList ? String(settings.emailList) : ''}
              >
                <option value="">Select an audience</option>
                {lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="email-flow__field">
              <span>Scheduled send time</span>
              <input
                onChange={(event) => updateField('scheduledAt', event.target.value)}
                type="datetime-local"
                value={settings.scheduledAt}
              />
            </label>
            <div className="email-flow__actions email-flow__field--wide">
              <Button buttonStyle="secondary" disabled={status === 'saving'} type="submit">
                {status === 'saving' ? 'Saving...' : 'Save audience settings'}
              </Button>
              <Button buttonStyle="primary" disabled={status === 'saving'} onClick={() => void saveAndContinue()} type="button">
                Save and review
              </Button>
            </div>
          </>
        )}
      </form>
    </Gutter>
  )
}
