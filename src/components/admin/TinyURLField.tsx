'use client'
import React, { useEffect, useRef, useState } from 'react'
import type { TextFieldClientProps } from 'payload'
import { Button, FieldLabel, TextInput, useDocumentInfo, useField } from '@payloadcms/ui'

export const TinyURLField: React.FC<TextFieldClientProps> = ({ field, path, readOnly }) => {
  const { value, setValue } = useField<string>({ path: path || field.name })
  const { id } = useDocumentInfo()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [shortURL, setShortURL] = useState('')
  const touched = useRef(false)
  const collection = () => window.location.pathname.split('/collections/')[1]?.split('/')[0]
  useEffect(() => {
    if (!id) return
    const slug = window.location.pathname.split('/collections/')[1]?.split('/')[0]
    if (!['posts', 'pages'].includes(slug || '')) return
    const controller = new AbortController()
    void fetch(`/api/${slug}/${encodeURIComponent(String(id))}/short-link`, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json()
        if (response.ok && result.links?.length) {
          setShortURL(result.links[0].shortURL || '')
          if (!touched.current) setValue(result.links[0].alias || '')
          setStatus(
            result.links
              .map(
                (link: { alias: string; syncError?: string }) =>
                  `${link.alias}${link.syncError ? `: ${link.syncError}` : ''}`,
              )
              .join(' · '),
          )
        }
      })
      .catch(() => {})
    return () => controller.abort()
  }, [id, setValue])
  const create = async () => {
    setBusy(true)
    setStatus('')
    setShortURL('')
    try {
      const slug = collection()
      if (!id || !['posts', 'pages'].includes(slug || ''))
        throw new Error('Save and publish the content first.')
      const response = await fetch(`/api/${slug}/${encodeURIComponent(String(id))}/short-link`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias: value }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to create the short link.')
      setValue(result.alias)
      setShortURL(result.shortURL)
      setStatus('Short link ready. Existing aliases continue pointing to this published content.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to create the short link.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="field-type text">
      <FieldLabel label={field.label} htmlFor={`field-${path || field.name}`} />
      <TextInput
        path={path || field.name}
        value={value || ''}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
          touched.current = true
          setValue(event.target.value)
        }}
        readOnly={Boolean(readOnly || busy)}
      />
      <p>
        <small>
          Creates a link to the saved, published public URL. Publish slug changes before syncing.
          Draft and preview links are never shortened.
        </small>
      </p>
      <Button type="button" size="small" disabled={busy || Boolean(readOnly)} onClick={create}>
        {busy ? 'Preparing…' : 'Create / sync short link'}
      </Button>
      {shortURL && (
        <div style={{ marginTop: 8 }}>
          <label>
            Short URL
            <input
              aria-label="Short URL"
              type="text"
              readOnly
              value={shortURL}
              onFocus={(event) => event.currentTarget.select()}
              style={{ width: '100%' }}
            />
          </label>
          <Button
            type="button"
            size="small"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(shortURL)
                setStatus('Short URL copied.')
              } catch {
                setStatus('Select and copy the short URL above.')
              }
            }}
          >
            Copy short URL
          </Button>
        </div>
      )}
      {status && (
        <p role="status">
          <small>{status}</small>
        </p>
      )}
    </div>
  )
}

export const TinyURLImportField: React.FC = () => {
  const { id } = useDocumentInfo()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const run = async () => {
    setBusy(true)
    setStatus('')
    try {
      if (!id) throw new Error('Save the Site Profile and domain before importing.')
      const response = await fetch(
        `/api/rep-info/${encodeURIComponent(String(id))}/import-short-links`,
        { method: 'POST', credentials: 'include' },
      )
      const result = await response.json()
      if (!response.ok)
        throw new Error(
          result.error || 'Import stopped. Retry to resume; completed records remain available.',
        )
      setStatus(
        `Imported ${result.imported} links from ${result.domain}. Open Short Links to review and edit them.`,
      )
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Import stopped. Retry to resume.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div>
      <p>
        Save the existing TinyURL domain above, then import its active and archived links. Import
        reads TinyURL and updates the local list; it does not change remote links.
      </p>
      <Button type="button" onClick={run} disabled={busy} size="small">
        {busy ? 'Importing…' : 'Import all domain links'}
      </Button>
      {status && <p role="status">{status}</p>}
    </div>
  )
}
