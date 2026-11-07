import type { PuckFieldSchema } from '@/lib/puck/types'

export type RelationshipOption = {
  label: string
  value: string | number
  resource?: Record<string, unknown> | null
}

export function relationshipId(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number') return String(value) || null
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  return relationshipId(record.id ?? record._id ?? record.value)
}

export function relationshipCollection(value: unknown, fallback: string): string {
  if (
    value &&
    typeof value === 'object' &&
    'relationTo' in value &&
    typeof value.relationTo === 'string'
  ) {
    return value.relationTo
  }
  return fallback
}

export function relationshipLabel(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if ('relationTo' in record) return relationshipLabel(record.value)
  const label = record.title || record.name || record.label || record.slug
  return typeof label === 'string' && label ? label : null
}

export function relationshipOptionValue(
  field: PuckFieldSchema,
  collection: string,
  option: RelationshipOption,
): unknown {
  // Populated page/post values keep links visible in the canvas immediately.
  // Serialization reduces polymorphic relationships back to their document IDs.
  const value = option.resource || option.value
  return Array.isArray(field.relationTo) ? { relationTo: collection, value } : option.value
}

export function booleanFieldValue(value: unknown, defaultValue: unknown = false): boolean {
  const resolved = value == null || value === '' ? defaultValue : value
  return resolved === true || resolved === 'true' || resolved === 1
}
