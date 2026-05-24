import type { DocumentViewServerProps } from 'payload'

import { isSuperUser } from '@/lib/access/isSuperUser'

import { EmailCampaignViewClient } from './EmailCampaignViewClient'

type EmailDoc = {
  id?: string | number
  subject?: string | null
  title?: string | null
}

export default function EmailCampaignView(props: DocumentViewServerProps) {
  const doc = props.doc as EmailDoc
  const id = props.id ?? doc?.id

  if (!props.user || !isSuperUser(props.user)) {
    return <div style={{ padding: 24 }}>Only super admins can use campaign guidance.</div>
  }

  if (!id) {
    return <div style={{ padding: 24 }}>Save this email before opening campaign guidance.</div>
  }

  return (
    <EmailCampaignViewClient
      emailId={String(id)}
      title={doc.subject || doc.title || 'Untitled email'}
    />
  )
}
