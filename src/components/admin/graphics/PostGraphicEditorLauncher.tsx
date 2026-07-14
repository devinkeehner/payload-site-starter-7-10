'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import React, { useCallback, useEffect, useRef, useState } from 'react'

import { createDefaultGraphicScene } from '@/lib/graphics/studioTypes'

import './graphic-design-gallery-list-view.scss'

type RelationValue = number | string | { id?: number | string } | null | undefined

type PostResponse = {
  graphicDesign?: RelationValue
  id?: number | string
  tenant?: RelationValue
  title?: string | null
}

type CreateResponse = {
  doc?: { id?: number | string }
  id?: number | string
  message?: string
}

function getRelationId(value: RelationValue): string | null {
  if (value == null) return null
  if (typeof value === 'object') return value.id == null ? null : String(value.id)
  return String(value)
}

function openStudio(designId: string) {
  window.location.replace(`/admin/collections/graphic-designs/${encodeURIComponent(designId)}/studio`)
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
      const post = (await postResponse.json()) as PostResponse & { message?: string }
      if (!postResponse.ok) throw new Error(post.message || 'Unable to load the Post')

      const savedDesignId = getRelationId(post.graphicDesign)
      if (savedDesignId) {
        openStudio(savedDesignId)
        return
      }

      const tenantId = getRelationId(post.tenant)
      const title = post.title?.trim() || 'Untitled Post'
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (tenantId) headers['X-Payload-Tenant'] = tenantId

      const createResponse = await fetch('/api/graphic-designs?draft=true', {
        body: JSON.stringify({
          ...(tenantId ? { primaryTenant: tenantId, tenant: tenantId } : {}),
          sourceCollection: 'posts',
          sourcePost: postId,
          studioScene: createDefaultGraphicScene(),
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
        body: JSON.stringify({ graphicDesign: designId }),
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
            <p>Loading the saved design or creating one for this Post.</p>
          </>
        )}
      </div>
    </div>
  )
}
