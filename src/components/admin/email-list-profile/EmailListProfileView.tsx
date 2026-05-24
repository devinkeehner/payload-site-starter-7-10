import type { DocumentViewServerProps } from 'payload'

import { isSuperUser } from '@/lib/access/isSuperUser'

import { EmailListProfileViewClient } from './EmailListProfileViewClient'

type EmailListDoc = {
  id?: string | number
  name?: string | null
}

export default function EmailListProfileView(props: DocumentViewServerProps) {
  const doc = props.doc as EmailListDoc
  const id = props.id ?? doc?.id

  if (!props.user || !isSuperUser(props.user)) {
    return <div style={{ padding: 24 }}>Only super admins can use audience profiles.</div>
  }

  if (!id) {
    return <div style={{ padding: 24 }}>Save this list before opening the audience profile.</div>
  }

  return <EmailListProfileViewClient listId={String(id)} name={doc.name || 'Audience list'} />
}
