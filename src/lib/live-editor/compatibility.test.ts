import { describe, expect, it } from 'vitest'
import { renderEmail } from '@/lib/email/renderEmail'
import { getEmailPuckBlockSchema } from '@/lib/puck/schema'
import { applyEditorCommand } from './agent'
import { ensureDocumentIds, getBlock, moveBlock, ROOT_SLOT, type BlockRecord, type PageDocument } from './document'
import { buildNativeEmailDraftPatch } from './emailDraft'
import { createLexicalValueFromText } from './lexical'

const schemas = getEmailPuckBlockSchema()
const fields = [{ name: 'layout', type: 'blocks', blocks: schemas }]
const render = (page: PageDocument) => renderEmail({ layout: page.layout, preheader: 'A town update', origin: 'https://example.gov' })
const persisted = (page: PageDocument): PageDocument => buildNativeEmailDraftPatch(JSON.parse(JSON.stringify(page)), fields, schemas)

function legacyEmail(): PageDocument {
  const formatted = createLexicalValueFromText('Formatted native copy') as unknown as { root: { children: Array<{ children: Array<Record<string, unknown>> }> } }
  formatted.root.children[0]!.children[0]!.format = 1
  return {
    title: 'Town news', subject: 'Community update', tenant: 'protected-tenant', sendStatus: 'draft',
    layout: [
      { blockType: 'emailHeading', text: 'November town news', level: 'h1', align: 'left', preserved: { future: true } },
      { blockType: 'emailGrid', layout: 'threeColumns', leftBlocks: [
        { blockType: 'emailText', text: 'Legacy native text', align: 'left' },
      ], centerBlocks: [{ blockType: 'emailText', text: formatted, color: 'primary' }], rightBlocks: [
        { blockType: 'emailButton', label: 'Read the agenda', url: 'https://example.gov/agenda', variant: 'primary' },
      ], fourthBlocks: [{ blockType: 'emailHeading', text: 'Hidden column copy', level: 'h2' }], unknown: 'Preserve grid extension' },
      { blockType: 'emailHeading', text: 'See you downtown', level: 'h2' },
    ],
  }
}

describe('production email renderer compatibility', () => {
  it('renders identical HTML and plain text before and after ID initialization and native serialization', async () => {
    const original = legacyEmail()
    let sequence = 0
    const initialized = ensureDocumentIds(original, { schemas, createId: () => `native-${++sequence}` })
    const serialized = persisted(initialized)
    const before = await render(original)
    const after = await render(serialized)
    expect(after).toEqual(before)
    expect(after.html).toMatch(/<span\s+style="font-weight:800"\s*>Formatted native\s+copy<\/span\s*>/)
    expect(after.html).toContain('https://example.gov/agenda')
    expect(after.text).toContain('Legacy native text')
    expect(after.text).not.toContain('Hidden column copy')
    expect(serialized.layout![0]).toMatchObject({ preserved: { future: true } })
    expect(serialized.layout![1]).toMatchObject({ unknown: 'Preserve grid extension', fourthBlocks: [{ text: 'Hidden column copy' }] })
    expect(original).toEqual(legacyEmail())
  })

  it('matches direct native rendering after a nested text edit and a block reorder', async () => {
    const original = ensureDocumentIds(legacyEmail(), { schemas })
    const grid = original.layout![1]!
    const left = (grid.leftBlocks as BlockRecord[])[0]!
    const last = original.layout![2]!
    const edited = applyEditorCommand(original, {
      type: 'edit_text', blockId: left.id!, path: ['text'], action: { type: 'plain', value: 'Updated meeting notice' },
    }, { schemas, revision: 0, expectedRevision: 0 })
    const reordered = moveBlock(edited.document, last.id!, ROOT_SLOT, original.layout![0]!.id!, { schemas }).document
    const expected = structuredClone(original)
    ;((expected.layout![1]!.leftBlocks as BlockRecord[])[0]!).text = createLexicalValueFromText('Updated meeting notice')
    expected.layout = [expected.layout![2]!, expected.layout![0]!, expected.layout![1]!]
    const actualRendered = await render(persisted(reordered))
    expect(actualRendered).toEqual(await render(expected))
    const plainText = actualRendered.text.toLowerCase()
    expect(plainText).toContain('see you downtown')
    expect(plainText.indexOf('see you downtown')).toBeLessThan(plainText.indexOf('november town news'))
    expect(actualRendered.text).toContain('Updated meeting notice')
    expect(actualRendered.text).not.toContain('Legacy native text')
    expect(actualRendered.html).toMatch(/<span\s+style="font-weight:800"\s*>Formatted native\s+copy<\/span\s*>/)
    expect(getBlock(reordered, (grid.centerBlocks as BlockRecord[])[0]!.id!, { schemas })).toEqual((grid.centerBlocks as BlockRecord[])[0])
    expect(reordered).toMatchObject({ tenant: 'protected-tenant', sendStatus: 'draft' })
  })
})
