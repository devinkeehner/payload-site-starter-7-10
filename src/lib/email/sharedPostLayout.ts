import type { CollectionAfterReadHook } from 'payload'
import xss from 'xss'
import type { IWhiteList } from 'xss'
import { EMAIL_LAYOUT_BLOCKS } from '@/components/email/blocks/config'
import { getServerSideURL } from '@/lib/utilities/getURL'
import { renderEmailLayoutFragment } from './renderEmail'

const sharedSlugs = new Set(EMAIL_LAYOUT_BLOCKS.map(block => block.slug))

export function isSharedPostBlock(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && 'blockType' in value &&
    typeof value.blockType === 'string' && sharedSlugs.has(value.blockType))
}

// React Email's Markdown component allows raw HTML. Sanitize the final
// fragment before passing it to a public or preview page.
const safeStyle = /^(?:[\w\s.,%#"'/-]+|rgba?\([\d\s.,%]+\))$/
const layoutStyles = [
  'background', 'background-color', 'border', 'border-top', 'border-right', 'border-bottom',
  'border-left', 'border-radius', 'border-collapse', 'box-sizing', 'color', 'display',
  'font-family', 'font-size', 'font-style', 'font-weight', 'height', 'letter-spacing',
  'line-height', 'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'max-width', 'min-width', 'object-fit', 'overflow', 'padding', 'padding-top',
  'padding-right', 'padding-bottom', 'padding-left', 'text-align', 'text-decoration',
  'text-transform', 'vertical-align', 'white-space', 'width', 'word-break',
]
// xss adds the default allowlist to its CommonJS function export at runtime.
const defaultTags = (xss as typeof xss & { whiteList: IWhiteList }).whiteList
const tags = Object.fromEntries(Object.entries({
  ...defaultTags,
  a: ['href', 'target', 'rel'],
  img: ['src', 'alt', 'title'],
  table: ['cellspacing', 'cellpadding', 'border'],
  td: ['colspan', 'rowspan', 'valign', 'class'],
  ol: ['start'],
  s: [],
  u: [],
}).map(([tag, attributes]) => [tag, [...(attributes || []), 'style', 'align', 'width', 'height', 'role']]))

export async function renderSharedPostLayout(layout: unknown[], origin: string) {
  const runs: { start: number; blocks: unknown[] }[] = []
  layout.forEach((block, index) => {
    if (!isSharedPostBlock(block)) return
    const last = runs.at(-1)
    if (last && last.start + last.blocks.length === index) last.blocks.push(block)
    else runs.push({ start: index, blocks: [block] })
  })

  return Promise.all(runs.map(async ({ start, blocks }) => ({
    start, count: blocks.length,
    html: xss(await renderEmailLayoutFragment(blocks, origin, start), {
      whiteList: tags,
      stripIgnoreTag: true,
      stripIgnoreTagBody: ['script', 'style', 'iframe'],
      css: { whiteList: Object.fromEntries(layoutStyles.map(property => [property, safeStyle])) },
      onTagAttr(_tag, name, value, allowed) {
        if (name === 'class' && allowed) return value.split(/\s+/).includes('email-grid-column') ? 'class="email-grid-column"' : ''
      },
    }),
  })))
}

export const populateSharedPostLayout: CollectionAfterReadHook = async ({ doc, req, context }) => {
  if (req.payloadAPI === 'local' || context.skipSharedPostHTML || !Array.isArray(doc.layout) || !doc.layout.some(isSharedPostBlock)) return doc
  // Next may see Render's internal listener as the request origin. Use the
  // public CMS URL for assets before falling back to the local request origin.
  const assetOrigin = process.env.PAYLOAD_PUBLIC_SERVER_URL ||
    process.env.RENDER_EXTERNAL_URL || req.origin || getServerSideURL()
  return { ...doc, sharedLayoutHTML: await renderSharedPostLayout(doc.layout, assetOrigin) }
}
