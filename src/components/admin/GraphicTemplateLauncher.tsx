'use client'

import React from 'react'
import { Button, useAuth, useDocumentInfo, useFormFields } from '@payloadcms/ui'

type FieldState = {
  value?: unknown
  initialValue?: unknown
}

type FormFields = Record<string, FieldState | undefined> & {
  _id?: FieldState
}

const asFormFields = (fields: unknown): FormFields =>
  (typeof fields === 'object' && fields !== null ? (fields as FormFields) : {})

const readStringField = (fields: unknown, path: string): string | undefined => {
  const segments = path.split('.')
  let current: unknown = asFormFields(fields)

  for (const segment of segments) {
    if (!current || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[segment]
  }

  if (current && typeof current === 'object') {
    const state = current as FieldState
    if (typeof state.value === 'string') return state.value
    if (typeof state.initialValue === 'string') return state.initialValue
  }

  return undefined
}

const readIdField = (fields: unknown): string | undefined => {
  const map = asFormFields(fields)
  const fromId = map.id?.value ?? map.id?.initialValue
  if (typeof fromId === 'string') return fromId
  const fromUnderscoreId = map._id?.value ?? map._id?.initialValue
  if (typeof fromUnderscoreId === 'string') return fromUnderscoreId
  return undefined
}

const hasSuperRole = (value: unknown) => {
  if (!value || typeof value !== 'object') return false
  const roles = (value as { roles?: unknown }).roles
  return Array.isArray(roles) && roles.includes('super')
}

export const GraphicTemplateLauncher: React.FC = () => {
  const { user } = useAuth()
  const docInfo = useDocumentInfo() as { id?: string } | null
  const documentID = useFormFields(([fields]) => readIdField(fields)) || docInfo?.id
  const templateID = useFormFields(([fields]) => readStringField(fields, 'graphicTemplate'))
  const designID = useFormFields(([fields]) => readStringField(fields, 'graphicDesign'))
  const isSuperAdmin = hasSuperRole(user)

  if (!isSuperAdmin) return null

  const openEditor = () => {
    if (typeof window === 'undefined' || !documentID) return
    const params = new URLSearchParams({ collection: 'posts', docId: documentID })
    if (templateID) params.set('templateId', templateID)
    if (designID) params.set('designId', designID)
    window.location.assign(`/graphics-editor?${params.toString()}`)
  }

  return (
    <div style={{ marginBottom: 16, display: 'grid', gap: 8 }}>
      <Button onClick={openEditor} disabled={!documentID} buttonStyle="secondary">
        Open Graphics Editor
      </Button>
      {!documentID ? <small>Save the post first to launch the editor.</small> : null}
    </div>
  )
}
