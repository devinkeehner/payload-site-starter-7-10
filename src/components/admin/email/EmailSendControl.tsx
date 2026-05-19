'use client'

import React, { useState } from 'react'
import { Button, useDocumentInfo, useFormModified } from '@payloadcms/ui'

export function EmailSendControl() {
  const { id } = useDocumentInfo()
  const isModified = useFormModified()
  const [status, setStatus] = useState<'idle' | 'creatingPost' | 'sending' | 'sent' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  if (!id) return null

  async function sendTestEmail() {
    if (!id || isModified) return

    setStatus('sending')
    setMessage(null)

    try {
      const res = await fetch(`/api/emails/${id}/send-test`, {
        method: 'POST',
      })

      if (!res.ok) throw new Error(await res.text())
      const payload = (await res.json()) as { message?: string }
      setStatus('sent')
      setMessage(payload.message || 'Test email sent successfully.')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Unable to send test email')
    }
  }

  async function createPost() {
    if (!id || isModified) return

    setStatus('creatingPost')
    setMessage(null)

    try {
      const res = await fetch(`/api/emails/${id}/create-post`, {
        method: 'POST',
      })

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
      setMessage(error instanceof Error ? error.message : 'Unable to create post')
    }
  }

  return (
    <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button
          buttonStyle="primary"
          disabled={isModified || status === 'sending' || status === 'creatingPost'}
          onClick={() => void sendTestEmail()}
          size="small"
          type="button"
        >
          {status === 'sending' ? 'Sending...' : 'Send Test Email'}
        </Button>
        <Button
          buttonStyle="secondary"
          disabled={isModified || status === 'sending' || status === 'creatingPost'}
          onClick={() => void createPost()}
          size="small"
          type="button"
        >
          {status === 'creatingPost' ? 'Creating...' : 'Create Post Draft'}
        </Button>
      </div>
      <div style={{ color: status === 'error' ? 'var(--theme-error-500)' : 'var(--theme-elevation-600)', fontSize: 12 }}>
        {isModified ? 'Save changes before sending a test or creating a post.' : message}
      </div>
    </div>
  )
}
