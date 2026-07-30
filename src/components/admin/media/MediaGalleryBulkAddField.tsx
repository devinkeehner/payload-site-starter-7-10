'use client'

import type { FormState, UIFieldClientComponent } from 'payload'

import { Button, SearchIcon, useForm } from '@payloadcms/ui'
import Image from 'next/image'
import React, { useEffect, useState } from 'react'

import './media-gallery-bulk-add-field.scss'

type MediaOption = {
  label: string
  resource?: {
    id?: number | string
    mimeType?: string | null
    url?: string | null
  }
  thumbnailURL?: string | null
  value: number | string
}

function getMediaID(value: unknown): string | null {
  if (typeof value === 'number' || typeof value === 'string') return String(value)
  if (!value || typeof value !== 'object') return null

  const id = (value as { id?: unknown; value?: unknown }).id ?? (value as { value?: unknown }).value
  return typeof id === 'number' || typeof id === 'string' ? String(id) : null
}

function createGalleryRow(mediaID: number | string): FormState {
  return {
    caption: {
      initialValue: null,
      passesCondition: true,
      valid: true,
      value: null,
    },
    media: {
      initialValue: null,
      passesCondition: true,
      valid: true,
      value: mediaID,
    },
  }
}

export const MediaGalleryBulkAddField: UIFieldClientComponent = ({ path }) => {
  const { addFieldRow, disabled, getDataByPath, replaceFieldRow } = useForm()
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<MediaOption[]>([])
  const [selectedIDs, setSelectedIDs] = useState<Set<string>>(() => new Set())
  const [error, setError] = useState<string | null>(null)
  const arrayPath = path.replace(/\.bulkAddGalleryImages$/u, '.images')
  const arraySchemaPath = arrayPath

  useEffect(() => {
    if (!isOpen) return

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setIsLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams({
          collection: 'media',
          query,
        })
        const response = await fetch(`/api/puck/options?${params.toString()}`, {
          credentials: 'same-origin',
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(await response.text())

        const payload = (await response.json()) as { options?: MediaOption[] }
        setOptions(
          (payload.options || []).filter(
            (option) => !option.resource?.mimeType || option.resource.mimeType.startsWith('image/'),
          ),
        )
      } catch (fetchError) {
        if (controller.signal.aborted) return
        setError(fetchError instanceof Error ? fetchError.message : 'Unable to load media.')
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }, 180)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [isOpen, query])

  const existingIDs = (() => {
    const rows = getDataByPath<unknown[]>(arrayPath)
    const ids = new Set<string>()

    if (Array.isArray(rows)) {
      rows.forEach((row) => {
        if (!row || typeof row !== 'object') return
        const id = getMediaID((row as { media?: unknown }).media)
        if (id) ids.add(id)
      })
    }

    return ids
  })()

  function toggleSelection(id: string) {
    setSelectedIDs((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function addSelectedImages() {
    const selected = options.filter((option) => selectedIDs.has(String(option.value)))
    if (!selected.length) return

    const currentRows = getDataByPath<unknown[]>(arrayPath)
    const rowCount = Array.isArray(currentRows) ? currentRows.length : 0
    const hasOnlyBlankRow =
      Array.isArray(currentRows) &&
      currentRows.length === 1 &&
      (!currentRows[0] ||
        typeof currentRows[0] !== 'object' ||
        !getMediaID((currentRows[0] as { media?: unknown }).media))

    selected.forEach((option, index) => {
      const subFieldState = createGalleryRow(option.value)
      if (index === 0 && hasOnlyBlankRow) {
        replaceFieldRow({
          path: arrayPath,
          rowIndex: 0,
          schemaPath: arraySchemaPath,
          subFieldState,
        })
      } else {
        addFieldRow({
          path: arrayPath,
          rowIndex: hasOnlyBlankRow ? index : rowCount + index,
          schemaPath: arraySchemaPath,
          subFieldState,
        })
      }
    })

    setSelectedIDs(new Set())
    setIsOpen(false)
  }

  return (
    <div className="media-gallery-bulk-add">
      <div className="media-gallery-bulk-add__intro">
        <div>
          <strong>Gallery images</strong>
          <span>Select several existing images and add them as gallery rows in one step.</span>
        </div>
        <Button
          buttonStyle="secondary"
          disabled={disabled}
          onClick={() => setIsOpen((current) => !current)}
          size="small"
          type="button"
        >
          {isOpen ? 'Close bulk add' : 'Bulk add images'}
        </Button>
      </div>

      {isOpen ? (
        <div className="media-gallery-bulk-add__picker">
          <label className="media-gallery-bulk-add__search">
            <SearchIcon />
            <input
              aria-label="Search gallery images"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the media library"
              type="search"
              value={query}
            />
          </label>

          {error ? <div className="media-gallery-bulk-add__error">{error}</div> : null}

          <div className="media-gallery-bulk-add__grid" aria-busy={isLoading}>
            {options.map((option) => {
              const id = String(option.value)
              const isAlreadyAdded = existingIDs.has(id)
              const isSelected = selectedIDs.has(id)
              const previewURL = option.thumbnailURL || option.resource?.url

              return (
                <button
                  aria-pressed={isSelected}
                  className="media-gallery-bulk-add__item"
                  data-selected={isSelected ? 'true' : undefined}
                  disabled={isAlreadyAdded}
                  key={id}
                  onClick={() => toggleSelection(id)}
                  title={isAlreadyAdded ? `${option.label} is already in this gallery` : option.label}
                  type="button"
                >
                  <span className="media-gallery-bulk-add__preview">
                    {previewURL ? (
                      <Image
                        alt=""
                        fill
                        sizes="160px"
                        src={previewURL}
                        unoptimized
                      />
                    ) : (
                      <span>No preview</span>
                    )}
                  </span>
                  <span className="media-gallery-bulk-add__label">{option.label}</span>
                  <span className="media-gallery-bulk-add__status">
                    {isAlreadyAdded ? 'Added' : isSelected ? 'Selected' : 'Select'}
                  </span>
                </button>
              )
            })}
          </div>

          {isLoading ? <p className="media-gallery-bulk-add__message">Loading images…</p> : null}
          {!isLoading && !options.length ? (
            <p className="media-gallery-bulk-add__message">No images found.</p>
          ) : null}

          <div className="media-gallery-bulk-add__footer">
            <span>
              {selectedIDs.size
                ? `${selectedIDs.size} image${selectedIDs.size === 1 ? '' : 's'} selected`
                : 'Select images to add'}
            </span>
            <Button
              disabled={!selectedIDs.size}
              onClick={addSelectedImages}
              size="small"
              type="button"
            >
              Add selected images
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
