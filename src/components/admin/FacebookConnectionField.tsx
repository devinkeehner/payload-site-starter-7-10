'use client'

import React, { useMemo, useState } from 'react'
import { Button, useDocumentInfo, useFormFields } from '@payloadcms/ui'

type FieldState = {
  value?: unknown
  initialValue?: unknown
}

type FormFields = Record<string, FieldState | undefined> & {
  _id?: FieldState
}

const asFormFields = (fields: unknown): FormFields =>
  (typeof fields === 'object' && fields !== null ? (fields as FormFields) : {})

const getFieldString = (field?: FieldState): string | undefined => {
  const value = field?.value ?? field?.initialValue
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

const readIdField = (fields: unknown): string | undefined => {
  const map = asFormFields(fields)
  return getFieldString(map.id) || getFieldString(map._id)
}

const deriveIdFromPath = (): string | undefined => {
  if (typeof window === 'undefined') return undefined
  try {
    const parts = window.location.pathname.split('/').filter(Boolean)
    const i = parts.findIndex((part) => part === 'collections')
    if (i !== -1 && parts[i + 2] && parts[i + 2] !== 'create') return parts[i + 2]
  } catch {
    // no-op
  }
  return undefined
}

const FacebookConnectionField: React.FC = () => {
  const docInfo = useDocumentInfo() as { id?: string } | null
  const fieldId = useFormFields(([fields]) => readIdField(fields))
  const status = useFormFields(([fields]) => getFieldString(asFormFields(fields).facebookConnectionStatus))
  const pageName = useFormFields(([fields]) => getFieldString(asFormFields(fields).facebookPageName))
  const pageId = useFormFields(([fields]) => getFieldString(asFormFields(fields).facebookPageId))
  const connectedAt = useFormFields(([fields]) => getFieldString(asFormFields(fields).facebookConnectedAt))
  const lastError = useFormFields(([fields]) => getFieldString(asFormFields(fields).facebookLastError))

  const resolvedId = docInfo?.id || fieldId || deriveIdFromPath()
  const [disconnecting, setDisconnecting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const connectUrl = useMemo(() => {
    if (!resolvedId || typeof window === 'undefined') return ''
    const params = new URLSearchParams({
      repInfoId: resolvedId,
      returnTo: `${window.location.pathname}${window.location.search}`,
    })
    return `/api/facebook/oauth/start?${params.toString()}`
  }, [resolvedId])

  const connectionLabel = status === 'connected' && pageId
    ? `Connected${pageName ? ` to ${pageName}` : ''}`
    : 'Not connected'

  const disconnect = async () => {
    if (!resolvedId) return
    setDisconnecting(true)
    setMessage(null)
    try {
      const response = await fetch('/api/facebook/disconnect', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repInfoId: resolvedId }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || `Disconnect failed (${response.status})`)
      window.location.reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Disconnect failed.')
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 10, padding: '14px 0' }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <strong>Facebook feed connection</strong>
        <span>{connectionLabel}</span>
        {pageId ? <small>Page ID: {pageId}</small> : null}
        {connectedAt ? <small>Connected: {new Date(connectedAt).toLocaleString()}</small> : null}
        {lastError ? <small style={{ color: 'var(--theme-error-500)' }}>{lastError}</small> : null}
        {!resolvedId ? <small>Save this Rep & District Settings document before connecting Facebook.</small> : null}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button
          buttonStyle="primary"
          size="small"
          disabled={!resolvedId || !connectUrl}
          onClick={() => {
            if (connectUrl) window.location.href = connectUrl
          }}
        >
          {status === 'connected' ? 'Reconnect Facebook' : 'Connect Facebook'}
        </Button>
        <Button
          buttonStyle="secondary"
          size="small"
          disabled={!resolvedId || status !== 'connected' || disconnecting}
          onClick={disconnect}
        >
          {disconnecting ? 'Disconnecting...' : 'Disconnect'}
        </Button>
      </div>
      {message ? <small>{message}</small> : null}
    </div>
  )
}

export { FacebookConnectionField }
