import type { DocumentViewServerProps } from 'payload'
import { redirect } from 'next/navigation'

import { canUseEmailFeatures } from '@/lib/access/isSuperUser'
import type { PuckEmailDoc } from '@/lib/puck/types'


export default function PuckEmailBuilderView(props: DocumentViewServerProps) {
  const doc = props.doc as PuckEmailDoc
  const id = props.id ?? doc?.id

  if (!props.user || !canUseEmailFeatures(props.user)) {
    return (
      <div style={{ padding: 24 }}>
        Only alpha testers and super admins can compose email campaigns.
      </div>
    )
  }

  if (!id) {
    return (
      <div style={{ padding: 24 }}>
        Save this email before opening Live Editor.
      </div>
    )
  }

  const deliveryStatus = (doc as PuckEmailDoc & { status?: string | null }).status
  if (
    deliveryStatus === 'scheduled' ||
    deliveryStatus === 'queued' ||
    deliveryStatus === 'sending' ||
    deliveryStatus === 'sent'
  ) {
    redirect(`/admin/collections/emails/${id}/campaign`)
  }

  redirect(`/live-editor/emails/${encodeURIComponent(String(id))}`)
}
