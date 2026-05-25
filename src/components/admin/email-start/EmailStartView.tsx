import type { AdminViewServerProps } from 'payload'

import { canUseEmailFeatures } from '@/lib/access/isSuperUser'

import { EmailStartViewClient } from './EmailStartViewClient'

export default function EmailStartView(props: AdminViewServerProps) {
  const user = props.user || props.initPageResult?.req?.user

  if (!canUseEmailFeatures(user)) {
    return <div style={{ padding: 24 }}>Only alpha testers and super admins can create email campaigns.</div>
  }

  return <EmailStartViewClient />
}
