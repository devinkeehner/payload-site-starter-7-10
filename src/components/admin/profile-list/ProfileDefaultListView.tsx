'use client'

import type { ListViewClientProps } from 'payload'

import { DefaultListView, Link, useConfig, useListDrawerContext, useListQuery } from '@payloadcms/ui'
import { formatAdminURL } from 'payload/shared'
import React, { useMemo } from 'react'

type ProfileDefaultListViewProps = ListViewClientProps & {
  profileCollectionSlug: string
}

type ProfileListDoc = Record<string, unknown> & {
  activeContactCount?: number | null
  email?: string | null
  firstName?: string | null
  id?: number | string
  lastName?: string | null
  name?: string | null
  status?: string | null
  updatedAt?: string | null
}

function formatDate(value: unknown) {
  if (typeof value !== 'string' || !value) return 'Not yet'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not yet'

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function formatStatus(value: unknown) {
  if (typeof value !== 'string' || !value) return 'None'
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^\w/, (letter) => letter.toUpperCase())
}

function getContactName(doc: ProfileListDoc) {
  return [doc.firstName, doc.lastName].filter(Boolean).join(' ') || 'No name'
}

function ProfileListTable({
  collectionSlug,
  fallbackTable,
}: {
  collectionSlug: string
  fallbackTable: ListViewClientProps['Table']
}) {
  const {
    config: {
      routes: { admin: adminRoute },
    },
  } = useConfig()
  const { drawerSlug } = useListDrawerContext()
  const { data } = useListQuery()
  const docs = useMemo(() => (data?.docs || []) as ProfileListDoc[], [data?.docs])

  if (drawerSlug) return <>{fallbackTable}</>

  if (!docs.length) {
    return (
      <div style={{ border: '1px solid var(--theme-elevation-150)', padding: 24 }}>
        No results found.
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={headerCellStyle}>{collectionSlug === 'contacts' ? 'Email' : 'Name'}</th>
            {collectionSlug === 'contacts' ? <th style={headerCellStyle}>Name</th> : null}
            {collectionSlug === 'email-lists' ? <th style={headerCellStyle}>Contacts</th> : null}
            <th style={headerCellStyle}>Status</th>
            <th style={headerCellStyle}>Updated</th>
          </tr>
        </thead>
        <tbody>
          {docs.map((doc) => {
            const id = doc.id == null ? '' : String(doc.id)
            const profileURL = id
              ? formatAdminURL({
                  adminRoute,
                  path: `/collections/${collectionSlug}/${encodeURIComponent(id)}/profile`,
                })
              : ''

            return (
              <tr key={id || String(doc.email || doc.name)} style={rowStyle}>
                <td style={bodyCellStyle}>
                  {profileURL ? (
                    <Link href={profileURL}>
                      {collectionSlug === 'contacts' ? doc.email || 'No email' : doc.name || 'Untitled list'}
                    </Link>
                  ) : collectionSlug === 'contacts' ? doc.email || 'No email' : doc.name || 'Untitled list'}
                </td>
                {collectionSlug === 'contacts' ? <td style={bodyCellStyle}>{getContactName(doc)}</td> : null}
                {collectionSlug === 'email-lists' ? <td style={bodyCellStyle}>{doc.activeContactCount ?? 'Not synced'}</td> : null}
                <td style={bodyCellStyle}>{formatStatus(doc.status)}</td>
                <td style={bodyCellStyle}>{formatDate(doc.updatedAt)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const headerCellStyle: React.CSSProperties = {
  borderBottom: '1px solid var(--theme-elevation-150)',
  color: 'var(--theme-elevation-600)',
  fontSize: 12,
  fontWeight: 600,
  padding: '12px',
  textAlign: 'left',
  textTransform: 'uppercase',
}

const bodyCellStyle: React.CSSProperties = {
  borderBottom: '1px solid var(--theme-elevation-100)',
  padding: '14px 12px',
  verticalAlign: 'top',
}

const rowStyle: React.CSSProperties = {
  background: 'var(--theme-bg)',
}

export function ProfileDefaultListView({
  profileCollectionSlug,
  ...props
}: ProfileDefaultListViewProps) {
  return (
    <DefaultListView
      {...props}
      Table={<ProfileListTable collectionSlug={profileCollectionSlug} fallbackTable={props.Table} />}
    />
  )
}
