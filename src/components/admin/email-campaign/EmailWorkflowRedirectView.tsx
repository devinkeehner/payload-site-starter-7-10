import type { DocumentViewServerProps } from 'payload'

import { redirect } from 'next/navigation'

export default function EmailWorkflowRedirectView(props: DocumentViewServerProps) {
  const id = props.id ?? (props.doc as { id?: string | number } | undefined)?.id

  if (!id) {
    return <div style={{ padding: 24 }}>Save this email before opening campaign guidance.</div>
  }

  redirect(`/admin/collections/emails/${id}/campaign`)
}
