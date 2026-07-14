'use client'

import Image from 'next/image'
import { type ReactNode, useMemo, useState } from 'react'

import { PuckMediaField, getMediaResource } from '@/components/admin/puck/PuckMediaField'

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
  const resource = getMediaResource(value)
  return resource?.id == null ? null : String(resource.id)
}

function DashboardImageCard({
  children,
  chooseLabel,
  description,
  objectPosition,
  onChange,
  portrait = false,
  title,
  uploadLabel,
  value,
}: {
  children?: ReactNode
  chooseLabel: string
  description: string
  objectPosition?: string
  onChange: (value: unknown) => void
  portrait?: boolean
  title: string
  uploadLabel: string
  value: unknown
}) {
  const resource = getMediaResource(value)

  return (
    <article className="campaign-dashboard-widget__media-card">
      <div
        className={`campaign-dashboard-widget__media-preview${portrait ? ' campaign-dashboard-widget__media-preview--portrait' : ''}`}
      >
        {resource?.url ? (
          <Image
            alt={String(resource.alt || resource.filename || title)}
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            src={resource.url}
            style={{ objectFit: 'cover', objectPosition }}
            unoptimized
          />
        ) : (
          <span>No image selected</span>
        )}
      </div>
      <div className="campaign-dashboard-widget__media-card-controls">
        <div className="campaign-dashboard-widget__media-card-header">
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <PuckMediaField
          chooseLabel={chooseLabel}
          display="compact"
          onChange={onChange}
          uploadLabel={uploadLabel}
          value={value}
        />
        {children}
      </div>
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
  const [banner, setBanner] = useState<unknown>(initialBanner)
  const [defaultFeaturedImage, setDefaultFeaturedImage] = useState<unknown>(
    initialDefaultFeaturedImage,
  )
  const [mobileHeadshot, setMobileHeadshot] = useState<unknown>(initialMobileHeadshot)
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
        bannerImage: getMediaId(banner),
        defaultFeaturedImage: getMediaId(defaultFeaturedImage),
        mobileHeadshot: getMediaId(mobileHeadshot),
        ...settings,
      }),
    [banner, defaultFeaturedImage, mobileHeadshot, settings],
  )
  const changed = currentSnapshot !== savedSnapshot

  const updateSetting = <Key extends keyof BannerSettings>(key: Key, value: BannerSettings[Key]) => {
    setSettings((current) => ({ ...current, [key]: value }))
    setStatus('idle')
    setMessage(null)
  }

  const save = async () => {
    const bannerImage = getMediaId(banner)
    const defaultFeaturedImageId = getMediaId(defaultFeaturedImage)
    const mobileHeadshotId = getMediaId(mobileHeadshot)
    if (!bannerImage || !defaultFeaturedImageId || !mobileHeadshotId) {
      setStatus('error')
      setMessage('Choose all three website images before saving.')
      return
    }

    setStatus('saving')
    setMessage(null)

    try {
      const response = await fetch(`/api/standard-media/${encodeURIComponent(documentId)}?depth=0`, {
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
      })

      if (!response.ok) {
        const result = await response.json().catch(() => null) as { message?: string } | null
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
        <a href={editHref}>Full settings</a>
      </div>

      <div className="campaign-dashboard-widget__media-grid">
        <DashboardImageCard
          chooseLabel="Choose another banner"
          description="Homepage hero image and its common display controls."
          objectPosition={`${settings.heroImageHorizontalAlign} ${settings.heroImageVerticalAlign}`}
          onChange={(value) => {
            setBanner(value)
            setStatus('idle')
            setMessage(null)
          }}
          title="Homepage Banner"
          uploadLabel="Upload banner"
          value={banner}
        >
          <div className="campaign-dashboard-widget__banner-controls">
            <label>
              <span>Image position</span>
              <select
                onChange={(event) => updateSetting('heroImageHorizontalAlign', event.target.value as BannerSettings['heroImageHorizontalAlign'])}
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
                onChange={(event) => updateSetting('heroImageVerticalAlign', event.target.value as BannerSettings['heroImageVerticalAlign'])}
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
                onChange={(event) => updateSetting('heroTextAlign', event.target.value as BannerSettings['heroTextAlign'])}
                value={settings.heroTextAlign}
              >
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </label>
            <label>
              <span>Text size</span>
              <select
                onChange={(event) => updateSetting('heroTextSize', event.target.value as BannerSettings['heroTextSize'])}
                value={settings.heroTextSize}
              >
                <option value="small">Small</option>
                <option value="default">Default</option>
                <option value="large">Large</option>
              </select>
            </label>
          </div>
        </DashboardImageCard>

        <DashboardImageCard
          chooseLabel="Choose another headshot"
          description="Portrait used in compact and mobile website layouts."
          onChange={(value) => {
            setMobileHeadshot(value)
            setStatus('idle')
            setMessage(null)
          }}
          portrait
          title="Mobile Headshot"
          uploadLabel="Upload headshot"
          value={mobileHeadshot}
        />

        <DashboardImageCard
          chooseLabel="Choose another featured image"
          description="Fallback image used when a post does not have its own featured image."
          onChange={(value) => {
            setDefaultFeaturedImage(value)
            setStatus('idle')
            setMessage(null)
          }}
          title="Default Featured Image"
          uploadLabel="Upload featured image"
          value={defaultFeaturedImage}
        />
      </div>

      <div className="campaign-dashboard-widget__media-actions">
        <button disabled={!changed || status === 'saving'} onClick={() => void save()} type="button">
          {status === 'saving' ? 'Saving…' : 'Save image changes'}
        </button>
        {message ? <span data-status={status}>{message}</span> : null}
      </div>
    </section>
  )
}
