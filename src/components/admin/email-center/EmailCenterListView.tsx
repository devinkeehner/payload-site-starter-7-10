'use client'

import type { ListViewClientProps } from 'payload'

import { Button, DefaultListView, Gutter, Pill, useConfig, useListQuery } from '@payloadcms/ui'
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

function EmailCenterSummary() {
  const { data } = useListQuery()
  const docs = useMemo(() => (data?.docs || []) as EmailDoc[], [data?.docs])
  const drafts = docs.filter((doc) => (doc.status || 'draft') !== 'sent').length
  const sent = docs.filter((doc) => doc.status === 'sent').length

  return (
    <div className="email-flow__summary">
      <Pill pillStyle="light-gray">{docs.length} total</Pill>
      <Pill pillStyle={drafts ? 'warning' : 'light-gray'}>{drafts} in progress</Pill>
      <Pill pillStyle={sent ? 'success' : 'light-gray'}>{sent} sent</Pill>
      {docs[0] ? <span>Last updated: {formatDate(docs[0].updatedAt)}</span> : <span>No emails yet</span>}
      {docs[0] ? <span>Latest audience: {getListName(docs[0].emailList)}</span> : null}
    </div>
  )
}

function EmailCenterHero({ createURL, listsURL }: { createURL: string; listsURL: string }) {
  return (
    <Gutter className="email-flow email-flow--list">
      <div className="email-flow__header">
        <p className="email-flow__eyebrow">Email Marketing</p>
        <h1>Emails</h1>
        <p>Start with a campaign name, build the email, choose the audience, then review and send.</p>
      </div>
      <div className="email-flow__toolbar">
        <Button buttonStyle="primary" el="link" to={createURL} type="button">
          Create Email
        </Button>
        <Button buttonStyle="secondary" el="link" to={listsURL} type="button">
          Audiences
        </Button>
      </div>
      <EmailCenterSummary />
    </Gutter>
  )
}

export default function EmailCenterListView(props: ListViewClientProps) {
  const {
    config: {
      routes: { admin: adminRoute },
    },
  } = useConfig()
  const createURL = formatAdminURL({ adminRoute, path: '/email-campaigns/start' })
  const listsURL = formatAdminURL({ adminRoute, path: '/collections/email-lists' })
  const BeforeList = useMemo(
    () => (
      <>
        <EmailCenterHero createURL={createURL} listsURL={listsURL} />
        {props.BeforeList}
      </>
    ),
    [createURL, listsURL, props.BeforeList],
  )

  return (
    <DefaultListView
      {...props}
      BeforeList={BeforeList}
      newDocumentURL={createURL}
    />
  )
}
