/** Local editor commands shared by browser tools and a future embedded agent. */
import type { PuckBlockSchema, PuckFieldSchema } from '../puck/types'
import { applyTextAction, canEditRichText, readAddress, readTextField, type TextAction } from './textFields'
import { buildUnsteadyDefaults, createUnsteadyBlock, flattenUnsteadyFields, getUnsteadyBlockGroups, isUnsteadyInternalField } from './catalog'
import { isUnsteadyCompanionTextField } from './textCapabilities'
import { createLexicalValueFromText } from './lexical'
import { duplicateBlock, editOwnedArray, getBlock, getSlots, insertBlock, moveBlock, removeBlock, updateBlock,
  findBlockSchema, type DocumentResult, type Id, type OwnedArrayAction, type PageDocument, type SlotAddress } from './document'

type RecordValue = Record<string, unknown>
type Path = Array<string | number>
export type EditorCommand =
  | { type: 'set_field'; blockId: Id; path: Path; value: unknown }
  | { type: 'edit_text'; blockId: Id; path: Path; action: TextAction }
  | { type: 'insert_block'; blockType: string; destination: SlotAddress; beforeId?: Id | null }
  | { type: 'move_block'; blockId: Id; destination: SlotAddress; beforeId?: Id | null }
  | { type: 'duplicate_block' | 'remove_block'; blockId: Id }
  | { type: 'edit_array'; blockId: Id; path: Path; action: OwnedArrayAction }
export type EditorCommandOptions = { schemas: readonly PuckBlockSchema[]; revision: number; expectedRevision: number }
export type EditorCommandResult = DocumentResult & { revision: number }
export type EditorAgentState = { document: PageDocument; revision: number; schemas: readonly PuckBlockSchema[] }

const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor'])
const MAX_INPUT_LENGTH = 200_000
function object(value: unknown, label: string): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`${label} must be an object.`)
  return value as RecordValue
}
function exactKeys(value: RecordValue, keys: readonly string[], label: string) {
  for (const key of Object.keys(value)) if (UNSAFE_KEYS.has(key) || !keys.includes(key)) throw new Error(`Unknown ${label} property: ${key}`)
}
function safeJSON(value: unknown, depth = 0, seen = new WeakSet<object>()): void {
  if (depth > 40) throw new Error('Input is nested too deeply.')
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return
  if (typeof value === 'number' && Number.isFinite(value)) return
  if (typeof value !== 'object' || !value) throw new Error('Input must contain only JSON values.')
  if (seen.has(value)) throw new Error('Input cannot contain cycles or repeated object references.')
  seen.add(value)
  if (!Array.isArray(value)) object(value, 'Input')
  for (const [key, child] of Object.entries(value)) {
    if (UNSAFE_KEYS.has(key)) throw new Error(`Unsafe input key: ${key}`)
    safeJSON(child, depth + 1, seen)
  }
}
function id(value: unknown, label: string): Id {
  if (typeof value === 'string' && value.length > 0 && value.length <= 200 || typeof value === 'number' && Number.isFinite(value)) return value as Id
  throw new Error(`${label} must be a stable document ID.`)
}
function pathValue(value: unknown): Path {
  if (!Array.isArray(value) || !value.length || value.length > 24) throw new Error('A field path with 1–24 segments is required.')
  return value.map(segment => {
    if (typeof segment === 'number' && Number.isInteger(segment) && segment >= 0) return segment
    if (typeof segment === 'string' && segment.length && !UNSAFE_KEYS.has(segment) && !isUnsteadyInternalField(segment)) return segment
    throw new Error('Field paths cannot target identity, storage, or unsafe keys.')
  })
}
function destinationValue(value: unknown): SlotAddress {
  const input = object(value, 'Destination')
  exactKeys(input, ['ownerId', 'path', 'itemId'], 'destination')
  const ownerId = id(input.ownerId, 'Destination owner')
  if (typeof input.path !== 'string' || !/^[A-Za-z][A-Za-z0-9]*(?:\.(?:[A-Za-z][A-Za-z0-9]*|\d+))*$/.test(input.path) || input.path.split('.').some(part => UNSAFE_KEYS.has(part))) throw new Error('Use a destination slot returned by read_document.')
  return { ownerId, path: input.path, ...(input.itemId == null ? {} : { itemId: id(input.itemId, 'Destination item') }) }
}

/** Resolve schema and value together; relationships and opaque JSON are never traversed. */
function resolveField(block: RecordValue, schema: PuckBlockSchema, path: Path) {
  let current = block
  let fields = schema.fields
  let textBlockType = schema.slug
  let textBase = 0
  for (let index = 0; index < path.length; index++) {
    const name = path[index]
    if (typeof name !== 'string') throw new Error('Expected a named schema field.')
    const field = flattenUnsteadyFields(fields).find(candidate => candidate.name === name)
    if (!field) throw new Error(`Unknown field: ${path.slice(0, index + 1).join('.')}`)
    if (index === path.length - 1) return { field, owner: current, value: current[name], textBlockType, textPath: path.slice(textBase) }
    if (field.type === 'group') {
      current = current[name] == null ? {} : object(current[name], 'Group')
      fields = field.fields || []
    } else if (field.type === 'array' || field.type === 'blocks') {
      const at = path[++index]
      const rows = current[name]
      if (typeof at !== 'number' || !Array.isArray(rows) || at >= rows.length) throw new Error('The requested row no longer exists.')
      current = object(rows[at], 'Row')
      if (field.type === 'blocks') {
        const childSchema = field.blocks?.find(candidate => candidate.slug === current.blockType)
        if (!childSchema) throw new Error('The nested block schema is unavailable.')
        fields = childSchema.fields
        textBlockType = childSchema.slug
        textBase = index + 1
      } else fields = field.fields || []
    } else throw new Error('Only groups, arrays, and nested blocks may appear inside a field path.')
  }
  throw new Error('A field path must end with a named field.')
}

function relationshipValue(field: PuckFieldSchema, value: unknown): void {
  if (value === null) return
  if (Array.isArray(field.relationTo)) {
    const relation = object(value, 'Relationship')
    exactKeys(relation, ['relationTo', 'value'], 'relationship')
    if (typeof relation.relationTo !== 'string' || !field.relationTo.includes(relation.relationTo)) throw new Error('Unknown relationship collection.')
    id(relation.value, 'Related document')
  } else id(value, 'Related document')
}
function validateFieldValue(field: PuckFieldSchema, value: unknown): void {
  if (['array', 'blocks', 'group'].includes(field.type)) throw new Error('Use array commands or edit individual fields; whole containers cannot be replaced.')
  if (field.type === 'richText') throw new Error('Use edit_text for formatted content.')
  if (value == null) { if (field.required) throw new Error('This field is required.'); return }
  if (field.hasMany) {
    if (!Array.isArray(value)) throw new Error('This field requires a list.')
    if (value.length > 200) throw new Error('This list is too large.')
    const single = { ...field, hasMany: false }
    value.forEach(item => validateFieldValue(single, item))
    return
  }
  if (field.type === 'checkbox') { if (typeof value !== 'boolean') throw new Error('Yes/No fields require true or false.'); return }
  if (field.type === 'number') { if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('A finite number is required.'); return }
  if (field.options?.length) { if (!field.options.some(option => option.value === value)) throw new Error('Choose a value from the field options.'); return }
  if (field.type === 'relationship' || field.type === 'upload') { relationshipValue(field, value); return }
  if (field.type === 'json' || field.type === 'point') { safeJSON(value); return }
  if (typeof value !== 'string') throw new Error('A string value is required.')
  if (value.length > 30_000) throw new Error('Text exceeds 30,000 characters.')
  if (field.required && !value.trim()) throw new Error('This field is required.')
  if (/url|href|website/i.test(field.name)) {
    const normalized = value.replace(/[\u0000-\u0020\u007f]/g, '')
    const protocol = /^([a-z][a-z0-9+.-]*):/i.exec(normalized)?.[1]?.toLowerCase()
    if (protocol && !['http', 'https', 'mailto', 'tel', 'sms'].includes(protocol)) throw new Error('This link protocol is not supported.')
  }
}

function replaceField(block: RecordValue, path: Path, value: unknown): RecordValue {
  const next = structuredClone(block)
  let owner: Record<string | number, unknown> = next
  for (let index = 0; index < path.length - 1; index++) {
    const key = path[index]!
    if (owner[key] == null) owner[key] = typeof path[index + 1] === 'number' ? [] : {}
    owner = owner[key] as Record<string | number, unknown>
  }
  owner[path.at(-1)!] = structuredClone(value)
  return next
}
function schemaFor(block: RecordValue, schemas: readonly PuckBlockSchema[]) {
  const schema = findBlockSchema(block.blockType, schemas)
  if (!schema) throw new Error('This block has no editable schema. Its content is preserved.')
  return schema
}
function textAction(value: unknown): TextAction {
  const input = object(value, 'Text action')
  const type = input.type
  if (type === 'plain' || type === 'replace-rich') {
    exactKeys(input, ['type', 'value', ...(type === 'replace-rich' ? ['defaultBlock'] : [])], 'text action')
    if (typeof input.value !== 'string' || input.value.length > 30_000) throw new Error('Text must be a string of at most 30,000 characters.')
  } else if (type === 'rich') {
    exactKeys(input, ['type', 'value'], 'text action')
    if (!canEditRichText(input.value) || !input.value) throw new Error('Use supported Lexical formatting for rich text.')
  } else if (type === 'mode') {
    exactKeys(input, ['type', 'rich', 'defaultBlock'], 'text action')
    if (typeof input.rich !== 'boolean') throw new Error('Text mode requires rich: true or false.')
  } else if (type === 'plain-from-rich') exactKeys(input, ['type'], 'text action')
  else throw new Error('Unknown text action.')
  if (input.defaultBlock !== undefined && !['paragraph', 'h1', 'h2', 'h3', 'h4'].includes(String(input.defaultBlock))) throw new Error('Unsupported text block style.')
  return input as TextAction
}

/** Write the visible text layer while preserving native/plain fallback content. */
function editVisibleText(block: RecordValue, path: Path, resolved: ReturnType<typeof resolveField>, action: TextAction): RecordValue {
  const native = resolved.field.type === 'richText'
  const companion = isUnsteadyCompanionTextField(resolved.textBlockType, resolved.textPath)
  if (!native && !companion) throw new Error('This field does not support rich text. Use set_field for technical strings.')
  const activeOverride = companion && readTextField(resolved.owner, resolved.field.name, 'companion').enabled
  if (native && (action.type === 'mode' || action.type === 'plain-from-rich')) return block
  if (activeOverride && ['plain', 'replace-rich', 'rich'].includes(action.type)) {
    const rich = readTextField(resolved.owner, resolved.field.name, 'companion').rich
    const projected = replaceField(block, path, rich)
    // Native guards require an explicit formatting removal action and preserve
    // unsupported nodes. They apply equally to enabled companion documents.
    const edited = applyTextAction(projected, path, 'native', action)
    return applyTextAction(block, path, 'companion', { type: 'rich', value: readAddress(edited, path) })
  }
  const source = native && typeof resolved.value === 'string'
    ? replaceField(block, path, createLexicalValueFromText(resolved.value))
    : readAddress(block, path.slice(0, -1)) == null ? replaceField(block, path, resolved.value) : block
  return applyTextAction(source, path, native ? 'native' : 'companion', action)
}

function arrayAction(value: unknown, field: PuckFieldSchema): OwnedArrayAction {
  const action = object(value, 'Array action')
  if (!['add', 'duplicate', 'remove', 'move'].includes(String(action.type))) throw new Error('Unknown array action.')
  exactKeys(action, action.type === 'add' ? ['type', 'item', 'toIndex'] : action.type === 'move' ? ['type', 'index', 'toIndex'] : ['type', 'index'], 'array action')
  for (const key of ['index', 'toIndex']) if (action[key] !== undefined && (!Number.isInteger(action[key]) || Number(action[key]) < 0)) throw new Error('Array indices must be nonnegative integers.')
  if (action.type === 'add') {
    const item = action.item === undefined ? {} : object(action.item, 'New row')
    if (field.type === 'blocks') {
      const schema = field.blocks?.find(block => block.slug === item.blockType)
      if (!schema) throw new Error('A valid blockType is required for a new nested block.')
      exactKeys(item, ['blockType'], 'new block')
      return { type: 'add', toIndex: action.toIndex as number | undefined, item: createUnsteadyBlock(schema) }
    }
    const fields = flattenUnsteadyFields(field.fields || [])
    for (const [key, stored] of Object.entries(item)) {
      if (isUnsteadyInternalField(key)) throw new Error('New row identities are assigned by the editor.')
      const child = fields.find(candidate => candidate.name === key)
      if (!child) throw new Error(`Unknown row field: ${key}`)
      validateFieldValue(child, stored)
    }
    return { type: 'add', toIndex: action.toIndex as number | undefined, item: { ...buildUnsteadyDefaults(field.fields || []), ...item } }
  }
  return action as OwnedArrayAction
}

export function applyEditorCommand(page: PageDocument, command: unknown, options: EditorCommandOptions): EditorCommandResult {
  if (!Number.isSafeInteger(options.revision) || !Number.isSafeInteger(options.expectedRevision) || options.revision < 0 || options.expectedRevision !== options.revision) throw new Error('The draft changed. Read its current revision before editing again.')
  safeJSON(command)
  if (JSON.stringify(command).length > MAX_INPUT_LENGTH) throw new Error('Command exceeds the input size limit.')
  const input = object(command, 'Command')
  const type = input.type
  const documentOptions = { schemas: options.schemas }
  let result: DocumentResult
  if (type === 'insert_block') {
    exactKeys(input, ['type', 'blockType', 'destination', 'beforeId'], 'command')
    const schema = options.schemas.find(item => item.slug === input.blockType)
    if (!schema || !getUnsteadyBlockGroups([schema]).length) throw new Error('This block is not available for new content.')
    result = insertBlock(page, destinationValue(input.destination), createUnsteadyBlock(schema), input.beforeId == null ? null : id(input.beforeId, 'Before block'), documentOptions)
  } else {
    const blockId = id(input.blockId, 'Block')
    const block = getBlock(page, blockId, documentOptions)
    if (type === 'move_block') {
      exactKeys(input, ['type', 'blockId', 'destination', 'beforeId'], 'command')
      result = moveBlock(page, blockId, destinationValue(input.destination), input.beforeId == null ? null : id(input.beforeId, 'Before block'), documentOptions)
    } else if (type === 'duplicate_block' || type === 'remove_block') {
      exactKeys(input, ['type', 'blockId'], 'command')
      result = type === 'duplicate_block' ? duplicateBlock(page, blockId, documentOptions) : removeBlock(page, blockId, documentOptions)
    } else if (type === 'set_field' || type === 'edit_text' || type === 'edit_array') {
      exactKeys(input, ['type', 'blockId', 'path', type === 'set_field' ? 'value' : 'action'], 'command')
      const path = pathValue(input.path)
      const resolved = resolveField(block, schemaFor(block, options.schemas), path)
      if (type === 'set_field') {
        if (!Object.hasOwn(input, 'value')) throw new Error('A field value is required.')
        validateFieldValue(resolved.field, input.value)
        // Prose edits go through the same storage action as the human inspector.
        const next = isUnsteadyCompanionTextField(resolved.textBlockType, resolved.textPath) && typeof input.value === 'string'
          ? editVisibleText(block, path, resolved, { type: 'plain', value: input.value }) : replaceField(block, path, input.value)
        result = updateBlock(page, blockId, next, documentOptions)
      } else if (type === 'edit_array') {
        if (!['array', 'blocks'].includes(resolved.field.type)) throw new Error('This field is not an editable list.')
        result = editOwnedArray(page, blockId, path, arrayAction(input.action, resolved.field), documentOptions)
      } else {
        const action = textAction(input.action)
        const next = editVisibleText(block, path, resolved, action)
        result = updateBlock(page, blockId, next, documentOptions)
      }
    } else throw new Error('Unknown editor command. Only local draft edits are supported.')
  }
  const unchanged = result.document === page || JSON.stringify(result.document) === JSON.stringify(page)
  return { ...result, document: unchanged ? page : result.document, revision: unchanged ? options.revision : options.revision + 1 }
}

function readableFields(value: RecordValue, fields: PuckFieldSchema[]): RecordValue {
  const result: RecordValue = {}
  for (const field of flattenUnsteadyFields(fields)) {
    if (isUnsteadyInternalField(field.name) || !Object.hasOwn(value, field.name)) continue
    const stored = value[field.name]
    if (field.type === 'group' && stored && typeof stored === 'object' && !Array.isArray(stored)) result[field.name] = readableFields(stored as RecordValue, field.fields || [])
    else if ((field.type === 'array' || field.type === 'blocks') && Array.isArray(stored)) result[field.name] = stored.map(row => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return null
      const rowFields = field.type === 'blocks' ? field.blocks?.find(schema => schema.slug === row.blockType)?.fields || [] : field.fields || []
      return { id: row.id, ...(field.type === 'blocks' ? { blockType: row.blockType } : {}), ...readableFields(row, rowFields) }
    })
    else if (field.type === 'relationship' || field.type === 'upload') {
      const relation = (item: unknown): unknown => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return item
        const resource = item as RecordValue
        if ('relationTo' in resource) return { relationTo: resource.relationTo, value: relation(resource.value) }
        return resource.id ?? resource._id ?? null
      }
      result[field.name] = field.hasMany && Array.isArray(stored) ? stored.map(relation) : relation(stored)
    } else result[field.name] = structuredClone(stored)
  }
  return result
}

export function readEditorSnapshot(state: EditorAgentState, blockId?: Id) {
  const slots = getSlots(state.document, { schemas: state.schemas })
  const seen = new Set<string>()
  const blocks = slots.flatMap(slot => slot.items.flatMap(block => {
    if (block.id == null || seen.has(String(block.id))) return []
    seen.add(String(block.id))
    const schema = findBlockSchema(block.blockType, state.schemas)
    return [{ id: block.id, blockType: block.blockType, label: schema?.label || block.blockType || 'Unknown block',
      slotId: slot.id, editable: Boolean(schema), ...(blockId != null && String(blockId) === String(block.id) && schema ? { fields: readableFields(block, schema.fields) } : {}) }]
  }))
  if (blockId != null && !blocks.some(block => String(block.id) === String(blockId))) throw new Error('This block no longer exists.')
  return { revision: state.revision, title: typeof state.document.title === 'string' ? state.document.title : '',
    blocks, slots: slots.map(slot => ({ id: slot.id, label: slot.label, address: slot.address, active: slot.active !== false, allowedSlugs: slot.active === false ? [] : slot.allowedSlugs, blockIds: slot.items.map(block => block.id) })),
    persistence: 'Unsaved local draft. Saving the email draft requires the human editor. Delivery and sending are unavailable here.' }
}

export function readEditorCatalog(schemas: readonly PuckBlockSchema[], blockType?: string) {
  if (blockType !== undefined) {
    const schema = findBlockSchema(blockType, schemas)
    if (!schema) throw new Error('Unknown block type.')
    const visible = (fields: PuckFieldSchema[]): PuckFieldSchema[] => fields.filter(field => !isUnsteadyInternalField(field.name)).map(field => ({ ...field,
      ...(field.fields ? { fields: visible(field.fields) } : {}),
      ...(field.blocks ? { blocks: field.blocks.map(block => ({ ...block, fields: visible(block.fields) })) } : {}),
    }))
    return structuredClone({ ...schema, fields: visible(schema.fields) })
  }
  return { groups: getUnsteadyBlockGroups([...schemas]).map(group => ({ label: group.label, blocks: group.blocks.map(block => ({ blockType: block.slug, label: block.label })) })) }
}
