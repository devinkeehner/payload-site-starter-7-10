'use client'

import Image from 'next/image'
import React, { useEffect, useState } from 'react'

import styles from './puck-page-builder.module.css'

type OptionItem = {
  label: string
  value: unknown
  resource?: unknown
  thumbnailURL?: string | null
}

type MediaResource = Record<string, unknown> & {
  alt?: string | null
  filename?: string | null
  id?: string | number
  url?: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function getMediaId(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number') {
    const id = String(value)
    return id.trim() ? id : null
  }

  if (!isRecord(value)) return null

  const id = value.id ?? value._id ?? value.value
  if (typeof id === 'string' || typeof id === 'number') {
    const normalized = String(id)
    return normalized.trim() ? normalized : null
  }

  return null
}

export function getMediaResource(value: unknown): MediaResource | null {
  if (!isRecord(value)) return null

  const record = value as MediaResource
  if (record.id == null && record._id == null && record.value == null && !record.url) return null
  const id = getMediaId(record)

  return {
    ...record,
    id: id ?? undefined,
  }
}

function getMediaLabel(value: MediaResource | null): string {
  if (!value) return ''

  return String(value.alt || value.filename || value.id || 'Selected image')
}

function getMediaURL(value: MediaResource | null): string | null {
  if (!value) return null

  return typeof value.url === 'string' && value.url ? value.url : null
}

export function PuckMediaField({
  value,
  onChange,
  readOnly,
}: {
  value: unknown
  onChange: (value: unknown) => void
  readOnly?: boolean
}) {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<OptionItem[]>([])
  const [resolvedValue, setResolvedValue] = useState<MediaResource | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const currentMedia = getMediaResource(value) || resolvedValue
  const currentURL = getMediaURL(currentMedia)
  const currentId = getMediaId(value)

  useEffect(() => {
    const id = currentId

    if (getMediaResource(value) || !id) {
      setResolvedValue(null)
      return
    }

    const mediaId: string = id
    let cancelled = false

    async function loadCurrentMedia() {
      try {
        const params = new URLSearchParams({
          collection: 'media',
          ids: mediaId,
        })
        const res = await fetch(`/api/puck/options?${params.toString()}`, {
          credentials: 'same-origin',
        })
        if (!res.ok) return

        const payload = (await res.json()) as { options?: OptionItem[] }
        const resource = getMediaResource(payload.options?.[0]?.resource)
        if (!cancelled) {
          setResolvedValue(resource)
        }
      } catch {
        if (!cancelled) {
          setResolvedValue(null)
        }
      }
    }

    void loadCurrentMedia()

    return () => {
      cancelled = true
    }
  }, [currentId, value])

  useEffect(() => {
    if (!isExpanded) {
      setItems([])
      setIsLoading(false)
      setError(null)
      return
    }

    let cancelled = false

    async function loadMedia() {
      setIsLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams({
          collection: 'media',
          query,
        })
        const res = await fetch(`/api/puck/options?${params.toString()}`, {
          credentials: 'same-origin',
        })
        if (!res.ok) throw new Error(await res.text())

        const payload = (await res.json()) as { options?: OptionItem[] }
        if (!cancelled) {
          setItems(payload.options || [])
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load images')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    const timer = window.setTimeout(() => {
      void loadMedia()
    }, 180)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [isExpanded, query])

  return (
    <div className={styles.mediaField}>
      {currentMedia ? (
        <div className={styles.mediaFieldCurrent}>
          {currentURL ? (
            <span className={styles.mediaThumb}>
              <Image
                src={currentURL}
                alt={getMediaLabel(currentMedia)}
                fill
                sizes="72px"
                unoptimized
              />
            </span>
          ) : null}
          <div>
            <strong>{getMediaLabel(currentMedia)}</strong>
            <button type="button" disabled={readOnly} onClick={() => onChange(null)}>
              Clear
            </button>
          </div>
        </div>
      ) : null}

      <div className={styles.mediaFieldActions}>
        <button
          className={styles.mediaToggleButton}
          disabled={readOnly}
          onClick={() => setIsExpanded((current) => !current)}
          type="button"
        >
          {currentMedia
            ? isExpanded
              ? 'Hide media library'
              : 'Change image'
            : isExpanded
              ? 'Hide media library'
              : 'Choose image'}
        </button>
      </div>

      {isExpanded ? (
        <>
          <input
            type="search"
            value={query}
            disabled={readOnly}
            placeholder="Search images"
            onChange={(event) => setQuery(event.target.value)}
          />

          {error ? <div className={styles.fieldError}>{error}</div> : null}

          <div className={styles.mediaGrid} data-loading={isLoading ? 'true' : undefined}>
            {items.map((item) => {
              const resource = getMediaResource(item.resource)
              const thumbnailURL = item.thumbnailURL || getMediaURL(resource)
              const isSelected =
                currentMedia?.id != null && resource?.id != null && String(currentMedia.id) === String(resource.id)

              return (
                <button
                  key={String(item.value)}
                  type="button"
                  className={styles.mediaGridItem}
                  data-selected={isSelected ? 'true' : undefined}
                  disabled={readOnly}
                  title={item.label}
                  onClick={() => {
                    onChange(item.resource || item.value)
                    setIsExpanded(false)
                  }}
                >
                  {thumbnailURL ? (
                    <span className={styles.mediaThumb}>
                      <Image
                        src={thumbnailURL}
                        alt={item.label}
                        fill
                        sizes="120px"
                        unoptimized
                      />
                    </span>
                  ) : (
                    <span>No preview</span>
                  )}
                  <span>{item.label}</span>
                </button>
              )
            })}
          </div>

          {isLoading ? <div className={styles.mediaLoading}>Loading images...</div> : null}
        </>
      ) : null}
    </div>
  )
}
