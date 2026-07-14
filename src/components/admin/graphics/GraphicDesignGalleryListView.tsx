'use client'

import type { ListViewClientProps } from 'payload'

import {
  DefaultListView,
  Gutter,
  Link,
  useConfig,
  useListDrawerContext,
  useListQuery,
  useSelection,
} from '@payloadcms/ui'
import { Plus } from 'lucide-react'
import { formatAdminURL } from 'payload/shared'
import React, { useEffect, useMemo, useRef, useState } from 'react'

import { renderGraphicSceneToPngBlob } from '@/lib/graphics/studioExport.client'
import { GRAPHIC_CANVAS_PRESETS, type GraphicScene } from '@/lib/graphics/studioTypes'

import './graphic-design-gallery-list-view.scss'

type GraphicDesignDoc = {
  id?: number | string
  studioScene?: GraphicScene | null
  title?: string | null
  updatedAt?: string | null
}

function isGraphicScene(value: unknown): value is GraphicScene {
  if (!value || typeof value !== 'object') return false
  const scene = value as Partial<GraphicScene>
  return (
    typeof scene.width === 'number' &&
    typeof scene.height === 'number' &&
    typeof scene.background === 'string' &&
    Array.isArray(scene.layers)
  )
}

function formatModifiedDate(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/New_York',
  }).format(date)
}

function GraphicDesignThumbnail({ scene, title }: { scene: GraphicScene; title: string }) {
  const [previewURL, setPreviewURL] = useState<string | null>(null)
  const [failureMessage, setFailureMessage] = useState<string | null>(null)
  const [shouldRender, setShouldRender] = useState(false)
  const previewRef = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    const element = previewRef.current
    if (!element || typeof IntersectionObserver === 'undefined') {
      setShouldRender(true)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        setShouldRender(true)
        observer.disconnect()
      },
      { rootMargin: '240px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!shouldRender) return
    let active = true
    let objectURL: string | null = null
    setFailureMessage(null)
    void renderGraphicSceneToPngBlob(scene, { maxDimension: 720 })
      .then((blob) => {
        if (!active) return
        objectURL = URL.createObjectURL(blob)
        setPreviewURL(objectURL)
      })
      .catch((error: unknown) => {
        if (active) {
          setFailureMessage(error instanceof Error ? error.message : 'Unable to render this design')
        }
      })
    return () => {
      active = false
      if (objectURL) URL.revokeObjectURL(objectURL)
    }
  }, [scene, shouldRender])

  return (
    <span className="graphic-design-gallery__preview" ref={previewRef}>
      {previewURL ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt={`${title} design preview`} loading="lazy" src={previewURL} />
      ) : (
        <span className="graphic-design-gallery__preview-status" title={failureMessage || undefined}>
          {failureMessage ? 'Preview unavailable' : 'Rendering preview…'}
        </span>
      )}
    </span>
  )
}

function GraphicDesignGrid({ enableRowSelections }: { enableRowSelections?: boolean }) {
  const {
    config: {
      routes: { admin: adminRoute },
    },
  } = useConfig()
  const { data } = useListQuery()
  const { drawerSlug, onSelect } = useListDrawerContext()
  const { selected, setSelection } = useSelection()
  const docs = useMemo(() => (data?.docs || []) as GraphicDesignDoc[], [data?.docs])
  const isInPicker = Boolean(drawerSlug && onSelect)

  return (
    <div className="graphic-design-gallery__grid">
      {docs.map((doc) => {
        const id = doc.id
        const idString = id == null ? '' : String(id)
        const selectionID = id ?? idString
        const title = doc.title?.trim() || 'Untitled design'
        const scene = isGraphicScene(doc.studioScene) ? doc.studioScene : null
        const preset = scene ? GRAPHIC_CANVAS_PRESETS[scene.preset] : null
        const modified = formatModifiedDate(doc.updatedAt)
        const studioURL = idString
          ? formatAdminURL({
              adminRoute,
              path: `/collections/graphic-designs/${encodeURIComponent(idString)}`,
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
            onSelect({ collectionSlug: 'graphic-designs', doc, docID: idString })
            return
          }
          window.location.assign(studioURL)
        }

        const content = (
          <>
            {scene ? (
              <GraphicDesignThumbnail scene={scene} title={title} />
            ) : (
              <span className="graphic-design-gallery__preview">
                <span className="graphic-design-gallery__preview-status">Preview unavailable</span>
              </span>
            )}
            <span className="graphic-design-gallery__body">
              <strong className="graphic-design-gallery__title">{title}</strong>
              {scene ? (
                <span className="graphic-design-gallery__meta">
                  {scene.width} × {scene.height}{preset ? ` · ${preset.label}` : ''}
                </span>
              ) : null}
              {modified ? <span className="graphic-design-gallery__meta">Modified {modified}</span> : null}
            </span>
          </>
        )

        return (
          <article
            className="graphic-design-gallery__card"
            data-selected={isSelected ? 'true' : undefined}
            key={idString || title}
          >
            {enableRowSelections && idString ? (
              <label className="graphic-design-gallery__select">
                <input
                  aria-label={`Select ${title}`}
                  checked={isSelected}
                  onChange={() => setSelection(selectionID)}
                  type="checkbox"
                />
              </label>
            ) : null}
            {isInPicker ? (
              <button
                className="graphic-design-gallery__card-button"
                onClick={activate}
                title={`Open ${title}`}
                type="button"
              >
                {content}
              </button>
            ) : (
              <Link className="graphic-design-gallery__card-button" href={studioURL} title={`Open ${title}`}>
                {content}
              </Link>
            )}
          </article>
        )
      })}
    </div>
  )
}

export default function GraphicDesignGalleryListView(props: ListViewClientProps) {
  const galleryHeader = (
    <>
      {props.BeforeList}
      <Gutter className="graphic-design-gallery__header">
        <div>
          <h1>Designs</h1>
          <p>Create and manage campaign graphics.</p>
        </div>
        {props.hasCreatePermission ? (
          <Link className="graphic-design-gallery__new" href={props.newDocumentURL}>
            <Plus />
            New design
          </Link>
        ) : null}
      </Gutter>
    </>
  )

  return (
    <DefaultListView
      {...props}
      BeforeList={galleryHeader}
      Table={<GraphicDesignGrid enableRowSelections={props.enableRowSelections} />}
    />
  )
}
