import React, { type ReactNode } from 'react'

function inlineContent(text: string, adminRoute?: string): ReactNode[] {
  const tokens = /`([^`\n]+)`|\*\*([^*\n]+)\*\*|\[([^\[\]\n]+)\]\((\/[^\s)]+)\)/g
  const parts: ReactNode[] = []
  let offset = 0
  for (const match of text.matchAll(tokens)) {
    const [literal, code, strong, label, href] = match
    const index = match.index!
    parts.push(text.slice(offset, index))
    if (code) parts.push(<code key={index}>{code}</code>)
    else if (strong) parts.push(<strong key={index}>{inlineContent(strong, adminRoute)}</strong>)
    else if (adminRoute && href?.startsWith(`${adminRoute}/`) && !/[\\\x00-\x1f\x7f]/.test(href) && !href.includes('..') &&
      new URL(href, 'https://dashboard.invalid').pathname.startsWith(`${adminRoute}/`)) {
      parts.push(<a key={index} href={href}>{inlineContent(label!)}</a>)
    } else parts.push(literal)
    offset = index + literal.length
  }
  parts.push(text.slice(offset))
  return parts
}

export function ChatMessageContent({ content, adminRoute, plain }: { content: string; adminRoute?: string; plain?: boolean }) {
  return <p>{plain ? content : inlineContent(content, adminRoute)}</p>
}
