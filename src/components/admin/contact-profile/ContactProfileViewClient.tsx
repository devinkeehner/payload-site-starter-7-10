'use client'

import { Banner, Button, Gutter, useConfig } from '@payloadcms/ui'
import { formatAdminURL } from 'payload/shared'
import React, { useCallback, useEffect, useMemo, useState } from 'react'

import '../email-center/email-center.scss'

type Profile = {
  contact: {
    customFields?: Array<{ key?: string; source?: string; value?: string }>
    email?: string
    firstName?: string
    lastName?: string
    source?: string
    status?: string
  }
  events: Array<{ eventType?: string; occurredAt?: string; recipientEmail?: string; url?: string }>
  memberships: Array<{ emailList?: { name?: string } | string; id: string; status?: string; updatedAt?: string }>
}

const MEMBERSHIP_STATUS_OPTIONS = [
  { label: 'Subscribed', value: 'subscribed' },
  { label: 'Unsubscribed', value: 'unsubscribed' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'Bounced', value: 'bounced' },
  { label: 'Do not contact', value: 'doNotContact' },
]

export function ContactProfileViewClient({ contactId, title }: { contactId: string; title: string }) {
  const {
    config: {
      routes: { admin: adminRoute },
    },
  } = useConfig()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savingMembership, setSavingMembership] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const editURL = useMemo(() => formatAdminURL({ adminRoute, path: `/collections/contacts/${contactId}` }), [adminRoute, contactId])

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/contacts/${contactId}/profile`, { cache: 'no-store' })
      if (!res.ok) throw new Error(await res.text())
      setProfile((await res.json()) as Profile)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load contact profile')
    }
  }, [contactId])

  useEffect(() => {
    void load()
  }, [load])

  async function updateMembership(membershipId: string, status: string) {
    setSavingMembership(membershipId)
    setError(null)
    setNotice(null)

    try {
      const res = await fetch(`/api/contacts/${contactId}/profile`, {
        body: JSON.stringify({ membershipId, status }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'PATCH',
      })
      if (!res.ok) throw new Error(await res.text())
      setProfile((current) => current
        ? {
            ...current,
            memberships: current.memberships.map((membership) => membership.id === membershipId ? { ...membership, status } : membership),
          }
        : current)
      setNotice('Membership updated.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update membership')
    } finally {
      setSavingMembership(null)
    }
  }

  return (
    <Gutter className="email-flow">
      <div className="email-flow__header">
        <p className="email-flow__eyebrow">Contact Profile</p>
        <h1>{title}</h1>
        <p>Review list memberships, imported fields, and recent email activity for this contact.</p>
      </div>

      {error ? <Banner type="error">{error}</Banner> : null}
      {notice ? <Banner type="success">{notice}</Banner> : null}

      <section className="email-flow__toolbar">
        <Button buttonStyle="secondary" el="link" to={editURL} type="button">Advanced Fields</Button>
        <Button buttonStyle="secondary" onClick={() => void load()} type="button">Refresh</Button>
      </section>

      {!profile ? (
        <section className="email-flow__panel"><p>Loading profile...</p></section>
      ) : (
        <>
          <section className="email-flow__panel">
            <h2>{profile.contact.email}</h2>
            <div className="email-flow__meta">
              <span>{[profile.contact.firstName, profile.contact.lastName].filter(Boolean).join(' ') || 'No name'}</span>
              <span>Status: {profile.contact.status || 'unknown'}</span>
              <span>Source: {profile.contact.source || 'unknown'}</span>
            </div>
          </section>

          <section className="email-flow__panel">
            <h2>List Memberships</h2>
            <div className="email-flow__table">
              {profile.memberships.map((membership, index) => (
                <div className="email-flow__row email-flow__row--actions" key={membership.id || index}>
                  <strong>{typeof membership.emailList === 'object' ? membership.emailList?.name : membership.emailList}</strong>
                  <label className="email-flow__inline-field">
                    <span>Status</span>
                    <select
                      disabled={savingMembership === membership.id}
                      onChange={(event) => void updateMembership(membership.id, event.target.value)}
                      value={membership.status || 'subscribed'}
                    >
                      {MEMBERSHIP_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <span>{membership.updatedAt ? new Date(membership.updatedAt).toLocaleString() : ''}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="email-flow__panel">
            <h2>Custom Fields</h2>
            <div className="email-flow__table">
              {(profile.contact.customFields || []).map((field, index) => (
                <div className="email-flow__row" key={index}>
                  <strong>{field.key}</strong>
                  <span>{field.value}</span>
                  <span>{field.source}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="email-flow__panel">
            <h2>Recent Email Events</h2>
            <div className="email-flow__table">
              {profile.events.map((event, index) => (
                <div className="email-flow__row" key={index}>
                  <strong>{event.eventType}</strong>
                  <span>{event.occurredAt ? new Date(event.occurredAt).toLocaleString() : ''}</span>
                  <span>{event.url}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </Gutter>
  )
}
