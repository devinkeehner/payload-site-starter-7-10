'use client'

import { SetStepNav, useConfig, type StepNavItem } from '@payloadcms/ui'
import { formatAdminURL } from 'payload/shared'
import { useMemo } from 'react'

type Props = {
  collectionLabel: string
  collectionSlug: string
  documentId?: string | null
  documentTitle?: string | null
  viewLabel?: string
}
export function PuckVisualBuilderStepNav({
  collectionLabel,
  collectionSlug,
  documentId,
  documentTitle,
  viewLabel = 'Visual Builder',
}: Props) {
  const { config } = useConfig()
  const adminRoute = config.routes.admin

  const nav = useMemo<StepNavItem[]>(() => {
    const items: StepNavItem[] = [
      {
        label: collectionLabel,
        url: formatAdminURL({
          adminRoute,
          path: `/collections/${collectionSlug}`,
        }),
      },
    ]

    if (documentId) {
      items.push({
        label: documentTitle || documentId,
        url: formatAdminURL({
          adminRoute,
          path: `/collections/${collectionSlug}/${documentId}`,
        }),
      })
    }

    items.push({ label: viewLabel })

    return items
  }, [adminRoute, collectionLabel, collectionSlug, documentId, documentTitle, viewLabel])

  return <SetStepNav nav={nav} />
}
