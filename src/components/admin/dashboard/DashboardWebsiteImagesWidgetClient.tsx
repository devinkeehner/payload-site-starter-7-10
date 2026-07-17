'use client'

import { UploadInput, useConfig } from '@payloadcms/ui'
import { useMemo, useState } from 'react'

export type DashboardMediaAsset = {
  alt?: string | null
  filename?: string | null
  id: number | string
  mimeType?: string | null
  url?: string | null
}

type BannerSettings = {
  heroImageHorizontalAlign: 'center' | 'left' | 'right'
  heroImageVerticalAlign: 'bottom' | 'center' | 'top'
  heroTextAlign: 'left' | 'right'
  heroTextSize: 'default' | 'large' | 'small'
}

function getMediaId(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const resource = value as { id?: number | string; value?: number | string }
  const id = resource.id ?? resource.value
  return id == null ? null : String(id)
}

function DashboardImageField({
  api,
  description,
  onChange,
  path,
  serverURL,
  title,
  value,
}: {
  api: string
  description: string
  onChange: (value: string | null) => void
  path: string
  serverURL?: string
  title: string
  value: string | null
}) {
  return (
    <article className="campaign-dashboard-widget__native-media-field">
      <UploadInput
        allowCreate
        api={api}
        description={description}
        displayPreview
        label={title}
        onChange={(nextValue) => onChange(getMediaId(nextValue))}
        path={path}
        relationTo="media"
        serverURL={serverURL}
        value={value ?? undefined}
      />
    </article>
  )
}

export function DashboardBannerWidgetClient({
  documentId,
  editHref,
  initialBanner,
  initialDefaultFeaturedImage,
  initialMobileHeadshot,
  initialSettings,
  tenantId,
}: {
  documentId: string
  editHref: string
  initialBanner: DashboardMediaAsset | null
  initialDefaultFeaturedImage: DashboardMediaAsset | null
  initialMobileHeadshot: DashboardMediaAsset | null
  initialSettings: BannerSettings
  tenantId: string | null
}) {
  const {
    config: {
      routes: { api },
      serverURL,
    },
  } = useConfig()
  const [banner, setBanner] = useState<string | null>(() => getMediaId(initialBanner))
  const [defaultFeaturedImage, setDefaultFeaturedImage] = useState<string | null>(() =>
    getMediaId(initialDefaultFeaturedImage),
  )
  const [mobileHeadshot, setMobileHeadshot] = useState<string | null>(() =>
    getMediaId(initialMobileHeadshot),
  )
  const [settings, setSettings] = useState(initialSettings)
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    JSON.stringify({
      bannerImage: getMediaId(initialBanner),
      defaultFeaturedImage: getMediaId(initialDefaultFeaturedImage),
      mobileHeadshot: getMediaId(initialMobileHeadshot),
      ...initialSettings,
    }),
  )
  const [status, setStatus] = useState<'error' | 'idle' | 'saved' | 'saving'>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const currentSnapshot = useMemo(
    () =>
      JSON.stringify({
        bannerImage: banner,
        defaultFeaturedImage,
        mobileHeadshot,
        ...settings,
      }),
    [banner, defaultFeaturedImage, mobileHeadshot, settings],
  )
  const changed = currentSnapshot !== savedSnapshot

  const updateSetting = <Key extends keyof BannerSettings>(
    key: Key,
    value: BannerSettings[Key],
  ) => {
    setSettings((current) => ({ ...current, [key]: value }))
    setStatus('idle')
    setMessage(null)
  }

  const save = async () => {
    const bannerImage = getMediaId(banner)
    const defaultFeaturedImageId = defaultFeaturedImage
    const mobileHeadshotId = mobileHeadshot
    if (!bannerImage || !defaultFeaturedImageId || !mobileHeadshotId) {
      setStatus('error')
      setMessage('Choose all three website images before saving.')
      return
    }

    setStatus('saving')
    setMessage(null)

    try {
      const response = await fetch(
        `/api/standard-media/${encodeURIComponent(documentId)}?depth=0`,
        {
          body: JSON.stringify({
            bannerImage,
            defaultFeaturedImage: defaultFeaturedImageId,
            mobileHeadshot: mobileHeadshotId,
            ...settings,
          }),
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            ...(tenantId ? { 'X-Payload-Tenant': tenantId } : {}),
          },
          method: 'PATCH',
        },
      )

      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { message?: string } | null
        throw new Error(result?.message || 'The website images could not be saved.')
      }

      setSavedSnapshot(currentSnapshot)
      setStatus('saved')
      setMessage('Website images updated.')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'The website images could not be saved.')
    }
  }

  return (
    <section className="campaign-dashboard-widget campaign-dashboard-widget--media-editor">
      <div className="campaign-dashboard-widget__header campaign-dashboard-widget__header--media">
        <div>
          <h2>Website Images</h2>
          <p>Preview and replace the primary images used throughout this website.</p>
        </div>
        <a className="campaign-dashboard-widget__primary-button" href={editHref}>
          Edit website images
        </a>
      </div>

      <div className="campaign-dashboard-widget__media-grid">
        <DashboardImageField
          api={api}
          description="Homepage hero image and its common display controls."
          onChange={setBanner}
          path="dashboardBannerImage"
          serverURL={serverURL}
          title="Homepage Banner"
          value={banner}
        />

        <details className="campaign-dashboard-widget__banner-settings">
          <summary>Banner placement and text</summary>
          <div className="campaign-dashboard-widget__banner-controls">
            <label>
              <span>Image position</span>
              <select
                onChange={(event) =>
                  updateSetting(
                    'heroImageHorizontalAlign',
                    event.target.value as BannerSettings['heroImageHorizontalAlign'],
                  )
                }
                value={settings.heroImageHorizontalAlign}
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>
            <label>
              <span>Vertical crop</span>
              <select
                onChange={(event) =>
                  updateSetting(
                    'heroImageVerticalAlign',
                    event.target.value as BannerSettings['heroImageVerticalAlign'],
                  )
                }
                value={settings.heroImageVerticalAlign}
              >
                <option value="top">Top</option>
                <option value="center">Center</option>
                <option value="bottom">Bottom</option>
              </select>
            </label>
            <label>
              <span>Text side</span>
              <select
                onChange={(event) =>
                  updateSetting(
                    'heroTextAlign',
                    event.target.value as BannerSettings['heroTextAlign'],
                  )
                }
                value={settings.heroTextAlign}
              >
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </label>
            <label>
              <span>Text size</span>
              <select
                onChange={(event) =>
                  updateSetting(
                    'heroTextSize',
                    event.target.value as BannerSettings['heroTextSize'],
                  )
                }
                value={settings.heroTextSize}
              >
                <option value="small">Small</option>
                <option value="default">Default</option>
                <option value="large">Large</option>
              </select>
            </label>
          </div>
        </details>

        <DashboardImageField
          api={api}
          description="Portrait used in compact and mobile website layouts."
          onChange={setMobileHeadshot}
          path="dashboardMobileHeadshot"
          serverURL={serverURL}
          title="Mobile Headshot"
          value={mobileHeadshot}
        />

        <DashboardImageField
          api={api}
          description="Fallback image used when a post does not have its own featured image."
          onChange={setDefaultFeaturedImage}
          path="dashboardDefaultFeaturedImage"
          serverURL={serverURL}
          title="Default Featured Image"
          value={defaultFeaturedImage}
        />
      </div>

      <div className="campaign-dashboard-widget__media-actions">
        <button
          disabled={!changed || status === 'saving'}
          onClick={() => void save()}
          type="button"
        >
          {status === 'saving' ? 'Saving…' : 'Save banner settings'}
        </button>
        {message ? <span data-status={status}>{message}</span> : null}
      </div>
    </section>
  )
}
