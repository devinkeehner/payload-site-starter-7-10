'use client'

import { ChevronDown, Mail, Save } from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { EmailWorkflowResponse } from '@/lib/email/workflowTypes'

import { createCoalescedSaveQueue } from './coalescedSaveQueue'
import { registerEmailComposeSettingsFlusher } from './emailComposeSettingsBridge'

type MessageSettings = {
  preheader: string
  replyTo: string
  subject: string
}

export function EmailComposeMessageSettings({
  emailId,
  workflow,
}: {
  emailId: string
  workflow: EmailWorkflowResponse | null
}) {
  const [settings, setSettings] = useState<MessageSettings | null>(null)
  const [dirty, setDirty] = useState(false)
  const [state, setState] = useState<'error' | 'idle' | 'loading' | 'saved' | 'saving'>('loading')
  const [message, setMessage] = useState<string | null>(null)
  const settingsRef = useRef<MessageSettings | null>(null)
  const localVersionRef = useRef(0)
  const savedStatusTimerRef = useRef<number | null>(null)
  const readOnly = workflow?.email.readOnly || false
  const saveQueue = useMemo(
    () => createCoalescedSaveQueue<MessageSettings>(async (snapshot) => {
      const response = await fetch(`/api/emails/${encodeURIComponent(emailId)}/settings`, {
        body: JSON.stringify(snapshot),
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'PATCH',
      })
      if (!response.ok) throw new Error(await response.text())
    }),
    [emailId],
  )

  useEffect(() => {
    let active = true
    settingsRef.current = null
    localVersionRef.current = 0

    void fetch(`/api/emails/${encodeURIComponent(emailId)}/settings`, {
      cache: 'no-store',
      credentials: 'include',
    }).then(async (response) => {
      if (!response.ok) throw new Error(await response.text())
      return response.json() as Promise<{ email: MessageSettings }>
    }).then(
      (payload) => {
        if (!active) return
        const loadedSettings = {
          preheader: payload.email.preheader || '',
          replyTo: payload.email.replyTo || '',
          subject: payload.email.subject || '',
        }
        settingsRef.current = loadedSettings
        setSettings(loadedSettings)
        setDirty(false)
        setState('idle')
      },
      (loadError: unknown) => {
        if (!active) return
        setState('error')
        setMessage(loadError instanceof Error ? loadError.message : 'Unable to load message settings')
      },
    )

    return () => {
      active = false
    }
  }, [emailId])

  useEffect(() => () => {
    if (savedStatusTimerRef.current !== null) {
      window.clearTimeout(savedStatusTimerRef.current)
    }
  }, [])

  const saveSettings = useCallback(async (): Promise<boolean> => {
    if (!settingsRef.current || readOnly || !saveQueue.isDirty()) return true

    setState('saving')
    setMessage(null)

    try {
      await saveQueue.flush()
      const savedVersion = saveQueue.getSavedVersion()
      const isCurrent = !saveQueue.isDirty()

      setDirty(!isCurrent)
      if (isCurrent) {
        setState('saved')
        if (savedStatusTimerRef.current !== null) {
          window.clearTimeout(savedStatusTimerRef.current)
        }
        savedStatusTimerRef.current = window.setTimeout(() => {
          if (saveQueue.getSavedVersion() === savedVersion && !saveQueue.isDirty()) {
            setState('idle')
          }
        }, 1800)
      }
      return isCurrent
    } catch (saveError) {
      setDirty(saveQueue.isDirty())
      setState('error')
      setMessage(saveError instanceof Error ? saveError.message : 'Unable to autosave message settings')
      return false
    }
  }, [readOnly, saveQueue])

  useEffect(
    () => registerEmailComposeSettingsFlusher(
      emailId,
      saveSettings,
    ),
    [emailId, saveSettings],
  )

  useEffect(() => {
    if (!dirty || !settings || readOnly) return

    const timer = window.setTimeout(() => {
      void saveSettings()
    }, 850)

    return () => window.clearTimeout(timer)
  }, [dirty, readOnly, saveSettings, settings])

  function updateSetting(field: keyof MessageSettings, value: string) {
    const current = settingsRef.current
    if (!current) return

    const next = { ...current, [field]: value }
    const version = ++localVersionRef.current
    settingsRef.current = next
    saveQueue.update(next, version)
    setSettings(next)
    setDirty(true)
    setState('idle')
    setMessage(null)
  }

  const statusLabel = state === 'loading'
    ? 'Loading…'
    : state === 'saving'
      ? 'Autosaving…'
      : state === 'saved'
        ? 'Saved'
        : state === 'error'
          ? 'Save failed'
          : dirty
            ? 'Autosave pending'
            : 'Autosaved'

  return (
    <details className="email-compose-settings">
      <summary>
        <span><Mail aria-hidden="true" /></span>
        <span>
          <strong>Message settings</strong>
          <small>{settings?.subject || 'Add a subject line'}</small>
        </span>
        <span data-state={state}>
          <Save aria-hidden="true" />
          {statusLabel}
        </span>
        <ChevronDown aria-hidden="true" />
      </summary>
      <div className="email-compose-settings__panel">
        {settings ? (
          <>
            <label>
              <span>Subject line</span>
              <input
                disabled={workflow?.email.readOnly}
                onChange={(event) => updateSetting('subject', event.target.value)}
                placeholder="Your latest update"
                type="text"
                value={settings.subject}
              />
            </label>
            <label>
              <span>Preheader</span>
              <textarea
                disabled={workflow?.email.readOnly}
                onChange={(event) => updateSetting('preheader', event.target.value)}
                placeholder="Short preview text shown in inboxes"
                rows={2}
                value={settings.preheader}
              />
            </label>
            <label>
              <span>Reply-to email</span>
              <input
                disabled={workflow?.email.readOnly}
                onChange={(event) => updateSetting('replyTo', event.target.value)}
                placeholder="reply@example.com"
                type="email"
                value={settings.replyTo}
              />
            </label>
          </>
        ) : (
          <p>{state === 'loading' ? 'Loading message settings…' : message || 'Message settings are unavailable.'}</p>
        )}
        {message && settings ? <p role="alert">{message}</p> : null}
        <p className="email-compose-settings__hint">
          Subject, preheader, and reply-to autosave here. Test recipients are managed in Review & Test.
        </p>
      </div>
    </details>
  )
}
