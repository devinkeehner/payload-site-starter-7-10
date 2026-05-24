'use client'

import { Banner, Button, Gutter, useConfig } from '@payloadcms/ui'
import { formatAdminURL } from 'payload/shared'
import React, { useMemo, useState } from 'react'

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
  const emailsURL = useMemo(() => formatAdminURL({ adminRoute, path: '/collections/emails' }), [adminRoute])

  async function startCampaign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
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
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Unable to create email campaign')
    }
  }

  return (
    <Gutter className="email-flow">
      <div className="email-flow__narrow">
        <div className="email-flow__header">
          <p className="email-flow__eyebrow">Email Marketing</p>
          <h1>Start an email campaign</h1>
          <p>Name the campaign first. The builder opens next so the content work starts immediately.</p>
        </div>

        {message ? <Banner type={status === 'error' ? 'error' : 'info'}>{message}</Banner> : null}

        <form className="email-flow__panel" onSubmit={(event) => void startCampaign(event)}>
          <label className="email-flow__field">
            <span>Email name</span>
            <input
              autoFocus
              onChange={(event) => setTitle(event.target.value)}
              placeholder="March district update"
              required
              type="text"
              value={title}
            />
          </label>

          <div className="email-flow__actions">
            <Button buttonStyle="primary" disabled={status === 'saving'} type="submit">
              {status === 'saving' ? 'Creating...' : 'Create and open builder'}
            </Button>
            <Button buttonStyle="secondary" el="link" to={emailsURL} type="button">
              Back to emails
            </Button>
          </div>
        </form>
      </div>
    </Gutter>
  )
}
