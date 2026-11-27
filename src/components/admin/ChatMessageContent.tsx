import React, { type ReactNode } from 'react'
import { assistantPreviewPrefix, dashboardPostIdPattern } from '@/lib/dashboard-assistant/protocol'

type LinkOptions = { adminRoute?: string; publicSiteBase?: string }

function isDraftPreviewLink(href: string) {
  return href.startsWith(assistantPreviewPrefix) && dashboardPostIdPattern.test(href.slice(assistantPreviewPrefix.length))
}

function allowedLink(href: string, { adminRoute, publicSiteBase }: LinkOptions) {
  if (/[\\\x00-\x1f\x7f]/.test(href)) return false
  try {
    if (adminRoute && isDraftPreviewLink(href)) return true
    if (adminRoute && href.startsWith(`${adminRoute}/`) && !href.includes('..')) {
      return new URL(href, 'https://dashboard.invalid').pathname.startsWith(`${adminRoute}/`)
    }
    if (publicSiteBase && /^https?:\/\//i.test(href)) {
      const destination = new URL(href)
      return destination.origin === new URL(publicSiteBase).origin && !destination.username && !destination.password
    }
  } catch { return false }
  return false
}

function inlineContent(text: string, linkOptions: LinkOptions = {}): ReactNode[] {
  const tokens = /`([^`\n]+)`|\*\*([^*\n]+)\*\*|\[([^\[\]\n]+)\]\(((?:https?:\/\/|\/)[^\s)]+)\)/g
  const parts: ReactNode[] = []
  let offset = 0
  for (const match of text.matchAll(tokens)) {
    const [literal, code, strong, label, href] = match
    const index = match.index!
    parts.push(text.slice(offset, index))
    if (code) parts.push(<code key={index}>{code}</code>)
    else if (strong) parts.push(<strong key={index}>{inlineContent(strong, linkOptions)}</strong>)
    else if (href && allowedLink(href, linkOptions)) {
      parts.push(<a key={index} href={href} {...(isDraftPreviewLink(href) && { target: '_blank', rel: 'noreferrer' })}>{inlineContent(label!)}</a>)
    } else parts.push(literal)
    offset = index + literal.length
  }
  parts.push(text.slice(offset))
  return parts
}

export function ChatMessageContent({ content, plain, ...linkOptions }: LinkOptions & { content: string; plain?: boolean }) {
  return <p>{plain ? content : inlineContent(content, linkOptions)}</p>
}
