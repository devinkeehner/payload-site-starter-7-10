'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Button, useAuth, useDocumentInfo, useField, useForm, useFormFields } from '@payloadcms/ui'

import {
  DEFAULT_SEO_ASSISTANT_SETTINGS,
  SEO_ASSISTANT_TONE_OPTIONS,
  type SeoAssistantSettings,
  type SeoAssistantTone,
} from '@/lib/seo/assistantConfig'

type AssistantConfigResponse = {
  error?: string
  settings?: SeoAssistantSettings
}

type GenerateSeoResponse = {
  articleTypeID?: string
  categoryIDs?: string[]
  description?: string
  error?: string
  keyTakeawaysNormalized?: Array<Record<string, unknown>>
  metaTitle?: string
  settings?: {
    model?: string
    reasoning?: string
    tone?: string
  }
}

type FieldState = {
  initialValue?: unknown
  value?: unknown
}

type FormFields = Record<string, FieldState | undefined> & {
  _id?: FieldState
}

type TenantDoc = {
  defaultGraphicTemplate?: unknown
  id?: string
}

type Notice = {
  kind: 'error' | 'info' | 'success'
  text: string
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
  const record = value as { id?: unknown; initialValue?: unknown; value?: unknown }
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

const deriveIdFromPath = (): string | undefined => {
  if (typeof window === 'undefined') return undefined

  try {
    const parts = window.location.pathname.split('/').filter(Boolean)
    const i = parts.findIndex((part) => part === 'collections')
    if (i !== -1 && parts[i + 2] && parts[i + 2] !== 'create') return parts[i + 2]
  } catch {
    // no-op
  }

  return undefined
}

const tenantDefaultGraphicTemplateCache = new Map<string, string | null>()

export const PostPublishingAssistant: React.FC = () => {
  const { dispatchFields } = useForm()
  const { user } = useAuth()
  const docInfo = useDocumentInfo() as { id?: string } | null
  const documentID = useFormFields(([fields]) => readIdField(fields)) || docInfo?.id || deriveIdFromPath()
  const tenantID = useFormFields(([fields]) => readRelationshipField(fields, 'tenant'))
  const templateID = useFormFields(([fields]) => readRelationshipField(fields, 'graphicTemplate'))
  const designID = useFormFields(([fields]) => readRelationshipField(fields, 'graphicDesign'))
  const slugFromForm = useFormFields(([fields]) => {
    const slug = asFormFields(fields).slug?.value
    return typeof slug === 'string' ? slug : undefined
  })
  const { setValue: setTemplateValue } = useField<string | null>({ path: 'graphicTemplate' })
  const [assistantSettings, setAssistantSettings] = useState<SeoAssistantSettings>(
    DEFAULT_SEO_ASSISTANT_SETTINGS,
  )
  const [tone, setTone] = useState<SeoAssistantTone>(DEFAULT_SEO_ASSISTANT_SETTINGS.defaultTone)
  const [additionalInstructions, setAdditionalInstructions] = useState('')
  const [tenantDefaultTemplateID, setTenantDefaultTemplateID] = useState<string | null>(null)
  const [generateLoading, setGenerateLoading] = useState(false)
  const [configLoading, setConfigLoading] = useState(true)
  const [notice, setNotice] = useState<Notice | null>(null)
  const toneTouchedRef = useRef(false)
  const isSuperAdmin = hasSuperRole(user)
  const effectiveTemplateID = templateID || tenantDefaultTemplateID || undefined

  useEffect(() => {
    let ignore = false

    const loadConfig = async () => {
      setConfigLoading(true)
      try {
        const response = await fetch('/api/posts/assistant-config', {
          credentials: 'include',
          method: 'GET',
        })
        const result = (await response.json()) as AssistantConfigResponse
        if (!response.ok) {
          throw new Error(result.error || `Failed to load assistant defaults (${response.status})`)
        }

        const settings = result.settings || DEFAULT_SEO_ASSISTANT_SETTINGS
        if (ignore) return

        setAssistantSettings(settings)
        if (!toneTouchedRef.current) setTone(settings.defaultTone)
      } catch (error) {
        if (!ignore) {
          const message = error instanceof Error ? error.message : 'Failed to load assistant defaults.'
          setNotice({ kind: 'info', text: `${message} Using fallback defaults.` })
        }
      } finally {
        if (!ignore) setConfigLoading(false)
      }
    }

    void loadConfig()

    return () => {
      ignore = true
    }
  }, [])

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
        console.error('[PostPublishingAssistant] Failed to load tenant default graphic template', error)
        tenantDefaultGraphicTemplateCache.set(tenantID, null)
        if (!ignore) setTenantDefaultTemplateID(null)
      }
    }

    void loadDefaultTemplate()

    return () => {
      ignore = true
    }
  }, [setTemplateValue, tenantID, templateID])

  const launchGraphicEditor = (params: URLSearchParams) => {
    if (typeof window === 'undefined') return
    window.location.assign(`/graphics-editor?${params.toString()}`)
  }

  const openPostGraphicEditor = () => {
    if (!documentID) return
    const params = new URLSearchParams({ collection: 'posts', docId: documentID })
    if (effectiveTemplateID) params.set('templateId', effectiveTemplateID)
    if (designID) params.set('designId', designID)
    launchGraphicEditor(params)
  }

  const openTemplateEditor = () => {
    const params = new URLSearchParams({ collection: 'posts' })
    if (documentID) params.set('docId', documentID)
    if (effectiveTemplateID) params.set('templateId', effectiveTemplateID)
    launchGraphicEditor(params)
  }

  const openDesignEditor = () => {
    if (!designID) return
    const params = new URLSearchParams({ collection: 'posts' })
    if (documentID) params.set('docId', documentID)
    params.set('designId', designID)
    if (effectiveTemplateID) params.set('templateId', effectiveTemplateID)
    launchGraphicEditor(params)
  }

  const openExperimentalTownGraphic = () => {
    if (typeof window === 'undefined') return
    window.location.assign('/graphics-editor-experimental')
  }

  const resolveIdFromSlug = async () => {
    if (!slugFromForm) return undefined

    try {
      const q = new URLSearchParams({ 'where[slug][equals]': slugFromForm, limit: '1', depth: '0' })
      const lookup = await fetch(`/api/posts?${q.toString()}`, { method: 'GET' })
      const result = await lookup.json()
      return result?.docs?.[0]?.id || result?.docs?.[0]?._id
    } catch (error) {
      console.error('[PostPublishingAssistant] Fallback lookup by slug failed', error)
      return undefined
    }
  }

  const activeModelSummary = useMemo(
    () =>
      `${assistantSettings.defaultModel} / ${assistantSettings.defaultReasoning} reasoning / ${SEO_ASSISTANT_TONE_OPTIONS.find((option) => option.value === assistantSettings.defaultTone)?.label || 'Lean Right'} default tone`,
    [assistantSettings],
  )

  const handleGenerateSeo = async () => {
    const finalId = documentID || (await resolveIdFromSlug())
    if (!finalId) {
      setNotice({ kind: 'info', text: 'Save the post first to generate SEO fields and launch the main post graphic editor.' })
      return
    }

    setGenerateLoading(true)
    setNotice(null)

    try {
      const response = await fetch(`/api/posts/${finalId}/generate-seo`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          additionalInstructions,
          tone,
        }),
      })

      const data = (await response.json()) as GenerateSeoResponse
      if (!response.ok) {
        throw new Error(data.error || `Failed to generate SEO (${response.status})`)
      }

      if (typeof data.metaTitle === 'string') {
        dispatchFields({ type: 'UPDATE', path: 'meta.title', value: data.metaTitle })
      }
      if (typeof data.description === 'string') {
        dispatchFields({ type: 'UPDATE', path: 'meta.description', value: data.description })
      }
      dispatchFields({ type: 'UPDATE', path: 'meta.descriptionApproved', value: false })

      if (Array.isArray(data.keyTakeawaysNormalized)) {
        const rowsWithIds = data.keyTakeawaysNormalized.map((row: Record<string, unknown>) => ({
          id:
            typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
              ? crypto.randomUUID()
              : `tmp_${Math.random().toString(36).slice(2)}`,
          ...row,
        }))
        dispatchFields({ type: 'UPDATE', path: 'keyTakeaways', value: rowsWithIds })
      }
      dispatchFields({ type: 'UPDATE', path: 'keyTakeawaysApproved', value: false })

      if (Array.isArray(data.categoryIDs)) {
        dispatchFields({ type: 'UPDATE', path: 'categories', value: data.categoryIDs })
      }
      if (data.articleTypeID) {
        dispatchFields({ type: 'UPDATE', path: 'articleType', value: data.articleTypeID })
      }

      const updatePayload: Record<string, unknown> = {
        keyTakeawaysApproved: false,
      }

      if (typeof data.metaTitle === 'string' || typeof data.description === 'string') {
        updatePayload.meta = {
          ...(typeof data.metaTitle === 'string' ? { title: data.metaTitle } : {}),
          ...(typeof data.description === 'string' ? { description: data.description } : {}),
          descriptionApproved: false,
        }
      }
      if (Array.isArray(data.keyTakeawaysNormalized)) {
        updatePayload.keyTakeaways = data.keyTakeawaysNormalized
      }
      if (Array.isArray(data.categoryIDs)) {
        updatePayload.categories = data.categoryIDs
      }
      if (data.articleTypeID) {
        updatePayload.articleType = data.articleTypeID
      }

      const saveResponse = await fetch(`/api/posts/${finalId}?draft=true`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload),
      })

      if (!saveResponse.ok) {
        const raw = await saveResponse.text()
        throw new Error(raw || 'SEO fields were generated but auto-save failed.')
      }

      const engineSummary = data.settings?.model
        ? `${data.settings.model}${data.settings?.reasoning ? ` / ${data.settings.reasoning} reasoning` : ''}`
        : activeModelSummary
      setNotice({
        kind: 'success',
        text: `SEO draft generated. Generated with ${engineSummary}.`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error generating SEO.'
      setNotice({ kind: 'error', text: message })
    } finally {
      setGenerateLoading(false)
    }
  }

  return (
    <div className="post-publishing-assistant">
      <div className="post-publishing-assistant__header">
        <div className="post-publishing-assistant__heading">
          <h3>SEO &amp; Meta Assistant</h3>
        </div>
        <div className="post-publishing-assistant__meta">
          <span className="post-publishing-assistant__pill">{activeModelSummary}</span>
          {tenantID && !templateID && tenantDefaultTemplateID ? (
            <span className="post-publishing-assistant__pill post-publishing-assistant__pill--muted">
              Tenant default template loaded
            </span>
          ) : null}
        </div>
      </div>

      <div className="post-publishing-assistant__grid">
        <section className="post-publishing-assistant__section">
          <div className="post-publishing-assistant__section-copy">
            <h4>SEO Generation</h4>
            {assistantSettings.defaultInstructions ? (
              <p className="post-publishing-assistant__subtle">
                Anything in Additional requests takes priority for this run. Saved default
                instructions still apply underneath it.
              </p>
            ) : null}
          </div>

          <div className="post-publishing-assistant__controls">
            <label className="post-publishing-assistant__control">
              <span>Tone</span>
              <select
                className="post-publishing-assistant__input"
                value={tone}
                onChange={(event) => {
                  toneTouchedRef.current = true
                  setTone(event.target.value as SeoAssistantTone)
                }}
              >
                {SEO_ASSISTANT_TONE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="post-publishing-assistant__control post-publishing-assistant__control--wide">
              <span>Additional requests</span>
              <textarea
                className="post-publishing-assistant__input post-publishing-assistant__textarea"
                value={additionalInstructions}
                placeholder="Optional author instructions for this run. Anything entered here takes priority."
                rows={4}
                onChange={(event) => {
                  setAdditionalInstructions(event.target.value)
                }}
              />
            </label>
          </div>

          <div className="post-publishing-assistant__actions">
            <Button
              onClick={handleGenerateSeo}
              disabled={generateLoading}
              buttonStyle="primary"
            >
              {generateLoading ? 'Generating SEO…' : 'Generate SEO Draft'}
            </Button>
          </div>
        </section>

        <section className="post-publishing-assistant__section">
          <div className="post-publishing-assistant__section-copy">
            <h4>Social Graphics</h4>
          </div>

          <div className="post-publishing-assistant__meta">
            <span className="post-publishing-assistant__pill">
              {effectiveTemplateID ? 'Template linked' : 'No template linked'}
            </span>
            <span className="post-publishing-assistant__pill">
              {designID ? 'Saved graphic linked' : 'No saved graphic yet'}
            </span>
          </div>

          <div className="post-publishing-assistant__actions">
            <Button
              onClick={openPostGraphicEditor}
              disabled={!documentID}
              buttonStyle="secondary"
            >
              Open Post Graphic Editor
            </Button>
            {isSuperAdmin ? (
              <Button
                onClick={openTemplateEditor}
                disabled={!effectiveTemplateID}
                buttonStyle="secondary"
              >
                Edit Template
              </Button>
            ) : null}
            <Button
              onClick={openDesignEditor}
              disabled={!designID}
              buttonStyle="secondary"
            >
              Edit Saved Graphic
            </Button>
          </div>
        </section>
      </div>

      <div className="post-publishing-assistant__footer">
        {!documentID ? (
          <p>Save the post once to enable SEO generation and the main post graphic editor.</p>
        ) : null}
        {configLoading ? <p>Loading assistant defaults…</p> : null}
        {assistantSettings.defaultInstructions ? (
          <details className="post-publishing-assistant__details">
            <summary>Saved default instructions</summary>
            <div className="post-publishing-assistant__details-body">
              {assistantSettings.defaultInstructions}
            </div>
          </details>
        ) : null}
      </div>

      {notice ? (
        <div
          className={`post-publishing-assistant__notice post-publishing-assistant__notice--${notice.kind}`}
        >
          {notice.text}
        </div>
      ) : null}
    </div>
  )
}
