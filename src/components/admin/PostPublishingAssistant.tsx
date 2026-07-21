'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Button, useDocumentInfo, useField, useForm, useFormFields } from '@payloadcms/ui'

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

type GraphicTemplateOption = {
  id: string
  title: string
}

type FieldState = {
  initialValue?: unknown
  value?: unknown
}

type FormFields = Record<string, FieldState | undefined> & {
  _id?: FieldState
}

type Notice = {
  kind: 'error' | 'info' | 'success'
  text: string
}

const asFormFields = (fields: unknown): FormFields =>
  typeof fields === 'object' && fields !== null ? (fields as FormFields) : {}

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

export const PostPublishingAssistant: React.FC = () => {
  const { dispatchFields } = useForm()
  const docInfo = useDocumentInfo() as { id?: string } | null
  const documentID =
    useFormFields(([fields]) => readIdField(fields)) || docInfo?.id || deriveIdFromPath()
  const designID = useFormFields(([fields]) => readRelationshipField(fields, 'graphicDesign'))
  const templateID = useFormFields(([fields]) => readRelationshipField(fields, 'graphicTemplate'))
  const tenantID = useFormFields(([fields]) => readRelationshipField(fields, 'tenant'))
  const { setValue: setTemplateValue } = useField<string | null>({ path: 'graphicTemplate' })
  const slugFromForm = useFormFields(([fields]) => {
    const slug = asFormFields(fields).slug?.value
    return typeof slug === 'string' ? slug : undefined
  })
  const [assistantSettings, setAssistantSettings] = useState<SeoAssistantSettings>(
    DEFAULT_SEO_ASSISTANT_SETTINGS,
  )
  const [tone, setTone] = useState<SeoAssistantTone>(DEFAULT_SEO_ASSISTANT_SETTINGS.defaultTone)
  const [additionalInstructions, setAdditionalInstructions] = useState('')
  const [generateLoading, setGenerateLoading] = useState(false)
  const [configLoading, setConfigLoading] = useState(true)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [tenantDefaultTemplateID, setTenantDefaultTemplateID] = useState<string | null>(null)
  const [graphicTemplates, setGraphicTemplates] = useState<GraphicTemplateOption[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [templateChoiceTouched, setTemplateChoiceTouched] = useState(false)
  const toneTouchedRef = useRef(false)

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
          const message =
            error instanceof Error ? error.message : 'Failed to load assistant defaults.'
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
    let ignore = false

    const loadGraphicTemplates = async () => {
      setTemplatesLoading(true)
      try {
        const query = new URLSearchParams({
          depth: '0',
          limit: '100',
          pagination: 'false',
          sort: 'title',
          'where[sourceCollection][equals]': 'posts',
        })
        const response = await fetch(`/api/graphic-templates?${query.toString()}`, {
          credentials: 'include',
        })
        if (!response.ok) throw new Error(`Failed to load graphic templates (${response.status})`)
        const result = (await response.json()) as {
          docs?: Array<{ id?: unknown; title?: unknown }>
        }
        if (ignore) return
        setGraphicTemplates(
          (Array.isArray(result.docs) ? result.docs : [])
            .filter((doc): doc is { id: string; title?: unknown } => typeof doc.id === 'string')
            .map((doc) => ({ id: doc.id, title: String(doc.title || 'Untitled template') })),
        )
      } catch (error) {
        console.error('[PostPublishingAssistant] Failed to load graphic templates', error)
        if (!ignore) setGraphicTemplates([])
      } finally {
        if (!ignore) setTemplatesLoading(false)
      }
    }

    void loadGraphicTemplates()
    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    if (!tenantID) {
      setTenantDefaultTemplateID(null)
      return
    }

    let ignore = false

    const loadDefaultGraphicTemplate = async () => {
      try {
        const response = await fetch(`/api/tenants/${encodeURIComponent(tenantID)}?depth=1`, {
          credentials: 'include',
        })
        if (!response.ok)
          throw new Error(`Failed to load the Site graphic template (${response.status})`)
        const tenant = (await response.json()) as { defaultGraphicTemplate?: unknown }
        const defaultTemplateID = readRelationshipID(tenant.defaultGraphicTemplate) || null
        if (ignore) return
        setTenantDefaultTemplateID(defaultTemplateID)
      } catch (error) {
        console.error('[PostPublishingAssistant] Failed to load the Site graphic template', error)
        if (!ignore) setTenantDefaultTemplateID(null)
      }
    }

    void loadDefaultGraphicTemplate()

    return () => {
      ignore = true
    }
  }, [tenantID])

  const effectiveTemplateID =
    templateID || (!templateChoiceTouched ? tenantDefaultTemplateID : null) || undefined

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

  const openDesignEditor = () => {
    if (!designID) return
    const params = new URLSearchParams({ collection: 'posts' })
    if (documentID) params.set('docId', documentID)
    params.set('designId', designID)
    if (effectiveTemplateID) params.set('templateId', effectiveTemplateID)
    launchGraphicEditor(params)
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
      setNotice({
        kind: 'info',
        text: 'Save the post first to generate SEO fields and launch the main post graphic editor.',
      })
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
          <h3>Search &amp; Social Assistant</h3>
          <p>
            Create a starting draft from the post, then review the fields below before publishing.
          </p>
        </div>
        <Button onClick={handleGenerateSeo} disabled={generateLoading} buttonStyle="primary">
          {generateLoading ? 'Generating SEO…' : 'Generate SEO'}
        </Button>
      </div>

      <details className="post-publishing-assistant__details">
        <summary>
          Adjust AI draft <span>Optional</span>
        </summary>
        <div className="post-publishing-assistant__details-body">
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
              placeholder="For example: emphasize the public meeting date and accessibility details."
              rows={3}
              onChange={(event) => setAdditionalInstructions(event.target.value)}
            />
          </label>
          <p className="post-publishing-assistant__subtle">{activeModelSummary}</p>
          {assistantSettings.defaultInstructions ? (
            <details className="post-publishing-assistant__saved-defaults">
              <summary>Saved default instructions</summary>
              <div>{assistantSettings.defaultInstructions}</div>
            </details>
          ) : null}
        </div>
      </details>

      <div className="post-publishing-assistant__graphics">
        <div>
          <h4>Social image</h4>
          <p>
            Create the SEO/social image in the visual builder or continue editing the linked design.
            {effectiveTemplateID
              ? ' The saved Site template will be used as the starting point.'
              : ''}
          </p>
          <label className="post-publishing-assistant__control post-publishing-assistant__template-control">
            <span>Starting design</span>
            <select
              className="post-publishing-assistant__input"
              disabled={templatesLoading}
              value={templateID || (!templateChoiceTouched ? tenantDefaultTemplateID || '' : '')}
              onChange={(event) => {
                setTemplateChoiceTouched(true)
                setTemplateValue(event.target.value || null)
              }}
            >
              <option value="">
                {templatesLoading ? 'Loading existing templates…' : 'Start without a template'}
              </option>
              {graphicTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.title}
                  {tenantDefaultTemplateID === template.id ? ' (Site default)' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="post-publishing-assistant__actions">
          <Button onClick={openPostGraphicEditor} disabled={!documentID} buttonStyle="secondary">
            Generate image
          </Button>
          {designID ? (
            <Button onClick={openDesignEditor} buttonStyle="secondary">
              Edit saved graphic
            </Button>
          ) : null}
        </div>
      </div>

      {!documentID ? (
        <p className="post-publishing-assistant__hint">
          Save this post once to enable drafting and social graphics.
        </p>
      ) : null}
      {configLoading ? (
        <p className="post-publishing-assistant__hint">Loading assistant defaults…</p>
      ) : null}

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
