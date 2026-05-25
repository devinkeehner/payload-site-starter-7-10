import type { DocumentViewServerProps } from 'payload'

import { ContactProfileViewClient } from './ContactProfileViewClient'

export default function ContactProfileView(props: DocumentViewServerProps) {
  const doc = props.doc as { email?: string; id?: string } | undefined
  const id = String(props.id || doc?.id || '')

  return <ContactProfileViewClient contactId={id} title={doc?.email || 'Contact profile'} />
}
