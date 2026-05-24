import type { AdminViewServerProps } from 'payload'

import { isSuperUser } from '@/lib/access/isSuperUser'

import { EmailStartViewClient } from './EmailStartViewClient'

export default function EmailStartView(props: AdminViewServerProps) {
  if (!props.user || !isSuperUser(props.user)) {
    return <div style={{ padding: 24 }}>Only super admins can create email campaigns.</div>
  }

  return <EmailStartViewClient />
}
