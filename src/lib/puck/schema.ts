import type { Block, Field } from 'payload'

import { POST_LAYOUT_BLOCKS } from '@/lib/blocks/postLayoutBlocks'
import { EMAIL_LAYOUT_BLOCKS } from '@/lib/email/blocks'

import type { PuckBlockSchema, PuckFieldSchema } from './types'

function getLabel(label: unknown, fallback: string): string {
  if (typeof label === 'string') return label
  if (label && typeof label === 'object') {
    const values = Object.values(label as Record<string, unknown>)
    const first = values.find((value) => typeof value === 'string')
    if (typeof first === 'string') return first
  }
  return fallback
}

function getOptionLabel(option: unknown): string {
  if (typeof option === 'string') return option
  if (option && typeof option === 'object' && 'label' in option) {
    return getLabel((option as { label?: unknown }).label, '')
  }
  return ''
}

function getOptionValue(option: unknown): unknown {
  if (typeof option === 'string') return option
  if (option && typeof option === 'object' && 'value' in option) {
    return (option as { value?: unknown }).value
  }
  return option
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function toSerializableValue(value: unknown): unknown {
  if (value == null) return value

  switch (typeof value) {
    case 'boolean':
    case 'string':
      return value
    case 'number':
      return Number.isFinite(value) ? value : null
    case 'bigint':
    case 'function':
    case 'symbol':
    case 'undefined':
      return undefined
    case 'object':
      if (value instanceof Date) return value.toISOString()
      if (Array.isArray(value)) {
        return value.map((item) => toSerializableValue(item) ?? null)
      }
      if (!isPlainObject(value)) return undefined

      return Object.entries(value).reduce<Record<string, unknown>>((acc, [key, item]) => {
        const nextValue = toSerializableValue(item)
        if (typeof nextValue !== 'undefined') {
          acc[key] = nextValue
        }
        return acc
      }, {})
    default:
      return undefined
  }
}

function normalizeField(field: Field): PuckFieldSchema | null {
  if (!field || typeof field !== 'object') return null
  if (!('type' in field)) return null

  if (field.type === 'row') {
    return {
      name: '__row',
      type: 'row',
      fields: Array.isArray(field.fields)
        ? field.fields.map(normalizeField).filter((value): value is PuckFieldSchema => Boolean(value))
        : [],
    }
  }

  if (field.type === 'collapsible') {
    return {
      name: getLabel(field.label, 'collapsible'),
      label: getLabel(field.label, 'Collapsible'),
      type: 'collapsible',
      fields: Array.isArray(field.fields)
        ? field.fields.map(normalizeField).filter((value): value is PuckFieldSchema => Boolean(value))
        : [],
    }
  }

  if (!('name' in field) || typeof field.name !== 'string') return null
  const defaultValue = 'defaultValue' in field ? toSerializableValue(field.defaultValue) : undefined

  const normalized: PuckFieldSchema = {
    name: field.name,
    label: getLabel(field.label, field.name),
    type: field.type,
  }

  if ('required' in field) normalized.required = Boolean(field.required)
  if (typeof defaultValue !== 'undefined') normalized.defaultValue = defaultValue
  if ('minRows' in field && typeof field.minRows === 'number') normalized.minRows = field.minRows
  if ('maxRows' in field && typeof field.maxRows === 'number') normalized.maxRows = field.maxRows
  if ('relationTo' in field) normalized.relationTo = field.relationTo as string | string[]

  if ('options' in field && Array.isArray(field.options)) {
    normalized.options = field.options.reduce<Array<{ label: string; value: unknown }>>((acc, option) => {
      const value = toSerializableValue(getOptionValue(option))
      if (typeof value !== 'undefined') {
        acc.push({
          label: getOptionLabel(option),
          value,
        })
      }
      return acc
    }, [])
  }

  if ('fields' in field && Array.isArray(field.fields)) {
    normalized.fields = field.fields
      .map(normalizeField)
      .filter((value): value is PuckFieldSchema => Boolean(value))
  }

  if (field.type === 'blocks' && 'blocks' in field && Array.isArray(field.blocks)) {
    normalized.blocks = field.blocks.map(normalizeBlock)
  }

  return normalized
}

function normalizeBlock(block: Block): PuckBlockSchema {
  return {
    slug: block.slug,
    label: getLabel(block.labels?.singular, block.slug),
    group: typeof block.admin?.group === 'string' ? block.admin.group : null,
    fields: Array.isArray(block.fields)
      ? block.fields.map(normalizeField).filter((value): value is PuckFieldSchema => Boolean(value))
      : [],
  }
}

export function getPuckBlockSchema(): PuckBlockSchema[] {
  return []
}

export function getPuckLexicalBlockSchema(): PuckBlockSchema[] {
  return []
}

export function getEmailPuckBlockSchema(): PuckBlockSchema[] {
  return EMAIL_LAYOUT_BLOCKS.map(normalizeBlock)
}

export function getPostPuckBlockSchema(): PuckBlockSchema[] {
  return POST_LAYOUT_BLOCKS.map(normalizeBlock)
}

export function getFooterPuckBlockSchema(): PuckBlockSchema[] {
  return []
}
