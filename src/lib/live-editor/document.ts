/** Native Payload email document editing. Serialized host fields remain authoritative. */
import type { PuckBlockSchema, PuckFieldSchema } from '@/lib/puck/types'
import { flattenUnsteadyFields } from './catalog'

export type Id = string | number
export type BlockRecord = Record<string, unknown> & { id?: Id | null; blockType?: string }
export type PageDocument = Record<string, unknown> & { id?: Id; title?: string | null; layout?: BlockRecord[] | null }
export type SlotAddress = { ownerId: Id; path: string; itemId?: Id }
export type SlotDescriptor = {
  id: string; ownerId: Id; path: string; label: string; items: BlockRecord[]
  allowedSlugs: readonly string[] | null; address: SlotAddress; active?: boolean
}
export type DocumentOptions = { schemas?: readonly PuckBlockSchema[]; createId?: () => string }
export type DocumentResult = { document: PageDocument; selectedId: Id | null }
export type OwnedArrayAction = { type: 'add' | 'duplicate' | 'remove' | 'move'; index?: number; toIndex?: number; item?: Record<string, unknown> }
export const ROOT_SLOT: SlotAddress = { ownerId: 'root', path: 'layout' }
export const EMAIL_GRID_FIELDS = ['leftBlocks', 'centerBlocks', 'rightBlocks', 'fourthBlocks'] as const

export function getEmailGridColumnFields(layout: unknown): readonly typeof EMAIL_GRID_FIELDS[number][] {
  if (layout === 'oneColumn') return ['leftBlocks']
  if (layout === 'threeColumns') return ['leftBlocks', 'centerBlocks', 'rightBlocks']
  if (layout === 'fourColumns') return EMAIL_GRID_FIELDS
  return ['leftBlocks', 'rightBlocks']
}

const forbidden = new Set(['__proto__', 'prototype', 'constructor'])
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isId = (value: unknown): value is Id => typeof value === 'string' && value.length > 0 || typeof value === 'number' && Number.isFinite(value)
const sameId = (a: unknown, b: unknown) => isId(a) && isId(b) && String(a) === String(b)
const safeKey = (key: string) => { if (!key || forbidden.has(key)) throw new Error(`Unsafe field key: ${key}`) }
const list = <T>(value: unknown, label: string): T[] => {
  if (value == null) return []
  if (!Array.isArray(value)) throw new Error(`Invalid ${label}: expected an array`)
  return value as T[]
}
const records = (value: unknown, label: string): BlockRecord[] => {
  const items = list<BlockRecord>(value, label)
  if (items.some(item => !isRecord(item))) throw new Error(`Invalid ${label}: expected records`)
  return items
}
const idOf = (block: BlockRecord): Id => { if (!isId(block.id)) throw new Error('Initialize stable document IDs before editing'); return block.id }

export function findBlockSchema(slug: unknown, schemas: readonly PuckBlockSchema[]): PuckBlockSchema | undefined {
  const visited = new Set<PuckBlockSchema>()
  const search = (candidates: readonly PuckBlockSchema[]): PuckBlockSchema | undefined => {
    for (const schema of candidates) {
      if (visited.has(schema)) continue
      visited.add(schema)
      if (schema.slug === slug) return schema
      const fields = (items: readonly PuckFieldSchema[]): PuckBlockSchema | undefined => {
        for (const field of items) {
          const found = search(field.blocks || []) || fields(field.fields || [])
          if (found) return found
        }
      }
      const found = fields(schema.fields)
      if (found) return found
    }
  }
  return search(schemas)
}

const fieldsFor = (block: BlockRecord, options: DocumentOptions): readonly PuckFieldSchema[] => {
  const schema = findBlockSchema(block.blockType, options.schemas || [])
  // Read before schema loading still preserves native grid descendants.
  return schema?.fields || (block.blockType === 'emailGrid' ? EMAIL_GRID_FIELDS.map(name => ({ name, type: 'blocks' })) : [])
}
type SlotEntry = SlotDescriptor & { write: (items: BlockRecord[]) => void }
type BlockEntry = { block: BlockRecord; slot: SlotEntry; index: number }
type DocumentIndex = { slots: SlotEntry[]; blocks: Map<string, BlockEntry>; rowIds: Set<string> }

function inspect(document: PageDocument, options: DocumentOptions): DocumentIndex {
  const slots: SlotEntry[] = []
  const blocks = new Map<string, BlockEntry>()
  const rowIds = new Set<string>()
  const addSlot = (slot: SlotEntry, depth: number) => {
    if (depth > 40) throw new Error('Document content is nested too deeply')
    slots.push(slot)
    slot.items.forEach((block, index) => {
      const id = idOf(block)
      if (id === 'root' || blocks.has(String(id)) || rowIds.has(String(id))) throw new Error(`Duplicate block ID or cyclic content: ${id}`)
      blocks.set(String(id), { block, slot, index })
      const schema = findBlockSchema(block.blockType, options.schemas || [])
      const label = [block.heading, block.title, block.blockName, schema?.label, block.blockType].find(value => typeof value === 'string' && value.trim()) || 'Block'
      const walk = (owner: Record<string, unknown>, fields: readonly PuckFieldSchema[], path: string[], stable: string[], lastRowId?: Id) => {
        for (const field of flattenUnsteadyFields(fields)) {
          safeKey(field.name)
          const stored = owner[field.name]
          const nextPath = [...path, field.name]
          const nextStable = [...stable, field.name]
          if (field.type === 'group' && stored != null) {
            if (!isRecord(stored)) throw new Error(`Invalid group: ${nextPath.join('.')}`)
            walk(stored, field.fields || [], nextPath, nextStable, lastRowId)
          } else if (field.type === 'array') {
            const siblings = new Set<string>()
            records(stored, nextPath.join('.')).forEach((row, at) => {
              const rowId = idOf(row)
              if (siblings.has(String(rowId)) || blocks.has(String(rowId)) || rowIds.has(String(rowId)) || rowId === 'root') throw new Error(`Duplicate owned row ID: ${rowId}`)
              siblings.add(String(rowId)); rowIds.add(String(rowId))
              walk(row, field.fields || [], [...nextPath, String(at)], [...nextStable, String(rowId)], rowId)
            })
          } else if (field.type === 'blocks') {
            const pathString = nextPath.join('.')
            const active = block.blockType !== 'emailGrid' || path.length > 0 || getEmailGridColumnFields(block.layout).includes(field.name as typeof EMAIL_GRID_FIELDS[number])
            const address: SlotAddress = { ownerId: id, path: pathString, ...(lastRowId == null ? {} : { itemId: lastRowId }) }
            addSlot({ id: `${id}:${nextStable.join(':')}`, ownerId: id, path: pathString,
              label: `${String(label)} → ${field.label || field.name}${active ? '' : ' (hidden column)'}`,
              items: records(stored, pathString), allowedSlugs: field.blocks?.map(child => child.slug) || null, address, active,
              write: items => { owner[field.name] = items },
            }, depth + 1)
          }
        }
      }
      walk(block, fieldsFor(block, options), [], [])
    })
  }
  addSlot({ id: 'root:layout', ...ROOT_SLOT, label: 'Email', items: records(document.layout, 'email layout'),
    address: ROOT_SLOT, allowedSlugs: options.schemas?.map(schema => schema.slug) || null, active: true,
    write: items => { document.layout = items },
  }, 0)
  return { slots, blocks, rowIds }
}

function resolveSlot(index: DocumentIndex, address: SlotAddress): SlotEntry {
  const shape = (path: string) => path.replace(/\.\d+(?=\.|$)/g, '.[]')
  const matches = index.slots.filter(slot => sameId(slot.ownerId, address.ownerId) && (address.itemId == null
    ? slot.path === address.path : sameId(slot.address.itemId, address.itemId) && shape(slot.path) === shape(address.path)))
  if (matches.length !== 1) throw new Error('The destination slot no longer exists')
  return matches[0]!
}
const requireBlock = (index: DocumentIndex, id: Id): BlockEntry => {
  const found = index.blocks.get(String(id))
  if (!found) throw new Error(`Block no longer exists: ${id}`)
  return found
}
const allowed = (slot: SlotDescriptor, block: BlockRecord) => {
  if (slot.active === false) throw new Error('Choose a column that is active in the current email row layout')
  if (slot.allowedSlugs && !slot.allowedSlugs.includes(block.blockType || '')) throw new Error(`This slot does not accept ${block.blockType || 'this block'}`)
}
const position = (items: BlockRecord[], beforeId: Id | null): number => {
  if (beforeId === null) return items.length
  const at = items.findIndex(item => sameId(item.id, beforeId))
  if (at < 0) throw new Error(`Target block no longer exists: ${beforeId}`)
  return at
}

export function getSlots(document: PageDocument, options: DocumentOptions = {}): SlotDescriptor[] {
  return inspect(document, options).slots.filter(slot => slot.active !== false || slot.items.length).map(({ write: _write, ...slot }) => slot)
}
export function getSlot(document: PageDocument, address: SlotAddress, options: DocumentOptions = {}): SlotDescriptor {
  const { write: _write, ...slot } = resolveSlot(inspect(document, options), address)
  return slot
}
export function findBlock(document: PageDocument, id: Id, options: DocumentOptions = {}): BlockRecord | null { return inspect(document, options).blocks.get(String(id))?.block || null }
export function getBlock(document: PageDocument, id: Id, options: DocumentOptions = {}): BlockRecord { return requireBlock(inspect(document, options), id).block }

/** Schema traversal never enters Lexical, relationship documents, or unknown extension fields. */
function walkOwned(record: Record<string, unknown>, fields: readonly PuckFieldSchema[], row: (value: BlockRecord, fields: readonly PuckFieldSchema[]) => void, block: (value: BlockRecord) => void) {
  for (const field of flattenUnsteadyFields(fields)) {
    safeKey(field.name)
    const stored = record[field.name]
    if (field.type === 'group' && isRecord(stored)) walkOwned(stored, field.fields || [], row, block)
    else if (field.type === 'array') records(stored, field.name).forEach(item => row(item, field.fields || []))
    else if (field.type === 'blocks') records(stored, field.name).forEach(block)
  }
}
function freshId(document: PageDocument, options: DocumentOptions) {
  const reserved = new Set<string>(['root'])
  const seen = new WeakSet<object>()
  const reserve = (value: unknown) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return
    seen.add(value)
    if (isRecord(value) && isId(value.id)) reserved.add(String(value.id))
    Object.values(value).forEach(reserve)
  }
  reserve(document)
  return () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const id = options.createId ? options.createId() : globalThis.crypto.randomUUID()
      if (isId(id) && !reserved.has(String(id))) { reserved.add(String(id)); return id }
    }
    throw new Error('Unable to generate a unique document ID')
  }
}
function identifyTree(document: PageDocument, options: DocumentOptions, fresh: () => string, replace: boolean) {
  const seen = new WeakSet<object>()
  const identify = (record: BlockRecord) => {
    if (seen.has(record)) throw new Error('Cyclic or shared owned content is not supported')
    seen.add(record)
    if (replace || !isId(record.id)) record.id = fresh()
  }
  const row = (value: BlockRecord, fields: readonly PuckFieldSchema[]) => { identify(value); walkOwned(value, fields, row, block) }
  const block = (value: BlockRecord) => { identify(value); walkOwned(value, fieldsFor(value, options), row, block) }
  records(document.layout, 'email layout').forEach(block)
}
export function ensureDocumentIds(page: PageDocument, options: DocumentOptions = {}): PageDocument {
  const document = structuredClone(page)
  identifyTree(document, options, freshId(page, options), false)
  inspect(document, options)
  return JSON.stringify(document) === JSON.stringify(page) ? page : document
}
function copyBlock(block: BlockRecord, document: PageDocument, options: DocumentOptions): BlockRecord {
  const copy = structuredClone(block)
  identifyTree({ layout: [copy] }, options, freshId(document, options), true)
  return copy
}
function validateNewContent(block: BlockRecord, options: DocumentOptions, schemas: readonly PuckBlockSchema[] = options.schemas || []) {
  if (!schemas.length) return
  const schema = schemas.find(candidate => candidate.slug === block.blockType)
  if (!schema) throw new Error(`This slot does not accept ${block.blockType || 'this block'}`)
  const row = (value: BlockRecord, fields: readonly PuckFieldSchema[]) => {
    for (const field of flattenUnsteadyFields(fields)) {
      if (field.type === 'group' && isRecord(value[field.name])) row(value[field.name] as BlockRecord, field.fields || [])
      if (field.type === 'array') records(value[field.name], field.name).forEach(child => row(child, field.fields || []))
      if (field.type === 'blocks') records(value[field.name], field.name).forEach(child => validateNewContent(child, options, field.blocks || []))
    }
  }
  row(block, schema.fields)
}
function finish(document: PageDocument, selectedId: Id | null, options: DocumentOptions): DocumentResult { inspect(document, options); return { document, selectedId } }

export function insertBlock(page: PageDocument, to: SlotAddress, block: BlockRecord, beforeId: Id | null = null, options: DocumentOptions = {}): DocumentResult {
  const document = structuredClone(page)
  const index = inspect(document, options)
  const slot = resolveSlot(index, to)
  allowed(slot, block)
  validateNewContent(block, options)
  const temporary = structuredClone({ layout: [block] })
  identifyTree(temporary, options, freshId({ ...document, pendingContent: temporary }, options), false)
  const addedIndex = inspect(temporary, options)
  for (const id of [...addedIndex.blocks.keys(), ...addedIndex.rowIds]) if (index.blocks.has(id) || index.rowIds.has(id)) throw new Error('Duplicate identity in new content')
  const at = position(slot.items, beforeId)
  const inserted = temporary.layout[0]!
  slot.write([...slot.items.slice(0, at), inserted, ...slot.items.slice(at)])
  return finish(document, idOf(inserted), options)
}
export function moveBlock(page: PageDocument, id: Id, to: SlotAddress, beforeId: Id | null = null, options: DocumentOptions = {}): DocumentResult {
  const document = structuredClone(page)
  const index = inspect(document, options)
  const source = requireBlock(index, id)
  const target = resolveSlot(index, to)
  allowed(target, source.block)
  const same = source.slot.id === target.id
  if (same && sameId(beforeId, id)) return { document: page, selectedId: id }
  if (!same && target.ownerId !== 'root' && inspect({ layout: [source.block] }, options).blocks.has(String(target.ownerId))) throw new Error('A block cannot be moved inside itself or its descendants')
  const remaining = source.slot.items.filter((_, at) => at !== source.index)
  const destination = same ? remaining : [...target.items]
  destination.splice(position(destination, beforeId), 0, source.block)
  if (same && destination.every((item, at) => item === source.slot.items[at])) return { document: page, selectedId: id }
  if (!same) source.slot.write(remaining)
  target.write(destination)
  return finish(document, id, options)
}
export function duplicateBlock(page: PageDocument, id: Id, options: DocumentOptions = {}): DocumentResult {
  const document = structuredClone(page)
  const source = requireBlock(inspect(document, options), id)
  allowed(source.slot, source.block)
  validateNewContent(source.block, options)
  const copy = copyBlock(source.block, document, options)
  source.slot.write([...source.slot.items.slice(0, source.index + 1), copy, ...source.slot.items.slice(source.index + 1)])
  return finish(document, idOf(copy), options)
}
export function removeBlock(page: PageDocument, id: Id, options: DocumentOptions = {}): DocumentResult {
  const document = structuredClone(page)
  const source = requireBlock(inspect(document, options), id)
  source.slot.write(source.slot.items.filter((_, at) => at !== source.index))
  return finish(document, source.slot.items[source.index + 1]?.id ?? source.slot.items[source.index - 1]?.id ?? (source.slot.ownerId === 'root' ? null : source.slot.ownerId), options)
}
export function updateBlock(page: PageDocument, id: Id, patch: Record<string, unknown>, options: DocumentOptions = {}): DocumentResult {
  Object.keys(patch).forEach(safeKey)
  const document = structuredClone(page)
  const source = requireBlock(inspect(document, options), id)
  if (Object.hasOwn(patch, 'id') && !sameId(patch.id, id)) throw new Error('Block identity cannot be changed')
  if (Object.hasOwn(patch, 'blockType') && patch.blockType !== source.block.blockType) throw new Error('Block type cannot be changed')
  const before = inspect({ layout: [structuredClone(source.block)] }, options)
  Object.assign(source.block, structuredClone(patch))
  const after = inspect({ layout: [source.block] }, options)
  for (const [childId, entry] of after.blocks) {
    const prior = before.blocks.get(childId)
    if (prior && prior.block.blockType !== entry.block.blockType) throw new Error('Nested block types cannot be changed')
    if (!prior || prior.slot.id !== entry.slot.id) { allowed(entry.slot, entry.block); validateNewContent(entry.block, options) }
  }
  return finish(document, id, options)
}

function locateArray(block: BlockRecord, path: readonly (string | number)[], options: DocumentOptions) {
  let owner: Record<string, unknown> = block
  let fields = fieldsFor(block, options)
  for (let index = 0; index < path.length; index++) {
    const name = path[index]
    if (typeof name !== 'string') throw new Error('Expected a named schema field')
    safeKey(name)
    const field = flattenUnsteadyFields(fields).find(candidate => candidate.name === name)
    if (!field) throw new Error('Unknown owned array field')
    if (index === path.length - 1) {
      if (!['array', 'blocks'].includes(field.type)) throw new Error('This field is not an owned array')
      return { field, items: records(owner[name], name), write: (items: BlockRecord[]) => { owner[name] = items } }
    }
    if (field.type === 'group') {
      if (owner[name] == null) owner[name] = {}
      if (!isRecord(owner[name])) throw new Error('Invalid owned group')
      owner = owner[name] as Record<string, unknown>; fields = field.fields || []
    } else if (field.type === 'array' || field.type === 'blocks') {
      const at = path[++index]
      const rows = records(owner[name], name)
      if (typeof at !== 'number' || !Number.isInteger(at) || at < 0 || !rows[at]) throw new Error('The owned row no longer exists')
      owner = rows[at]!
      fields = field.type === 'blocks' ? field.blocks?.find(schema => schema.slug === owner.blockType)?.fields || [] : field.fields || []
    } else throw new Error('Only schema-owned containers may appear in an array path')
  }
  throw new Error('An owned array must end in a field name')
}
export function editOwnedArray(page: PageDocument, ownerId: Id, path: readonly (string | number)[], action: OwnedArrayAction, options: DocumentOptions = {}): DocumentResult {
  const document = structuredClone(page)
  const owner = requireBlock(inspect(document, options), ownerId).block
  const array = locateArray(owner, path, options)
  const items = [...array.items]
  const index = action.index
  if (!['add', 'duplicate', 'remove', 'move'].includes(action.type)) throw new Error('Unknown array action')
  if (action.type !== 'add' && (index == null || !Number.isInteger(index) || index < 0 || index >= items.length)) throw new Error('The owned row no longer exists')
  if (['add', 'duplicate'].includes(action.type) && array.field.maxRows != null && items.length >= array.field.maxRows) throw new Error(`This list allows at most ${array.field.maxRows} rows`)
  if (array.field.type === 'blocks' && ['add', 'duplicate'].includes(action.type)) {
    const slot = resolveSlot(inspect(document, options), { ownerId, path: path.join('.') })
    if (slot.active === false) throw new Error('Choose a column that is active in the current email row layout')
  }
  if (action.type === 'remove' && array.field.minRows != null && items.length <= array.field.minRows) throw new Error(`This list needs at least ${array.field.minRows} rows`)
  if (action.type === 'move') {
    const to = action.toIndex
    if (to == null || !Number.isInteger(to) || to < 0 || to >= items.length) throw new Error('The destination row no longer exists')
    if (to === index) return { document: page, selectedId: ownerId }
    items.splice(to, 0, items.splice(index!, 1)[0]!)
  } else if (action.type === 'remove') items.splice(index!, 1)
  else {
    const original = action.type === 'duplicate' ? items[index!]! : action.item || {}
    const fresh = freshId(document, options)
    let copy: BlockRecord
    if (array.field.type === 'blocks') {
      validateNewContent(original, options, array.field.blocks || [])
      copy = copyBlock(original, document, options)
    } else {
      copy = structuredClone(original)
      validateNewContent({ ...copy, blockType: '__ownedRow' }, options, [{ slug: '__ownedRow', label: 'Row', fields: array.field.fields || [] }])
      const row = (value: BlockRecord, fields: readonly PuckFieldSchema[]) => { value.id = fresh(); walkOwned(value, fields, row, block) }
      const block = (value: BlockRecord) => { validateNewContent(value, options); value.id = fresh(); walkOwned(value, fieldsFor(value, options), row, block) }
      row(copy, array.field.fields || [])
    }
    const at = action.type === 'duplicate' ? index! + 1 : action.toIndex ?? items.length
    if (!Number.isInteger(at) || at < 0 || at > items.length) throw new Error('Invalid insertion position')
    items.splice(at, 0, copy)
  }
  array.write(items)
  return finish(document, ownerId, options)
}
