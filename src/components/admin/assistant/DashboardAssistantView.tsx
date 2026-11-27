import { DefaultTemplate } from '@payloadcms/next/templates'
import type { AdminViewServerProps } from 'payload'
import { DashboardAssistant } from './DashboardAssistant'

export default function DashboardAssistantView(props: AdminViewServerProps) {
  const { permissions, req, visibleEntities } = props.initPageResult
  if (req.user?.collection !== 'users') return null
  return (
    <DefaultTemplate i18n={props.i18n} locale={props.locale} params={props.params} payload={props.payload}
      permissions={permissions} req={req} searchParams={props.searchParams} user={req.user}
      viewActions={props.viewActions} viewType={props.viewType} visibleEntities={visibleEntities}>
      <DashboardAssistant />
    </DefaultTemplate>
  )
}
