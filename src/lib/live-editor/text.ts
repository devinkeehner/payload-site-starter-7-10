import { applyTextAction, readAddress, type FieldAddress, type TextAction, type TextStorage } from '@/lib/live-editor/textFields'
import { createLexicalValueFromText } from '@/lib/live-editor/lexical'

/** Convert legacy strings for display without normalizing unknown rich objects. */
export function unsteadyTextOwner(owner: Record<string, unknown>, field: string, storage: TextStorage): Record<string, unknown> {
  return storage === 'native' && typeof owner[field] === 'string'
    ? { ...owner, [field]: createLexicalValueFromText(owner[field]) } : owner
}

/** Normalize a legacy native string only during an explicit content edit. */
export function applyUnsteadyTextAction(root: Record<string, unknown>, address: FieldAddress, storage: TextStorage, action: TextAction): Record<string, unknown> {
  if (storage === 'native' && (action.type === 'mode' || action.type === 'plain-from-rich')) return root
  const current = readAddress(root, address)
  if (storage !== 'native' || typeof current !== 'string') return applyTextAction(root, address, storage, action)
  const field = address.at(-1)
  if (typeof field !== 'string') throw new Error('Text fields must end in a named property.')
  const copy = structuredClone(root)
  const owner = readAddress(copy, address.slice(0, -1))
  if (!owner || typeof owner !== 'object' || Array.isArray(owner)) throw new Error('The text owner is no longer available.')
  ;(owner as Record<string, unknown>)[field] = createLexicalValueFromText(current)
  return applyTextAction(copy, address, storage, action)
}
