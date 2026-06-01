'use client'

import React from 'react'

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

const COLORS = {
  accent: '#a71e22',
  accentSoft: '#fff1f2',
  border: '#d9dee7',
  foreground: '#030712',
  muted: '#4b5563',
  primary: '#0b1e3a',
  primarySoft: '#eef3f9',
  surface: '#ffffff',
  surfaceAlt: '#f8fafc',
  white: '#ffffff',
}

const cardStyle: React.CSSProperties = {
  background: COLORS.surfaceAlt,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 14,
  boxShadow: '0 8px 22px rgba(15, 23, 42, 0.05)',
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function getItems(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
    : []
}

function getAlign(value: unknown): 'left' | 'center' | 'right' {
  return value === 'center' || value === 'right' ? value : 'left'
}

function getMediaSource(value: unknown): { alt: string; height?: number | null; src: string; width?: number | null } | null {
  const media = normalizeMediaResource(value)
  if (!media?.url) return null
  return {
    alt: media.alt || '',
    height: media.height,
    src: media.url,
    width: media.width,
  }
}

function getNodeChildren(node: LexicalNode): LexicalNode[] {
  return Array.isArray(node.children) ? node.children : []
}

function isLexicalState(value: unknown): value is LexicalState {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && 'root' in value)
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

  return Object.keys(style).length ? style : undefined
}

function renderInlineNodes(nodes: LexicalNode[], keyPrefix: string): React.ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`

    if (node.type === 'text') {
      const text = node.text || ''
      const style = getTextNodeStyle(node)
      return style ? <span key={key} style={style}>{text}</span> : text
    }

    if (node.type === 'linebreak') return <br key={key} />

    if (node.type === 'link' || node.type === 'autolink') {
      const url = typeof node.fields?.url === 'string' ? node.fields.url : typeof node.url === 'string' ? node.url : ''
      return (
        <a key={key} href={url || undefined} style={{ color: COLORS.accent, fontWeight: 800, textDecoration: 'underline' }}>
          {renderInlineNodes(getNodeChildren(node), key)}
        </a>
      )
    }

    return <React.Fragment key={key}>{renderInlineNodes(getNodeChildren(node), key)}</React.Fragment>
  })
}

function renderRichText(value: unknown): React.ReactNode {
  if (!isLexicalState(value)) return null
  const blocks = value.root?.children || []
  if (!blocks.length) return null

  return blocks.map((node, index) => {
    const children = renderInlineNodes(getNodeChildren(node), `rt-${index}`)
    const hasChildren = children.some((child) => child !== '')
    if (!hasChildren && node.type !== 'horizontalrule') return null

    if (node.type === 'heading') {
      const tag = node.tag === 'h1' || node.tag === 'h2' || node.tag === 'h3' ? node.tag : 'h2'
      const fontSize = tag === 'h1' ? 40 : tag === 'h2' ? 31 : 24
      return (
        <div
          key={index}
          style={{
            color: COLORS.primary,
            fontSize,
            fontWeight: 900,
            letterSpacing: 0,
            lineHeight: tag === 'h1' ? '48px' : tag === 'h2' ? '39px' : '31px',
            margin: index === 0 ? '0 0 22px' : '30px 0 16px',
          }}
        >
          {children}
        </div>
      )
    }

    if (node.type === 'list') {
      const ordered = node.listType === 'number' || node.listType === 'ordered'
      return (
        <div key={index} style={{ display: 'grid', gap: 12, margin: '0 0 26px' }}>
          {getNodeChildren(node).map((item, itemIndex) => (
            <div key={itemIndex} style={{ ...cardStyle, padding: '14px 18px' }}>
              <span style={{ color: COLORS.accent, fontWeight: 900 }}>{ordered ? `${itemIndex + 1}. ` : '• '}</span>
              <span style={{ color: COLORS.foreground, fontSize: 16, lineHeight: '25px' }}>
                {renderInlineNodes(getNodeChildren(item), `rt-${index}-${itemIndex}`)}
              </span>
            </div>
          ))}
        </div>
      )
    }

    if (node.type === 'horizontalrule') {
      return <hr key={index} style={{ border: 0, borderTop: `1px solid ${COLORS.border}`, margin: '24px 0' }} />
    }

    return (
      <div key={index} style={{ color: COLORS.foreground, fontSize: 19, lineHeight: '31px', margin: '0 0 22px' }}>
        {children}
      </div>
    )
  })
}

function Placeholder({ label }: { label: string }) {
  return (
    <div
      style={{
        alignItems: 'center',
        background: COLORS.surfaceAlt,
        border: `1px dashed ${COLORS.border}`,
        borderRadius: 14,
        color: COLORS.muted,
        display: 'flex',
        justifyContent: 'center',
        minHeight: 120,
        padding: 18,
        textAlign: 'center',
      }}
    >
      {label}
    </div>
  )
}

function PreviewImage({ alt, src, style }: { alt: string; src: string; style?: React.CSSProperties }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} style={style} />
  )
}

function PostImagePreview(props: BlockProps) {
  const media = getMediaSource(props.media)
  if (!media) return <Placeholder label="Select a post image" />

  return (
    <figure style={{ margin: '0 0 28px' }}>
      <PreviewImage
        alt={getString(props.caption) || media.alt}
        src={media.src}
        style={{
          border: `1px solid ${COLORS.border}`,
          borderRadius: 16,
          display: 'block',
          maxHeight: 360,
          objectFit: 'cover',
          width: '100%',
        }}
      />
      {props.caption ? (
        <figcaption style={{ color: COLORS.muted, fontSize: 13, lineHeight: '20px', marginTop: 10, textAlign: 'center' }}>
          {getString(props.caption)}
        </figcaption>
      ) : null}
    </figure>
  )
}

function PostListPreview(props: BlockProps) {
  const items = getItems(props.items)
  if (!items.length) return <Placeholder label="Add list items" />

  const imageLeft = props.style === 'imageLeft'
  return (
    <div style={{ display: 'grid', gap: 12, margin: '0 0 28px' }}>
      {items.map((item, index) => {
        const media = getMediaSource(item.media)
        const title = getString(item.title)
        const body = getString(item.body)

        return (
          <article
            key={index}
            style={{
              ...cardStyle,
              display: imageLeft ? 'grid' : 'block',
              gap: imageLeft ? 16 : undefined,
              gridTemplateColumns: imageLeft ? '112px 1fr' : undefined,
              padding: imageLeft ? 16 : '16px 20px',
            }}
          >
            {imageLeft && media ? (
              <PreviewImage
                alt={media.alt || title}
                src={media.src}
                style={{
                  aspectRatio: '1 / 1',
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 10,
                  objectFit: 'cover',
                  width: '100%',
                }}
              />
            ) : null}
            <div style={{ minWidth: 0 }}>
              <div style={{ alignItems: 'flex-start', display: 'flex', gap: 12 }}>
                {!imageLeft ? <span style={{ background: COLORS.accent, borderRadius: 999, flex: '0 0 8px', height: 8, marginTop: 9, width: 8 }} /> : null}
                <div>
                  {title ? <div style={{ color: COLORS.primary, fontSize: 18, fontWeight: 900, lineHeight: '24px' }}>{title}</div> : null}
                  {body ? <div style={{ color: COLORS.muted, fontSize: 16, lineHeight: '26px', marginTop: 5 }}>{body}</div> : null}
                </div>
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}

function PostLinksPreview(props: BlockProps) {
  const heading = getString(props.heading)
  const body = getString(props.body)
  const links = getItems(props.links)
  const footerVariant = props.variant === 'footer'

  if (footerVariant) {
    return (
      <aside
        style={{
          background: COLORS.primary,
          borderRadius: 18,
          color: COLORS.white,
          margin: '4px 0 30px',
          padding: '30px 34px',
          textAlign: 'center',
        }}
      >
        {heading ? <div style={{ fontSize: 24, fontWeight: 900, lineHeight: '30px' }}>{heading}</div> : null}
        {body ? <div style={{ color: 'rgba(255,255,255,0.86)', fontSize: 16, lineHeight: '25px', marginTop: 10, whiteSpace: 'pre-line' }}>{body}</div> : null}
        {links.length ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', justifyContent: 'center', marginTop: 18 }}>
            {links.map((link, index) => (
              <span key={index} style={{ color: COLORS.white, fontSize: 14, fontWeight: 900, textDecoration: 'underline' }}>
                {getString(link.label) || 'Link'}
              </span>
            ))}
          </div>
        ) : null}
      </aside>
    )
  }

  return (
    <aside style={{ ...cardStyle, margin: '4px 0 30px', padding: '24px 28px' }}>
      {heading ? <div style={{ color: COLORS.primary, fontSize: 25, fontWeight: 900, lineHeight: '31px' }}>{heading}</div> : null}
      {body ? <div style={{ color: COLORS.muted, fontSize: 16, lineHeight: '26px', marginTop: 8, whiteSpace: 'pre-line' }}>{body}</div> : null}
      {links.length ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 18 }}>
          {links.map((link, index) => (
            <span
              key={index}
              style={{
                border: `1px solid ${COLORS.accent}`,
                borderRadius: 8,
                color: COLORS.accent,
                fontSize: 14,
                fontWeight: 900,
                padding: '9px 14px',
              }}
            >
              {getString(link.label) || 'Link'}
            </span>
          ))}
        </div>
      ) : null}
    </aside>
  )
}

function PostGalleryPreview(props: BlockProps) {
  const items = getItems(props.items)
  if (!items.length) return <Placeholder label="Select gallery images" />
  const stacked = props.layout === 'stacked'

  return (
    <div style={{ display: 'grid', gap: 14, gridTemplateColumns: stacked ? '1fr' : 'repeat(2, minmax(0, 1fr))', margin: '0 0 28px' }}>
      {items.map((item, index) => {
        const media = getMediaSource(item.media)
        if (!media) return null

        return (
          <figure key={index} style={{ margin: 0 }}>
            <PreviewImage
              alt={getString(item.caption) || media.alt}
              src={media.src}
              style={{
                aspectRatio: '4 / 3',
                border: `1px solid ${COLORS.border}`,
                borderRadius: 14,
                objectFit: 'cover',
                width: '100%',
              }}
            />
            {item.caption ? <figcaption style={{ color: COLORS.muted, fontSize: 13, lineHeight: '20px', marginTop: 8 }}>{getString(item.caption)}</figcaption> : null}
          </figure>
        )
      })}
    </div>
  )
}

function PostBentoGridPreview(props: BlockProps) {
  const heading = getString(props.heading)
  const items = getItems(props.items)
  if (!heading && !items.length) return <Placeholder label="Add bento grid items" />

  return (
    <section style={{ margin: '4px 0 30px' }}>
      {heading ? <div style={{ color: COLORS.primary, fontSize: 28, fontWeight: 900, lineHeight: '34px', marginBottom: 16 }}>{heading}</div> : null}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        {items.map((item, index) => {
          const media = getMediaSource(item.media)
          const wide = item.size === 'wide'

          return (
            <article
              key={index}
              style={{
                ...cardStyle,
                borderLeft: wide ? `4px solid ${COLORS.accent}` : `1px solid ${COLORS.border}`,
                gridColumn: wide ? 'span 2' : undefined,
                padding: wide ? 22 : 18,
              }}
            >
              {media ? (
                <PreviewImage
                  alt={getString(item.alt) || media.alt}
                  src={media.src}
                  style={{
                    aspectRatio: wide ? '16 / 7' : '4 / 3',
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 12,
                    display: 'block',
                    marginBottom: 12,
                    objectFit: 'cover',
                    width: '100%',
                  }}
                />
              ) : null}
              <div style={{ color: COLORS.primary, fontSize: wide ? 20 : 17, fontWeight: 900, lineHeight: wide ? '26px' : '23px' }}>
                {getString(item.title) || 'Bento item'}
              </div>
              {item.body ? <div style={{ color: COLORS.muted, fontSize: 15, lineHeight: '24px', marginTop: 7 }}>{getString(item.body)}</div> : null}
            </article>
          )
        })}
      </div>
    </section>
  )
}

function PostGridPreview({ children, props }: { children?: React.ReactNode; props: BlockProps }) {
  const childrenArray = React.Children.toArray(children)
  const layout = typeof props.layout === 'string' ? props.layout : 'twoColumns'
  const columns = (() => {
    switch (layout) {
      case 'oneColumn':
        return childrenArray.slice(0, 1)
      case 'threeColumns':
        return childrenArray.slice(0, 3)
      case 'fourColumns':
        return childrenArray.slice(0, 4)
      case 'twoColumnsLeftWide':
      case 'twoColumnsRightWide':
      case 'twoColumns':
      default:
        return [childrenArray[0], childrenArray[childrenArray.length - 1]]
    }
  })()
  const gridTemplateColumns = (() => {
    switch (layout) {
      case 'oneColumn':
        return 'minmax(0, 1fr)'
      case 'twoColumnsLeftWide':
        return 'minmax(0, 2fr) minmax(0, 1fr)'
      case 'twoColumnsRightWide':
        return 'minmax(0, 1fr) minmax(0, 2fr)'
      case 'threeColumns':
        return 'repeat(3, minmax(0, 1fr))'
      case 'fourColumns':
        return 'repeat(4, minmax(0, 1fr))'
      case 'twoColumns':
      default:
        return 'repeat(2, minmax(0, 1fr))'
    }
  })()

  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns, margin: '4px 0 30px' }}>
      {columns.map((child, index) => (
        <div key={index} style={{ ...cardStyle, borderStyle: 'dashed', minHeight: 140, padding: 12 }}>
          {child}
        </div>
      ))}
    </div>
  )
}

function PostCalloutPreview(props: BlockProps) {
  const strong = props.tone === 'strong'
  const accent = props.tone === 'accent'

  return (
    <aside
      style={{
        background: strong ? COLORS.primary : accent ? COLORS.accentSoft : COLORS.surfaceAlt,
        border: `1px solid ${strong ? COLORS.primary : accent ? 'rgba(167,30,34,0.3)' : COLORS.border}`,
        borderRadius: 16,
        color: strong ? COLORS.white : COLORS.foreground,
        margin: '4px 0 30px',
        padding: '24px 28px',
      }}
    >
      {props.heading ? <div style={{ fontSize: 24, fontWeight: 900, lineHeight: '30px', marginBottom: 10 }}>{getString(props.heading)}</div> : null}
      {renderRichText(props.content)}
    </aside>
  )
}

function PostButtonPreview(props: BlockProps) {
  const label = getString(props.label) || 'Read more'
  const align = getAlign(props.align)
  const outline = props.variant === 'outline'
  const secondary = props.variant === 'secondary'

  return (
    <div style={{ margin: '0 0 28px', textAlign: align }}>
      <span
        style={{
          background: outline ? COLORS.white : secondary ? COLORS.surfaceAlt : COLORS.accent,
          border: `1px solid ${outline ? COLORS.accent : secondary ? COLORS.border : COLORS.accent}`,
          borderRadius: 8,
          color: outline || secondary ? COLORS.accent : COLORS.white,
          display: 'inline-block',
          fontSize: 15,
          fontWeight: 900,
          padding: '11px 18px',
        }}
      >
        {label}
      </span>
    </div>
  )
}

export function PuckPostBlockPreview({
  blockType,
  children,
  props,
}: {
  blockType: string
  children?: React.ReactNode
  props: BlockProps
}) {
  switch (blockType) {
    case 'postBody':
      return props.content ? <>{renderRichText(props.content)}</> : <Placeholder label="Post body renders the existing Content tab rich text." />
    case 'postRichText':
      return <>{renderRichText(props.content)}</>
    case 'postCallout':
      return <PostCalloutPreview {...props} />
    case 'postButton':
      return <PostButtonPreview {...props} />
    case 'postImage':
      return <PostImagePreview {...props} />
    case 'postGallery':
      return <PostGalleryPreview {...props} />
    case 'postList':
      return <PostListPreview {...props} />
    case 'postLinks':
      return <PostLinksPreview {...props} />
    case 'postBentoGrid':
      return <PostBentoGridPreview {...props} />
    case 'postGrid':
      return <PostGridPreview props={props}>{children}</PostGridPreview>
    case 'postDivider':
      return <hr style={{ border: 0, borderTop: `1px solid ${COLORS.border}`, margin: '28px 0' }} />
    case 'postSpacer':
      return <div aria-hidden="true" style={{ height: Math.max(4, Math.min(96, Number(props.size) || 24)) }} />
    default:
      return null
  }
}
