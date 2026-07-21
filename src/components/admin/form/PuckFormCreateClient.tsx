'use client'

import { Link, useConfig } from '@payloadcms/ui'
import { formatAdminURL } from 'payload/shared'
import React, { useState } from 'react'

import { getSelectedTenantID } from '@/components/admin/hooks/useActiveTenant'
import styles from '@/components/admin/puck/puck-page-builder.module.css'

import { FormSettingsFields } from './FormSettingsFields'
import {
  createLexicalText,
  normalizeFormSettings,
  type FormSettings,
} from './formSettings'

const INITIAL_SETTINGS: FormSettings = {
  confirmationMessage: 'Thanks! Your response has been received.',
  confirmationType: 'message',
  enableHoneypot: true,
  enableTurnstile: false,
  redirectURL: '',
  submitButtonLabel: 'Submit',
  title: '',
}

type CreateResponse = {
  doc?: { id?: number | string }
  errors?: Array<{ message?: string }>
  id?: number | string
  message?: string
}

export function PuckFormCreateClient() {
  const {
    config: {
      routes: { admin: adminRoute },
    },
  } = useConfig()
  const [settings, setSettings] = useState(INITIAL_SETTINGS)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const formsURL = formatAdminURL({ adminRoute, path: '/collections/forms' })
  async function createForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextSettings = normalizeFormSettings(settings)

    if (!nextSettings.title) {
      setError('Give this form a name before opening the builder.')
      return
    }
    if (nextSettings.confirmationType === 'redirect' && !nextSettings.redirectURL) {
      setError('Enter the URL people should be sent to after submitting.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const tenantId = getSelectedTenantID() || undefined
      const response = await fetch('/api/forms', {
        body: JSON.stringify({
          ...(tenantId ? { tenant: tenantId } : {}),
          confirmationMessage: createLexicalText(nextSettings.confirmationMessage),
          confirmationType: nextSettings.confirmationType,
          enableHoneypot: nextSettings.enableHoneypot,
          enableTurnstile: nextSettings.enableTurnstile,
          fields: [],
          redirect: nextSettings.confirmationType === 'redirect'
            ? { url: nextSettings.redirectURL }
            : undefined,
          submitButtonLabel: nextSettings.submitButtonLabel,
          title: nextSettings.title,
        }),
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          ...(tenantId ? { 'X-Payload-Tenant': tenantId } : {}),
        },
        method: 'POST',
      })
      const result = await response.json() as CreateResponse
      if (!response.ok) {
        const validationMessage = result.errors?.map((entry) => entry.message).filter(Boolean).join(' ')
        throw new Error(result.message || validationMessage || 'Unable to create form')
      }

      const id = result.doc?.id ?? result.id
      if (id == null) throw new Error('The form was created without an ID')

      window.location.replace(
        formatAdminURL({
          adminRoute,
          path: `/collections/forms/${encodeURIComponent(String(id))}`,
        }),
      )
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create form')
      setSaving(false)
    }
  }

  return (
    <main className={styles.createShell}>
      <form className={styles.createForm} onSubmit={createForm}>
        <header>
          <h1>Create a form</h1>
          <p>Set the essentials now. You can change these settings anytime from the visual builder.</p>
        </header>

        <FormSettingsFields
          disabled={saving}
          minimal
          onChange={setSettings}
          settings={settings}
        />

        {error ? <div className={styles.createError} role="alert">{error}</div> : null}

        <div className={styles.createActions}>
          <Link href={formsURL}>Cancel</Link>
          <button disabled={saving} type="submit">
            {saving ? 'Creating form…' : 'Create and open builder'}
          </button>
        </div>
      </form>
    </main>
  )
}
