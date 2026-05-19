'use client'

import type { ListViewClientProps } from 'payload'

import {
  DefaultListView,
  GridViewIcon,
  Link,
  ListViewIcon,
  useConfig,
  useListDrawerContext,
  useListQuery,
  useSelection,
} from '@payloadcms/ui'
import { formatAdminURL } from 'payload/shared'
import React, { useMemo, useState } from 'react'

import './media-gallery-list-view.scss'

type MediaViewMode = 'gallery' | 'list'

type MediaDoc = {
  id?: number | string
  alt?: string | null
  filename?: string | null
  filesize?: number | string | null
  height?: number | null
  mimeType?: string | null
  thumbnailURL?: string | null
  updatedAt?: string | null
  url?: string | null
  width?: number | null
  sizes?: {
    thumbnail?: {
      url?: string | null
    }
  }
}

function getMediaTitle(doc: MediaDoc) {
  return doc.alt || doc.filename || (doc.id != null ? `Media ${doc.id}` : 'Media')
}

function getMediaPreviewURL(doc: MediaDoc) {
  return doc.thumbnailURL || doc.sizes?.thumbnail?.url || doc.url || null
}

function formatFileSize(value: MediaDoc['filesize']) {
  if (typeof value === 'string') return value
  if (typeof value !== 'number' || Number.isNaN(value)) return null

  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function MediaViewToggle({
  mode,
  setMode,
}: {
  mode: MediaViewMode
  setMode: (mode: MediaViewMode) => void
}) {
  return (
    <div className="media-gallery-list-view__toggle" role="group" aria-label="Media view mode">
      <button
        type="button"
        aria-pressed={mode === 'gallery'}
        className="media-gallery-list-view__toggle-button"
        onClick={() => setMode('gallery')}
      >
        <GridViewIcon />
        <span>Gallery</span>
      </button>
      <button
        type="button"
        aria-pressed={mode === 'list'}
        className="media-gallery-list-view__toggle-button"
        onClick={() => setMode('list')}
      >
        <ListViewIcon />
        <span>List</span>
      </button>
    </div>
  )
}

function MediaGalleryGrid({ enableRowSelections }: { enableRowSelections?: boolean }) {
  const {
    config: {
      routes: { admin: adminRoute },
    },
  } = useConfig()
  const { data } = useListQuery()
  const { drawerSlug, onSelect } = useListDrawerContext()
  const { selected, setSelection } = useSelection()
  const docs = useMemo(() => (data?.docs || []) as MediaDoc[], [data?.docs])
  const isInPicker = Boolean(drawerSlug && onSelect)

  const cards = useMemo(() => {
    return docs.map((doc) => {
      const id = doc.id
      const idString = id != null ? String(id) : ''
      const selectionID = id ?? idString
      const previewURL = getMediaPreviewURL(doc)
      const title = getMediaTitle(doc)
      const isImage = doc.mimeType?.startsWith('image/')
      const details = [doc.mimeType, formatFileSize(doc.filesize)].filter(Boolean).join(' · ')
      const editURL = idString
        ? formatAdminURL({
            adminRoute,
            path: `/collections/media/${encodeURIComponent(idString)}`,
          })
        : ''
      const isSelected = selectionID ? selected.get(selectionID) === true : false

      const activate = () => {
        if (!idString) return

        if (isInPicker && enableRowSelections) {
          setSelection(selectionID)
          return
        }

        if (isInPicker && typeof onSelect === 'function') {
          onSelect({
            collectionSlug: 'media',
            doc,
            docID: idString,
          })
          return
        }

        window.location.assign(editURL)
      }

      const content = (
        <>
          <span className="media-gallery-list-view__preview">
            {previewURL && isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewURL} alt={doc.alt || title} loading="lazy" />
            ) : (
              <span className="media-gallery-list-view__file">
                <span>{doc.filename?.split('.').pop()?.toUpperCase() || 'FILE'}</span>
              </span>
            )}
          </span>
          <span className="media-gallery-list-view__body">
            <span className="media-gallery-list-view__title">{title}</span>
            {details ? <span className="media-gallery-list-view__meta">{details}</span> : null}
            {doc.width && doc.height ? (
              <span className="media-gallery-list-view__meta">
                {doc.width} x {doc.height}
              </span>
            ) : null}
          </span>
        </>
      )

      return (
        <article
          className="media-gallery-list-view__card"
          data-selected={isSelected ? 'true' : undefined}
          key={idString || title}
        >
          {enableRowSelections && idString ? (
            <label className="media-gallery-list-view__select">
              <input
                type="checkbox"
                checked={isSelected}
                aria-label={`Select ${title}`}
                onChange={() => setSelection(selectionID)}
              />
            </label>
          ) : null}
          {isInPicker ? (
            <button
              type="button"
              className="media-gallery-list-view__card-button"
              title={title}
              onClick={activate}
            >
              {content}
            </button>
          ) : (
            <Link className="media-gallery-list-view__card-button" href={editURL} title={title}>
              {content}
            </Link>
          )}
        </article>
      )
    })
  }, [adminRoute, docs, enableRowSelections, isInPicker, onSelect, selected, setSelection])

  return <div className="media-gallery-list-view__grid">{cards}</div>
}

export default function MediaGalleryListView(props: ListViewClientProps) {
  const [mode, setMode] = useState<MediaViewMode>('gallery')
  const beforeActions = useMemo(
    () => [
      <MediaViewToggle key="media-view-toggle" mode={mode} setMode={setMode} />,
      ...(props.beforeActions || []),
    ],
    [mode, props.beforeActions],
  )

  return (
    <DefaultListView
      {...props}
      beforeActions={beforeActions}
      Table={mode === 'gallery' ? <MediaGalleryGrid enableRowSelections={props.enableRowSelections} /> : props.Table}
    />
  )
}
