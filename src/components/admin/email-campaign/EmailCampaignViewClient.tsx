'use client'

import { Banner, Button, Gutter, Pill, useConfig } from '@payloadcms/ui'
import { formatAdminURL } from 'payload/shared'
import React, { useCallback, useEffect, useMemo, useState } from 'react'

import '../email-center/email-center.scss'

type Readiness = {
  audience?: {
    active: number
    listName: string
  }
  canSend: boolean
  failures: number
  warnings: number
}

export function EmailCampaignViewClient({
  emailId,
  title,
}: {
  emailId: string
  title: string
}) {
  const {
    config: {
      routes: { admin: adminRoute },
    },
  } = useConfig()
  const [readiness, setReadiness] = useState<Readiness | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const baseURL = useMemo(() => formatAdminURL({ adminRoute, path: `/collections/emails/${emailId}` }), [adminRoute, emailId])
  const builderURL = `${baseURL}/visual`
  const audienceURL = `${baseURL}/audience`
  const reviewURL = `${baseURL}/review`

  const loadReadiness = useCallback(async () => {
    setMessage(null)
    try {
      const res = await fetch(`/api/emails/${emailId}/readiness`, { cache: 'no-store' })
      if (!res.ok) throw new Error(await res.text())
      setReadiness((await res.json()) as Readiness)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load campaign status')
    }
  }, [emailId])

  useEffect(() => {
    void loadReadiness()
  }, [loadReadiness])

  return (
    <Gutter className="email-flow">
      <div className="email-flow__header">
        <p className="email-flow__eyebrow">Email</p>
        <h1>{title}</h1>
        <p>Use these steps when preparing an email. Advanced fields remain available for unusual edits.</p>
      </div>

      {message ? <Banner type="error">{message}</Banner> : null}

      <section className="email-flow__steps">
        <article className="email-flow__step">
          <Pill pillStyle="light-gray">1</Pill>
          <h2>Build the email</h2>
          <p>Create the content and layout.</p>
          <Button buttonStyle="secondary" el="link" to={builderURL} type="button">
            Open builder
          </Button>
        </article>
        <article className="email-flow__step">
          <Pill pillStyle={readiness?.audience?.active ? 'success' : 'warning'}>2</Pill>
          <h2>Choose the audience</h2>
          <p>{readiness?.audience?.active ? `${readiness.audience.active} active recipients in ${readiness.audience.listName}.` : 'Select a list before sending.'}</p>
          <Button buttonStyle="secondary" el="link" to={audienceURL} type="button">
            Audience settings
          </Button>
        </article>
        <article className="email-flow__step">
          <Pill pillStyle={readiness?.canSend ? 'success' : 'warning'}>3</Pill>
          <h2>Review and send</h2>
          <p>{readiness ? `${readiness.failures} failures and ${readiness.warnings} warnings.` : 'Loading readiness.'}</p>
          <Button buttonStyle="primary" el="link" to={reviewURL} type="button">
            Review & Send
          </Button>
        </article>
      </section>
    </Gutter>
  )
}
