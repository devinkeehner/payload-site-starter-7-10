import { createLexicalValueFromText, getPlainTextFromLexical } from '@/lib/live-editor/lexical'
import { getEmailGridColumnFields } from '@/lib/live-editor/document'
import { EMAIL_LAYOUT_BLOCKS } from '@/components/email/blocks/config'

const sharedSlugs = new Set(EMAIL_LAYOUT_BLOCKS.map(block => block.slug))

function firstBodyText(layout: unknown[]): string {
  for (const block of layout) {
    if (!block || typeof block !== 'object') continue
    const row = block as Record<string, unknown>
    if (row.blockType === 'emailText') {
      const text = getPlainTextFromLexical(row.text).trim()
      if (text) return text
    }
    if (row.blockType === 'emailGrid') {
      for (const column of getEmailGridColumnFields(row.layout)) {
        const items = row[column]
        if (Array.isArray(items)) {
          const text = firstBodyText(items)
          if (text) return text
        }
      }
    }
  }
  return ''
}

export function convertEmailToPost(layout: unknown, fallbackContent: string) {
  const blocks = Array.isArray(layout) ? layout : []
  const isNativeBlock = (block: unknown): block is Record<string, unknown> =>
    Boolean(block && typeof block === 'object' && 'blockType' in block &&
      typeof block.blockType === 'string' && sharedSlugs.has(block.blockType))

  return {
    content: createLexicalValueFromText(firstBodyText(blocks) || fallbackContent || 'Draft post content.'),
    layout: structuredClone(blocks.filter(isNativeBlock)),
  }
}
