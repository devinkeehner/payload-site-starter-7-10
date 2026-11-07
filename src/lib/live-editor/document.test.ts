import { describe, expect, it } from 'vitest'
import { getEmailPuckBlockSchema } from '@/lib/puck/schema'
import { createUnsteadyBlock, getUnsteadyBlockGroups } from './catalog'
import { createLexicalValueFromText } from './lexical'
import { duplicateBlock, editOwnedArray, ensureDocumentIds, findBlock, getBlock, getSlots, insertBlock, moveBlock, removeBlock, ROOT_SLOT, updateBlock, type PageDocument } from './document'

const schemas = getEmailPuckBlockSchema()
const options = { schemas }
const text = (id: string, value = 'Native email text') => ({ id, blockType: 'emailText', text: createLexicalValueFromText(value), preserved: { future: true } })
const fixture = (): PageDocument => ({
  id: 'email-1', title: 'Town news', subject: 'November news', tenant: { id: 'tenant-1' },
  delivery: { mode: 'protected' }, extension: { id: 'opaque-document-id', layout: [{ blockType: 'external' }] },
  layout: [{ id: 'grid', blockType: 'emailGrid', layout: 'threeColumns', unknownGrid: true,
    leftBlocks: [text('left')], centerBlocks: [{ id: 'gallery', blockType: 'emailGallery', layout: 'twoColumns', items: [
      { id: 'gallery-row', media: { id: 'media-1', filename: 'town.jpg', extension: { id: 'media-extension' } }, caption: 'Town center', unknownRow: true },
    ] }], rightBlocks: [{ id: 'button', blockType: 'emailButton', label: 'Learn more', url: 'https://example.gov' }],
    fourthBlocks: [text('hidden', 'Preserve this inactive column')],
  }, text('after')],
})

describe('native email document engine', () => {
  it('round trips native nested grids, unknown data, relationships and Lexical exactly', () => {
    const document = fixture()
    expect(ensureDocumentIds(document, options)).toBe(document)
    expect(getSlots(document, options).map(slot => slot.path)).toEqual(['layout', 'leftBlocks', 'centerBlocks', 'rightBlocks', 'fourthBlocks'])
    expect(getSlots(document, options).find(slot => slot.path === 'fourthBlocks')).toMatchObject({ active: false, items: [text('hidden', 'Preserve this inactive column')] })
    expect(getBlock(document, 'gallery', options)).toMatchObject({ items: [{ id: 'gallery-row', media: { id: 'media-1' } }] })
    expect(document).toEqual(fixture())
  })

  it('shows only active empty columns and preserves populated inactive columns', () => {
    const document: PageDocument = { layout: [{ id: 'grid', blockType: 'emailGrid', layout: 'oneColumn', leftBlocks: [], rightBlocks: [], centerBlocks: [], fourthBlocks: [] }] }
    expect(getSlots(document, options).map(slot => slot.path)).toEqual(['layout', 'leftBlocks'])
    expect(() => insertBlock(document, { ownerId: 'grid', path: 'rightBlocks' }, text('new'), null, options)).toThrow('active')
    const changed = updateBlock(document, 'grid', { layout: 'fourColumns' }, options).document
    expect(getSlots(changed, options)).toHaveLength(5)
  })

  it('initializes only missing schema-owned IDs and keeps opaque IDs intact', () => {
    const page: PageDocument = { layout: [{ blockType: 'emailGrid', layout: 'twoColumns', leftBlocks: [{ blockType: 'emailGallery', items: [{ media: { id: 'media-id' }, extra: { id: 'opaque' } }] }], rightBlocks: [] }] }
    let next = 0
    const document = ensureDocumentIds(page, { schemas, createId: () => `generated-${++next}` })
    const grid = document.layout![0]!
    const gallery = (grid.leftBlocks as Array<Record<string, unknown>>)[0]!
    expect([grid.id, gallery.id, (gallery.items as Array<Record<string, unknown>>)[0]!.id]).toEqual(['generated-1', 'generated-2', 'generated-3'])
    expect((gallery.items as Array<Record<string, unknown>>)[0]).toMatchObject({ media: { id: 'media-id' }, extra: { id: 'opaque' } })
    expect(page.layout![0]).not.toHaveProperty('id')
    expect(ensureDocumentIds(document, options)).toBe(document)
  })

  it('moves native blocks between root and grid without changing IDs or text', () => {
    const page = fixture()
    const moved = moveBlock(page, 'after', { ownerId: 'grid', path: 'leftBlocks' }, 'left', options)
    expect(moved.selectedId).toBe('after')
    expect((getBlock(moved.document, 'grid', options).leftBlocks as Array<{ id: string }>).map(block => block.id)).toEqual(['after', 'left'])
    expect(getBlock(moved.document, 'after', options)).toEqual(text('after'))
    expect(moved.document.subject).toBe('November news')
    expect(page).toEqual(fixture())
    expect(moveBlock(moved.document, 'after', { ownerId: 'grid', path: 'leftBlocks' }, 'after', options).document).toBe(moved.document)
  })

  it('duplicates every owned block and row ID while preserving media and custom metadata', () => {
    const page = fixture()
    let sequence = 0
    const result = duplicateBlock(page, 'grid', { schemas, createId: () => `copy-${++sequence}` })
    const copy = result.document.layout![1]!
    expect(copy.id).toBe(result.selectedId)
    expect(copy.id).not.toBe('grid')
    expect(copy.unknownGrid).toBe(true)
    const copiedGallery = (copy.centerBlocks as Array<Record<string, unknown>>)[0]!
    expect(copiedGallery.id).not.toBe('gallery')
    expect((copiedGallery.items as Array<Record<string, unknown>>)[0]).toMatchObject({ id: expect.not.stringMatching(/^gallery-row$/), media: { id: 'media-1', extension: { id: 'media-extension' } }, unknownRow: true })
    expect((copy.fourthBlocks as Array<Record<string, unknown>>)[0]!.id).not.toBe('hidden')
    expect(getBlock(result.document, 'hidden', options)).toEqual(text('hidden', 'Preserve this inactive column'))
    expect(page).toEqual(fixture())
  })

  it('removes nested blocks and returns an existing nearby selection', () => {
    const page = fixture()
    const result = removeBlock(page, 'left', options)
    expect(findBlock(result.document, 'left', options)).toBeNull()
    expect(result.selectedId).toBe('grid')
    expect(page).toEqual(fixture())
  })

  it('rejects website blocks and incompatible nested email blocks atomically', () => {
    const page = fixture()
    expect(() => insertBlock(page, ROOT_SLOT, { id: 'campaign', blockType: 'heroFamily' }, null, options)).toThrow('does not accept')
    expect(() => moveBlock(page, 'grid', { ownerId: 'grid', path: 'leftBlocks' }, null, options)).toThrow('does not accept')
    expect(() => insertBlock(page, { ownerId: 'grid', path: 'leftBlocks' }, { id: 'footer', blockType: 'emailFooterOneColumn' }, null, options)).toThrow('does not accept')
    expect(() => insertBlock(page, ROOT_SLOT, { id: 'invalid-grid', blockType: 'emailGrid', leftBlocks: [{ id: 'nested-grid', blockType: 'emailGrid' }] }, null, options)).toThrow('does not accept')
    expect(page).toEqual(fixture())
  })

  it('rejects duplicate identities and protected block identity changes', () => {
    const page = fixture()
    expect(() => insertBlock(page, ROOT_SLOT, text('left'), null, options)).toThrow('Duplicate')
    expect(() => updateBlock(page, 'left', { id: 'replacement' }, options)).toThrow('identity')
    expect(() => updateBlock(page, 'left', { blockType: 'emailHeading' }, options)).toThrow('type')
    expect(() => ensureDocumentIds({ layout: [text('duplicate'), text('duplicate')] }, options)).toThrow('Duplicate')
    expect(page).toEqual(fixture())
  })

  it('edits schema-owned arrays with limits and regenerates only duplicated row IDs', () => {
    const page = fixture()
    const result = editOwnedArray(page, 'gallery', ['items'], { type: 'duplicate', index: 0 }, options)
    const rows = getBlock(result.document, 'gallery', options).items as Array<Record<string, unknown>>
    expect(rows[1]!.id).not.toBe(rows[0]!.id)
    expect(rows[1]!.media).toEqual(rows[0]!.media)
    expect(rows[1]!.unknownRow).toBe(true)
    const moved = editOwnedArray(result.document, 'gallery', ['items'], { type: 'move', index: 1, toIndex: 0 }, options)
    expect((getBlock(moved.document, 'gallery', options).items as Array<Record<string, unknown>>)[0]!.id).toBe(rows[1]!.id)
    const cards: PageDocument = { layout: [{ id: 'cards', blockType: 'emailArticleTwoCards', cards: [{ id: 'card', heading: 'One' }] }] }
    expect(() => editOwnedArray(cards, 'cards', ['cards'], { type: 'remove', index: 0 }, options)).toThrow('at least')
    const two = editOwnedArray(cards, 'cards', ['cards'], { type: 'duplicate', index: 0 }, options).document
    expect(() => editOwnedArray(two, 'cards', ['cards'], { type: 'add', item: {} }, options)).toThrow('at most')
    expect(() => editOwnedArray(page, 'gallery', ['items', 0, 'media', 'items'], { type: 'add' }, options)).toThrow('schema-owned')
  })

  it('keeps unknown existing blocks opaque while restricting newly created content to the email schema', () => {
    const unknown = { id: 'unknown', blockType: 'futureEmailBlock', future: { id: 'external', children: [{ id: 'opaque' }] } }
    const page: PageDocument = { layout: [unknown, text('known')] }
    const updated = updateBlock(page, 'known', { align: 'center' }, options).document
    expect(updated.layout![0]).toEqual(unknown)
    expect(getSlots(updated, options)[0]!.items).toHaveLength(2)
    expect(() => duplicateBlock(updated, 'unknown', options)).toThrow('does not accept')
  })

  it('builds the palette from native email schemas and assigns all default array row IDs', () => {
    expect(getUnsteadyBlockGroups(schemas).flatMap(group => group.blocks.map(block => block.slug))).toEqual(schemas.map(block => block.slug))
    expect(schemas.every(schema => schema.slug.startsWith('email'))).toBe(true)
    const created = createUnsteadyBlock(schemas.find(schema => schema.slug === 'emailArticleTwoCards')!)
    const page = { layout: [created] }
    expect(ensureDocumentIds(page, options)).toBe(page)
    expect((created.cards as Array<{ id?: string }>).every(row => Boolean(row.id))).toBe(true)
  })
})
