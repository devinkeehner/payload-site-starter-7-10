'use client'

import { createUsePuck, registerOverlayPortal } from '@puckeditor/core'
import React, { useCallback, useEffect, useRef } from 'react'

import { PuckLexicalTextEditor } from '@/components/admin/puck/PuckLexicalTextEditor'
import styles from '@/components/admin/puck/puck-page-builder.module.css'
import { normalizeMediaResource } from '@/lib/utilities/image'

type BlockProps = Record<string, unknown>

type LexicalNode = Record<string, unknown> & {
  children?: LexicalNode[]
  fields?: Record<string, unknown>
  format?: number | string
  listType?: string
  style?: string
  tag?: string
  text?: string
  type?: string
  url?: string
}

type LexicalState = {
  root?: {
    children?: LexicalNode[]
  }
}

const usePuck = createUsePuck()

const COLORS = {
  accent: '#7a0012',
  accentSoft: '#fff1f2',
  background: '#f6f7f9',
  border: '#d9dee7',
  borderStrong: '#c5cbd6',
  foreground: '#111827',
  muted: '#5b6472',
  primary: '#0b1e3a',
  primarySoft: '#eef3f9',
  surface: '#ffffff',
  surfaceAlt: '#f8fafc',
  white: '#ffffff',
}

const cardStyle: React.CSSProperties = {
  background: COLORS.surface,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 0,
}

const softCardStyle: React.CSSProperties = {
  background: COLORS.surfaceAlt,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 0,
}

const imageFrameStyle: React.CSSProperties = {
  border: `1px solid ${COLORS.border}`,
  borderRadius: 0,
  display: 'block',
}

const CONTENT_BLOCK_SIDE_PADDING = 20

const contentBlockInsetStyle: React.CSSProperties = {
  boxSizing: 'border-box',
  paddingLeft: CONTENT_BLOCK_SIDE_PADDING,
  paddingRight: CONTENT_BLOCK_SIDE_PADDING,
}

const EDGE_TO_EDGE_BLOCK_TYPES = new Set([
  'emailFooterOneColumn',
  'emailHeaderSocial',
  'emailImage',
])

function getTextColor(value: unknown): string {
  switch (value) {
    case 'primary':
      return COLORS.primary
    case 'accent':
      return COLORS.accent
    case 'white':
      return COLORS.white
    default:
      return COLORS.foreground
  }
}

function getAlign(value: unknown): 'left' | 'center' | 'justify' | 'right' {
  return value === 'center' || value === 'right' || value === 'justify' ? value : 'left'
}

function getButtonVariant(value: unknown): 'primary' | 'accent' | 'outline' {
  return value === 'accent' || value === 'outline' ? value : 'primary'
}

function getButtonStyle(value: unknown): React.CSSProperties {
  const variant = getButtonVariant(value)
  const backgroundColor = variant === 'outline' ? COLORS.white : variant === 'accent' ? COLORS.accent : COLORS.primary
  const color = variant === 'outline' ? COLORS.primary : COLORS.white

  return {
    backgroundColor,
    border: `1px solid ${variant === 'outline' ? COLORS.borderStrong : backgroundColor}`,
    borderRadius: 0,
    color,
    display: 'inline-block',
    fontSize: 14,
    fontWeight: 800,
    lineHeight: '20px',
    padding: '13px 22px',
    textTransform: 'uppercase',
  }
}

function getNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numberValue = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numberValue)) return fallback
  return Math.max(min, Math.min(max, numberValue))
}

function getText(value: unknown): React.ReactNode {
  if (typeof value === 'string' || typeof value === 'number') return value
  if (React.isValidElement(value)) return value
  return null
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function getComponentId(props: BlockProps): string | null {
  return typeof props.id === 'string' && props.id ? props.id : null
}

function getItems(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
    : []
}

type SocialIconMeta = {
  alt: string
  file: string
}

function getSocialIconMeta(value: unknown): SocialIconMeta {
  switch (value) {
    case 'facebook':
      return { alt: 'Facebook', file: 'facebook.png' }
    case 'instagram':
      return { alt: 'Instagram', file: 'instagram.png' }
    case 'linkedin':
      return { alt: 'LinkedIn', file: 'linkedin.png' }
    case 'x':
      return { alt: 'X', file: 'x.png' }
    case 'youtube':
      return { alt: 'YouTube', file: 'youtube.png' }
    case 'flickr':
      return { alt: 'Flickr', file: 'flickr.png' }
    case 'website':
      return { alt: 'Website', file: 'website.png' }
    default:
      return { alt: 'Website', file: 'website.png' }
  }
}

function PreviewSocialIcon({ platform }: { platform: unknown }) {
  const icon = getSocialIconMeta(platform)

  // eslint-disable-next-line @next/next/no-img-element
  return <img alt={icon.alt} src={`/email-icons/${icon.file}`} style={{ display: 'block', height: 30, width: 30 }} />
}

function getMediaSource(value: unknown): { alt: string; src: string } | null {
  const media = normalizeMediaResource(value)
  const src = media?.url
  if (!src) return null
  return { alt: media.alt || '', src }
}

function getYoutubeVideoId(value: unknown): string | null {
  const url = getString(value)
  if (!url) return null

  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase()

    if (host === 'youtu.be') return parsed.pathname.split('/').filter(Boolean)[0] || null
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const fromQuery = parsed.searchParams.get('v')
      if (fromQuery) return fromQuery

      const parts = parsed.pathname.split('/').filter(Boolean)
      if ((parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live') && parts[1]) return parts[1]
    }
  } catch {
    return null
  }

  return null
}

function getYoutubeThumbnail(value: unknown, title: string): { alt: string; src: string } | null {
  const id = getYoutubeVideoId(value)
  if (!id) return null

  return {
    alt: title,
    src: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  }
}

function isLexicalState(value: unknown): value is LexicalState {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && 'root' in value)
}

function getNodeChildren(node: LexicalNode): LexicalNode[] {
  return Array.isArray(node.children) ? node.children : []
}

function parseTextColor(style?: string): string | undefined {
  if (!style) return undefined
  const match = /(^|;)\s*color\s*:\s*([^;]+)/i.exec(style)
  const color = match?.[2]?.trim()

  if (!color) return undefined
  if (color.includes('--tenant-primary')) return COLORS.primary
  if (color.includes('--tenant-accent')) return COLORS.accent

  return color
}

function getNodeAlignment(node: LexicalNode, fallback: unknown): 'left' | 'center' | 'justify' | 'right' {
  return typeof node.format === 'string' && node.format ? getAlign(node.format) : getAlign(fallback)
}

function getTextNodeStyle(node: LexicalNode): React.CSSProperties | undefined {
  const format = typeof node.format === 'number' ? node.format : 0
  const style: React.CSSProperties = {}

  if (format & 1) style.fontWeight = 800
  if (format & 2) style.fontStyle = 'italic'
  if (format & 8) style.textDecoration = 'underline'
  if (format & 4) style.textDecoration = style.textDecoration ? `${style.textDecoration} line-through` : 'line-through'
  if (format & 16) {
    style.backgroundColor = COLORS.primarySoft
    style.borderRadius = 4
    style.fontFamily = 'Menlo, Monaco, Consolas, monospace'
    style.fontSize = '0.92em'
    style.padding = '1px 4px'
  }

  const color = parseTextColor(node.style)
  if (color) style.color = color

  return Object.keys(style).length ? style : undefined
}

function getLinkURL(node: LexicalNode): string {
  const fields = node.fields
  const url = typeof fields?.url === 'string' ? fields.url : typeof node.url === 'string' ? node.url : ''
  return url.trim()
}

function getLinkTarget(node: LexicalNode): string | undefined {
  return node.fields?.newTab === true ? '_blank' : undefined
}

function renderInlineNodes(nodes: LexicalNode[], keyPrefix: string): React.ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`

    if (node.type === 'text') {
      const text = node.text || ''
      const style = getTextNodeStyle(node)
      return style ? <span key={key} style={style}>{text}</span> : text
    }

    if (node.type === 'linebreak') {
      return <br key={key} />
    }

    if (node.type === 'link' || node.type === 'autolink') {
      const url = getLinkURL(node)
      const children = renderInlineNodes(getNodeChildren(node), key)

      return (
        <a
          key={key}
          href={url || undefined}
          rel={getLinkTarget(node) ? 'noreferrer' : undefined}
          style={{ color: COLORS.accent, fontWeight: 800, textDecoration: 'underline' }}
          target={getLinkTarget(node)}
        >
          {children}
        </a>
      )
    }

    return <React.Fragment key={key}>{renderInlineNodes(getNodeChildren(node), key)}</React.Fragment>
  })
}

function renderRichTextPreview(value: unknown, color: unknown, align: unknown): React.ReactNode[] | null {
  if (!isLexicalState(value)) return null

  const blocks = value.root?.children || []
  if (!blocks.length) return null

  return blocks.map((node, index) => {
    const children = renderInlineNodes(getNodeChildren(node), `rt-${index}`)
    const alignment = getNodeAlignment(node, align)
    const textColor = getTextColor(color)
    const hasChildren = children.some((child) => child !== '')

    if (!hasChildren && node.type !== 'horizontalrule') return null

    if (node.type === 'heading') {
      const tag = node.tag === 'h1' || node.tag === 'h2' || node.tag === 'h3' ? node.tag : 'h3'
      const fontSize = tag === 'h1' ? 30 : tag === 'h2' ? 24 : 19

      return (
        <div
          key={index}
          style={{
            color: textColor,
            fontSize,
            fontWeight: 800,
            lineHeight: tag === 'h1' ? '36px' : tag === 'h2' ? '30px' : '25px',
            margin: index === 0 ? '0 0 14px' : '18px 0 14px',
            textAlign: alignment,
          }}
        >
          {children}
        </div>
      )
    }

    if (node.type === 'quote') {
      return (
        <div key={index} style={{ borderLeft: `4px solid ${COLORS.accent}`, margin: '10px 0 20px', padding: '2px 0 2px 16px' }}>
          <div style={{ color: COLORS.muted, fontSize: 16, fontStyle: 'italic', lineHeight: '26px', textAlign: alignment }}>
            {children}
          </div>
        </div>
      )
    }

    if (node.type === 'list') {
      const listItems = getNodeChildren(node)
      const ordered = node.listType === 'number' || node.listType === 'ordered'

      return (
        <div key={index} style={{ margin: '4px 0 18px' }}>
          {listItems.map((item, itemIndex) => (
            <div key={itemIndex} style={{ color: textColor, fontSize: 16, lineHeight: '26px', margin: '0 0 6px', textAlign: alignment }}>
              <span style={{ color: COLORS.accent, fontWeight: 800 }}>{ordered ? `${itemIndex + 1}. ` : '• '}</span>
              {renderInlineNodes(getNodeChildren(item), `rt-${index}-${itemIndex}`)}
            </div>
          ))}
        </div>
      )
    }

    if (node.type === 'horizontalrule') {
      return <hr key={index} style={{ border: 0, borderTop: `1px solid ${COLORS.border}`, margin: '20px 0' }} />
    }

    return (
      <div
        key={index}
        style={{
          color: textColor,
          fontSize: 16,
          lineHeight: '27px',
          margin: index === blocks.length - 1 ? '0 0 18px' : '0 0 14px',
          textAlign: alignment,
        }}
      >
        {children}
      </div>
    )
  })
}

function needsInlineSeparatorBefore(value: string): boolean {
  return Boolean(value && !/\s$/.test(value))
}

function needsInlineSeparatorAfter(value: string): boolean {
  return Boolean(value && !/^\s|^[.,;:!?]/.test(value))
}

function Placeholder({ label }: { label: string }) {
  return (
    <div
      style={{
        alignItems: 'center',
        background: '#eef2f7',
        border: `1px dashed ${COLORS.border}`,
        borderRadius: 0,
        color: COLORS.muted,
        display: 'flex',
        justifyContent: 'center',
        minHeight: 96,
        padding: 12,
        textAlign: 'center',
      }}
    >
      {label}
    </div>
  )
}

function PreviewImage({
  alt,
  src,
  style,
}: {
  alt: string
  src: string
  style?: React.CSSProperties
}) {
  return (
    // Email previews should display the literal R2/media URL instead of using Next image optimization.
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} style={style} />
  )
}

function EmailHeaderSocialPreview(props: BlockProps) {
  const socialLinks = getItems(props.socialLinks)

  return (
    <div
      style={{
        alignItems: 'center',
        background: COLORS.primary,
        borderRadius: 0,
        display: 'flex',
        gap: 16,
        justifyContent: 'space-between',
        marginBottom: 30,
        padding: '22px 24px',
      }}
    >
      <div>
        <div style={{ color: COLORS.white, fontSize: 22, fontWeight: 800, letterSpacing: '0.02em', lineHeight: '26px' }}>
          {getText(props.logoText) || 'Campaign Update'}
        </div>
        {props.subtitle ? (
          <div style={{ color: '#d8e0ee', fontSize: 13, lineHeight: '19px', marginTop: 6 }}>
            {getText(props.subtitle)}
          </div>
        ) : null}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {socialLinks.length ? socialLinks.map((link, index) => (
          <span
            key={index}
            style={{
              display: 'inline-block',
              height: 30,
              width: 30,
            }}
          >
            <PreviewSocialIcon platform={link.platform} />
          </span>
        )) : null}
      </div>
    </div>
  )
}

function EmailHeadingPreview(props: BlockProps) {
  const level = props.level === 'h2' || props.level === 'h3' ? props.level : 'h1'
  const fontSize = level === 'h1' ? 34 : level === 'h2' ? 26 : 20
  const text = getText(props.text)
  if (!text) return null

  return (
    <div
      style={{
        color: getTextColor(props.color),
        fontSize,
        fontWeight: 800,
        letterSpacing: '0.01em',
        lineHeight: level === 'h1' ? '39px' : level === 'h2' ? '32px' : '26px',
        margin: '0 0 18px',
        textAlign: getAlign(props.align),
      }}
    >
      {text}
    </div>
  )
}

function EmailTextPreview(props: BlockProps) {
  const componentId = getComponentId(props)
  if (componentId) {
    return <EmailTextCanvasEditor componentId={componentId} props={props} />
  }

  const richText = renderRichTextPreview(props.text, props.color, props.align)
  if (richText) return <>{richText}</>

  const text = getText(props.text)
  if (!text) return null

  return (
    <div
      style={{
        color: getTextColor(props.color),
        fontSize: 16,
        lineHeight: '27px',
        margin: '0 0 18px',
        textAlign: getAlign(props.align),
        whiteSpace: 'pre-line',
      }}
    >
      {text}
    </div>
  )
}

function EmailTextCanvasEditor({
  componentId,
  props,
}: {
  componentId: string
  props: BlockProps
}) {
  const portalRef = useRef<HTMLDivElement | null>(null)
  const dispatch = usePuck((state) => state.dispatch)
  const getItemById = usePuck((state) => state.getItemById)
  const getSelectorForId = usePuck((state) => state.getSelectorForId)

  useEffect(() => {
    if (!portalRef.current) return

    return registerOverlayPortal(portalRef.current, {
      disableDragOnFocus: true,
    })
  }, [])

  const selectCurrentBlock = useCallback(() => {
    const selector = getSelectorForId(componentId)
    if (!selector) return

    dispatch({
      type: 'setUi',
      ui: {
        itemSelector: selector,
        leftSideBarVisible: true,
        plugin: { current: 'fields' },
        rightSideBarVisible: false,
      },
    })
  }, [componentId, dispatch, getSelectorForId])

  const updateText = useCallback(
    (value: unknown) => {
      const item = getItemById(componentId)
      const selector = getSelectorForId(componentId)
      if (!item || !selector) return

      const itemProps = item.props as BlockProps

      dispatch({
        type: 'replace',
        data: {
          ...item,
          props: {
            ...itemProps,
            id: componentId,
            text: value,
          },
        },
        destinationIndex: selector.index,
        destinationZone: selector.zone,
        ui: {
          itemSelector: selector,
          leftSideBarVisible: true,
          plugin: { current: 'fields' },
          rightSideBarVisible: false,
        },
      })
    },
    [componentId, dispatch, getItemById, getSelectorForId],
  )

  const handleClickCapture = useCallback(
    (event: React.SyntheticEvent) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('[data-puck-rich-text-toolbar="true"]')
      ) {
        return
      }

      event.stopPropagation()
      selectCurrentBlock()
    },
    [selectCurrentBlock],
  )

  return (
    <div
      className={styles.inlineRichTextPrototype}
      data-puck-overlay-portal="true"
      data-puck-rich-text-editor="true"
      onClick={(event) => event.stopPropagation()}
      onClickCapture={handleClickCapture}
      onDragStart={(event) => event.preventDefault()}
      onPointerDown={(event) => event.stopPropagation()}
      ref={portalRef}
      style={{ margin: '0 0 18px' }}
    >
      <PuckLexicalTextEditor
        contentEditableStyle={{
          color: getTextColor(props.color),
          fontSize: 16,
          lineHeight: '27px',
          minHeight: 27,
          padding: 0,
          textAlign: getAlign(props.align),
        }}
        hideAdvancedJson
        surface="canvas"
        toolbarLabel="Text"
        toolbarMode="global"
        value={props.text}
        onChange={updateText}
      />
    </div>
  )
}

function EmailInlineLinkPreview(props: BlockProps) {
  const beforeText = getString(props.beforeText)
  const label = getText(props.label) || 'inline link'
  const afterText = getString(props.afterText)

  return (
    <div
      style={{
        color: COLORS.foreground,
        fontSize: 16,
        lineHeight: '26px',
        margin: '0 0 18px',
        textAlign: getAlign(props.align),
      }}
    >
      {beforeText}
      {needsInlineSeparatorBefore(beforeText) ? ' ' : null}
      <span style={{ color: COLORS.accent, fontWeight: 800, textDecoration: 'underline' }}>{label}</span>
      {needsInlineSeparatorAfter(afterText) ? ' ' : null}
      {afterText}
    </div>
  )
}

function EmailButtonPreview(props: BlockProps) {
  const label = getText(props.label)

  return (
    <div style={{ margin: '10px 0 26px', textAlign: getAlign(props.align) }}>
      <span style={getButtonStyle(props.variant)}>
        {label || 'Button'}
      </span>
    </div>
  )
}

function EmailTwoButtonsPreview(props: BlockProps) {
  const primaryLabel = getText(props.primaryLabel)
  const secondaryLabel = getText(props.secondaryLabel)

  return (
    <div style={{ margin: '10px 0 26px', textAlign: getAlign(props.align) }}>
      <span style={{ ...getButtonStyle(props.primaryVariant), margin: '0 8px 8px 0' }}>
        {primaryLabel || 'Primary action'}
      </span>
      <span style={{ ...getButtonStyle(props.secondaryVariant), margin: '0 0 8px' }}>
        {secondaryLabel || 'Secondary action'}
      </span>
    </div>
  )
}

function EmailListPreview(props: BlockProps) {
  const items = getItems(props.items)
  const imageLeft = props.style === 'imageLeft'

  if (!items.length) return <Placeholder label="Add list items" />

  return (
    <div style={{ margin: '10px 0 26px' }}>
      {items.map((item, index) => {
        const media = getMediaSource(item.media)

        if (imageLeft) {
          return (
            <div key={index} style={{ ...softCardStyle, display: 'flex', gap: 12, marginBottom: 10, padding: 14 }}>
              <div style={{ flex: '0 0 56px' }}>
                {media ? (
                  <PreviewImage
                    alt={getString(item.alt) || media.alt}
                    src={media.src}
                    style={{ ...imageFrameStyle, borderRadius: 0, height: 56, objectFit: 'cover', width: 56 }}
                  />
                ) : (
                  <div style={{ background: COLORS.accent, borderRadius: 0, color: COLORS.white, fontSize: 13, fontWeight: 800, lineHeight: '32px', textAlign: 'center', width: 32 }}>
                    {index + 1}
                  </div>
                )}
              </div>
              <div>
                <div style={{ color: COLORS.foreground, fontSize: 15, fontWeight: 800, lineHeight: '20px' }}>
                  {getText(item.title) || 'List item'}
                </div>
                {item.body ? <div style={{ color: COLORS.muted, fontSize: 14, lineHeight: '22px', marginTop: 4 }}>{getText(item.body)}</div> : null}
              </div>
            </div>
          )
        }

        return (
          <div key={index} style={{ ...softCardStyle, marginBottom: 10, padding: '14px 16px' }}>
            <div style={{ color: COLORS.foreground, fontSize: 15, fontWeight: 800, lineHeight: '21px' }}>
              <span style={{ color: COLORS.accent }}>• </span>
              {getText(item.title) || 'List item'}
            </div>
            {item.body ? <div style={{ color: COLORS.muted, fontSize: 14, lineHeight: '22px', marginTop: 4 }}>{getText(item.body)}</div> : null}
          </div>
        )
      })}
    </div>
  )
}

function EmailMarkdownPreview(props: BlockProps) {
  const markdown = getString(props.markdown)

  return (
    <div
      style={{
        ...softCardStyle,
        color: COLORS.foreground,
        fontSize: 15,
        lineHeight: '24px',
        margin: '0 0 24px',
        padding: '18px 20px',
        whiteSpace: 'pre-line',
      }}
    >
      {markdown || 'Markdown content'}
    </div>
  )
}

function EmailImagePreview(props: BlockProps) {
  const media = normalizeMediaResource(props.media)
  const src = media?.url

  if (!src) {
    return (
      <div
        style={{
          alignItems: 'center',
          background: '#eef2f7',
          border: `1px dashed ${COLORS.border}`,
          borderRadius: 0,
          color: COLORS.muted,
          display: 'flex',
          height: 180,
          justifyContent: 'center',
          marginBottom: 20,
        }}
      >
        Select an image
      </div>
    )
  }

  return (
    <PreviewImage
      alt={typeof props.alt === 'string' ? props.alt : media.alt || ''}
      src={src}
      style={{
        ...imageFrameStyle,
        borderRadius: 0,
        display: 'block',
        height: 'auto',
        margin: '0 auto 24px',
        maxWidth: '100%',
        width: getNumber(props.width, 640, 120, 640),
      }}
    />
  )
}

function PlayButtonOverlayPreview() {
  return (
    <span
      style={{
        alignItems: 'center',
        background: 'rgba(11, 30, 58, 0.84)',
        border: `2px solid ${COLORS.white}`,
        borderRadius: 999,
        display: 'inline-flex',
        height: 64,
        justifyContent: 'center',
        left: '50%',
        position: 'absolute',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: 64,
      }}
    >
      <span
        style={{
          borderBottom: '12px solid transparent',
          borderLeft: `18px solid ${COLORS.white}`,
          borderTop: '12px solid transparent',
          display: 'inline-block',
          height: 0,
          marginLeft: 5,
          width: 0,
        }}
      />
    </span>
  )
}

function getVideoTitle(value: unknown): string {
  const title = getString(value)
  return title.toLowerCase() === 'watch this video' ? '' : title
}

function EmailVideoPreview(props: BlockProps) {
  const title = getVideoTitle(props.title)
  const fallbackTitle = title || 'Video'
  const thumbnail = getMediaSource(props.thumbnailMedia) || getYoutubeThumbnail(props.youtubeUrl, fallbackTitle)
  const video = getMediaSource(props.videoMedia)
  const hasTarget = Boolean(getString(props.youtubeUrl) || video?.src)
  const width = getNumber(props.width, 640, 240, 640)

  return (
    <div style={{ margin: '10px auto 26px', maxWidth: '100%', width }}>
      {title ? (
        <div style={{ color: COLORS.foreground, fontSize: 18, fontWeight: 800, lineHeight: '24px', marginBottom: 10, textAlign: 'center' }}>
          {title}
        </div>
      ) : null}
      <div
        style={{
          background: thumbnail ? 'transparent' : COLORS.surfaceAlt,
          border: thumbnail ? `1px solid ${COLORS.border}` : `1px dashed ${COLORS.borderStrong}`,
          color: COLORS.muted,
          minHeight: 220,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {thumbnail ? (
          <PreviewImage
            alt={getString(props.thumbnailAlt) || thumbnail.alt || fallbackTitle}
            src={thumbnail.src}
            style={{
              ...imageFrameStyle,
              border: 0,
              display: 'block',
              height: 'auto',
              width: '100%',
            }}
          />
        ) : (
          <div style={{ alignItems: 'center', display: 'flex', minHeight: 220, justifyContent: 'center', padding: 20, textAlign: 'center' }}>
            {hasTarget ? 'Upload a thumbnail image' : 'Add a video upload or YouTube URL'}
          </div>
        )}
        <PlayButtonOverlayPreview />
      </div>
    </div>
  )
}

function EmailArticleImageRightPreview(props: BlockProps) {
  const media = getMediaSource(props.media)

  return (
    <div style={{ ...softCardStyle, display: 'grid', gap: 16, gridTemplateColumns: '1.35fr 1fr', margin: '10px 0 26px', padding: 18 }}>
      <div>
        <div style={{ color: COLORS.foreground, fontSize: 20, fontWeight: 800, lineHeight: '25px' }}>
          {getText(props.heading) || 'Article headline'}
        </div>
        <div style={{ color: COLORS.muted, fontSize: 14, lineHeight: '22px', marginTop: 8, whiteSpace: 'pre-line' }}>
          {getText(props.body)}
        </div>
        {props.linkLabel ? <div style={{ color: COLORS.accent, fontSize: 14, fontWeight: 800, marginTop: 12 }}>{getText(props.linkLabel)}</div> : null}
      </div>
      <div>
        {media ? (
          <PreviewImage alt={getString(props.alt) || media.alt} src={media.src} style={{ ...imageFrameStyle, width: '100%' }} />
        ) : (
          <Placeholder label="Select article image" />
        )}
      </div>
    </div>
  )
}

function EmailArticleTwoCardsPreview(props: BlockProps) {
  const cards = getItems(props.cards).slice(0, 2)
  if (!cards.length) return <Placeholder label="Add article cards" />

  return (
    <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', margin: '10px 0 26px' }}>
      {cards.map((card, index) => {
        const media = getMediaSource(card.media)
        return (
          <div key={index} style={{ ...cardStyle, padding: 16 }}>
            {media ? <PreviewImage alt={getString(card.alt) || media.alt} src={media.src} style={{ ...imageFrameStyle, marginBottom: 12, width: '100%' }} /> : null}
            <div style={{ color: COLORS.foreground, fontSize: 16, fontWeight: 800, lineHeight: '21px' }}>{getText(card.heading) || 'Article headline'}</div>
            {card.body ? <div style={{ color: COLORS.muted, fontSize: 13, lineHeight: '20px', marginTop: 7 }}>{getText(card.body)}</div> : null}
            {card.linkLabel ? <div style={{ color: COLORS.accent, fontSize: 13, fontWeight: 800, marginTop: 10 }}>{getText(card.linkLabel)}</div> : null}
          </div>
        )
      })}
    </div>
  )
}

type GalleryItemPreview = {
  alt: string
  caption: React.ReactNode
  src: string
}

function getGalleryItems(value: unknown): GalleryItemPreview[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null

      const record = item as Record<string, unknown>
      const media = normalizeMediaResource(record.media)
      const src = media?.url

      if (!src) return null

      return {
        alt: typeof record.alt === 'string' ? record.alt : media.alt || '',
        caption: getText(record.caption),
        src,
      }
    })
    .filter((item): item is GalleryItemPreview => Boolean(item))
}

function GalleryPlaceholder() {
  return (
    <div
      style={{
        alignItems: 'center',
        background: '#eef2f7',
        border: `1px dashed ${COLORS.border}`,
        borderRadius: 0,
        color: COLORS.muted,
        display: 'flex',
        minHeight: 120,
        justifyContent: 'center',
        textAlign: 'center',
      }}
    >
      Select gallery images
    </div>
  )
}

function EmailGalleryPreview(props: BlockProps) {
  const items = getGalleryItems(props.items)
  const layout = props.layout === 'threeColumns' || props.layout === 'horizontalGrid' || props.layout === 'verticalGrid'
    ? props.layout
    : 'fourGrid'

  if (!items.length) {
    return <GalleryPlaceholder />
  }

  const columns = layout === 'threeColumns'
    ? 3
    : layout === 'horizontalGrid'
      ? Math.min(4, Math.max(1, items.length))
      : layout === 'verticalGrid'
        ? 1
        : 2

  const visibleItems = layout === 'fourGrid' ? items.slice(0, 4) : items

  return (
    <div
      style={{
        display: 'grid',
        gap: 10,
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        margin: '10px 0 26px',
      }}
    >
      {visibleItems.map((item, index) => (
        <div key={`${item.src}-${index}`} style={{ minWidth: 0 }}>
          <PreviewImage
            alt={item.alt}
            src={item.src}
            style={{
              aspectRatio: '4 / 3',
              ...imageFrameStyle,
              borderRadius: 0,
              display: 'block',
              height: 'auto',
              objectFit: 'cover',
              width: '100%',
            }}
          />
          {item.caption ? (
            <div style={{ color: COLORS.muted, fontSize: 13, lineHeight: '18px', marginTop: 8 }}>
              {item.caption}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function EmailFeatureThreeCenteredPreview(props: BlockProps) {
  const paragraphs = getItems(props.paragraphs).map((item) => getText(item.text)).filter(Boolean).slice(0, 3)

  return (
    <div style={{ ...softCardStyle, margin: '10px 0 28px', padding: '24px 28px', textAlign: 'center' }}>
      <div style={{ color: COLORS.foreground, fontSize: 26, fontWeight: 800, lineHeight: '32px', marginBottom: 16 }}>
        {getText(props.heading) || 'What to know'}
      </div>
      {paragraphs.map((paragraph, index) => (
        <div key={index} style={{ color: COLORS.muted, fontSize: 15, lineHeight: '24px', marginBottom: index === paragraphs.length - 1 ? 0 : 10 }}>
          {paragraph}
        </div>
      ))}
    </div>
  )
}

function EmailBentoGridPreview(props: BlockProps) {
  const items = getItems(props.items)

  return (
    <div style={{ margin: '10px 0 26px' }}>
      {props.heading ? <div style={{ color: COLORS.foreground, fontSize: 26, fontWeight: 800, lineHeight: '32px', marginBottom: 16 }}>{getText(props.heading)}</div> : null}
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        {items.map((item, index) => {
          const media = getMediaSource(item.media)
          return (
            <div key={index} style={{ ...(item.size === 'wide' ? softCardStyle : cardStyle), borderLeft: item.size === 'wide' ? `4px solid ${COLORS.accent}` : undefined, gridColumn: item.size === 'wide' ? 'span 2' : undefined, padding: item.size === 'wide' ? 18 : 16 }}>
              {media ? <PreviewImage alt={getString(item.alt) || media.alt} src={media.src} style={{ ...imageFrameStyle, marginBottom: 10, width: '100%' }} /> : null}
              <div style={{ color: COLORS.foreground, fontSize: 15, fontWeight: 800, lineHeight: '20px' }}>{getText(item.title) || 'Bento item'}</div>
              {item.body ? <div style={{ color: COLORS.muted, fontSize: 13, lineHeight: '20px', marginTop: 6 }}>{getText(item.body)}</div> : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function EmailGridPreview({ children, props }: { children?: React.ReactNode; props: BlockProps }) {
  const childrenArray = React.Children.toArray(children)
  const layout = getString(props.layout) || 'twoColumns'
  const columnTemplates: Record<string, string> = {
    fourColumns: 'repeat(4, minmax(0, 1fr))',
    oneColumn: 'minmax(0, 1fr)',
    threeColumns: 'repeat(3, minmax(0, 1fr))',
    twoColumns: 'repeat(2, minmax(0, 1fr))',
    twoColumnsLeftWide: '2fr 1fr',
    twoColumnsRightWide: '1fr 2fr',
  }
  const columnCount = layout === 'oneColumn'
    ? 1
    : layout === 'threeColumns'
      ? 3
      : layout === 'fourColumns'
        ? 4
        : 2
  const columns = childrenArray.slice(0, columnCount)

  return (
    <div style={{ display: 'grid', gap: 14, gridTemplateColumns: columnTemplates[layout] || columnTemplates.twoColumns, margin: '10px 0 26px' }}>
      {columns.map((child, index) => (
        <div key={index} style={{ ...softCardStyle, borderStyle: 'dashed', minHeight: 176, padding: 14 }}>
          {child}
        </div>
      ))}
    </div>
  )
}

function EmailDividerPreview(props: BlockProps) {
  const spacing = getNumber(props.spacing, 24, 0, 64)
  const color = props.color === 'primary'
    ? COLORS.primary
    : props.color === 'accent'
      ? COLORS.accent
      : COLORS.border

  return (
    <hr
      style={{
        border: 0,
        borderTop: `${props.color === 'border' ? 1 : 2}px solid ${color}`,
        margin: `${spacing}px 0`,
      }}
    />
  )
}

function EmailSpacerPreview(props: BlockProps) {
  return <div style={{ height: getNumber(props.size, 24, 4, 96) }} />
}

function EmailCalloutPreview(props: BlockProps) {
  const heading = getText(props.heading)
  const body = getText(props.body)
  const variant = props.variant === 'primary' || props.variant === 'neutral' ? props.variant : 'accent'
  const borderColor = variant === 'primary' ? COLORS.primary : variant === 'neutral' ? COLORS.border : COLORS.accent
  const backgroundColor = variant === 'primary' ? COLORS.primarySoft : variant === 'neutral' ? COLORS.surfaceAlt : COLORS.accentSoft

  return (
    <div
      style={{
        backgroundColor,
        border: `1px solid ${variant === 'neutral' ? COLORS.border : borderColor}`,
        borderLeft: `4px solid ${borderColor}`,
        borderRadius: 0,
        margin: '10px 0 24px',
        padding: '18px 20px',
      }}
    >
      {heading ? (
        <div style={{ color: COLORS.foreground, fontSize: 17, fontWeight: 800, lineHeight: '22px', marginBottom: 6 }}>
          {heading}
        </div>
      ) : null}
      {body ? (
        <div style={{ color: COLORS.muted, fontSize: 15, lineHeight: '24px', whiteSpace: 'pre-line' }}>
          {body}
        </div>
      ) : null}
    </div>
  )
}

function EmailFooterOneColumnPreview(props: BlockProps) {
  const links = getItems(props.links)
  const socialLinks = getItems(props.socialLinks)
  const towns = getItems(props.towns)

  return (
    <div style={{ background: COLORS.primary, borderRadius: 0, marginTop: 30, padding: '24px 28px', textAlign: 'center' }}>
      {props.heading ? <div style={{ color: COLORS.white, fontSize: 17, fontWeight: 800, lineHeight: '23px' }}>{getText(props.heading)}</div> : null}
      {props.body ? <div style={{ color: '#d8e0ee', fontSize: 13, lineHeight: '20px', marginTop: 7, whiteSpace: 'pre-line' }}>{getText(props.body)}</div> : null}
      {props.address ? <div style={{ color: '#bac6d8', fontSize: 12, lineHeight: '18px', marginTop: 14, whiteSpace: 'pre-line' }}>{getText(props.address)}</div> : null}
      {links.length ? (
        <div style={{ color: COLORS.white, fontSize: 12, fontWeight: 800, lineHeight: '18px', marginTop: 14, textDecoration: 'underline' }}>
          {links.map((link, index) => (
            <React.Fragment key={index}>
              {index > 0 ? '  |  ' : null}
              {getText(link.label) || 'Footer link'}
            </React.Fragment>
          ))}
        </div>
      ) : null}
      {socialLinks.length ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 16 }}>
          {socialLinks.map((item, index) => (
            <span
              key={index}
              style={{
                display: 'inline-block',
                height: 30,
                width: 30,
              }}
            >
              <PreviewSocialIcon platform={item.platform} />
            </span>
          ))}
        </div>
      ) : null}
      {towns.length ? (
        <div style={{ color: '#d8e0ee', fontSize: 11, lineHeight: '18px', marginTop: 16 }}>
          <span style={{ color: '#9fb0c8', fontWeight: 800, textTransform: 'uppercase' }}>Serving </span>
          {towns.map((town, index) => (
            <React.Fragment key={index}>
              {index > 0 ? ', ' : null}
              <span style={{ color: COLORS.white, fontWeight: 800 }}>{getText(town.town) || 'Town'}</span>
            </React.Fragment>
          ))}
        </div>
      ) : null}
      {props.copyright ? <div style={{ color: '#9fb0c8', fontSize: 11, lineHeight: '16px', marginTop: 14 }}>{getText(props.copyright)}</div> : null}
    </div>
  )
}

export function PuckEmailBlockPreview({
  blockType,
  children,
  props,
}: {
  blockType: string
  children?: React.ReactNode
  props: BlockProps
}) {
  let element: React.ReactNode

  switch (blockType) {
    case 'emailHeaderSocial':
      element = <EmailHeaderSocialPreview {...props} />
      break
    case 'emailHeading':
      element = <EmailHeadingPreview {...props} />
      break
    case 'emailText':
      element = <EmailTextPreview {...props} />
      break
    case 'emailInlineLink':
      element = <EmailInlineLinkPreview {...props} />
      break
    case 'emailButton':
      element = <EmailButtonPreview {...props} />
      break
    case 'emailTwoButtons':
      element = <EmailTwoButtonsPreview {...props} />
      break
    case 'emailList':
      element = <EmailListPreview {...props} />
      break
    case 'emailMarkdown':
      element = <EmailMarkdownPreview {...props} />
      break
    case 'emailImage':
      element = <EmailImagePreview {...props} />
      break
    case 'emailVideo':
      element = <EmailVideoPreview {...props} />
      break
    case 'emailArticleImageRight':
      element = <EmailArticleImageRightPreview {...props} />
      break
    case 'emailArticleTwoCards':
      element = <EmailArticleTwoCardsPreview {...props} />
      break
    case 'emailGallery':
      element = <EmailGalleryPreview {...props} />
      break
    case 'emailFeatureThreeCentered':
      element = <EmailFeatureThreeCenteredPreview {...props} />
      break
    case 'emailBentoGrid':
      element = <EmailBentoGridPreview {...props} />
      break
    case 'emailGrid':
      element = <EmailGridPreview props={props}>{children}</EmailGridPreview>
      break
    case 'emailDivider':
      element = <EmailDividerPreview {...props} />
      break
    case 'emailSpacer':
      element = <EmailSpacerPreview {...props} />
      break
    case 'emailCallout':
      element = <EmailCalloutPreview {...props} />
      break
    case 'emailFooterOneColumn':
      element = <EmailFooterOneColumnPreview {...props} />
      break
    default:
      return null
  }

  if (!element) return null
  if (EDGE_TO_EDGE_BLOCK_TYPES.has(blockType)) return <>{element}</>

  return <div style={contentBlockInsetStyle}>{element}</div>
}
