import type { AdminViewServerProps } from 'payload'

import { isSuperUser } from '@/lib/access/isSuperUser'

import { EmailStartViewClient } from './EmailStartViewClient'

export default function EmailStartView(props: AdminViewServerProps) {
  const user = props.user || props.initPageResult?.req?.user

  if (!isSuperUser(user)) {
    return <div style={{ padding: 24 }}>Only super admins can create email campaigns.</div>
  }

  return <EmailStartViewClient />
}
