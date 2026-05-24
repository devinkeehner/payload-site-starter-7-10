'use client'

import type { ListViewClientProps } from 'payload'

import { DefaultListView, Link, useConfig, useListQuery } from '@payloadcms/ui'
import { formatAdminURL } from 'payload/shared'
import React, { useMemo } from 'react'

import './email-center.scss'

type EmailDoc = {
  id?: string | number
  emailList?: { name?: string | null } | string | null
  lastSend?: {
    status?: string | null
    sentAt?: string | null
  } | null
  preheader?: string | null
  sendSummary?: {
    recipientCount?: number | null
    sentAt?: string | null
  } | null
  status?: string | null
  subject?: string | null
  title?: string | null
  updatedAt?: string | null
}

function formatDate(value?: string | null) {
  if (!value) return 'Not yet'
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function getListName(value: EmailDoc['emailList']) {
  if (value && typeof value === 'object') return value.name || 'Audience selected'
  if (typeof value === 'string') return 'Audience selected'
  return 'No audience'
}

function EmailCenterTable() {
  const {
    config: {
      routes: { admin: adminRoute },
    },
  } = useConfig()
  const { data } = useListQuery()
  const docs = useMemo(() => (data?.docs || []) as EmailDoc[], [data?.docs])

  if (!docs.length) {
    return (
      <div className="email-center__card">
        <strong>No emails yet</strong>
        <span className="email-center__meta">Create an email to start the campaign workflow.</span>
      </div>
    )
  }

  return (
    <div className="email-center__grid">
      {docs.map((doc) => {
        const id = doc.id != null ? String(doc.id) : ''
        const title = doc.subject || doc.title || 'Untitled email'
        const editURL = formatAdminURL({ adminRoute, path: `/collections/emails/${encodeURIComponent(id)}` })
        const workflowURL = `${editURL}/workflow`
        const builderURL = `${editURL}/visual`
        const status = doc.status || 'draft'

        return (
          <article className="email-center__card" key={id || title}>
            <div className="email-center__card-main">
              <span className="email-center__pill" data-status={status}>{status}</span>
              <Link className="email-center__card-title" href={workflowURL}>
                {title}
              </Link>
              {doc.preheader ? <span className="email-center__meta">{doc.preheader}</span> : null}
              <div className="email-center__stats">
                <span>Audience: {getListName(doc.emailList)}</span>
                <span>Recipients: {doc.sendSummary?.recipientCount ?? 'Pending'}</span>
                <span>Last test: {doc.lastSend?.status || 'Not sent'}</span>
                <span>Last updated: {formatDate(doc.updatedAt)}</span>
              </div>
            </div>
            <div className="email-center__card-actions">
              <Link className="email-center__button email-center__button--dark" href={workflowURL}>Workflow</Link>
              <Link className="email-center__button" href={builderURL}>Builder</Link>
              <Link className="email-center__button" href={editURL}>Advanced</Link>
            </div>
          </article>
        )
      })}
    </div>
  )
}

function EmailCenterHero() {
  const {
    config: {
      routes: { admin: adminRoute },
    },
  } = useConfig()
  const createURL = formatAdminURL({ adminRoute, path: '/collections/emails/create' })
  const listsURL = formatAdminURL({ adminRoute, path: '/collections/email-lists' })

  return (
    <section className="email-center__hero">
      <div>
        <h2>Email Center</h2>
        <p>Build campaign emails, check readiness, create matching post drafts, and send Elastic Email campaigns from one workflow.</p>
      </div>
      <div className="email-center__actions">
        <Link className="email-center__button" href={createURL}>Create Email</Link>
        <Link className="email-center__button" href={listsURL}>Audiences</Link>
      </div>
    </section>
  )
}

export default function EmailCenterListView(props: ListViewClientProps) {
  const BeforeList = useMemo(
    () => (
      <>
        <EmailCenterHero />
        {props.BeforeList}
      </>
    ),
    [props.BeforeList],
  )

  return (
    <DefaultListView
      {...props}
      BeforeList={BeforeList}
      Table={<EmailCenterTable />}
    />
  )
}
