'use client'

import '@puckeditor/core/puck.css'

import { Puck, type Config, type Data } from '@puckeditor/core'
import React, { useEffect, useMemo, useState } from 'react'

import { buildDefaults, buildFields } from '@/components/admin/puck/PuckPageBuilderEditor'
import styles from '@/components/admin/puck/puck-page-builder.module.css'
import { hydratePuckMedia } from '@/lib/puck/mediaHydration'
import type { PuckBlockSchema, PuckPageData, PuckPostDoc } from '@/lib/puck/types'
import { postToPuckData } from '@/lib/puck/converters'

import { PuckPostBlockPreview } from './PuckPostBlockPreview'

export type PuckPostBuilderProps = {
  blockSchema: PuckBlockSchema[]
  initialData: PuckPageData
  initialThemeStyle?: Record<string, string> | null
  postId: string
  title: string
}

type PuckPostPayload = {
  data: PuckPageData
  post: PuckPostDoc
  themeStyle?: Record<string, string> | null
}

function getThemeStyleFromPayload(payload: PuckPostPayload): React.CSSProperties | undefined {
  if (!payload.themeStyle || typeof payload.themeStyle !== 'object') return undefined
  return payload.themeStyle as React.CSSProperties
}

function createConfig(blockSchema: PuckBlockSchema[], previewThemeStyle?: React.CSSProperties): Config {
  return {
    root: {
      render: (props: { children?: React.ReactNode }) => (
        <main
          style={{
            ...previewThemeStyle,
            background: 'var(--tenant-background, hsl(var(--background)))',
            color: 'var(--tenant-foreground, hsl(var(--foreground)))',
            fontFamily: 'var(--tenant-body-font, var(--font-sans, Arial, Helvetica, sans-serif))',
            minHeight: '100%',
            padding: '48px 16px',
          }}
        >
          <article style={{ margin: '0 auto', maxWidth: 960 }}>
            {props.children}
          </article>
        </main>
      ),
    },
    categories: {
      Post: {
        components: blockSchema.map((block) => block.slug),
      },
    },
    components: blockSchema.reduce<Config['components']>((acc, block) => {
      acc[block.slug] = {
        label: block.label,
        fields: buildFields(block.fields, []),
        defaultProps: buildDefaults(block.fields),
        render: (props) => (
          <PuckPostBlockPreview
            blockType={block.slug}
            props={props as Record<string, unknown>}
          />
        ),
      }
      return acc
    }, {}),
  }
}

function PuckPreviewIframe({
  children,
  previewThemeStyle,
}: {
  children: React.ReactNode
  previewThemeStyle?: React.CSSProperties
}) {
  return (
    <div
      className={styles.previewFrameRoot}
      style={{
        ...previewThemeStyle,
        background: 'var(--tenant-background, hsl(var(--background)))',
        color: 'var(--tenant-foreground, hsl(var(--foreground)))',
        fontFamily: 'var(--tenant-body-font, var(--font-sans, Arial, Helvetica, sans-serif))',
        minHeight: '100%',
      }}
    >
      {children}
    </div>
  )
}

export function PuckPostBuilderEditor({
  blockSchema,
  initialData,
  initialThemeStyle,
  postId,
  title,
}: PuckPostBuilderProps) {
  const [previewThemeStyle, setPreviewThemeStyle] = useState<React.CSSProperties | undefined>(
    initialThemeStyle ? (initialThemeStyle as React.CSSProperties) : undefined,
  )
  const config = useMemo(() => createConfig(blockSchema, previewThemeStyle), [blockSchema, previewThemeStyle])
  const overrides = useMemo(
    () => ({
      iframe: (props: { children: React.ReactNode }) => (
        <PuckPreviewIframe {...props} previewThemeStyle={previewThemeStyle} />
      ),
    }),
    [previewThemeStyle],
  )
  const [data, setData] = useState<PuckPageData | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadLatest() {
      setStatus('loading')
      setMessage(null)
      try {
        const res = await fetch(`/api/puck/posts/${postId}`, { cache: 'no-store' })
        if (!res.ok) throw new Error(await res.text())
        const payload = (await res.json()) as PuckPostPayload
        const nextData = await hydratePuckMedia(payload.data, blockSchema, [])
        if (!cancelled) {
          setData(nextData)
          setPreviewThemeStyle((current) => getThemeStyleFromPayload(payload) ?? current)
          setStatus('idle')
        }
      } catch (error) {
        const fallbackData = await hydratePuckMedia(initialData, blockSchema, [])
        if (!cancelled) {
          setData(fallbackData)
          setStatus('error')
          setMessage(error instanceof Error ? error.message : 'Unable to load the latest post data')
        }
      }
    }

    void loadLatest()

    return () => {
      cancelled = true
    }
  }, [blockSchema, initialData, postId])

  async function save(nextData: Data) {
    setStatus('saving')
    setMessage(null)
    try {
      const res = await fetch(`/api/puck/posts/${postId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: nextData }),
      })

      if (!res.ok) throw new Error(await res.text())
      const payload = (await res.json()) as PuckPostPayload
      setData(await hydratePuckMedia(postToPuckData(payload.post), blockSchema, []))
      setPreviewThemeStyle((current) => getThemeStyleFromPayload(payload) ?? current)
      setStatus('saved')
      setMessage('Post layout draft saved.')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Unable to save post layout')
    }
  }

  if (!data) {
    return <div className={styles.loading}>Loading post builder...</div>
  }

  return (
    <div className={styles.wrapper} style={previewThemeStyle}>
      <Puck
        config={config}
        data={data}
        headerTitle={`Post Builder: ${title}`}
        height="calc(100vh - 96px)"
        onChange={(nextData) => setData(nextData as PuckPageData)}
        onPublish={(nextData) => void save(nextData)}
        overrides={overrides}
        renderHeaderActions={({ state }) => (
          <button
            className={styles.saveButton}
            disabled={status === 'saving'}
            type="button"
            onClick={() => void save(state.data)}
          >
            {status === 'saving' ? 'Saving...' : 'Save Draft'}
          </button>
        )}
        viewports={[
          { width: 390, height: 'auto', label: 'Mobile' },
          { width: 768, height: 'auto', label: 'Tablet' },
          { width: 1100, height: 'auto', label: 'Desktop' },
        ]}
      />
      <div className={styles.status} data-state={status}>
        {status === 'saving' ? 'Saving draft...' : message}
      </div>
    </div>
  )
}
