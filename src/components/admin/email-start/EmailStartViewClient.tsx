'use client'

import { Banner, Button, Gutter, useConfig } from '@payloadcms/ui'
import { formatAdminURL } from 'payload/shared'
import React, { useMemo, useRef, useState } from 'react'

import '../email-center/email-center.scss'

export function EmailStartViewClient() {
  const {
    config: {
      routes: { admin: adminRoute },
    },
  } = useConfig()
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState<'error' | 'idle' | 'saving'>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const starting = useRef(false)
  const emailsURL = useMemo(() => formatAdminURL({ adminRoute, path: '/collections/emails' }), [adminRoute])

  async function startCampaign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (starting.current) return
    starting.current = true
    setStatus('saving')
    setMessage(null)

    try {
      const res = await fetch('/api/emails/start', {
        body: JSON.stringify({ title }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      })

      if (!res.ok) throw new Error(await res.text())
      const payload = (await res.json()) as { adminUrl?: string }
      window.location.href = payload.adminUrl || emailsURL
    } catch (error) {
      starting.current = false
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Unable to create email campaign')
    }
  }

  return (
    <Gutter className="email-flow">
      <div className="email-flow__narrow">
        <div className="email-flow__header">
          <h1>Start a campaign</h1>
        </div>

        {message ? <Banner type={status === 'error' ? 'error' : 'info'}>{message}</Banner> : null}

        <form className="email-flow__panel" onSubmit={(event) => void startCampaign(event)}>
          <label className="email-flow__field">
            <span>Internal campaign name</span>
            <input
              autoFocus
              onChange={(event) => setTitle(event.target.value)}
              placeholder="March district update"
              required
              type="text"
              value={title}
            />
            <small>Staff see this name in the campaign list. Set the subject in Compose.</small>
          </label>

          <div className="email-flow__actions">
            <Button buttonStyle="primary" disabled={status === 'saving'} type="submit">
              {status === 'saving' ? 'Creating…' : 'Create draft & compose'}
            </Button>
            <Button buttonStyle="secondary" el="link" to={emailsURL} type="button">
              Back to campaigns
            </Button>
          </div>
        </form>
        <section className="email-flow__panel">
          <h2>Start from a previous campaign</h2>
          <p>Open a previous campaign and choose Duplicate Campaign to copy it into a new draft.</p>
          <a href={emailsURL}>Browse campaigns</a>
        </section>
      </div>
    </Gutter>
  )
}
