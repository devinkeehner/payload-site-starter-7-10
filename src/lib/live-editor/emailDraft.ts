/** Native Payload save boundary. Unknown JSON stays opaque; only schema-owned
 * relationships are reduced from preview resources to their stored identities. */
export type DraftField = {
  name?: string
  type: string
  fields?: readonly DraftField[]
  tabs?: readonly { name?: string; fields: readonly DraftField[] }[]
  blocks?: readonly DraftBlock[]
  blockReferences?: readonly (DraftBlock | string)[]
  relationTo?: string | readonly string[]
  hasMany?: boolean
}
export type DraftBlock = { slug: string; fields: readonly DraftField[] }
type RecordValue = Record<string, unknown>

const CONTENT_FIELDS = ['title', 'subject', 'preheader', 'replyTo', 'layout'] as const
const isRecord = (value: unknown): value is RecordValue => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isID = (value: unknown): value is string | number => typeof value === 'string' && value.length > 0 || typeof value === 'number' && Number.isFinite(value)

export class NativeDraftError extends Error {
  constructor(message: string, public readonly status: 400 | 409 = 400) { super(message); this.name = 'NativeDraftError' }
}

function relationshipID(value: unknown, path: string): string | number {
  if (isID(value)) return value
  if (isRecord(value)) {
    if (isID(value.id)) return value.id
    if (isID(value._id)) return value._id
    if (isID(value.value)) return value.value
  }
  throw new NativeDraftError(`Choose a saved document or media item for ${path} before saving.`)
}

function normalizeRelationship(value: unknown, field: DraftField, path: string): unknown {
  if (value == null) return value
  if (field.hasMany) {
    if (!Array.isArray(value)) throw new NativeDraftError(`${path} must contain a list of relationships.`)
    return value.map((item, index) => normalizeRelationship(item, { ...field, hasMany: false }, `${path}.${index}`))
  }
  if (Array.isArray(field.relationTo)) {
    if (!isRecord(value) || typeof value.relationTo !== 'string' || !field.relationTo.includes(value.relationTo)) {
      throw new NativeDraftError(`Choose a supported collection for ${path} before saving.`)
    }
    return { ...value, value: relationshipID(value.value, path) }
  }
  if (isRecord(value) && typeof value.relationTo === 'string') {
    if (field.relationTo && value.relationTo !== field.relationTo) throw new NativeDraftError(`The relationship in ${path} belongs to another collection.`)
    return relationshipID(value.value, path)
  }
  return relationshipID(value, path)
}

const LEXICAL_CONTAINERS = new Set(['root', 'paragraph', 'heading', 'quote', 'list', 'listitem', 'table', 'tablerow', 'tablecell', 'link', 'autolink'])

/** Payload reads populate these nodes, but its node hooks do not consistently
 * reduce them again on a draft write. Touch only standard node relationship
 * locations, leaving unsupported nodes and their arbitrary payloads intact. */
function normalizeRichText(value: unknown, path: string): unknown {
  if (!isRecord(value) || !isRecord(value.root) || value.root.type !== 'root') return value
  const visit = (node: unknown, location: string): unknown => {
    if (!isRecord(node)) return node
    if (node.type === 'upload' || node.type === 'relationship') {
      if (node.pending) throw new NativeDraftError(`Finish uploading the media in ${location} before saving.`)
      return node.value == null ? node : { ...node, value: relationshipID(node.value, location) }
    }
    if (typeof node.type !== 'string' || !LEXICAL_CONTAINERS.has(node.type)) return node
    const next = { ...node }
    if ((node.type === 'link' || node.type === 'autolink') && isRecord(node.fields) && node.fields.linkType === 'internal' && node.fields.doc != null) {
      const doc = node.fields.doc
      if (!isRecord(doc) || typeof doc.relationTo !== 'string') throw new NativeDraftError(`Choose a saved document for ${location} before saving.`)
      next.fields = { ...node.fields, doc: { ...doc, value: relationshipID(doc.value, location) } }
    }
    if (Array.isArray(node.children)) next.children = node.children.map((child, index) => visit(child, `${location}.children.${index}`))
    return next
  }
  return { ...value, root: visit(value.root, `${path}.root`) }
}

function normalizeFields(value: RecordValue, fields: readonly DraftField[], registry: readonly DraftBlock[], prefix = ''): RecordValue {
  const next = { ...value }
  for (const field of fields) {
    if (field.type === 'tabs') {
      for (const tab of field.tabs || []) {
        if (tab.name) {
          if (next[tab.name] != null && !isRecord(next[tab.name])) throw new NativeDraftError(`${prefix}${tab.name} must be an object.`)
          if (isRecord(next[tab.name])) next[tab.name] = normalizeFields(next[tab.name] as RecordValue, tab.fields, registry, `${prefix}${tab.name}.`)
        } else Object.assign(next, normalizeFields(next, tab.fields, registry, prefix))
      }
      continue
    }
    if (field.type === 'row' || field.type === 'collapsible') {
      Object.assign(next, normalizeFields(next, field.fields || [], registry, prefix))
      continue
    }
    if (!field.name || !Object.hasOwn(next, field.name)) continue
    if (['__proto__', 'constructor', 'prototype'].includes(field.name)) throw new NativeDraftError('The email schema contains an unsafe field name.')
    const stored = next[field.name]
    const path = `${prefix}${field.name}`
    if (field.type === 'relationship' || field.type === 'upload') next[field.name] = normalizeRelationship(stored, field, path)
    else if (field.type === 'richText') next[field.name] = normalizeRichText(stored, path)
    else if (field.type === 'group' && stored != null) {
      if (!isRecord(stored)) throw new NativeDraftError(`${path} must be an object.`)
      next[field.name] = normalizeFields(stored, field.fields || [], registry, `${path}.`)
    } else if ((field.type === 'array' || field.type === 'blocks') && stored != null) {
      if (!Array.isArray(stored)) throw new NativeDraftError(`${path} must be an array.`)
      next[field.name] = stored.map((row, index) => {
        if (!isRecord(row)) throw new NativeDraftError(`${path}.${index} must be an object.`)
        if (field.type === 'array') return normalizeFields(row, field.fields || [], registry, `${path}.${index}.`)
        if (typeof row.blockType !== 'string' || !row.blockType) throw new NativeDraftError(`${path}.${index} must identify its block type.`)
        const candidates = [...(field.blocks || []), ...(field.blockReferences || [])]
        const definition = candidates.find(block => typeof block === 'string' ? block === row.blockType : block.slug === row.blockType)
        const schema = typeof definition === 'string' ? registry.find(block => block.slug === definition) : definition
        // Unknown block records and every unknown property remain intact. Payload
        // remains responsible for its collection/block validation on the write.
        return schema ? normalizeFields(row, schema.fields, registry, `${path}.${index}.`) : row
      })
    }
    // JSON and unknown fields are deliberately not heuristically walked.
  }
  return next
}

export function buildNativeEmailDraftPatch(email: unknown, fields: readonly DraftField[], registry: readonly DraftBlock[] = []): RecordValue {
  if (!isRecord(email)) throw new NativeDraftError('A native email document is required.')
  const patch: RecordValue = {}
  for (const name of CONTENT_FIELDS) {
    if (!Object.hasOwn(email, name)) continue
    const value = email[name]
    if (name !== 'layout' && typeof value !== 'string') throw new NativeDraftError(`${name} must be text.`)
    if (name === 'layout' && value !== null && !Array.isArray(value)) throw new NativeDraftError(`${name} must be an array.`)
    patch[name] = structuredClone(value)
  }
  if (!Object.keys(patch).length) throw new NativeDraftError('No editable email content was supplied.')
  return normalizeFields(patch, fields, registry)
}

export function readNativeDraftRequest(body: unknown): { email: RecordValue; expectedUpdatedAt: string } {
  if (!isRecord(body) || !isRecord(body.email)) throw new NativeDraftError('A native email document is required.')
  if (Object.keys(body).some(key => !['email', 'expectedUpdatedAt'].includes(key))) throw new NativeDraftError('Only email and expectedUpdatedAt may be submitted.')
  const token = body.expectedUpdatedAt
  if (typeof token !== 'string' || token.length > 64 || !/^\d{4}-\d{2}-\d{2}T/.test(token) || !Number.isFinite(Date.parse(token))) {
    throw new NativeDraftError('Load the latest draft before saving; a valid expectedUpdatedAt is required.')
  }
  return { email: body.email, expectedUpdatedAt: token }
}

export function assertCurrentDraftRevision(current: { updatedAt?: unknown }, expectedUpdatedAt: string): void {
  if (typeof current.updatedAt !== 'string' || current.updatedAt !== expectedUpdatedAt) {
    throw new NativeDraftError('This email draft changed after you opened it. Reload the latest draft before saving again.', 409)
  }
}

/** Follow the app's public-origin handling behind Render/Next proxies. Requests
 * without browser Origin metadata still require normal Payload authentication. */
export function isSameOriginDraftRequest(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site')
  if (site === 'cross-site' || site === 'same-site') return false
  const origin = request.headers.get('origin')
  if (!origin) return true
  const url = new URL(request.url)
  const host = (request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host).split(',')[0]?.trim()
  const protocol = (request.headers.get('x-forwarded-proto') || url.protocol.slice(0, -1)).split(',')[0]?.trim()
  try { return new URL(origin).origin === `${protocol}://${host}` } catch { return false }
}
