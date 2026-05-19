import type { PayloadRequest, SanitizedPermissions, ServerProps } from 'payload'

import { RenderServerComponent } from '@payloadcms/ui/elements/RenderServerComponent'
import { EntityType, getVisibleEntities, groupNavItems } from '@payloadcms/ui/shared'
import React from 'react'

import { getQuickTasks } from '@/components/admin/dashboard/adminDashboardMeta'

import { CampaignAdminNavClient } from './CampaignAdminNavClient'

type Props = ServerProps & {
  documentSubViewType?: string
  permissions?: SanitizedPermissions
  req?: PayloadRequest
  viewType?: string
}

export async function CampaignAdminNav(props: Props) {
  const { documentSubViewType, i18n, locale, params, payload, permissions, req, searchParams, user, viewType } = props

  if (!payload?.config || !permissions || !req) return null

  const adminComponents = (payload.config.admin.components || {}) as {
    afterNav?: unknown
    afterNavLinks?: unknown
    beforeNav?: unknown
    beforeNavLinks?: unknown
  }
  const { afterNav, afterNavLinks, beforeNav, beforeNavLinks } = adminComponents
  const { collections, globals } = payload.config

  const visibleEntities = getVisibleEntities({ req })
  const groups = groupNavItems(
    ([
      ...collections
        .filter(({ slug }) => visibleEntities.collections.includes(slug))
        .map((collection) => ({
          entity: collection,
          type: EntityType.collection,
        })),
      ...globals
        .filter(({ slug }) => visibleEntities.globals.includes(slug))
        .map((global) => ({
          entity: global,
          type: EntityType.global,
        })),
    ] as Parameters<typeof groupNavItems>[0]),
    permissions,
    i18n,
  )
  const tasks = await getQuickTasks(req)
  const serverProps = {
    i18n,
    locale,
    params,
    payload,
    permissions,
    req,
    searchParams,
    user,
  }
  const clientProps = {
    documentSubViewType,
    viewType,
  }

  return (
    <CampaignAdminNavClient
      afterNav={RenderServerComponent({
        clientProps,
        Component: afterNav,
        importMap: payload.importMap,
        serverProps,
      })}
      afterNavLinks={RenderServerComponent({
        clientProps,
        Component: afterNavLinks,
        importMap: payload.importMap,
        serverProps,
      })}
      beforeNav={RenderServerComponent({
        clientProps,
        Component: beforeNav,
        importMap: payload.importMap,
        serverProps,
      })}
      beforeNavLinks={RenderServerComponent({
        clientProps,
        Component: beforeNavLinks,
        importMap: payload.importMap,
        serverProps,
      })}
      groups={groups}
      tasks={tasks}
    />
  )
}
