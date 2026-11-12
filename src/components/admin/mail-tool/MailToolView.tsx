import { DefaultTemplate } from '@payloadcms/next/templates'
import type { AdminViewServerProps } from 'payload'

import MailToolClient from './MailToolClient'

export default function MailToolView(props: AdminViewServerProps) {
  const { permissions, req, visibleEntities } = props.initPageResult
  const user = props.user || req.user
  if (!user) return <p>Please sign in to use the Mail Tool.</p>

  return (
    <DefaultTemplate
      i18n={props.i18n}
      locale={props.locale}
      params={props.params}
      payload={props.payload}
      permissions={permissions}
      req={req}
      searchParams={props.searchParams}
      user={user}
      viewActions={props.viewActions}
      viewType={props.viewType}
      visibleEntities={visibleEntities}
    >
      <MailToolClient />
    </DefaultTemplate>
  )
}
