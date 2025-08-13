'use client'

import React, { useState } from 'react'
import { Button, useForm, useFormFields, useDocumentInfo } from '@payloadcms/ui'

 type GenerateSeoResponse = {
   description?: string
   keyTakeawaysNormalized?: Array<Record<string, unknown>>
   categoryIDs?: string[]
   articleTypeID?: string
   error?: string
 }
 
const GenerateSEOButton: React.FC = () => {
  const { dispatchFields } = useForm()
  const docInfo = useDocumentInfo() as { id?: string } | null
  const infoId = docInfo?.id
  const fieldId = useFormFields(
    ([fields]) =>
      (fields?.id?.value ??
        (fields?.id as any)?.initialValue ??
        (fields as any)?._id?.value ??
        (fields as any)?._id?.initialValue) as string | undefined,
  )
  const fieldKeys = useFormFields(([fields]) => Object.keys((fields as any) || {}))
  const slugFromForm = useFormFields(([fields]) => (fields as any)?.slug?.value as string | undefined)
  const [loading, setLoading] = useState(false)

  const disabled = loading

  const deriveIdFromPath = (): string | undefined => {
    if (typeof window === 'undefined') return undefined
    try {
      const parts = window.location.pathname.split('/').filter(Boolean)
      // Expect: /admin/collections/<slug>/<id>
      const i = parts.findIndex((p) => p === 'collections')
      if (i !== -1 && parts[i + 2] && parts[i + 2] !== 'create') return parts[i + 2]
    } catch (_) {
      // no-op
    }
    return undefined
  }

  const resolvedId = infoId || fieldId || deriveIdFromPath()

  const handleClick = async () => {
    let finalId = resolvedId
    if (!finalId && slugFromForm) {
      try {
        const q = new URLSearchParams({ 'where[slug][equals]': slugFromForm, limit: '1', depth: '0' })
        const lookup = await fetch(`/api/posts?${q.toString()}`, { method: 'GET' })
        const result = await lookup.json()
        finalId = result?.docs?.[0]?.id || result?.docs?.[0]?._id
        console.debug('[GenerateSEO] Fallback resolved id from slug', { slugFromForm, finalId })
      } catch (e) {
        console.error('[GenerateSEO] Fallback lookup by slug failed', e)
      }
    }
    if (!finalId) {
      const path = typeof window !== 'undefined' ? window.location.pathname + window.location.search : ''
      console.error(
        '[GenerateSEO] Cannot generate: missing document id. Save the post once, then click Generate SEO again.',
      )
      console.debug('[GenerateSEO] Debug', { infoId, fieldId, fieldKeys, slugFromForm, path })
      return
    }
    setLoading(true)
    try {
      console.debug('[GenerateSEO] Using document id:', finalId, { infoId, fieldId })
      const res = await fetch(`/api/posts/${finalId}/generate-seo`, {
        method: 'POST',
        credentials: 'include',
      })
      let data: GenerateSeoResponse | null = null
      let rawText: string | null = null
      try {
        data = await res.json()
      } catch (_) {
        try {
          rawText = await res.text()
        } catch (_) {
          // no-op
        }
      }
      if (!res.ok) {
        console.error('[GenerateSEO] Endpoint error', { status: res.status, body: data ?? rawText })
        throw new Error(data?.error || `Failed to generate (status ${res.status})`)
      }

      if (typeof data?.description === 'string') {
        dispatchFields({ type: 'UPDATE', path: 'meta.description', value: data.description })
      }
      // Replace keyTakeaways with rows that include client-side ids so they render immediately
      if (Array.isArray(data?.keyTakeawaysNormalized)) {
        const makeId = () => {
          const c = (globalThis as { crypto?: Crypto }).crypto
          return c && typeof c.randomUUID === 'function'
            ? c.randomUUID()
            : `tmp_${Math.random().toString(36).slice(2)}`
        }

        const rowsWithIds = data.keyTakeawaysNormalized.map((row: Record<string, unknown>) => ({ id: makeId(), ...row }))
        dispatchFields({ type: 'UPDATE', path: 'keyTakeaways', value: rowsWithIds })
      }
      if (Array.isArray(data?.categoryIDs)) {
        dispatchFields({ type: 'UPDATE', path: 'categories', value: data.categoryIDs })
      }
      if (data?.articleTypeID) {
        dispatchFields({ type: 'UPDATE', path: 'articleType', value: data.articleTypeID })
      }

      // Persist the generated fields to the server, then refresh the page
      try {
        const updatePayload: any = {}
        if (typeof data?.description === 'string') {
          updatePayload.meta = { description: data.description }
        }
        if (Array.isArray(data?.keyTakeawaysNormalized)) {
          updatePayload.keyTakeaways = data.keyTakeawaysNormalized
        }
        if (Array.isArray(data?.categoryIDs)) {
          updatePayload.categories = data.categoryIDs
        }
        if (data?.articleTypeID) {
          updatePayload.articleType = data.articleTypeID
        }
        if (Object.keys(updatePayload).length) {
          const saveRes = await fetch(`/api/posts/${finalId}?draft=true`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(updatePayload),
          })
          if (!saveRes.ok) {
            console.error('[GenerateSEO] Auto-save failed', await saveRes.text())
          }
        }
      } catch (e) {
        console.error('[GenerateSEO] Auto-save error', e)
      }

      if (typeof window !== 'undefined') {
        window.location.reload()
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      alert(message || 'Error generating SEO')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <Button onClick={handleClick} disabled={disabled} buttonStyle="primary">
        {loading ? 'Generating…' : 'Generate SEO'}
      </Button>

      {!resolvedId ? (
        <div style={{ marginTop: 8 }}>
          <small>Save the post first to enable generation.</small>
        </div>
      ) : null}
    </div>
  )
}

export { GenerateSEOButton }

