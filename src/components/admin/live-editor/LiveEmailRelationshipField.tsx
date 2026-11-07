'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import { Check, Search, X } from 'lucide-react'
import type { PuckFieldSchema } from '@/lib/puck/types'
import {
  relationshipCollection,
  relationshipId,
  relationshipLabel,
  relationshipOptionValue,
  type RelationshipOption,
} from '@/lib/live-editor/relationships'
import { liveEmailOptionsURL, useLiveEmailResourceScope } from './LiveEmailResourceContext'
import styles from './live-editor-lexical.module.css'

const collectionLabels: Record<string, string> = {
  pages: 'Pages',
  posts: 'Posts',
  forms: 'Forms',
  categories: 'Categories',
  downloads: 'Downloads',
  tenants: 'Sites',
}

export function LiveEmailRelationshipField({
  field,
  value,
  onChange,
  readOnly,
}: {
  field: PuckFieldSchema & { hasMany?: boolean }
  value: unknown
  onChange: (value: unknown) => void
  readOnly?: boolean
}) {
  const { emailId } = useLiveEmailResourceScope()
  const label = field.label || field.name
  const inputId = useId()
  const collections = Array.isArray(field.relationTo)
    ? field.relationTo
    : [field.relationTo || 'pages']
  const fallback = collections[0] || 'pages'
  const selected = field.hasMany
    ? Array.isArray(value)
      ? value
      : []
    : relationshipId(value)
      ? [value]
      : []
  const [open, setOpen] = useState(false)
  const [collection, setCollection] = useState(() => relationshipCollection(selected[0], fallback))
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<RelationshipOption[]>([])
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const selectedKey = JSON.stringify(
    selected.map((item) => [relationshipCollection(item, fallback), relationshipId(item)]),
  )
  const selectedIds = useMemo(
    () => JSON.parse(selectedKey) as Array<[string, string]>,
    [selectedKey],
  )

  useEffect(() => {
    const controller = new AbortController()
    const groups = new Map<string, string[]>()
    for (const [target, id] of selectedIds) {
      if (id) groups.set(target, [...(groups.get(target) || []), id])
    }
    void Promise.all(
      Array.from(groups, async ([target, ids]) => {
        try {
          const params = new URLSearchParams({ collection: target, ids: ids.join(',') })
          const response = await fetch(liveEmailOptionsURL(emailId, params), {
            signal: controller.signal,
            credentials: 'same-origin',
          })
          if (!response.ok) return
          const data = (await response.json()) as { options?: RelationshipOption[] }
          if (!controller.signal.aborted) {
            setLabels((current) => ({
              ...current,
              ...Object.fromEntries(
                (data.options || []).map((item) => [`${target}:${item.value}`, item.label]),
              ),
            }))
          }
        } catch {
          /* Keep existing relationships intact when the label cannot be loaded. */
        }
      }),
    )
    return () => controller.abort()
  }, [emailId, selectedIds])

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setLoading(true)
    setError('')
    setOptions([])
    const timer = window.setTimeout(
      async () => {
        try {
          const params = new URLSearchParams({ collection, query })
          const response = await fetch(liveEmailOptionsURL(emailId, params), {
            signal: controller.signal,
            credentials: 'same-origin',
          })
          if (!response.ok)
            throw new Error(
              response.status === 403
                ? 'Your session expired. Sign in again to choose a document.'
                : 'Documents could not be loaded. Try again.',
            )
          const data = (await response.json()) as { options?: RelationshipOption[] }
          if (!controller.signal.aborted) {
            setOptions(data.options || [])
            setLabels((current) => ({
              ...current,
              ...Object.fromEntries(
                (data.options || []).map((item) => [`${collection}:${item.value}`, item.label]),
              ),
            }))
          }
        } catch (cause) {
          if (!controller.signal.aborted)
            setError(cause instanceof Error ? cause.message : 'Documents could not be loaded.')
        } finally {
          if (!controller.signal.aborted) setLoading(false)
        }
      },
      query ? 200 : 0,
    )
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [collection, emailId, open, query, retry])

  const remove = (index: number) =>
    onChange(field.hasMany ? selected.filter((_, itemIndex) => itemIndex !== index) : null)
  return (
    <div className={styles.relationshipField} onKeyDown={(event) => {
      if (event.key === 'Escape' && open) {
        event.preventDefault()
        event.stopPropagation()
        setOpen(false)
      }
    }}>
      {selected.map((item, index) => {
        const target = relationshipCollection(item, fallback)
        const id = relationshipId(item)
        return (
          <div className={styles.relationshipSelected} key={`${target}:${id}`}>
            <span>
              <strong>
                {labels[`${target}:${id}`] || relationshipLabel(item) || `Document ${id}`}
              </strong>
              <small>{collectionLabels[target] || target}</small>
            </span>
            <button
              aria-label={`Remove ${labels[`${target}:${id}`] || relationshipLabel(item) || 'document'}`}
              disabled={readOnly}
              onClick={() => remove(index)}
              type="button"
            >
              <X aria-hidden="true" size={15} />
            </button>
          </div>
        )
      })}
      <button
        aria-expanded={open}
        className={styles.relationshipBrowse}
        disabled={readOnly}
        onClick={() => {
          if (!open && selected[0]) setCollection(relationshipCollection(selected[0], fallback))
          setOpen(!open)
        }}
        type="button"
      >
        {open
          ? 'Close document picker'
          : selected.length
            ? field.hasMany
              ? 'Add documents'
              : 'Change document'
            : 'Choose document'}
      </button>
      {open ? (
        <div className={styles.relationshipPicker}>
          {collections.length > 1 ? (
            <label htmlFor={`${inputId}-collection`}>
              Document type
              <select
                id={`${inputId}-collection`}
                disabled={readOnly}
                value={collection}
                onChange={(event) => {
                  setCollection(event.target.value)
                  setQuery('')
                }}
              >
                {collections.map((target) => (
                  <option key={target} value={target}>
                    {collectionLabels[target] || target}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label htmlFor={inputId}>
            Search {collectionLabels[collection]?.toLowerCase() || collection}
            <span className={styles.relationshipSearch}>
              <Search aria-hidden="true" size={16} />
              <input
                autoFocus
                id={inputId}
                disabled={readOnly}
                type="search"
                value={query}
                placeholder="Search by title or slug"
                onChange={(event) => setQuery(event.target.value)}
              />
            </span>
          </label>
          <div
            aria-busy={loading}
            aria-label={`${label} documents`}
            className={styles.relationshipResults}
          >
            {loading ? (
              <p role="status">Loading documents…</p>
            ) : error ? (
              <div role="alert">
                <p>{error}</p>
                <button type="button" onClick={() => setRetry((current) => current + 1)}>
                  Try again
                </button>
              </div>
            ) : options.length ? (
              options.map((option) => {
                const isSelected = selectedIds.some(
                  ([target, id]) => target === collection && id === String(option.value),
                )
                return (
                  <button
                    type="button"
                    disabled={readOnly}
                    key={option.value}
                    aria-pressed={isSelected}
                    onClick={() => {
                      if (isSelected && field.hasMany) {
                        onChange(
                          selected.filter(
                            (item) =>
                              relationshipCollection(item, fallback) !== collection ||
                              relationshipId(item) !== String(option.value),
                          ),
                        )
                        return
                      }
                      const nextValue = relationshipOptionValue(field, collection, option)
                      onChange(field.hasMany ? [...selected, nextValue] : nextValue)
                      if (!field.hasMany) setOpen(false)
                    }}
                  >
                    <span>
                      {option.label}
                      {typeof option.resource?.slug === 'string' ? (
                        <small>
                          /{collection === 'posts' ? 'posts/' : ''}
                          {option.resource.slug === 'home' && collection === 'pages'
                            ? ''
                            : option.resource.slug}
                        </small>
                      ) : null}
                    </span>
                    {isSelected ? <Check aria-hidden="true" size={16} /> : null}
                  </button>
                )
              })
            ) : (
              <p role="status">
                {query
                  ? 'No matching documents. Try a different search.'
                  : 'No documents available.'}
              </p>
            )}
          </div>
          {options.length >= 20 ? (
            <p className={styles.relationshipHint}>
              Showing the first 20 matches. Search to narrow the list.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
