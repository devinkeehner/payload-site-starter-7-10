import React from 'react'
import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components'
import { Markdown } from '@react-email/markdown'
import { render } from '@react-email/render'

import { normalizeMediaResource } from '@/lib/utilities/image'

type EmailBlock = Record<string, unknown> & {
  blockType?: string
}

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

export type RenderEmailInput = {
  layout?: unknown[] | null
  origin?: string | null
  preheader?: string | null
  subject?: string | null
}

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
  backgroundColor: COLORS.surface,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 14,
}

const softCardStyle: React.CSSProperties = {
  backgroundColor: COLORS.surfaceAlt,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 14,
}

const imageFrameStyle: React.CSSProperties = {
  border: `1px solid ${COLORS.border}`,
  borderRadius: 12,
  display: 'block',
  height: 'auto',
}

function getTextColor(value: unknown): string {
  switch (value) {
    case 'primary':
      return COLORS.primary
    case 'accent':
      return COLORS.accent
    case 'white':
      return COLORS.white
    case 'default':
    case 'foreground':
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
    borderRadius: 999,
    color,
    display: 'inline-block',
    fontSize: 14,
    fontWeight: 800,
    lineHeight: '20px',
    padding: '13px 22px',
    textDecoration: 'none',
    textTransform: 'uppercase',
  }
}

function getNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numberValue = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numberValue)) return fallback
  return Math.max(min, Math.min(max, numberValue))
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeItems(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
    : []
}

function normalizeOrigin(origin?: string | null): string | null {
  const trimmed = typeof origin === 'string' ? origin.trim() : ''
  if (!trimmed) return null

  try {
    return new URL(trimmed).origin
  } catch {
    return null
  }
}

function absolutizeRelativeMediaURLs(value: unknown, origin: string | null): unknown {
  if (!origin || value == null || typeof value !== 'object') return value

  if (Array.isArray(value)) {
    return value.map((item) => absolutizeRelativeMediaURLs(item, origin))
  }

  const record = value as Record<string, unknown>
  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => {
      if (key === 'url' && typeof entry === 'string' && entry.startsWith('/')) {
        return [key, new URL(entry, origin).toString()]
      }

      return [key, absolutizeRelativeMediaURLs(entry, origin)]
    }),
  )
}

function getSocialLabel(value: unknown): string {
  switch (value) {
    case 'facebook':
      return 'f'
    case 'instagram':
      return 'ig'
    case 'linkedin':
      return 'in'
    case 'x':
      return 'x'
    case 'youtube':
      return 'yt'
    case 'flickr':
      return 'fl'
    case 'website':
      return 'www'
    default:
      return 'link'
  }
}

function getMediaSource(value: unknown): { alt: string; src: string } | null {
  const media = normalizeMediaResource(value)
  const src = media?.url || ''
  if (!src) return null
  return { alt: media?.alt || '', src }
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

function renderEmailInlineNodes(nodes: LexicalNode[], keyPrefix: string): React.ReactNode[] {
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
      const children = renderEmailInlineNodes(getNodeChildren(node), key)
      if (!url) return <React.Fragment key={key}>{children}</React.Fragment>

      return (
        <Link key={key} href={url} style={{ color: COLORS.accent, fontWeight: 800, textDecoration: 'underline' }}>
          {children}
        </Link>
      )
    }

    return <React.Fragment key={key}>{renderEmailInlineNodes(getNodeChildren(node), key)}</React.Fragment>
  })
}

function renderEmailRichText(value: unknown, color: unknown, align: unknown): React.ReactNode[] | null {
  if (!isLexicalState(value)) return null

  const blocks = value.root?.children || []
  if (!blocks.length) return null

  return blocks.map((node, index) => {
    const children = renderEmailInlineNodes(getNodeChildren(node), `rt-${index}`)
    const alignment = getNodeAlignment(node, align)
    const textColor = getTextColor(color)
    const hasChildren = children.some((child) => child !== '')

    if (!hasChildren && node.type !== 'horizontalrule') return null

    if (node.type === 'heading') {
      const tag = node.tag === 'h1' || node.tag === 'h2' || node.tag === 'h3' ? node.tag : 'h3'
      const fontSize = tag === 'h1' ? 30 : tag === 'h2' ? 24 : 19
      return (
        <Heading
          key={index}
          as={tag}
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
        </Heading>
      )
    }

    if (node.type === 'quote') {
      return (
        <Section key={index} style={{ borderLeft: `4px solid ${COLORS.accent}`, margin: '10px 0 20px', padding: '2px 0 2px 16px' }}>
          <Text style={{ color: COLORS.muted, fontSize: 16, fontStyle: 'italic', lineHeight: '26px', margin: 0, textAlign: alignment }}>
            {children}
          </Text>
        </Section>
      )
    }

    if (node.type === 'list') {
      const listItems = getNodeChildren(node)
      const ordered = node.listType === 'number' || node.listType === 'ordered'

      return (
        <Section key={index} style={{ margin: '4px 0 18px' }}>
          {listItems.map((item, itemIndex) => (
            <Text key={itemIndex} style={{ color: textColor, fontSize: 16, lineHeight: '26px', margin: '0 0 6px', textAlign: alignment }}>
              <span style={{ color: COLORS.accent, fontWeight: 800 }}>{ordered ? `${itemIndex + 1}. ` : '• '}</span>
              {renderEmailInlineNodes(getNodeChildren(item), `rt-${index}-${itemIndex}`)}
            </Text>
          ))}
        </Section>
      )
    }

    if (node.type === 'horizontalrule') {
      return <Hr key={index} style={{ borderColor: COLORS.border, borderStyle: 'solid', borderWidth: '1px 0 0', margin: '20px 0' }} />
    }

    return (
      <Text
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
      </Text>
    )
  })
}

function needsInlineSeparatorBefore(value: string): boolean {
  return Boolean(value && !/\s$/.test(value))
}

function needsInlineSeparatorAfter(value: string): boolean {
  return Boolean(value && !/^\s|^[.,;:!?]/.test(value))
}

function EmailHeaderSocial({ block }: { block: EmailBlock }) {
  const logoText = normalizeText(block.logoText)
  const subtitle = normalizeText(block.subtitle)
  const socialLinks = normalizeItems(block.socialLinks)

  return (
    <Section style={{ backgroundColor: COLORS.primary, borderRadius: 16, margin: '0 0 30px', padding: '22px 24px' }}>
      <Row>
        <Column style={{ verticalAlign: 'middle', width: '62%' }}>
          {logoText ? (
            <Text
              style={{
                color: COLORS.white,
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: '0.02em',
                lineHeight: '26px',
                margin: 0,
              }}
            >
              {logoText}
            </Text>
          ) : null}
          {subtitle ? (
            <Text style={{ color: '#d8e0ee', fontSize: 13, lineHeight: '19px', margin: '6px 0 0' }}>
              {subtitle}
            </Text>
          ) : null}
        </Column>
        <Column style={{ textAlign: 'right', verticalAlign: 'middle', width: '38%' }}>
          {socialLinks.map((item, index) => {
            const url = normalizeText(item.url)
            if (!url) return null

            return (
              <Link
                key={`${url}-${index}`}
                href={url}
                style={{
                  backgroundColor: 'rgba(255,255,255,0.12)',
                  border: '1px solid rgba(255,255,255,0.22)',
                  borderRadius: 999,
                  color: COLORS.white,
                  display: 'inline-block',
                  fontSize: 11,
                  fontWeight: 800,
                  lineHeight: '28px',
                  marginLeft: 6,
                  textAlign: 'center',
                  textDecoration: 'none',
                  textTransform: 'uppercase',
                  width: 28,
                }}
              >
                {getSocialLabel(item.platform)}
              </Link>
            )
          })}
        </Column>
      </Row>
    </Section>
  )
}

function EmailHeading({ block }: { block: EmailBlock }) {
  const level = block.level === 'h2' || block.level === 'h3' ? block.level : 'h1'
  const fontSize = level === 'h1' ? 34 : level === 'h2' ? 26 : 20
  const text = normalizeText(block.text)
  if (!text) return null

  return (
    <Heading
      as={level}
      style={{
        color: getTextColor(block.color),
        fontSize,
        fontWeight: 800,
        letterSpacing: '0.01em',
        lineHeight: level === 'h1' ? '39px' : level === 'h2' ? '32px' : '26px',
        margin: '0 0 18px',
        textAlign: getAlign(block.align),
      }}
    >
      {text}
    </Heading>
  )
}

function EmailText({ block }: { block: EmailBlock }) {
  const richText = renderEmailRichText(block.text, block.color, block.align)
  if (richText) return <>{richText}</>

  const text = normalizeText(block.text)
  if (!text) return null

  return (
    <Text
      style={{
        color: getTextColor(block.color),
        fontSize: 16,
        lineHeight: '27px',
        margin: '0 0 18px',
        textAlign: getAlign(block.align),
        whiteSpace: 'pre-line',
      }}
    >
      {text}
    </Text>
  )
}

function EmailInlineLink({ block }: { block: EmailBlock }) {
  const beforeText = normalizeText(block.beforeText)
  const label = normalizeText(block.label)
  const url = normalizeText(block.url)
  const afterText = normalizeText(block.afterText)
  if (!label || !url) return null

  return (
    <Text
      style={{
        color: COLORS.foreground,
        fontSize: 16,
        lineHeight: '26px',
        margin: '0 0 18px',
        textAlign: getAlign(block.align),
      }}
    >
      {beforeText}
      {needsInlineSeparatorBefore(beforeText) ? ' ' : null}
      <Link href={url} style={{ color: COLORS.accent, fontWeight: 800, textDecoration: 'underline' }}>
        {label}
      </Link>
      {needsInlineSeparatorAfter(afterText) ? ' ' : null}
      {afterText}
    </Text>
  )
}

function EmailButton({ block }: { block: EmailBlock }) {
  const label = normalizeText(block.label)
  const url = normalizeText(block.url)
  if (!label || !url) return null

  return (
    <Section style={{ margin: '10px 0 26px', textAlign: getAlign(block.align) }}>
      <Button href={url} style={getButtonStyle(block.variant)}>
        {label}
      </Button>
    </Section>
  )
}

function EmailTwoButtons({ block }: { block: EmailBlock }) {
  const primaryLabel = normalizeText(block.primaryLabel)
  const primaryUrl = normalizeText(block.primaryUrl)
  const secondaryLabel = normalizeText(block.secondaryLabel)
  const secondaryUrl = normalizeText(block.secondaryUrl)

  if (!primaryLabel && !secondaryLabel) return null

  return (
    <Section style={{ margin: '10px 0 26px', textAlign: getAlign(block.align) }}>
      {primaryLabel && primaryUrl ? (
        <Button href={primaryUrl} style={{ ...getButtonStyle(block.primaryVariant), margin: '0 8px 8px 0' }}>
          {primaryLabel}
        </Button>
      ) : null}
      {secondaryLabel && secondaryUrl ? (
        <Button href={secondaryUrl} style={{ ...getButtonStyle(block.secondaryVariant), margin: '0 0 8px' }}>
          {secondaryLabel}
        </Button>
      ) : null}
    </Section>
  )
}

function EmailList({ block }: { block: EmailBlock }) {
  const items = normalizeItems(block.items)
  if (!items.length) return null

  const imageLeft = block.style === 'imageLeft'

  return (
    <Section style={{ margin: '10px 0 26px' }}>
      {items.map((item, index) => {
        const title = normalizeText(item.title)
        const body = normalizeText(item.body)
        const media = getMediaSource(item.media)
        const alt = normalizeText(item.alt) || media?.alt || ''

        if (!title && !body) return null

        if (imageLeft) {
          return (
            <Row key={index} style={{ ...softCardStyle, marginBottom: 10 }}>
              <Column style={{ padding: '14px 12px 14px 14px', verticalAlign: 'top', width: 72 }}>
                {media ? (
                  <Img
                    alt={alt}
                    src={media.src}
                    width={56}
                    style={{ ...imageFrameStyle, borderRadius: 10, width: 56 }}
                  />
                ) : (
                  <Text
                    style={{
                      backgroundColor: COLORS.accent,
                      borderRadius: 999,
                      color: COLORS.white,
                      fontSize: 13,
                      fontWeight: 800,
                      lineHeight: '32px',
                      margin: 0,
                      textAlign: 'center',
                      width: 32,
                    }}
                  >
                    {index + 1}
                  </Text>
                )}
              </Column>
              <Column style={{ padding: '14px 14px 14px 0', verticalAlign: 'top' }}>
                {title ? (
                  <Text style={{ color: COLORS.foreground, fontSize: 15, fontWeight: 800, lineHeight: '21px', margin: 0 }}>
                    {title}
                  </Text>
                ) : null}
                {body ? (
                  <Text style={{ color: COLORS.muted, fontSize: 14, lineHeight: '22px', margin: '4px 0 0' }}>
                    {body}
                  </Text>
                ) : null}
              </Column>
            </Row>
          )
        }

        return (
          <Section key={index} style={{ ...softCardStyle, margin: '0 0 10px', padding: '14px 16px' }}>
            <Text style={{ color: COLORS.foreground, fontSize: 15, fontWeight: 800, lineHeight: '21px', margin: 0 }}>
              <span style={{ color: COLORS.accent }}>• </span>
              {title}
            </Text>
            {body ? <Text style={{ color: COLORS.muted, fontSize: 14, lineHeight: '22px', margin: '4px 0 0' }}>{body}</Text> : null}
          </Section>
        )
      })}
    </Section>
  )
}

function EmailMarkdown({ block }: { block: EmailBlock }) {
  const markdown = normalizeText(block.markdown)
  if (!markdown) return null

  return (
    <Markdown
      markdownContainerStyles={{
        ...softCardStyle,
        color: COLORS.foreground,
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: 15,
        lineHeight: '24px',
        margin: '0 0 24px',
        padding: '18px 20px',
      }}
      markdownCustomStyles={{
        link: { color: COLORS.accent, fontWeight: '700' },
        h1: { color: COLORS.foreground, fontSize: '28px', lineHeight: '34px', margin: '0 0 14px' },
        h2: { color: COLORS.foreground, fontSize: '23px', lineHeight: '30px', margin: '0 0 12px' },
        h3: { color: COLORS.foreground, fontSize: '19px', lineHeight: '26px', margin: '0 0 10px' },
        li: { marginBottom: '6px' },
        p: { margin: '0 0 14px' },
      }}
    >
      {markdown}
    </Markdown>
  )
}

function EmailImage({ block }: { block: EmailBlock }) {
  const media = normalizeMediaResource(block.media)
  const src = media?.url || ''
  if (!src) return null

  const alt = normalizeText(block.alt) || media?.alt || ''
  const width = getNumber(block.width, 560, 120, 640)
  const image = (
    <Img
      alt={alt}
      src={src}
      width={width}
      style={{
        ...imageFrameStyle,
        borderRadius: 14,
        display: 'block',
        height: 'auto',
        margin: '0 auto 24px',
        maxWidth: '100%',
        width: '100%',
      }}
    />
  )

  const href = normalizeText(block.href)
  return href ? <Link href={href}>{image}</Link> : image
}

function EmailArticleImageRight({ block }: { block: EmailBlock }) {
  const heading = normalizeText(block.heading)
  const body = normalizeText(block.body)
  const url = normalizeText(block.url)
  const linkLabel = normalizeText(block.linkLabel)
  const media = getMediaSource(block.media)
  const alt = normalizeText(block.alt) || media?.alt || ''

  if (!heading && !body && !media) return null

  return (
    <Section style={{ ...softCardStyle, margin: '10px 0 26px', padding: 18 }}>
      <Row>
        <Column style={{ paddingRight: 16, verticalAlign: 'top', width: '58%' }}>
          {heading ? (
                  <Text style={{ color: COLORS.foreground, fontSize: 20, fontWeight: 800, lineHeight: '25px', margin: 0 }}>
              {heading}
            </Text>
          ) : null}
          {body ? (
            <Text style={{ color: COLORS.muted, fontSize: 14, lineHeight: '22px', margin: '8px 0 0' }}>
              {body}
            </Text>
          ) : null}
          {url && linkLabel ? (
            <Link href={url} style={{ color: COLORS.accent, display: 'inline-block', fontSize: 14, fontWeight: 800, marginTop: 12, textDecoration: 'none' }}>
              {linkLabel}
            </Link>
          ) : null}
        </Column>
        <Column style={{ verticalAlign: 'top', width: '42%' }}>
          {media ? (
            <Img
              alt={alt}
              src={media.src}
              style={{ ...imageFrameStyle, maxWidth: '100%', width: '100%' }}
            />
          ) : null}
        </Column>
      </Row>
    </Section>
  )
}

function EmailArticleTwoCards({ block }: { block: EmailBlock }) {
  const cards = normalizeItems(block.cards).slice(0, 2)
  if (!cards.length) return null

  return (
    <Section style={{ margin: '10px -5px 26px' }}>
      <Row>
        {cards.map((card, index) => {
          const media = getMediaSource(card.media)
          const alt = normalizeText(card.alt) || media?.alt || ''
          const heading = normalizeText(card.heading)
          const body = normalizeText(card.body)
          const url = normalizeText(card.url)
          const linkLabel = normalizeText(card.linkLabel)

          return (
            <Column key={index} style={{ padding: '5px', verticalAlign: 'top', width: '50%' }}>
              <Section style={{ ...cardStyle, padding: 16 }}>
                {media ? (
                  <Img
                    alt={alt}
                    src={media.src}
                    style={{ ...imageFrameStyle, marginBottom: 12, maxWidth: '100%', width: '100%' }}
                  />
                ) : null}
                {heading ? (
                  <Text style={{ color: COLORS.foreground, fontSize: 16, fontWeight: 800, lineHeight: '21px', margin: 0 }}>
                    {heading}
                  </Text>
                ) : null}
                {body ? (
                  <Text style={{ color: COLORS.muted, fontSize: 13, lineHeight: '20px', margin: '7px 0 0' }}>
                    {body}
                  </Text>
                ) : null}
                {url && linkLabel ? (
                  <Link href={url} style={{ color: COLORS.accent, display: 'inline-block', fontSize: 13, fontWeight: 800, marginTop: 10, textDecoration: 'none' }}>
                    {linkLabel}
                  </Link>
                ) : null}
              </Section>
            </Column>
          )
        })}
      </Row>
    </Section>
  )
}

type EmailGalleryItem = {
  alt: string
  caption: string
  href: string
  src: string
}

function getGalleryItems(value: unknown): EmailGalleryItem[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null

      const record = item as Record<string, unknown>
      const media = normalizeMediaResource(record.media)
      const src = media?.url || ''
      if (!src) return null

      return {
        alt: normalizeText(record.alt) || media?.alt || '',
        caption: normalizeText(record.caption),
        href: normalizeText(record.href),
        src,
      }
    })
    .filter((item): item is EmailGalleryItem => Boolean(item))
}

function GalleryImage({ item }: { item: EmailGalleryItem }) {
  const image = (
    <Img
      alt={item.alt}
      src={item.src}
      style={{
        ...imageFrameStyle,
        borderRadius: 12,
        display: 'block',
        height: 'auto',
        maxWidth: '100%',
        width: '100%',
      }}
    />
  )

  return (
    <>
      {item.href ? <Link href={item.href}>{image}</Link> : image}
      {item.caption ? (
        <Text
          style={{
            color: COLORS.muted,
            fontSize: 13,
            lineHeight: '18px',
            margin: '8px 0 0',
          }}
        >
          {item.caption}
        </Text>
      ) : null}
    </>
  )
}

function GalleryRows({ items, columns }: { columns: number; items: EmailGalleryItem[] }) {
  const rows: EmailGalleryItem[][] = []
  for (let index = 0; index < items.length; index += columns) {
    rows.push(items.slice(index, index + columns))
  }

  return (
    <>
      {rows.map((row, rowIndex) => (
        <Row key={rowIndex}>
          {row.map((item, itemIndex) => (
            <Column
              key={`${item.src}-${itemIndex}`}
              style={{
                padding: '5px',
                verticalAlign: 'top',
                width: `${100 / columns}%`,
              }}
            >
              <GalleryImage item={item} />
            </Column>
          ))}
        </Row>
      ))}
    </>
  )
}

function EmailGallery({ block }: { block: EmailBlock }) {
  const items = getGalleryItems(block.items)
  if (!items.length) return null

  const layout = normalizeText(block.layout)

  return (
    <Section style={{ margin: '10px -5px 26px' }}>
      {layout === 'threeColumns' ? (
        <GalleryRows columns={3} items={items} />
      ) : layout === 'horizontalGrid' ? (
        <GalleryRows columns={Math.min(4, Math.max(1, items.length))} items={items} />
      ) : layout === 'verticalGrid' ? (
        <GalleryRows columns={1} items={items} />
      ) : (
        <GalleryRows columns={2} items={items.slice(0, 4)} />
      )}
    </Section>
  )
}

function EmailFeatureThreeCentered({ block }: { block: EmailBlock }) {
  const heading = normalizeText(block.heading)
  const paragraphs = normalizeItems(block.paragraphs)
    .map((item) => normalizeText(item.text))
    .filter(Boolean)
    .slice(0, 3)

  if (!heading && !paragraphs.length) return null

  return (
    <Section style={{ ...softCardStyle, margin: '10px 0 28px', padding: '24px 28px', textAlign: 'center' }}>
      {heading ? (
        <Heading
          as="h2"
          style={{
            color: COLORS.foreground,
            fontSize: 26,
            fontWeight: 800,
            lineHeight: '32px',
            margin: '0 0 16px',
            textAlign: 'center',
          }}
        >
          {heading}
        </Heading>
      ) : null}
      {paragraphs.map((text, index) => (
        <Text
          key={index}
          style={{
            color: COLORS.muted,
            fontSize: 15,
            lineHeight: '24px',
            margin: index === paragraphs.length - 1 ? 0 : '0 0 10px',
            textAlign: 'center',
          }}
        >
          {text}
        </Text>
      ))}
    </Section>
  )
}

function EmailBentoGrid({ block }: { block: EmailBlock }) {
  const heading = normalizeText(block.heading)
  const items = normalizeItems(block.items)
  if (!heading && !items.length) return null

  return (
    <Section style={{ margin: '10px -5px 26px' }}>
      {heading ? (
        <Heading as="h2" style={{ color: COLORS.foreground, fontSize: 26, lineHeight: '32px', margin: '0 5px 16px' }}>
          {heading}
        </Heading>
      ) : null}
      {items.map((item, index) => {
        const media = getMediaSource(item.media)
        const alt = normalizeText(item.alt) || media?.alt || ''
        const title = normalizeText(item.title)
        const body = normalizeText(item.body)
        const wide = item.size === 'wide'

        if (wide) {
          return (
            <Section key={index} style={{ ...softCardStyle, borderLeft: `4px solid ${COLORS.accent}`, margin: '0 5px 10px', padding: 18 }}>
              {media ? (
                <Img alt={alt} src={media.src} style={{ ...imageFrameStyle, marginBottom: 12, maxWidth: '100%', width: '100%' }} />
              ) : null}
              {title ? <Text style={{ color: COLORS.foreground, fontSize: 17, fontWeight: 800, lineHeight: '22px', margin: 0 }}>{title}</Text> : null}
              {body ? <Text style={{ color: COLORS.muted, fontSize: 14, lineHeight: '22px', margin: '6px 0 0' }}>{body}</Text> : null}
            </Section>
          )
        }

        return (
          <Row key={index}>
            <Column style={{ padding: '5px', verticalAlign: 'top', width: '50%' }}>
              <Section style={{ ...cardStyle, padding: 16 }}>
                {media ? <Img alt={alt} src={media.src} style={{ ...imageFrameStyle, marginBottom: 10, maxWidth: '100%', width: '100%' }} /> : null}
                {title ? <Text style={{ color: COLORS.foreground, fontSize: 15, fontWeight: 800, lineHeight: '20px', margin: 0 }}>{title}</Text> : null}
                {body ? <Text style={{ color: COLORS.muted, fontSize: 13, lineHeight: '20px', margin: '6px 0 0' }}>{body}</Text> : null}
              </Section>
            </Column>
          </Row>
        )
      })}
    </Section>
  )
}

function renderNestedBlocks(value: unknown): React.ReactNode[] {
  const blocks = Array.isArray(value)
    ? value.filter((block): block is EmailBlock => Boolean(block && typeof block === 'object' && !Array.isArray(block)))
    : []

  return blocks.map(renderBlock)
}

function EmailGrid({ block }: { block: EmailBlock }) {
  const threeColumns = block.layout === 'threeColumns'
  const leftBlocks = renderNestedBlocks(block.leftBlocks)
  const centerBlocks = renderNestedBlocks(block.centerBlocks)
  const rightBlocks = renderNestedBlocks(block.rightBlocks)
  const columnWidth = threeColumns ? '33.333%' : '50%'

  return (
    <Section style={{ margin: '10px -6px 26px' }}>
      <Row>
        <Column style={{ padding: '0 6px', verticalAlign: 'top', width: columnWidth }}>
          {leftBlocks}
        </Column>
        {threeColumns ? (
          <Column style={{ padding: '0 6px', verticalAlign: 'top', width: columnWidth }}>
            {centerBlocks}
          </Column>
        ) : null}
        <Column style={{ padding: '0 6px', verticalAlign: 'top', width: columnWidth }}>
          {rightBlocks}
        </Column>
      </Row>
    </Section>
  )
}

function EmailDivider({ block }: { block: EmailBlock }) {
  const spacing = getNumber(block.spacing, 24, 0, 64)
  const color = block.color === 'primary'
    ? COLORS.primary
    : block.color === 'accent'
      ? COLORS.accent
      : COLORS.border

  return (
    <Hr
      style={{
        borderColor: color,
        borderStyle: 'solid',
        borderWidth: block.color === 'border' ? '1px 0 0' : '2px 0 0',
        margin: `${spacing}px 0`,
      }}
    />
  )
}

function EmailSpacer({ block }: { block: EmailBlock }) {
  const size = getNumber(block.size, 24, 4, 96)
  return <Section style={{ height: size, lineHeight: `${size}px` }}>&nbsp;</Section>
}

function EmailCallout({ block }: { block: EmailBlock }) {
  const heading = normalizeText(block.heading)
  const body = normalizeText(block.body)
  if (!heading && !body) return null

  const variant = block.variant === 'primary' || block.variant === 'neutral' ? block.variant : 'accent'
  const borderColor = variant === 'primary' ? COLORS.primary : variant === 'neutral' ? COLORS.border : COLORS.accent
  const backgroundColor = variant === 'primary' ? COLORS.primarySoft : variant === 'neutral' ? COLORS.surfaceAlt : COLORS.accentSoft

  return (
    <Section
      style={{
        border: `1px solid ${variant === 'neutral' ? COLORS.border : borderColor}`,
        backgroundColor,
        borderLeft: `4px solid ${borderColor}`,
        borderRadius: 12,
        margin: '10px 0 24px',
        padding: '18px 20px',
      }}
    >
      {heading ? (
        <Text
          style={{
            color: COLORS.foreground,
            fontSize: 17,
            fontWeight: 800,
            lineHeight: '22px',
            margin: '0 0 6px',
          }}
        >
          {heading}
        </Text>
      ) : null}
      {body ? (
        <Text
          style={{
            color: COLORS.muted,
            fontSize: 15,
            lineHeight: '24px',
            margin: 0,
            whiteSpace: 'pre-line',
          }}
        >
          {body}
        </Text>
      ) : null}
    </Section>
  )
}

function EmailFooterOneColumn({ block }: { block: EmailBlock }) {
  const heading = normalizeText(block.heading)
  const body = normalizeText(block.body)
  const address = normalizeText(block.address)
  const copyright = normalizeText(block.copyright)
  const links = normalizeItems(block.links)
  const socialLinks = normalizeItems(block.socialLinks)
  const towns = normalizeItems(block.towns)

  return (
    <Section style={{ backgroundColor: COLORS.primary, borderRadius: 16, margin: '30px 0 0', padding: '24px 28px', textAlign: 'center' }}>
      {heading ? <Text style={{ color: COLORS.white, fontSize: 17, fontWeight: 800, lineHeight: '23px', margin: 0 }}>{heading}</Text> : null}
      {body ? <Text style={{ color: '#d8e0ee', fontSize: 13, lineHeight: '20px', margin: '7px 0 0', whiteSpace: 'pre-line' }}>{body}</Text> : null}
      {address ? <Text style={{ color: '#bac6d8', fontSize: 12, lineHeight: '18px', margin: '14px 0 0', whiteSpace: 'pre-line' }}>{address}</Text> : null}
      {links.length ? (
        <Text style={{ color: COLORS.white, fontSize: 12, lineHeight: '18px', margin: '14px 0 0' }}>
          {links.map((link, index) => {
            const label = normalizeText(link.label)
            const url = normalizeText(link.url)
            if (!label || !url) return null
            return (
              <React.Fragment key={`${url}-${index}`}>
                {index > 0 ? '  |  ' : null}
                <Link href={url} style={{ color: COLORS.white, fontWeight: 800, textDecoration: 'underline' }}>
                  {label}
                </Link>
              </React.Fragment>
            )
          })}
        </Text>
      ) : null}
      {socialLinks.length ? (
        <Text style={{ margin: '16px 0 0' }}>
          {socialLinks.map((item, index) => {
            const url = normalizeText(item.url)
            if (!url) return null

            return (
              <Link
                key={`${url}-${index}`}
                href={url}
                style={{
                  backgroundColor: 'rgba(255,255,255,0.12)',
                  border: '1px solid rgba(255,255,255,0.24)',
                  borderRadius: 999,
                  color: COLORS.white,
                  display: 'inline-block',
                  fontSize: 11,
                  fontWeight: 800,
                  lineHeight: '28px',
                  margin: '0 3px',
                  textAlign: 'center',
                  textDecoration: 'none',
                  textTransform: 'uppercase',
                  width: 28,
                }}
              >
                {getSocialLabel(item.platform)}
              </Link>
            )
          })}
        </Text>
      ) : null}
      {towns.length ? (
        <Text style={{ color: '#d8e0ee', fontSize: 11, lineHeight: '18px', margin: '16px 0 0' }}>
          <span style={{ color: '#9fb0c8', fontWeight: 800, textTransform: 'uppercase' }}>Serving </span>
          {towns.map((town, index) => {
            const label = normalizeText(town.town)
            const url = normalizeText(town.url)
            if (!label) return null

            const separator = index > 0 ? ', ' : ''
            return (
              <React.Fragment key={`${label}-${index}`}>
                {separator}
                {url ? (
                  <Link href={url} style={{ color: COLORS.white, fontWeight: 800, textDecoration: 'underline' }}>
                    {label}
                  </Link>
                ) : (
                  <span style={{ color: COLORS.white, fontWeight: 800 }}>{label}</span>
                )}
              </React.Fragment>
            )
          })}
        </Text>
      ) : null}
      {copyright ? <Text style={{ color: '#9fb0c8', fontSize: 11, lineHeight: '16px', margin: '14px 0 0' }}>{copyright}</Text> : null}
    </Section>
  )
}

function renderBlock(block: EmailBlock, index: number) {
  switch (block.blockType) {
    case 'emailHeaderSocial':
      return <EmailHeaderSocial key={index} block={block} />
    case 'emailHeading':
      return <EmailHeading key={index} block={block} />
    case 'emailText':
      return <EmailText key={index} block={block} />
    case 'emailInlineLink':
      return <EmailInlineLink key={index} block={block} />
    case 'emailButton':
      return <EmailButton key={index} block={block} />
    case 'emailTwoButtons':
      return <EmailTwoButtons key={index} block={block} />
    case 'emailList':
      return <EmailList key={index} block={block} />
    case 'emailMarkdown':
      return <EmailMarkdown key={index} block={block} />
    case 'emailImage':
      return <EmailImage key={index} block={block} />
    case 'emailArticleImageRight':
      return <EmailArticleImageRight key={index} block={block} />
    case 'emailArticleTwoCards':
      return <EmailArticleTwoCards key={index} block={block} />
    case 'emailGallery':
      return <EmailGallery key={index} block={block} />
    case 'emailFeatureThreeCentered':
      return <EmailFeatureThreeCentered key={index} block={block} />
    case 'emailBentoGrid':
      return <EmailBentoGrid key={index} block={block} />
    case 'emailGrid':
      return <EmailGrid key={index} block={block} />
    case 'emailDivider':
      return <EmailDivider key={index} block={block} />
    case 'emailSpacer':
      return <EmailSpacer key={index} block={block} />
    case 'emailCallout':
      return <EmailCallout key={index} block={block} />
    case 'emailFooterOneColumn':
      return <EmailFooterOneColumn key={index} block={block} />
    default:
      return null
  }
}

export function EmailDocument({ layout, preheader }: RenderEmailInput) {
  const blocks = Array.isArray(layout)
    ? layout.filter((block): block is EmailBlock => Boolean(block && typeof block === 'object' && !Array.isArray(block)))
    : []

  return (
    <Html>
      <Head />
      {preheader ? <Preview>{preheader}</Preview> : null}
      <Body style={{ backgroundColor: COLORS.background, margin: 0, padding: '32px 16px' }}>
        <Container
          style={{
            backgroundColor: COLORS.white,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 18,
            margin: '0 auto',
            maxWidth: 640,
            padding: '30px 30px',
          }}
        >
          {blocks.map(renderBlock)}
        </Container>
      </Body>
    </Html>
  )
}

export async function renderEmail(input: RenderEmailInput) {
  const element = (
    <EmailDocument
      {...input}
      layout={absolutizeRelativeMediaURLs(input.layout, normalizeOrigin(input.origin)) as unknown[] | null | undefined}
    />
  )
  const html = await render(element, { pretty: true })
  const text = await render(element, { plainText: true })

  return { html, text }
}
