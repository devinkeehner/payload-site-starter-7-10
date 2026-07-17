'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import React, { useCallback, useEffect, useRef, useState } from 'react'

import {
  convertLegacyTemplateToStudioScene,
  type LegacyTemplateMedia,
} from '@/lib/graphics/legacyTemplateToStudioScene'

import './graphic-design-gallery-list-view.scss'

type RelationValue = number | string | { id?: number | string } | null | undefined

type PostResponse = {
  graphicDesign?: RelationValue
  graphicTemplate?: RelationValue
  id?: number | string
  tenant?: RelationValue
  title?: string | null
}

type TenantResponse = {
  defaultGraphicTemplate?: RelationValue
  name?: string | null
}

type TemplateResponse = {
  backgroundImage?: LegacyTemplateMedia | RelationValue
  id?: number | string
  scene?: unknown
}

type ListResponse<T> = {
  docs?: T[]
}

type RepInfoResponse = {
  name?: string | null
}

type StandardMediaResponse = {
  mobileHeadshot?: LegacyTemplateMedia | RelationValue
}

type CreateResponse = {
  doc?: { id?: number | string }
  id?: number | string
  message?: string
}

function getRelationId(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'object') {
    const id = (value as { id?: unknown }).id
    return typeof id === 'string' || typeof id === 'number' ? String(id) : null
  }
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null
}

function getMedia(value: unknown): LegacyTemplateMedia | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const id = record.id
  const url = record.url
  if ((typeof id !== 'string' && typeof id !== 'number') || typeof url !== 'string') return null
  return {
    alt: typeof record.alt === 'string' ? record.alt : null,
    id,
    url,
  }
}

function collectLegacyMediaIds(scene: unknown): string[] {
  if (!scene || typeof scene !== 'object') return []
  const record = scene as Record<string, unknown>
  const ids = new Set<string>()

  if (Array.isArray(record.imageLayers)) {
    record.imageLayers.forEach((value) => {
      if (!value || typeof value !== 'object') return
      const mediaId = (value as Record<string, unknown>).mediaID
      if (typeof mediaId === 'string') ids.add(mediaId)
    })
  }

  if (Array.isArray(record.headshots)) {
    record.headshots.forEach((value) => {
      if (!value || typeof value !== 'object') return
      const binding = (value as Record<string, unknown>).binding
      if (!binding || typeof binding !== 'object') return
      const bindingRecord = binding as Record<string, unknown>
      if (bindingRecord.type === 'media' && typeof bindingRecord.mediaID === 'string') {
        ids.add(bindingRecord.mediaID)
      }
    })
  }

  return Array.from(ids)
}

async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const result = (await response.json()) as T & { message?: string }
  if (!response.ok) throw new Error(result.message || fallbackMessage)
  return result
}

function openStudio(designId: string) {
  window.location.replace(`/admin/collections/graphic-designs/${encodeURIComponent(designId)}`)
}

export function PostGraphicEditorLauncher() {
  const searchParams = useSearchParams()
  const started = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  const launch = useCallback(async () => {
    setError(null)

    const collection = searchParams.get('collection') || 'posts'
    const postId = searchParams.get('docId')
    const requestedDesignId = searchParams.get('designId')
    const requestedTemplateId = searchParams.get('templateId')

    if (collection !== 'posts') {
      window.location.replace('/admin/collections/graphic-designs')
      return
    }

    if (requestedDesignId) {
      openStudio(requestedDesignId)
      return
    }

    if (!postId) {
      window.location.replace('/admin/collections/graphic-designs')
      return
    }

    try {
      const postResponse = await fetch(`/api/posts/${encodeURIComponent(postId)}?draft=true&depth=1`, {
        credentials: 'include',
      })
      const post = await readJson<PostResponse>(postResponse, 'Unable to load the Post')

      const savedDesignId = getRelationId(post.graphicDesign)
      if (savedDesignId) {
        openStudio(savedDesignId)
        return
      }

      const tenantId = getRelationId(post.tenant)
      const title = post.title?.trim() || 'Untitled Post'
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (tenantId) headers['X-Payload-Tenant'] = tenantId

      let tenant: TenantResponse | null = null
      let repInfo: RepInfoResponse | null = null
      let standardMedia: StandardMediaResponse | null = null

      if (tenantId) {
        const tenantQuery = encodeURIComponent(tenantId)
        const [tenantResponse, repResponse, standardResponse] = await Promise.all([
          fetch(`/api/tenants/${tenantQuery}?depth=1`, { credentials: 'include' }),
          fetch(`/api/rep-info?limit=1&where[tenant][equals]=${tenantQuery}&depth=0`, {
            credentials: 'include',
            headers,
          }),
          fetch(`/api/standard-media?limit=1&where[tenant][equals]=${tenantQuery}&depth=1`, {
            credentials: 'include',
            headers,
          }),
        ])

        tenant = await readJson<TenantResponse>(tenantResponse, 'Unable to load the Site graphic settings')
        if (repResponse.ok) {
          const result = (await repResponse.json()) as ListResponse<RepInfoResponse>
          repInfo = result.docs?.[0] || null
        }
        if (standardResponse.ok) {
          const result = (await standardResponse.json()) as ListResponse<StandardMediaResponse>
          standardMedia = result.docs?.[0] || null
        }
      }

      const postTemplateId = getRelationId(post.graphicTemplate)
      const templateId =
        requestedTemplateId || postTemplateId || getRelationId(tenant?.defaultGraphicTemplate)

      let template: TemplateResponse | null = null
      let studioScene: ReturnType<typeof convertLegacyTemplateToStudioScene> | null = null

      if (templateId) {
        const templateResponse = await fetch(
          `/api/graphic-templates/${encodeURIComponent(templateId)}?depth=1`,
          { credentials: 'include', headers },
        )
        template = await readJson<TemplateResponse>(templateResponse, 'Unable to load the saved graphic template')

        const mediaEntries = await Promise.all(
          collectLegacyMediaIds(template.scene).map(async (mediaId) => {
            const response = await fetch(`/api/media/${encodeURIComponent(mediaId)}?depth=0`, {
              credentials: 'include',
              headers,
            })
            if (!response.ok) return [mediaId, undefined] as const
            return [mediaId, getMedia(await response.json()) || undefined] as const
          }),
        )

        studioScene = convertLegacyTemplateToStudioScene({
          backgroundImage: getMedia(template.backgroundImage),
          headlineText: title,
          mediaById: Object.fromEntries(mediaEntries),
          primaryHeadshot: getMedia(standardMedia?.mobileHeadshot),
          primaryRepName: repInfo?.name || tenant?.name,
          scene: template.scene,
        })
      }

      const createResponse = await fetch('/api/graphic-designs?draft=true', {
        body: JSON.stringify({
          ...(tenantId ? { primaryTenant: tenantId, tenant: tenantId } : {}),
          ...(templateId ? { template: templateId } : {}),
          ...(getRelationId(template?.backgroundImage)
            ? { backgroundImage: getRelationId(template?.backgroundImage) }
            : {}),
          ...(template?.scene ? { scene: template.scene } : {}),
          sourceCollection: 'posts',
          sourcePost: postId,
          ...(studioScene ? { studioScene } : {}),
          title: `${title} social graphic`,
          titleOverride: title,
        }),
        credentials: 'include',
        headers,
        method: 'POST',
      })
      const created = (await createResponse.json()) as CreateResponse
      if (!createResponse.ok) throw new Error(created.message || 'Unable to create the Post graphic')
      const designId = created.doc?.id ?? created.id
      if (designId == null) throw new Error('The graphic was created without an ID')

      const postUpdateResponse = await fetch(`/api/posts/${encodeURIComponent(postId)}?draft=true`, {
        body: JSON.stringify({
          graphicDesign: designId,
          ...(!postTemplateId && templateId ? { graphicTemplate: templateId } : {}),
        }),
        credentials: 'include',
        headers,
        method: 'PATCH',
      })
      if (!postUpdateResponse.ok) throw new Error('The graphic was created, but it could not be linked to the Post')

      openStudio(String(designId))
    } catch (launchError) {
      started.current = false
      setError(launchError instanceof Error ? launchError.message : 'Unable to open the Post graphic editor')
    }
  }, [searchParams])

  useEffect(() => {
    if (started.current) return
    started.current = true
    void launch()
  }, [attempt, launch])

  return (
    <div className="graphic-design-create">
      <div className="graphic-design-create__panel">
        {error ? (
          <>
            <h1>Graphic editor could not be opened</h1>
            <p>{error}</p>
            <div className="graphic-design-create__actions">
              <button onClick={() => setAttempt((current) => current + 1)} type="button">Try again</button>
              <Link href="/admin/collections/graphic-designs">Back to Graphic Designs</Link>
            </div>
          </>
        ) : (
          <>
            <span className="graphic-design-create__spinner" />
            <h1>Opening the Post design studio…</h1>
            <p>Loading the saved design or creating one from this Post&apos;s visual template.</p>
          </>
        )}
      </div>
    </div>
  )
}
