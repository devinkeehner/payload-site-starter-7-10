import type { PuckBlockSchema, PuckFieldSchema } from '@/lib/puck/types'
import { createLexicalValueFromText } from './lexical'

export type UnsteadyBlock = Record<string, unknown> & { blockType: string; id: string }
export type UnsteadyBlockGroup = { label: string; blocks: PuckBlockSchema[] }

const INTERNAL_FIELDS = new Set(['id', '_id', 'blockType', 'blockName', 'puckRichText', '__proto__', 'prototype', 'constructor'])
export const isUnsteadyInternalField = (name: string) => INTERNAL_FIELDS.has(name)
export const unsteadyID = () => globalThis.crypto.randomUUID()

export function flattenUnsteadyFields(fields: readonly PuckFieldSchema[]): PuckFieldSchema[] {
  return fields.flatMap(field => ['row', 'collapsible', 'tabs'].includes(field.type)
    ? flattenUnsteadyFields(field.fields || []) : [field])
}

/** Only native array rows and blocks receive IDs; populated relationships stay opaque. */
export function cloneUnsteadyRow(fields: readonly PuckFieldSchema[], value: Record<string, unknown>, freshIDs = true): Record<string, unknown> {
  const next = structuredClone(value)
  if (freshIDs || next.id == null) next.id = unsteadyID()
  for (const field of flattenUnsteadyFields(fields)) {
    if (isUnsteadyInternalField(field.name)) continue
    const stored = next[field.name]
    if (field.type === 'group' && stored && typeof stored === 'object' && !Array.isArray(stored)) {
      const group = cloneUnsteadyRow(field.fields || [], stored as Record<string, unknown>, freshIDs)
      if (!Object.hasOwn(stored, 'id')) delete group.id
      next[field.name] = group
    } else if (Array.isArray(stored) && (field.type === 'array' || field.type === 'blocks')) {
      next[field.name] = stored.map(item => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return item
        const rowFields = field.type === 'blocks'
          ? field.blocks?.find(block => block.slug === item.blockType)?.fields || [] : field.fields || []
        return cloneUnsteadyRow(rowFields, item, freshIDs)
      })
    }
  }
  return next
}

export function buildUnsteadyDefaults(fields: readonly PuckFieldSchema[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const field of flattenUnsteadyFields(fields)) {
    if (isUnsteadyInternalField(field.name)) continue
    if (field.defaultValue !== undefined) result[field.name] = structuredClone(field.defaultValue)
    else if (field.type === 'group') result[field.name] = buildUnsteadyDefaults(field.fields || [])
    else if (field.type === 'array') result[field.name] = Array.from({ length: field.minRows || 0 }, () => ({ ...buildUnsteadyDefaults(field.fields || []), id: unsteadyID() }))
    else if (field.type === 'blocks') result[field.name] = []
    else if (field.type === 'checkbox') result[field.name] = false
    else if (field.type === 'richText') result[field.name] = createLexicalValueFromText('')
    else if (field.type === 'select' || field.type === 'radio') result[field.name] = field.required ? field.options?.[0]?.value ?? null : null
    else if (['relationship', 'upload', 'number', 'date', 'json'].includes(field.type)) result[field.name] = null
    else result[field.name] = ''
  }
  return result
}

export function createUnsteadyBlock(schema: PuckBlockSchema): UnsteadyBlock {
  return { ...cloneUnsteadyRow(schema.fields, buildUnsteadyDefaults(schema.fields)), blockType: schema.slug } as UnsteadyBlock
}

/** The server supplies getEmailPuckBlockSchema; no website registry enters this catalog. */
export function getUnsteadyBlockGroups(schemas: readonly PuckBlockSchema[]): UnsteadyBlockGroup[] {
  const groups = new Map<string, PuckBlockSchema[]>()
  for (const schema of schemas) {
    const group = schema.group || 'Email'
    const entries = groups.get(group) || []
    entries.push(schema)
    groups.set(group, entries)
  }
  return [...groups].map(([label, blocks]) => ({ label, blocks }))
}
