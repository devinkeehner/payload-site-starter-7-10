import type { DocumentViewServerProps } from 'payload'

import { canUseEmailFeatures } from '@/lib/access/isSuperUser'

import { EmailDeliveryStageViewClient } from './EmailDeliveryStageViewClient'

type EmailDoc = {
  id?: string | number
  subject?: string | null
  title?: string | null
}

export default function EmailDeliveryStageView(props: DocumentViewServerProps) {
  const doc = props.doc as EmailDoc
  const id = props.id ?? doc?.id

  if (!props.user || !canUseEmailFeatures(props.user)) {
    return <div style={{ padding: 24 }}>Only alpha testers and super admins can deliver email campaigns.</div>
  }

  if (!id) {
    return <div style={{ padding: 24 }}>Save this email before choosing delivery.</div>
  }

  return (
    <EmailDeliveryStageViewClient
      emailId={String(id)}
      title={doc.subject || doc.title || 'Untitled email'}
    />
  )
}
