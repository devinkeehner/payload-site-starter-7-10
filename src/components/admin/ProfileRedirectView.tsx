import type { DocumentViewServerProps } from 'payload'

import { redirect } from 'next/navigation'

function getId(props: DocumentViewServerProps) {
  const doc = props.doc as { id?: string | number } | undefined
  return props.id ?? doc?.id
}

export function ContactProfileRedirectView(props: DocumentViewServerProps) {
  const id = getId(props)
  if (!id) return <div style={{ padding: 24 }}>Save this contact before opening the profile.</div>

  redirect(`/admin/collections/contacts/${id}/profile`)
}

export function EmailListProfileRedirectView(props: DocumentViewServerProps) {
  const id = getId(props)
  if (!id) return <div style={{ padding: 24 }}>Save this email list before opening the profile.</div>

  redirect(`/admin/collections/email-lists/${id}/profile`)
}
