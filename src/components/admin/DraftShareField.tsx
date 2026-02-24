'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Button, useDocumentInfo, useForm, useFormFields } from '@payloadcms/ui'

type FieldState = {
  value?: unknown
  initialValue?: unknown
}

type FormFields = Record<string, FieldState | undefined> & {
  _id?: FieldState
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

const deriveIdFromPath = (): string | undefined => {
  if (typeof window === 'undefined') return undefined
  try {
    const parts = window.location.pathname.split('/').filter(Boolean)
    const i = parts.findIndex((p) => p === 'collections')
    if (i !== -1 && parts[i + 2] && parts[i + 2] !== 'create') return parts[i + 2]
  } catch {
    // no-op
  }
  return undefined
}

const deriveCollectionSlugFromPath = (): string | undefined => {
  if (typeof window === 'undefined') return undefined
  try {
    const parts = window.location.pathname.split('/').filter(Boolean)
    const i = parts.findIndex((p) => p === 'collections')
    if (i !== -1 && parts[i + 1]) return parts[i + 1]
  } catch {
    // no-op
  }
  return undefined
}

const normalizeSlug = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}
const asRecord = (value: unknown): Record<string, unknown> =>
  (typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {})

const buildSiteBase = (): string => {
  const fromEnv =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_SERVER_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (fromEnv) {
    return fromEnv.startsWith('http') ? fromEnv.replace(/\/$/, '') : `https://${fromEnv.replace(/\/$/, '')}`
  }
  return ''
}

const DraftShareField: React.FC = () => {
  const { dispatchFields } = useForm()
  const docInfo = useDocumentInfo() as { id?: string } | null
  const infoId = docInfo?.id
  const fieldId = useFormFields(([fields]) => readIdField(fields))
  const slugFromForm = useFormFields(
    ([fields]) => {
      const map = asFormFields(fields)
      const slug = map.slug?.value ?? map.slug?.initialValue
      return typeof slug === 'string' ? slug : undefined
    },
  ) as string | undefined
  const tenantField = useFormFields(
    ([fields]) => {
      const map = asFormFields(fields)
      return map.tenant?.value ?? map.tenant?.initialValue
    },
  )
  const tokenFromForm = useFormFields(
    ([fields]) => {
      const map = asFormFields(fields)
      const token = map.draftShareToken?.value ?? map.draftShareToken?.initialValue
      return typeof token === 'string' ? token : undefined
    },
  ) as string | undefined

  const [status, setStatus] = useState<string | null>(null)
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)
  const [pathId, setPathId] = useState<string | undefined>(undefined)
  const [pathCollection, setPathCollection] = useState<string | undefined>(undefined)

  useEffect(() => {
    setIsHydrated(true)
    setPathId(deriveIdFromPath())
    setPathCollection(deriveCollectionSlugFromPath())
  }, [])

  const resolvedId = infoId || fieldId || pathId
  const collectionSlug = pathCollection || 'posts'

  const tenantId = useMemo(() => {
    if (!tenantField) return undefined
    if (typeof tenantField === 'string') return tenantField
    if (typeof tenantField === 'object') {
      const tenantRecord = asRecord(tenantField)
      const id = tenantRecord.id
      const value = tenantRecord.value
      if (typeof id === 'string') return id
      if (typeof value === 'string') return value
    }
    return undefined
  }, [tenantField])

  const fetchTenantSlug = async (id?: string): Promise<string | undefined> => {
    if (!id) return undefined
    try {
      const res = await fetch(`/api/tenants/${id}?depth=0`, { credentials: 'include' })
      if (!res.ok) return undefined
      const data = await res.json()
      return normalizeSlug(data?.slug)
    } catch {
      return undefined
    }
  }

  const generateToken = () => {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return globalThis.crypto.randomUUID().replace(/-/g, '')
    }
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  }

  const buildDraftUrl = async (token: string) => {
    const slug = normalizeSlug(slugFromForm)
    if (!slug) return null
    const tenantSlug = await fetchTenantSlug(tenantId)
    const base = buildSiteBase()
    if (!base) return null
    const params = new URLSearchParams({
      collection: collectionSlug,
      slug,
      token,
    })
    if (tenantSlug) params.set('tenant', tenantSlug)
    return `${base}/api/draft-share?${params.toString()}`
  }

  const handleCopy = async () => {
    setStatus(null)
    setCopiedUrl(null)

    const slug = normalizeSlug(slugFromForm)
    if (!slug) {
      setStatus('Save the document first to generate a draft URL.')
      return
    }
    if (!resolvedId) {
      setStatus('Save the document first to generate a draft URL.')
      return
    }

    setLoading(true)
    try {
      let token = normalizeSlug(tokenFromForm)
      if (!token) {
        token = generateToken()
        dispatchFields({ type: 'UPDATE', path: 'draftShareToken', value: token })
        const res = await fetch(`/api/${collectionSlug}/${resolvedId}?draft=true`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ draftShareToken: token }),
        })
        if (!res.ok) {
          const errorText = await res.text()
          throw new Error(`Failed to save draft token: ${errorText}`)
        }
      }

      const url = await buildDraftUrl(token)
      if (!url) {
        throw new Error('Unable to build the draft URL. Check NEXT_PUBLIC_SITE_URL.')
      }

      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
        setStatus('Draft URL copied to clipboard.')
      } else {
        setStatus('Copy the draft URL below.')
      }
      setCopiedUrl(url)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to copy draft URL.')
    } finally {
      setLoading(false)
    }
  }

  if (!isHydrated) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Button onClick={handleCopy} buttonStyle="primary" size="small" disabled={loading}>
        {loading ? 'Preparing…' : 'Copy draft URL'}
      </Button>
      {copiedUrl ? (
        <div>
          <small>Draft URL:</small>
          <div style={{ marginTop: 4 }}>
            <input
              type="text"
              readOnly
              value={copiedUrl}
              style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--theme-elevation-150)' }}
              onFocus={(event) => event.currentTarget.select()}
            />
          </div>
        </div>
      ) : null}
      {status ? (
        <small style={{ color: 'var(--theme-text)', opacity: 0.8 }}>{status}</small>
      ) : null}
    </div>
  )
}

export { DraftShareField }
