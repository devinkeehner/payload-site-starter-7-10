import type { DocumentViewServerProps } from 'payload'
import { redirect } from 'next/navigation'
import { canUseBuilders } from '@/lib/access/isSuperUser'

export default function LivePageBuilderView({ id, doc, user }: DocumentViewServerProps) {
  if (!canUseBuilders(user)) return <p>Your account does not have access to Live Editor.</p>
  const pageID = id ?? doc?.id
  if (pageID == null) return <p>Save this page before opening Live Editor.</p>
  redirect(`/live-editor/pages/${encodeURIComponent(String(pageID))}`)
}
