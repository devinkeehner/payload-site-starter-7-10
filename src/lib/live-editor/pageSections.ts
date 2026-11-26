import type { PuckBlockSchema } from '@/lib/puck/types'
import { buildUnsteadyDefaults } from './catalog'
import type { BlockRecord } from './document'
import { createLexicalValueFromText } from './lexical'

export const PAGE_SECTION = 'composableSection'
export type SectionTemplate = { id: string; name: string; section: BlockRecord }

export function collectSectionSchemas(schemas: readonly PuckBlockSchema[]): PuckBlockSchema[] {
  const section = schemas.find(schema => schema.slug === PAGE_SECTION)
  const seen = new Map<string, PuckBlockSchema>()
  function visit(schema: PuckBlockSchema) {
    if (seen.has(schema.slug)) return
    seen.set(schema.slug, schema)
    schema.fields.find(field => field.name === 'children')?.blocks?.forEach(visit)
  }
  if (section) visit(section)
  return [...seen.values()]
}

const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value)))

/** Convert agent-authored data to the same native Payload blocks the canvas edits. */
export function buildPageSection(input: unknown, schemas: readonly PuckBlockSchema[]): BlockRecord {
  let count = 0
  let characters = 0
  function parse(value: unknown, candidates: readonly PuckBlockSchema[]): BlockRecord {
    if (!record(value) || typeof value.blockType !== 'string') throw new Error('Each element needs a blockType.')
    const schema = candidates.find(candidate => candidate.slug === value.blockType)
    if (!schema) throw new Error(`${value.blockType} is unavailable in this part of the section.`)
    if (++count > 100) throw new Error('A section can contain at most 100 elements and containers.')
    const result: BlockRecord = { ...buildUnsteadyDefaults(schema.fields), blockType: schema.slug }
    for (const [name, input] of Object.entries(value)) {
      if (name === 'blockType') continue
      const field = schema.fields.find(candidate => candidate.name === name)
      if (!field) throw new Error(`Unknown field ${name} on ${schema.label}.`)
      if (field.type === 'blocks') {
        if (!Array.isArray(input) || input.length > (field.maxRows ?? 16)) throw new Error(`Too many items in ${schema.label}.`)
        result[name] = input.map(child => parse(child, field.blocks ?? []))
        continue
      }
      if (field.type === 'upload' || field.type === 'relationship') {
        const isID = (id: unknown) => typeof id === 'string' && /^[a-z\d_-]{1,128}$/i.test(id)
        if (input !== null && (field.hasMany ? !Array.isArray(input) || input.length > 12 || !input.every(isID) : !isID(input))) {
          throw new Error(`${field.label} must use existing records from this site.`)
        }
      } else {
        if (typeof input !== 'string' || input.length > (field.maxLength ?? 4000) || (characters += input.length) > 25000) throw new Error(`${field.label} exceeds the section text limit.`)
        if (field.type === 'select' && !field.options?.some(option => option.value === input)) throw new Error(`Choose a supported value for ${field.label}.`)
        if (name === 'url' && input && !safeSectionURL(input)) throw new Error('Use an https, http, mailto, tel, or site-relative link.')
      }
      result[name] = field.type === 'richText' ? createLexicalValueFromText(input as string) : input
    }
    return result
  }
  const section = parse(input, schemas.filter(schema => schema.slug === PAGE_SECTION))
  if (!Array.isArray(section.children) || !section.children.length) throw new Error('Include at least one element in the section.')
  return section
}

export function safeSectionURL(input: unknown): string | undefined {
  if (typeof input !== 'string' || /[\x00-\x20\\]/.test(input)) return
  if (/^(?:https?:\/\/|mailto:|tel:|#|\/(?!\/))/i.test(input)) return input
}

export const PAGE_SECTION_STARTERS = [
  {
    name: 'Budget highlights',
    recipe: {
      blockType: PAGE_SECTION, title: 'Budget highlights', tone: 'muted',
      children: [
        { blockType: 'sectionHeading', text: 'Budget highlights' },
        { blockType: 'sectionText', body: 'Summarize the proposal and what it means for residents.' },
        { blockType: 'sectionGrid', variant: 'three', children: [
          { blockType: 'sectionStatistic', value: '—', text: 'First figure' },
          { blockType: 'sectionStatistic', value: '—', text: 'Second figure' },
          { blockType: 'sectionStatistic', value: '—', text: 'Third figure' },
        ] },
        { blockType: 'sectionDocument', text: 'Read the full report' },
      ],
    },
  },
] as const
