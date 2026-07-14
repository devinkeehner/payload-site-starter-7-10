import type { PayloadComponent, PayloadRequest, SanitizedPermissions, ServerProps } from 'payload'

import { DefaultNav } from '@payloadcms/next/rsc'
import { RenderServerComponent } from '@payloadcms/ui/elements/RenderServerComponent'
import { EntityType, getVisibleEntities, groupNavItems } from '@payloadcms/ui/shared'
import React from 'react'

import { getQuickTasks } from '@/components/admin/dashboard/adminDashboardMeta'
import { ADMIN_WORKSPACE_SECTIONS } from '@/components/admin/adminWorkspace'
import { canUseBuilders } from '@/lib/access/isSuperUser'
import { canAccessCollection } from '@/lib/access/roles'

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
    afterNav?: PayloadComponent | PayloadComponent[]
    afterNavLinks?: PayloadComponent | PayloadComponent[]
    beforeNav?: PayloadComponent | PayloadComponent[]
    beforeNavLinks?: PayloadComponent | PayloadComponent[]
  }
  const { afterNav, afterNavLinks, beforeNav, beforeNavLinks } = adminComponents
  const { collections, globals } = payload.config

  const visibleEntities = getVisibleEntities({ req })

  if (!canUseBuilders(req.user)) {
    return <DefaultNav {...props} visibleEntities={visibleEntities} />
  }

  const payloadGroups = groupNavItems(
    ([
      ...collections
        .filter(({ slug }) => visibleEntities.collections.includes(slug) && canAccessCollection(req.user, slug))
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
  const visibleNavEntities = payloadGroups.flatMap((group) => group.entities)
  const entityBySlug = new Map(visibleNavEntities.map((entity) => [String(entity.slug), entity]))
  const assignedSlugs = new Set<string>()
  const groups = ADMIN_WORKSPACE_SECTIONS.map((section) => {
    const entities = section.slugs
      .map((slug) => entityBySlug.get(slug))
      .filter((entity): entity is (typeof visibleNavEntities)[number] => Boolean(entity))

    entities.forEach((entity) => assignedSlugs.add(String(entity.slug)))

    return {
      entities,
      label: section.label,
    }
  }).filter((group) => group.entities.length > 0)

  const remainingEntities = visibleNavEntities.filter((entity) => !assignedSlugs.has(String(entity.slug)))
  if (remainingEntities.length > 0) {
    const advancedGroup = groups.find((group) => group.label === 'Advanced')
    if (advancedGroup) {
      advancedGroup.entities.push(...remainingEntities)
    } else {
      groups.push({ entities: remainingEntities, label: 'Advanced' })
    }
  }
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
