import type { AdminViewServerProps } from 'payload'

import { isSuperUser } from '@/lib/access/isSuperUser'

import { IContactImportViewClient } from './IContactImportViewClient'

export default function IContactImportView(props: AdminViewServerProps) {
  const user = props.user || props.initPageResult?.req?.user

  if (!isSuperUser(user)) {
    return <div style={{ padding: 24 }}>Only super admins can import iContact contacts.</div>
  }

  return <IContactImportViewClient />
}
