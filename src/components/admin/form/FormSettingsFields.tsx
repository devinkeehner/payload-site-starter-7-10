'use client'

import React from 'react'

import styles from '@/components/admin/puck/puck-page-builder.module.css'

import type { FormSettings } from './formSettings'

type FormSettingsFieldsProps = {
  disabled?: boolean
  minimal?: boolean
  onChange: (nextSettings: FormSettings) => void
  settings: FormSettings
}

export function FormSettingsFields({
  disabled = false,
  minimal = false,
  onChange,
  settings,
}: FormSettingsFieldsProps) {
  const update = <K extends keyof FormSettings>(key: K, value: FormSettings[K]) => {
    onChange({ ...settings, [key]: value })
  }

  return (
    <div className={styles.formSettingsFields}>
      <label>
        <span>Form name <strong aria-hidden="true">*</strong></span>
        <input
          autoComplete="off"
          disabled={disabled}
          onChange={(event) => update('title', event.target.value)}
          placeholder="Contact form"
          required
          value={settings.title}
        />
      </label>

      {minimal ? null : <>

      <label>
        <span>Submit button label</span>
        <input
          autoComplete="off"
          disabled={disabled}
          onChange={(event) => update('submitButtonLabel', event.target.value)}
          placeholder="Submit"
          value={settings.submitButtonLabel}
        />
      </label>

      <label>
        <span>After submission</span>
        <select
          disabled={disabled}
          onChange={(event) => update('confirmationType', event.target.value as FormSettings['confirmationType'])}
          value={settings.confirmationType}
        >
          <option value="message">Show a confirmation message</option>
          <option value="redirect">Redirect to another URL</option>
        </select>
      </label>

      {settings.confirmationType === 'message' ? (
        <label>
          <span>Confirmation message</span>
          <textarea
            disabled={disabled}
            onChange={(event) => update('confirmationMessage', event.target.value)}
            placeholder="Thanks! Your response has been received."
            rows={4}
            value={settings.confirmationMessage}
          />
        </label>
      ) : (
        <label>
          <span>Redirect URL <strong aria-hidden="true">*</strong></span>
          <input
            disabled={disabled}
            onChange={(event) => update('redirectURL', event.target.value)}
            placeholder="https://example.com/thank-you"
            required
            type="url"
            value={settings.redirectURL}
          />
        </label>
      )}

      <fieldset>
        <legend>Spam protection</legend>
        <label className={styles.formSettingsCheckbox}>
          <input
            checked={settings.enableHoneypot}
            disabled={disabled}
            onChange={(event) => update('enableHoneypot', event.target.checked)}
            type="checkbox"
          />
          <span>
            <b>Honeypot</b>
            <small>Quietly blocks simple automated submissions.</small>
          </span>
        </label>
        <label className={styles.formSettingsCheckbox}>
          <input
            checked={settings.enableTurnstile}
            disabled={disabled}
            onChange={(event) => update('enableTurnstile', event.target.checked)}
            type="checkbox"
          />
          <span>
            <b>Turnstile CAPTCHA</b>
            <small>Require the configured CAPTCHA check before submitting.</small>
          </span>
        </label>
      </fieldset>
      </>}
    </div>
  )
}
