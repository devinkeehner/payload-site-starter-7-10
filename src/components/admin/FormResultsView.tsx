import React from 'react'
import { DefaultTemplate } from '@payloadcms/next/templates'
import type { AdminViewServerProps } from 'payload'

import FormResultsDashboard from './FormResultsDashboard'

const FormResultsView: React.FC<AdminViewServerProps> = (props) => {
  const {
    collectionConfig,
    docID,
    documentSubViewType,
    globalConfig,
    i18n,
    initPageResult,
    locale,
    params,
    payload,
    searchParams,
    viewActions,
    viewType,
  } = props

  const { permissions, req, visibleEntities } = initPageResult

  return (
    <DefaultTemplate
      collectionSlug={collectionConfig?.slug}
      docID={docID}
      documentSubViewType={documentSubViewType}
      globalSlug={globalConfig?.slug}
      i18n={i18n}
      locale={locale}
      params={params}
      payload={payload}
      permissions={permissions}
      req={req}
      searchParams={searchParams}
      viewActions={viewActions}
      viewType={viewType}
      visibleEntities={visibleEntities}
    >
      <FormResultsDashboard />
    </DefaultTemplate>
  )
}

export default FormResultsView
