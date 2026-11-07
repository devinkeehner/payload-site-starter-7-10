import { createLexicalValueFromText, getPlainTextFromLexical, isLexicalEditorState } from '@/lib/live-editor/lexical'

export type TextStorage = 'companion' | 'native'
type TextBlock = 'paragraph' | 'h1' | 'h2' | 'h3' | 'h4'
export type TextCapability = { storage: TextStorage; label: string; multiline: boolean; defaultBlock?: TextBlock }
export type FieldAddress = Array<string | number | { id: string }>
type RecordValue = Record<string, unknown>
export type TextAction =
  | { type: 'plain'; value: string }
  | { type: 'rich'; value: unknown }
  | { type: 'mode'; rich: boolean; defaultBlock?: TextBlock }
  | { type: 'plain-from-rich' }
  | { type: 'replace-rich'; value: string; defaultBlock?: TextBlock }

/** Native email fields are bound by their richText schema in the editor. */
export function previewTextFields(_blockType: string, _ownerPath: Array<string | number>): string[] {
  return []
}
export function textCapability(name: string, storage: TextStorage = 'companion', multiline = true): TextCapability {
  return { storage, multiline, label: name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, value => value.toUpperCase()) }
}
export function defaultTextBlock(_blockSlug: string, _path: string[], _name: string): TextBlock {
  return 'paragraph'
}
function record(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('This text field is no longer available.')
  return value as RecordValue
}
function key(segment: FieldAddress[number], container: unknown): string | number {
  if (typeof segment === 'object') {
    if (!Array.isArray(container)) throw new Error('This item moved. Select it again.')
    const matches = container.flatMap((value, index) => value && String(value.id) === segment.id ? [index] : [])
    if (matches.length !== 1) throw new Error('This item is missing or has an ambiguous ID.')
    return matches[0]!
  }
  if (['__proto__', 'prototype', 'constructor'].includes(String(segment))) throw new Error('Invalid text field path.')
  return segment
}
export function readAddress(root: unknown, address: FieldAddress): unknown {
  return address.reduce<unknown>((value, segment) => {
    if (value == null) return undefined
    return (value as Record<string | number, unknown>)[key(segment, value)]
  }, root)
}
export function captureTextAddress(root: unknown, path: Array<string | number>): FieldAddress {
  let value = root
  return path.map(segment => {
    const child = value == null ? undefined : (value as Record<string | number, unknown>)[segment]
    const stable = Array.isArray(value) && child && typeof child === 'object' && 'id' in child && child.id != null
      ? { id: String(child.id) } : segment
    value = child
    return stable
  })
}
function replaceAddress(root: unknown, address: FieldAddress, value: unknown): unknown {
  if (!address.length) return value
  const [segment, ...tail] = address
  if (segment === undefined) return value
  const at = key(segment, root)
  const copy = Array.isArray(root) ? [...root] : { ...record(root) }
  ;(copy as unknown as Record<string | number, unknown>)[at] = replaceAddress((root as Record<string | number, unknown>)[at], tail, value)
  return copy
}
export function readTextField(owner: RecordValue, field: string, storage: TextStorage = 'companion') {
  const plain = typeof owner[field] === 'string' || typeof owner[field] === 'number' ? String(owner[field]) : ''
  const map = owner.puckRichText && typeof owner.puckRichText === 'object' ? owner.puckRichText as RecordValue : {}
  const entry = map[field]
  const wrapped = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry as RecordValue : {}
  const rich = storage === 'native' ? owner[field] : isLexicalEditorState(entry) ? entry : wrapped.value
  return { plain: storage === 'native' ? getPlainTextFromLexical(rich) : plain, rich,
    enabled: storage === 'native' || isLexicalEditorState(entry) || wrapped.enabled === true,
    entry, map }
}

// Unknown serialized keys/nodes are not passed through an engine that may drop them.
// They remain intact and can still be edited through the existing native Payload view.
export function canEditRichText(value: unknown): boolean {
  if (value == null) return true
  if (!isLexicalEditorState(value)) return false
  const versions: Record<string, number> = { root: 1, paragraph: 1, text: 1, linebreak: 1, heading: 1, quote: 1, list: 1, listitem: 1, link: 3, autolink: 2, horizontalrule: 1 }
  const elementKeys = ['type', 'version', 'children', 'direction', 'format', 'indent']
  const nodeKeys: Record<string, readonly string[]> = {
    root: elementKeys,
    paragraph: [...elementKeys, 'textFormat', 'textStyle'],
    heading: [...elementKeys, 'textFormat', 'textStyle', 'tag'],
    quote: elementKeys,
    list: [...elementKeys, 'listType', 'start', 'tag'],
    listitem: [...elementKeys, 'value', 'checked'],
    link: [...elementKeys, 'fields', 'id'],
    autolink: [...elementKeys, 'fields'],
    text: ['type', 'version', 'text', 'detail', 'format', 'mode', 'style'],
    linebreak: ['type', 'version'],
    horizontalrule: ['type', 'version'],
  }
  const inlineTypes = ['text', 'linebreak', 'link', 'autolink']
  const seen = new WeakSet<object>()
  const plainObject = (item: unknown): item is RecordValue => Boolean(item) && typeof item === 'object' && !Array.isArray(item) && [Object.prototype, null].includes(Object.getPrototypeOf(item))
  const integer = (item: unknown) => typeof item === 'number' && Number.isSafeInteger(item) && item >= 0
  const safeStyle = (item: unknown) => typeof item === 'string' && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]|url\s*\(|expression\s*\(|@import|javascript\s*:/i.test(item)
  const safeLink = (item: unknown) => {
    if (typeof item !== 'string') return false
    const normalized = item.replace(/[\u0000-\u0020\u007f]/g, '')
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(normalized)?.[1]?.toLowerCase()
    return !scheme || ['http', 'https', 'mailto', 'tel', 'sms'].includes(scheme)
  }
  const safeJSON = (item: unknown, depth = 0): boolean => {
    if (depth > 40) return false
    if (item == null || typeof item === 'string' || typeof item === 'boolean') return true
    if (typeof item === 'number') return Number.isFinite(item)
    if (typeof item !== 'object' || seen.has(item)) return false
    if (!Array.isArray(item) && !plainObject(item)) return false
    seen.add(item)
    return Object.entries(item).every(([name, child]) => !['__proto__', 'prototype', 'constructor'].includes(name) && safeJSON(child, depth + 1))
  }
  function visit(node: unknown, parent?: string, depth = 0): boolean {
    if (depth > 40 || !plainObject(node) || seen.has(node)) return false
    seen.add(node)
    const data = node
    if (typeof data.type !== 'string' || !Object.hasOwn(versions, data.type) || versions[data.type] !== data.version || Object.keys(data).some(name => !nodeKeys[data.type as string]?.includes(name))) return false
    if (data.type === 'root' && parent !== undefined || parent === undefined && data.type !== 'root') return false
    if (parent === 'root' && !['paragraph', 'heading', 'quote', 'list', 'horizontalrule'].includes(data.type)) return false
    if (parent && ['paragraph', 'heading', 'quote'].includes(parent) && !inlineTypes.includes(data.type)) return false
    if (parent && ['link', 'autolink'].includes(parent) && !['text', 'linebreak'].includes(data.type)) return false
    if (parent === 'listitem' && ![...inlineTypes, 'list'].includes(data.type)) return false
    if (data.id !== undefined && (typeof data.id !== 'string' || !data.id)) return false
    if (data.direction !== undefined && data.direction !== null && !['ltr', 'rtl'].includes(String(data.direction))) return false
    if (data.indent !== undefined && !integer(data.indent)) return false
    if (data.textFormat !== undefined && !integer(data.textFormat)) return false
    if (data.textStyle !== undefined && !safeStyle(data.textStyle)) return false
    if (data.format !== undefined && !(data.type === 'text' ? integer(data.format) : ['', 'left', 'center', 'right', 'justify', 'start', 'end'].includes(String(data.format)))) return false
    if (data.type === 'text') {
      if (typeof data.text !== 'string' || data.detail !== undefined && !integer(data.detail) || data.style !== undefined && !safeStyle(data.style) || data.mode !== undefined && !['normal', 'token', 'segmented'].includes(String(data.mode))) return false
    }
    if (data.type === 'heading' && !['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(String(data.tag))) return false
    if (data.type === 'list' && (!['bullet', 'number', 'check'].includes(String(data.listType)) || data.start !== undefined && !integer(data.start) || data.tag !== undefined && !['ul', 'ol'].includes(String(data.tag)))) return false
    if (data.type === 'listitem' && (parent !== 'list' || data.value !== undefined && !integer(data.value) || data.checked !== undefined && typeof data.checked !== 'boolean')) return false
    if (data.fields !== undefined) {
      if (!['link', 'autolink'].includes(data.type) || !plainObject(data.fields)) return false
      const fields = data.fields
      if (Object.keys(fields).some(name => !['doc', 'linkType', 'newTab', 'url'].includes(name))) return false
      if (fields.url !== undefined && !safeLink(fields.url) || fields.newTab !== undefined && typeof fields.newTab !== 'boolean' || fields.linkType !== undefined && !['custom', 'internal'].includes(String(fields.linkType))) return false
      if (fields.doc !== undefined && !safeJSON(fields.doc)) return false
    }
    const leaf = ['text', 'linebreak', 'horizontalrule'].includes(data.type)
    if (leaf) return data.children === undefined
    if (!Array.isArray(data.children)) return false
    if (data.type === 'list' && data.children.some(child => !plainObject(child) || child.type !== 'listitem')) return false
    return data.children.every(child => visit(child, data.type as string, depth + 1))
  }
  try { return Object.keys(value).every(name => name === 'root') && visit(value.root) } catch { return false }
}
export function hasRichFormatting(value: unknown, defaultBlock: TextBlock = 'paragraph'): boolean {
  if (!canEditRichText(value)) return true
  if (!isLexicalEditorState(value)) return false
  const root = record(value.root)
  if (root.format || root.indent || root.direction && root.direction !== 'ltr') return true
  if (!Array.isArray(root.children) || root.children.length !== 1) return true
  const paragraph = record(root.children[0])
  if ((defaultBlock === 'paragraph' ? paragraph.type !== 'paragraph' : paragraph.type !== 'heading' || paragraph.tag !== defaultBlock) || paragraph.format || paragraph.indent || paragraph.textFormat || paragraph.textStyle || paragraph.direction && paragraph.direction !== 'ltr') return true
  return !Array.isArray(paragraph.children) || paragraph.children.some(node => {
    const item = record(node)
    return !['text', 'linebreak'].includes(String(item.type)) || Boolean(item.format || item.style || item.detail) || (item.mode != null && item.mode !== 'normal')
  })
}
export function updateTextField(owner: RecordValue, field: string, storage: TextStorage, action: TextAction): RecordValue {
  const current = readTextField(owner, field, storage)
  if (storage === 'native') {
    if (action.type === 'mode' || action.type === 'plain-from-rich') return owner // UI mode never changes the Payload field type.
    if (!canEditRichText(current.rich)) throw new Error('Unsupported rich content is preserved.')
    if (action.type === 'plain' && hasRichFormatting(current.rich)) throw new Error('Choose explicitly before removing formatting.')
    if (action.type === 'rich' && (!action.value || !canEditRichText(action.value))) throw new Error('Use supported Lexical formatting for rich text.')
    return { ...owner, [field]: action.type === 'rich' ? structuredClone(action.value) : createLexicalValueFromText(action.value, { blockType: action.type === 'replace-rich' ? action.defaultBlock : undefined }) }
  }
  if (action.type === 'plain') return { ...owner, [field]: action.value } // Retain inactive rich content, exactly.
  if (action.type === 'rich' && (!action.value || !canEditRichText(action.value))) throw new Error('Use supported Lexical formatting for rich text.')
  if ((action.type === 'rich' || action.type === 'replace-rich') && !canEditRichText(current.rich)) throw new Error('Unsupported rich content is preserved.')
  const old = current.entry && typeof current.entry === 'object' && !isLexicalEditorState(current.entry) ? current.entry as RecordValue : {}
  const initial = (text: string) => createLexicalValueFromText(text, { blockType: action.type === 'mode' || action.type === 'replace-rich' ? action.defaultBlock : undefined })
  const value = action.type === 'rich' ? structuredClone(action.value) : action.type === 'replace-rich' ? initial(action.value) : current.rich ?? initial(current.plain)
  return { ...owner, ...(action.type === 'plain-from-rich' ? { [field]: getPlainTextFromLexical(current.rich) } : {}),
    puckRichText: { ...current.map, [field]: { ...old, enabled: action.type === 'mode' ? action.rich : action.type !== 'plain-from-rich', value } } }
}
export function applyTextAction(root: RecordValue, address: FieldAddress, storage: TextStorage, action: TextAction): RecordValue {
  const field = address[address.length - 1]
  if (typeof field !== 'string') throw new Error('Text fields must have a named property.')
  key(field, root)
  const ownerPath = address.slice(0, -1)
  const owner = record(readAddress(root, ownerPath))
  return replaceAddress(root, ownerPath, updateTextField(owner, field, storage, action)) as RecordValue
}
