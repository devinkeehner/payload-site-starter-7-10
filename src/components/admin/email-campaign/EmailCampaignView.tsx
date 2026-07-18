import type { DocumentViewServerProps } from 'payload'

import { canUseEmailFeatures } from '@/lib/access/isSuperUser'

import { EmailCampaignViewClient } from './EmailCampaignViewClient'

type EmailDoc = {
  id?: string | number
  subject?: string | null
  title?: string | null
}

export default function EmailCampaignView(props: DocumentViewServerProps) {
  const doc = props.doc as EmailDoc
  const id = props.id ?? doc?.id

  if (!props.user || !canUseEmailFeatures(props.user)) {
    return <div style={{ padding: 24 }}>Only alpha testers and super admins can use email campaigns.</div>
  }

  if (!id) {
    return <div style={{ padding: 24 }}>Save this email before opening its campaign workspace.</div>
  }

  return (
    <EmailCampaignViewClient
      emailId={String(id)}
      title={doc.subject || doc.title || 'Untitled email'}
    />
  )
}
