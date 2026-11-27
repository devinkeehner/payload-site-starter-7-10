import type { Block, Field } from 'payload'
import { lexicalEditor } from '@payloadcms/richtext-lexical'

import { PAGE_SECTION } from '@/lib/live-editor/pageSections'
import { parseDesignLayout } from './DesignedSection'
import { sectionYouTubeEmbed } from './media'

const name = (slug: string, label: string, fields: Field[]): Block => ({
  slug, interfaceName: `Page${slug[0]!.toUpperCase()}${slug.slice(1)}`, labels: { singular: label, plural: label }, fields,
})
const text = (field: string, label: string, maxLength = 240): Field => ({
  name: field, label, type: 'text', maxLength,
})
const select = (field: string, label: string, options: string[], defaultValue = options[0]): Field => ({
  name: field, label, type: 'select', options, defaultValue,
})
const richText = (): Field => ({ name: 'body', label: 'Body', type: 'richText', editor: lexicalEditor() })
const url = (): Field => text('url', 'Link URL', 2048)

const leaves = [
  name('sectionHeading', 'Heading', [text('text', 'Heading'), select('level', 'Heading level', ['h2', 'h3', 'h4'])]),
  name('sectionText', 'Rich text', [richText()]),
  name('sectionImage', 'Image', [{ name: 'image', type: 'upload', relationTo: 'media' }, text('caption', 'Caption')]),
  name('sectionLink', 'Link', [text('text', 'Label'), url()]),
  name('sectionButton', 'Button', [text('text', 'Label'), url()]),
  name('sectionDocument', 'Document link', [text('text', 'Label'), { name: 'file', type: 'upload', relationTo: 'media' }]),
  name('sectionVideo', 'Video', [
    { name: 'file', label: 'Video file', type: 'upload', relationTo: 'media' },
    { name: 'youtubeUrl', label: 'YouTube URL', type: 'text', maxLength: 2048,
      validate: (value: string | null | undefined) => !value?.trim() || Boolean(sectionYouTubeEmbed(value)) || 'Enter a valid YouTube video URL.' },
    text('caption', 'Caption'),
  ]),
  name('sectionGallery', 'Gallery', [{ name: 'images', type: 'upload', relationTo: 'media', hasMany: true }]),
  name('sectionIcon', 'Icon', [select('symbol', 'Symbol', ['check', 'info', 'star', 'arrow']), text('text', 'Label')]),
  name('sectionQuote', 'Quote', [text('text', 'Quote', 1000), text('attribution', 'Attribution')]),
  name('sectionStatistic', 'Statistic', [text('value', 'Value', 60), text('text', 'Label')]),
  name('sectionCallout', 'Callout', [text('text', 'Heading'), richText()]),
  name('sectionList', 'List', [{ name: 'text', label: 'One item per line', type: 'textarea', maxLength: 4000 }]),
  name('sectionDivider', 'Divider', []),
  name('sectionForm', 'Form', [{ name: 'form', type: 'relationship', relationTo: 'forms' }]),
]

const children = (blocks: Block[], maxRows = 16): Field => ({ name: 'children', label: 'Elements', type: 'blocks', blocks, maxRows })
const cards = name('sectionCard', 'Card', [children(leaves)])
const stacks = name('sectionStack', 'Stack', [children([...leaves, cards])])
const column = name('sectionColumn', 'Column', [children([...leaves, cards, stacks])])
const columns = name('sectionColumns', 'Columns', [
  select('variant', 'Layout', ['equal', 'wide-left', 'wide-right', 'stacked']),
  children([column], 4),
])
const grid = name('sectionGrid', 'Grid', [select('variant', 'Layout', ['two', 'three', 'four'], 'three'), children([...leaves, cards], 12)])

export const ComposableSectionConfig = name(PAGE_SECTION, 'Section', [
  text('title', 'Editor label'),
  select('tone', 'Background', ['plain', 'muted', 'accent']),
  { name: 'design', type: 'json', admin: { hidden: true }, validate: value => {
    if (value == null) return true
    try { parseDesignLayout(value); return true } catch (error) {
      return error instanceof Error ? error.message : 'Invalid section design.'
    }
  } },
  children([...leaves, cards, stacks, columns, grid]),
])
