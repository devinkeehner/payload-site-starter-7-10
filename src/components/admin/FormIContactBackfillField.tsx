'use client'

import React, { useState } from 'react'
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

const readIdField = (fields: unknown): string | undefined => {
  const map = asFormFields(fields)
  const fromId = map.id?.value ?? map.id?.initialValue
  if (typeof fromId === 'string') return fromId
  const fromUnderscoreId = map._id?.value ?? map._id?.initialValue
  if (typeof fromUnderscoreId === 'string') return fromUnderscoreId
  return undefined
}

const deriveIdFromPath = (): string | undefined => {
  if (typeof window === 'undefined') return undefined
  try {
    const parts = window.location.pathname.split('/').filter(Boolean)
    const i = parts.findIndex((p) => p === 'collections')
    if (i !== -1 && parts[i + 2] && parts[i + 2] !== 'create') return parts[i + 2]
  } catch {}
  return undefined
}

const FormIContactBackfillField: React.FC = () => {
  const docInfo = useDocumentInfo() as { id?: string } | null
  const infoId = docInfo?.id
  const fieldId = useFormFields(([fields]) => readIdField(fields))
  const resolvedId = infoId || fieldId || deriveIdFromPath()

  const [maxToProcess, setMaxToProcess] = useState('500')
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState('')

  const runBackfill = async () => {
    if (!resolvedId) {
      setStatus('Save this form first before running backfill.')
      return
    }

    const maxParsed = Number.parseInt(maxToProcess, 10)
    const max = Number.isFinite(maxParsed) && maxParsed > 0 ? maxParsed : 500

    setRunning(true)
    setStatus('')
    try {
      const res = await fetch(`/api/forms/${resolvedId}/icontact-backfill`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxToProcess: max }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`)
      setStatus(
        `Backfill complete. Scanned ${data?.scanned ?? 0}, candidates ${data?.candidates ?? 0}, changed ${data?.changedCount ?? 0}, failed ${data?.failedCount ?? 0}.`,
      )
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Backfill failed.')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <label style={{ display: 'grid', gap: 6 }}>
        <span>Max unsynced submissions to process</span>
        <input
          type="number"
          min={1}
          max={5000}
          value={maxToProcess}
          onChange={(e) => setMaxToProcess(e.target.value)}
        />
      </label>
      <Button onClick={runBackfill} buttonStyle="primary" size="small" disabled={running || !resolvedId}>
        {running ? 'Transferring…' : 'Transfer Unsynced Emails'}
      </Button>
      {status ? <small>{status}</small> : null}
    </div>
  )
}

export { FormIContactBackfillField }
