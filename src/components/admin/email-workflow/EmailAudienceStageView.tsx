import type { DocumentViewServerProps } from 'payload'

import { canUseEmailFeatures } from '@/lib/access/isSuperUser'

import { EmailAudienceStageViewClient } from './EmailAudienceStageViewClient'

type EmailDoc = {
  id?: string | number
  subject?: string | null
  title?: string | null
}

export default function EmailAudienceStageView(props: DocumentViewServerProps) {
  const doc = props.doc as EmailDoc
  const id = props.id ?? doc?.id

  if (!props.user || !canUseEmailFeatures(props.user)) {
    return <div style={{ padding: 24 }}>Only alpha testers and super admins can edit email audiences.</div>
  }

  if (!id) {
    return <div style={{ padding: 24 }}>Save this email before choosing its audience.</div>
  }

  return (
    <EmailAudienceStageViewClient
      emailId={String(id)}
      title={doc.subject || doc.title || 'Untitled email'}
    />
  )
}
