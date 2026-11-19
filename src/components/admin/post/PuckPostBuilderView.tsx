import type { DocumentViewServerProps } from 'payload'

import { canUseBuilders } from '@/lib/access/isSuperUser'
import { redirect } from 'next/navigation'
import type { PuckPostDoc } from '@/lib/puck/types'

export default function PuckPostBuilderView(props: DocumentViewServerProps) {
  const doc = props.doc as PuckPostDoc
  const id = props.id ?? doc?.id
  const user = props.user

  if (!canUseBuilders(user)) {
    return (
      <div style={{ padding: '2rem' }}>
        Only alpha testers and super admins can use the post builder.
      </div>
    )
  }

  if (!id) {
    return (
      <div style={{ padding: '2rem' }}>
        Save this post before opening the post builder.
      </div>
    )
  }

  redirect(`/live-editor/posts/${encodeURIComponent(String(id))}`)
}
