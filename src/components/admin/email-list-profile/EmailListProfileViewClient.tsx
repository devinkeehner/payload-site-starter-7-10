'use client'

import { Link, useConfig } from '@payloadcms/ui'
import { formatAdminURL } from 'payload/shared'
import React, { useEffect, useMemo, useState } from 'react'

import '@/components/admin/email-center/email-center.scss'

type Summary = {
  active: number
  bounced: number
  doNotContact: number
  inactive: number
  listName: string
  total: number
  unsubscribed: number
}

export function EmailListProfileViewClient({
  listId,
  name,
}: {
  listId: string
  name: string
}) {
  const {
    config: {
      routes: { admin: adminRoute },
    },
  } = useConfig()
  const [summary, setSummary] = useState<Summary | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const editURL = useMemo(() => formatAdminURL({ adminRoute, path: `/collections/email-lists/${listId}` }), [adminRoute, listId])
  const contactsURL = useMemo(() => formatAdminURL({ adminRoute, path: '/collections/contacts' }), [adminRoute])
  const membershipsURL = useMemo(() => formatAdminURL({ adminRoute, path: '/collections/email-list-memberships' }), [adminRoute])

  async function loadSummary() {
    setMessage(null)
    try {
      const res = await fetch(`/api/email-lists/${listId}/summary`, { cache: 'no-store' })
      if (!res.ok) throw new Error(await res.text())
      setSummary((await res.json()) as Summary)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load audience summary')
    }
  }

  useEffect(() => {
    void loadSummary()
  }, [listId])

  return (
    <main className="email-list-profile">
      <section className="email-list-profile__hero">
        <div>
          <h2>{summary?.listName || name}</h2>
          <p>Review audience health, subscription status, and list membership before using this list for a campaign.</p>
        </div>
        <div className="email-center__actions">
          <button className="email-center__button" type="button" onClick={() => void loadSummary()}>Refresh</button>
          <Link className="email-center__button" href={contactsURL}>Contacts</Link>
          <Link className="email-center__button" href={membershipsURL}>Memberships</Link>
          <Link className="email-center__button" href={editURL}>Advanced Fields</Link>
        </div>
      </section>

      <section className="email-list-profile__cards">
        <div className="email-list-profile__metric">
          <strong>{summary?.active ?? '-'}</strong>
          <span>Subscribed</span>
        </div>
        <div className="email-list-profile__metric">
          <strong>{summary?.unsubscribed ?? '-'}</strong>
          <span>Unsubscribed</span>
        </div>
        <div className="email-list-profile__metric">
          <strong>{summary?.bounced ?? '-'}</strong>
          <span>Bounced</span>
        </div>
        <div className="email-list-profile__metric">
          <strong>{summary?.doNotContact ?? '-'}</strong>
          <span>Do not contact</span>
        </div>
        <div className="email-list-profile__metric">
          <strong>{summary?.total ?? '-'}</strong>
          <span>Total</span>
        </div>
      </section>

      <section className="email-list-profile__panel">
        <h3>Next actions</h3>
        <div className="email-center__meta">
          <span>Use iContact dry-run imports before writing contacts.</span>
          <span>Use Memberships for rich list assignment.</span>
          <span>The legacy contact picker remains available in Advanced Fields.</span>
        </div>
        {message ? <p className="email-center__meta">{message}</p> : null}
      </section>
    </main>
  )
}
