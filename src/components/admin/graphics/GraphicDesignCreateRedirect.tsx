'use client'

import { Link, useConfig } from '@payloadcms/ui'
import { formatAdminURL } from 'payload/shared'
import React, { useCallback, useEffect, useRef, useState } from 'react'

import { getSelectedTenantID } from '@/components/admin/hooks/useActiveTenant'
import { createDefaultGraphicScene } from '@/lib/graphics/studioTypes'

import './graphic-design-gallery-list-view.scss'

type CreateResponse = {
  doc?: { id?: number | string }
  id?: number | string
  message?: string
}

export function GraphicDesignCreateRedirect() {
  const {
    config: {
      routes: { admin: adminRoute },
    },
  } = useConfig()
  const started = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  const createDesign = useCallback(async () => {
    setError(null)
    try {
      const tenantId = getSelectedTenantID()
      const response = await fetch('/api/graphic-designs?draft=true', {
        body: JSON.stringify({
          ...(tenantId ? { primaryTenant: tenantId, tenant: tenantId } : {}),
          studioScene: createDefaultGraphicScene(),
          title: 'Untitled design',
        }),
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          ...(tenantId ? { 'X-Payload-Tenant': tenantId } : {}),
        },
        method: 'POST',
      })
      const result = await response.json() as CreateResponse
      if (!response.ok) throw new Error(result.message || 'Unable to create design')
      const id = result.doc?.id ?? result.id
      if (id == null) throw new Error('The design was created without an ID')
      window.location.replace(
        formatAdminURL({
          adminRoute,
          path: `/collections/graphic-designs/${encodeURIComponent(String(id))}`,
        }),
      )
    } catch (createError) {
      started.current = false
      setError(createError instanceof Error ? createError.message : 'Unable to create design')
    }
  }, [adminRoute])

  useEffect(() => {
    if (started.current) return
    started.current = true
    void createDesign()
  }, [attempt, createDesign])

  const designsURL = formatAdminURL({ adminRoute, path: '/collections/graphic-designs' })

  return (
    <div className="graphic-design-create">
      <div className="graphic-design-create__panel">
        {error ? (
          <>
            <h1>Design could not be created</h1>
            <p>{error}</p>
            <div className="graphic-design-create__actions">
              <button onClick={() => setAttempt((current) => current + 1)} type="button">Try again</button>
              <Link href={designsURL}>Back to Designs</Link>
            </div>
          </>
        ) : (
          <>
            <span className="graphic-design-create__spinner" />
            <h1>Starting your design…</h1>
            <p>Creating a blank canvas and opening the Design Studio.</p>
          </>
        )}
      </div>
    </div>
  )
}
