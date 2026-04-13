'use client'

import React, { useEffect, useState } from 'react'
import { Button, useAuth, useDocumentInfo, useField, useFormFields } from '@payloadcms/ui'

type FieldState = {
  value?: unknown
  initialValue?: unknown
}

type FormFields = Record<string, FieldState | undefined> & {
  _id?: FieldState
}

type TenantDoc = {
  id?: string
  defaultGraphicTemplate?: unknown
}

const asFormFields = (fields: unknown): FormFields =>
  (typeof fields === 'object' && fields !== null ? (fields as FormFields) : {})

const readIdField = (fields: unknown): string | undefined => {
  const map = asFormFields(fields)
  const fromId = map.id?.value ?? map.id?.initialValue
  if (typeof fromId === 'string') return fromId
  const fromUnderscoreId = map._id?.value ?? map._id?.initialValue
  if (typeof fromUnderscoreId === 'string') return fromUnderscoreId
  return undefined
}

const readRelationshipID = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return undefined
  const record = value as { id?: unknown; value?: unknown; initialValue?: unknown; relationTo?: unknown }
  if (typeof record.id === 'string') return record.id
  if (typeof record.value === 'string') return record.value
  if (typeof record.initialValue === 'string') return record.initialValue
  return undefined
}

const readRelationshipField = (fields: unknown, path: string): string | undefined => {
  const segments = path.split('.')
  let current: unknown = asFormFields(fields)

  for (const segment of segments) {
    if (!current || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[segment]
  }

  if (current && typeof current === 'object') {
    const state = current as FieldState
    return readRelationshipID(state.value ?? state.initialValue)
  }

  return readRelationshipID(current)
}

const hasSuperRole = (value: unknown) => {
  if (!value || typeof value !== 'object') return false
  const roles = (value as { roles?: unknown }).roles
  return Array.isArray(roles) && roles.includes('super')
}

const tenantDefaultGraphicTemplateCache = new Map<string, string | null>()

export const GraphicTemplateLauncher: React.FC = () => {
  const { user } = useAuth()
  const docInfo = useDocumentInfo() as { id?: string } | null
  const documentID = useFormFields(([fields]) => readIdField(fields)) || docInfo?.id
  const tenantID = useFormFields(([fields]) => readRelationshipField(fields, 'tenant'))
  const templateID = useFormFields(([fields]) => readRelationshipField(fields, 'graphicTemplate'))
  const designID = useFormFields(([fields]) => readRelationshipField(fields, 'graphicDesign'))
  const { setValue: setTemplateValue } = useField<string | null>({ path: 'graphicTemplate' })
  const [tenantDefaultTemplateID, setTenantDefaultTemplateID] = useState<string | null>(null)
  const isSuperAdmin = hasSuperRole(user)

  const effectiveTemplateID = templateID || tenantDefaultTemplateID || undefined

  useEffect(() => {
    if (!tenantID || templateID) return

    const cached = tenantDefaultGraphicTemplateCache.get(tenantID)
    if (cached !== undefined) {
      setTenantDefaultTemplateID(cached)
      if (cached) setTemplateValue(cached)
      return
    }

    let ignore = false

    const loadDefaultTemplate = async () => {
      try {
        const response = await fetch(`/api/tenants/${tenantID}?depth=1`, { credentials: 'include' })
        if (!response.ok) throw new Error(`Failed to load tenant default template (${response.status})`)

        const json = (await response.json()) as TenantDoc
        const defaultID = readRelationshipID(json.defaultGraphicTemplate) ?? null
        tenantDefaultGraphicTemplateCache.set(tenantID, defaultID)

        if (ignore) return

        setTenantDefaultTemplateID(defaultID)
        if (defaultID) setTemplateValue(defaultID)
      } catch (error) {
        console.error('[GraphicTemplateLauncher] Failed to load tenant default graphic template', error)
        tenantDefaultGraphicTemplateCache.set(tenantID, null)
        if (!ignore) setTenantDefaultTemplateID(null)
      }
    }

    void loadDefaultTemplate()

    return () => {
      ignore = true
    }
  }, [setTemplateValue, tenantID, templateID])

  const openEditor = (params: URLSearchParams) => {
    if (typeof window === 'undefined') return
    window.location.assign(`/graphics-editor?${params.toString()}`)
  }

  const openPostGraphicEditor = () => {
    if (!documentID) return
    const params = new URLSearchParams({ collection: 'posts', docId: documentID })
    if (effectiveTemplateID) params.set('templateId', effectiveTemplateID)
    if (designID) params.set('designId', designID)
    openEditor(params)
  }

  const openTemplateEditor = () => {
    const params = new URLSearchParams({ collection: 'posts' })
    if (documentID) params.set('docId', documentID)
    if (effectiveTemplateID) params.set('templateId', effectiveTemplateID)
    openEditor(params)
  }

  const openDesignEditor = () => {
    if (!designID) return
    const params = new URLSearchParams({ collection: 'posts' })
    if (documentID) params.set('docId', documentID)
    params.set('designId', designID)
    if (effectiveTemplateID) params.set('templateId', effectiveTemplateID)
    openEditor(params)
  }

  return (
    <div
      style={{
        marginBottom: 16,
        display: 'grid',
        gap: 10,
        padding: 16,
        borderRadius: 16,
        border: '1px solid rgba(17, 24, 39, 0.08)',
        background: 'rgba(248, 250, 252, 0.8)',
      }}
    >
      <div style={{ display: 'grid', gap: 4 }}>
        <strong style={{ fontSize: 14, color: '#111827' }}>Social Graphics</strong>
        <span style={{ fontSize: 12, lineHeight: 1.5, color: '#64748b' }}>
          Use this area to manage the default template for the post and reopen the saved graphic used for social sharing and SEO images.
        </span>
      </div>
      {tenantID && !templateID && tenantDefaultTemplateID ? (
        <small>Default template preselected from the current tenant.</small>
      ) : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button onClick={openPostGraphicEditor} disabled={!documentID} buttonStyle="secondary">
          Open Post Graphic Editor
        </Button>
        {isSuperAdmin ? (
          <Button onClick={openTemplateEditor} disabled={!effectiveTemplateID} buttonStyle="secondary">
            Edit Template
          </Button>
        ) : null}
        <Button onClick={openDesignEditor} disabled={!designID} buttonStyle="secondary">
          Edit Saved Graphic
        </Button>
      </div>
      {!documentID ? <small>Save the post first to launch the editor.</small> : null}
    </div>
  )
}
