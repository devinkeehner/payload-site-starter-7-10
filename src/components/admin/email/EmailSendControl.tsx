'use client'

import React, { useEffect, useState } from 'react'
import { Button, useDocumentInfo, useFormModified } from '@payloadcms/ui'

type PreparedTest = {
  activeRecipientCount: 1
  clientFolderId: string
  listId: string
  listName: string
  message: string
  recipientEmail: string
}

export function EmailSendControl() {
  const { id } = useDocumentInfo()
  const isModified = useFormModified()
  const [status, setStatus] = useState<'idle' | 'creatingPost' | 'verifying' | 'verified' | 'sending' | 'sendingProduction' | 'sent' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [preparedTest, setPreparedTest] = useState<PreparedTest | null>(null)

  useEffect(() => {
    if (isModified) setPreparedTest(null)
  }, [isModified])

  if (!id) return null

  async function verifyTestRecipient() {
    if (!id || isModified) return

    setStatus('verifying')
    setMessage(null)
    setPreparedTest(null)

    try {
      const res = await fetch(`/api/emails/${id}/send-test`, {
        body: JSON.stringify({ dryRun: true }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })

      if (!res.ok) throw new Error(await res.text())
      const payload = (await res.json()) as PreparedTest
      if (payload.activeRecipientCount !== 1) {
        throw new Error(`Safety check returned ${payload.activeRecipientCount} recipients instead of exactly one.`)
      }
      setPreparedTest(payload)
      setStatus('verified')
      setMessage(payload.message)
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Unable to verify the test recipient')
    }
  }

  async function sendTestEmail() {
    if (!id || isModified || !preparedTest) return
    if (!window.confirm(
      `Send one test email to ${preparedTest.recipientEmail}?\n\nVerified iContact list: ${preparedTest.listName}\nActive recipients: exactly 1`,
    )) return

    setStatus('sending')
    setMessage(null)

    try {
      const res = await fetch(`/api/emails/${id}/send-test`, {
        body: JSON.stringify({ preparedListId: preparedTest.listId }),
        headers: { 'Content-Type': 'application/json' },
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

  async function sendProductionEmail() {
    if (!id || isModified) return
    if (!window.confirm('Send this email to the selected iContact audience list? This creates a production iContact send.')) return

    setStatus('sendingProduction')
    setMessage(null)

    try {
      const res = await fetch(`/api/emails/${id}/send`, {
        method: 'POST',
      })

      if (!res.ok) throw new Error(await res.text())
      const payload = (await res.json()) as { message?: string; recipientCount?: number }
      setStatus('sent')
      setMessage(payload.message || 'Production email queued for sending.')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Unable to send production email')
    }
  }

  const busy = status === 'verifying' || status === 'sending' || status === 'creatingPost' || status === 'sendingProduction'

  return (
    <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button
          buttonStyle="primary"
          disabled={isModified || busy}
          onClick={() => void verifyTestRecipient()}
          size="small"
          type="button"
        >
          {status === 'verifying' ? 'Verifying...' : 'Dry Run: Verify 1 Recipient'}
        </Button>
        <Button
          buttonStyle="secondary"
          disabled={isModified || busy || !preparedTest}
          onClick={() => void sendTestEmail()}
          size="small"
          type="button"
        >
          {status === 'sending' ? 'Sending...' : 'Send Test Email'}
        </Button>
        <Button
          buttonStyle="secondary"
          disabled={isModified || busy}
          onClick={() => void createPost()}
          size="small"
          type="button"
        >
          {status === 'creatingPost' ? 'Creating...' : 'Create Post Draft'}
        </Button>
        <Button
          buttonStyle="secondary"
          disabled={isModified || busy}
          onClick={() => void sendProductionEmail()}
          size="small"
          type="button"
        >
          {status === 'sendingProduction' ? 'Sending Campaign...' : 'Send Campaign'}
        </Button>
      </div>
      <div style={{ color: status === 'error' ? 'var(--theme-error-500)' : 'var(--theme-elevation-600)', fontSize: 12 }}>
        {isModified
          ? 'Save changes before verifying a recipient, sending a test, or creating a post.'
          : message || (!preparedTest ? 'Run the dry run before sending a test email.' : null)}
      </div>
    </div>
  )
}
