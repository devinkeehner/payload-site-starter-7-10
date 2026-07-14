import type { PayloadComponent, PayloadRequest, SanitizedPermissions, ServerProps } from 'payload'

import { RenderServerComponent } from '@payloadcms/ui/elements/RenderServerComponent'
import { EntityType, getVisibleEntities, groupNavItems } from '@payloadcms/ui/shared'
import React from 'react'

import { getQuickTasks } from '@/components/admin/dashboard/adminDashboardMeta'
import {
  ADMIN_WORKSPACE_NAV_AREAS,
  type AdminWorkspaceNavAreaKey,
} from '@/components/admin/adminWorkspace'
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
  const { afterNav, afterNavLinks } = adminComponents
  const { collections, globals } = payload.config

  const visibleEntities = getVisibleEntities({ req })

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
  const areas: Array<{
    description: string
    entities: typeof visibleNavEntities
    key: AdminWorkspaceNavAreaKey
    label: string
    primaryTaskKey?: 'createForm' | 'createPost'
  }> = ADMIN_WORKSPACE_NAV_AREAS.map((area) => {
    const entities = area.slugs
      .map((slug) => entityBySlug.get(slug))
      .filter((entity): entity is (typeof visibleNavEntities)[number] => Boolean(entity))

    entities.forEach((entity) => assignedSlugs.add(String(entity.slug)))

    return {
      description: area.description,
      entities,
      key: area.key,
      label: area.label,
      primaryTaskKey: 'primaryTaskKey' in area ? area.primaryTaskKey : undefined,
    }
  }).filter((area) => area.entities.length > 0)

  const remainingEntities = visibleNavEntities.filter((entity) => !assignedSlugs.has(String(entity.slug)))
  if (remainingEntities.length > 0) {
    const advancedArea = areas.find((area) => area.key === 'advanced')
    if (advancedArea) {
      advancedArea.entities.push(...remainingEntities)
    } else {
      areas.push({
        description: 'Supporting records and technical tools.',
        entities: remainingEntities,
        key: 'advanced',
        label: 'More',
        primaryTaskKey: undefined,
      })
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
      areas={areas}
      tasks={tasks}
    />
  )
}
