import type { DocumentViewServerProps } from 'payload'

import { canUseEmailFeatures } from '@/lib/access/isSuperUser'

import { EmailResultsStageViewClient } from './EmailResultsStageViewClient'

type EmailDoc = {
  id?: string | number
  subject?: string | null
  title?: string | null
}

export default function EmailResultsStageView(props: DocumentViewServerProps) {
  const doc = props.doc as EmailDoc
  const id = props.id ?? doc?.id

  if (!props.user || !canUseEmailFeatures(props.user)) {
    return <div style={{ padding: 24 }}>Only alpha testers and super admins can view email campaign results.</div>
  }

  if (!id) {
    return <div style={{ padding: 24 }}>Save this email before viewing results.</div>
  }

  return (
    <EmailResultsStageViewClient
      emailId={String(id)}
      title={doc.subject || doc.title || 'Untitled email'}
    />
  )
}
