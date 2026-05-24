import type { DocumentViewServerProps } from 'payload'

import { isSuperUser } from '@/lib/access/isSuperUser'

import { EmailAudienceViewClient } from './EmailAudienceViewClient'

type EmailDoc = {
  id?: string | number
  subject?: string | null
  title?: string | null
}

export default function EmailAudienceView(props: DocumentViewServerProps) {
  const doc = props.doc as EmailDoc
  const id = props.id ?? doc?.id

  if (!props.user || !isSuperUser(props.user)) {
    return <div style={{ padding: 24 }}>Only super admins can edit email audience settings.</div>
  }

  if (!id) {
    return <div style={{ padding: 24 }}>Save this email before choosing an audience.</div>
  }

  return (
    <EmailAudienceViewClient
      emailId={String(id)}
      title={doc.subject || doc.title || 'Untitled email'}
    />
  )
}
