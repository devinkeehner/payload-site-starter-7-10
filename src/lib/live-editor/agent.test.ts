import { describe, expect, it } from 'vitest'
import { getEmailPuckBlockSchema } from '@/lib/puck/schema'
import { applyEditorCommand, readEditorCatalog, readEditorSnapshot } from './agent'
import { getBlock, type PageDocument } from './document'
import { createLexicalValueFromText, getPlainTextFromLexical } from './lexical'

const schemas = getEmailPuckBlockSchema()
const options = { schemas, revision: 7, expectedRevision: 7 }
const fixture = (): PageDocument => ({
  id: 'email-1', title: 'Community news', subject: 'Original subject', tenant: 'tenant-1', sendStatus: 'draft',
  layout: [{ id: 'row', blockType: 'emailGrid', layout: 'twoColumns', preserved: true,
    leftBlocks: [{ id: 'text', blockType: 'emailText', text: createLexicalValueFromText('Original text'), align: 'left', unknown: { preserve: true } }],
    rightBlocks: [{ id: 'image', blockType: 'emailImage', media: { id: 'media-1', filename: 'image.jpg', privateMetadata: 'opaque' }, alt: 'Town' }],
    fourthBlocks: [{ id: 'hidden', blockType: 'emailHeading', text: 'Hidden title', level: 'h2' }],
  }, { id: 'cards', blockType: 'emailArticleTwoCards', cards: [{ id: 'card-1', heading: 'First', body: 'One', media: { id: 'media-2' } }] }],
})

describe('local native email agent commands', () => {
  it('rejects stale or invalid revisions before changing a draft', () => {
    const page = fixture()
    const command = { type: 'set_field', blockId: 'text', path: ['align'], value: 'center' }
    for (const expectedRevision of [6, 8, -1, NaN, 7.5]) expect(() => applyEditorCommand(page, command, { ...options, expectedRevision })).toThrow('revision')
    expect(page).toEqual(fixture())
  })

  it('edits one schema field atomically and returns one new revision', () => {
    const page = fixture()
    const result = applyEditorCommand(page, { type: 'set_field', blockId: 'text', path: ['align'], value: 'center' }, options)
    expect(result.revision).toBe(8)
    expect(getBlock(result.document, 'text', { schemas })).toMatchObject({ align: 'center', unknown: { preserve: true } })
    expect(result.document).toMatchObject({ subject: 'Original subject', tenant: 'tenant-1', sendStatus: 'draft' })
    expect(page).toEqual(fixture())
    expect(applyEditorCommand(result.document, { type: 'set_field', blockId: 'text', path: ['align'], value: 'center' }, { ...options, revision: 8, expectedRevision: 8 })).toMatchObject({ document: result.document, revision: 8 })
  })

  it('uses native nested block paths and preserves every surrounding field', () => {
    const page = fixture()
    const result = applyEditorCommand(page, { type: 'edit_text', blockId: 'row', path: ['leftBlocks', 0, 'text'], action: { type: 'plain', value: 'Updated native text' } }, options)
    const text = getBlock(result.document, 'text', { schemas })
    expect(getPlainTextFromLexical(text.text)).toBe('Updated native text')
    expect(text).not.toHaveProperty('puckRichText')
    expect(getBlock(result.document, 'image', { schemas }).media).toEqual({ id: 'media-1', filename: 'image.jpg', privateMetadata: 'opaque' })
    expect(page).toEqual(fixture())
  })

  it('requires an explicit action to remove native Lexical formatting', () => {
    const page = fixture()
    const rich = getBlock(page, 'text', { schemas }).text as { root: { children: Array<{ children: Array<{ format: number }> }> } }
    rich.root.children[0]!.children[0]!.format = 1
    const snapshot = structuredClone(page)
    expect(() => applyEditorCommand(page, { type: 'edit_text', blockId: 'text', path: ['text'], action: { type: 'plain', value: 'Unformatted' } }, options)).toThrow('explicitly')
    expect(page).toEqual(snapshot)
    const result = applyEditorCommand(page, { type: 'edit_text', blockId: 'text', path: ['text'], action: { type: 'replace-rich', value: 'Unformatted' } }, options)
    expect(getPlainTextFromLexical(getBlock(result.document, 'text', { schemas }).text)).toBe('Unformatted')
  })

  it('preserves unsupported rich content when editing a different field', () => {
    const page = fixture()
    const value = { root: { type: 'root', version: 1, children: [{ type: 'future-node', version: 9, payload: { id: 'keep' } }] }, extension: true }
    const text = getBlock(page, 'text', { schemas })
    text.text = value
    const result = applyEditorCommand(page, { type: 'set_field', blockId: 'text', path: ['align'], value: 'center' }, options)
    expect(getBlock(result.document, 'text', { schemas }).text).toEqual(value)
    expect(() => applyEditorCommand(page, { type: 'edit_text', blockId: 'text', path: ['text'], action: { type: 'replace-rich', value: 'Lost metadata' } }, options)).toThrow('preserved')
  })

  it.each([['id'], ['blockType'], ['_id'], ['blockName'], ['puckRichText'], ['__proto__'], ['media', 'filename'], ['unknown'], ['text', 'root']].map(path => ({ path })))('rejects protected or opaque field path $path', ({ path }) => {
    const page = fixture()
    expect(() => applyEditorCommand(page, { type: 'set_field', blockId: path[0] === 'media' ? 'image' : 'text', path, value: 'bad' }, options)).toThrow()
    expect(page).toEqual(fixture())
  })

  it('rejects whole containers, malformed options and rich content supplied as plain fields', () => {
    const page = fixture()
    for (const command of [
      { type: 'set_field', blockId: 'row', path: ['leftBlocks'], value: [] },
      { type: 'set_field', blockId: 'text', path: ['text'], value: 'plain' },
      { type: 'set_field', blockId: 'text', path: ['align'], value: 'sideways' },
      { type: 'set_field', blockId: 'text', path: ['align'], value: 'center', unauthorized: true },
      { type: 'edit_text', blockId: 'text', path: ['text'], action: { type: 'rich', value: { root: { type: 'root', version: 999, children: [] } } } },
    ]) expect(() => applyEditorCommand(page, command, options)).toThrow()
    expect(page).toEqual(fixture())
  })

  it('validates native owned array actions and leaves the source unchanged after failure', () => {
    const page = fixture()
    expect(() => applyEditorCommand(page, { type: 'edit_array', blockId: 'cards', path: ['cards'], action: { type: 'remove', index: 0 } }, options)).toThrow('at least')
    expect(() => applyEditorCommand(page, { type: 'edit_array', blockId: 'cards', path: ['cards'], action: { type: 'add', item: { id: 'injected-id', heading: 'Bad' } } }, options)).toThrow('identities')
    const result = applyEditorCommand(page, { type: 'edit_array', blockId: 'cards', path: ['cards'], action: { type: 'add', item: { heading: 'Second article' } } }, options)
    const rows = getBlock(result.document, 'cards', { schemas }).cards as Array<Record<string, unknown>>
    expect(rows).toHaveLength(2)
    expect(rows[0]!.id).toBe('card-1')
    expect(rows[1]).toMatchObject({ id: expect.any(String), heading: 'Second article', body: 'Add article summary copy.' })
    expect(result.revision).toBe(8)
    expect(page).toEqual(fixture())
  })

  it('inserts and moves only native email block types into compatible active columns', () => {
    const page = fixture()
    const destination = { ownerId: 'row', path: 'leftBlocks' }
    expect(() => applyEditorCommand(page, { type: 'insert_block', blockType: 'heroFamily', destination }, options)).toThrow('not available')
    expect(() => applyEditorCommand(page, { type: 'insert_block', blockType: 'emailGrid', destination }, options)).toThrow('does not accept')
    expect(() => applyEditorCommand(page, { type: 'insert_block', blockType: 'emailText', destination: { ownerId: 'row', path: 'fourthBlocks' } }, options)).toThrow('active')
    const result = applyEditorCommand(page, { type: 'insert_block', blockType: 'emailHeading', destination, beforeId: 'text' }, options)
    expect(result.selectedId).toEqual(expect.any(String))
    expect((getBlock(result.document, 'row', { schemas }).leftBlocks as Array<Record<string, unknown>>)[0]).toMatchObject({ id: result.selectedId, blockType: 'emailHeading' })
    expect(page).toEqual(fixture())
  })

  it.each(['javascript:alert(1)', 'java\tscript:alert(1)', 'data:text/html,bad', 'file:///etc/passwd'])('rejects unsafe URL %s without changes', value => {
    const page = fixture()
    expect(() => applyEditorCommand(page, { type: 'set_field', blockId: 'image', path: ['href'], value }, options)).toThrow('protocol')
    expect(page).toEqual(fixture())
  })

  it('reads native schemas, normalized relationship identities and hidden slot status', () => {
    const page = fixture()
    const snapshot = readEditorSnapshot({ document: page, revision: 7, schemas }, 'image')
    expect(snapshot.revision).toBe(7)
    expect(snapshot.blocks.find(block => block.id === 'image')?.fields).toMatchObject({ media: 'media-1', alt: 'Town' })
    expect(snapshot.slots.find(slot => slot.address.path === 'fourthBlocks')).toMatchObject({ active: false, allowedSlugs: [], blockIds: ['hidden'] })
    expect(readEditorCatalog(schemas, 'emailText')).toMatchObject({ slug: 'emailText', fields: expect.arrayContaining([expect.objectContaining({ name: 'text', type: 'richText' })]) })
    expect(() => readEditorCatalog(schemas, 'heroFamily')).toThrow('Unknown')
    expect(() => readEditorSnapshot({ document: page, revision: 7, schemas }, 'gone')).toThrow('no longer exists')
    const outline = readEditorSnapshot({ document: page, revision: 7, schemas })
    expect(outline.blocks.every(block => !Object.hasOwn(block, 'fields'))).toBe(true)
    expect(page).toEqual(fixture())
  })
})
