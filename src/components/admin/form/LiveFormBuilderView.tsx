import { redirect } from 'next/navigation'
import type { DocumentViewServerProps } from 'payload'

import { PuckFormCreateClient } from './PuckFormCreateClient'

export default function LiveFormBuilderView({ id, doc }: DocumentViewServerProps) {
  const formID = id ?? doc?.id
  if (formID == null) return <PuckFormCreateClient />

  redirect(`/live-editor/forms/${encodeURIComponent(String(formID))}`)
}
