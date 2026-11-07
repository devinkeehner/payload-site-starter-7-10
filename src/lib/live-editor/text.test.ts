import { describe, expect, it } from 'vitest'

import { createLexicalValueFromText, getPlainTextFromLexical } from './lexical'
import { applyUnsteadyTextAction, unsteadyTextOwner } from './text'
import { getUnsteadyCompanionFields, isUnsteadyCompanionTextField } from './textCapabilities'
import { canEditRichText, captureTextAddress, hasRichFormatting, readAddress, updateTextField } from './textFields'

type State = { root: { children: Array<Record<string, unknown>> } }
const rich = (text = 'Keep this formatting') => structuredClone(createLexicalValueFromText(text)) as unknown as State
const paragraph = (state: State) => state.root.children[0]!
const textNode = (state: State) => (paragraph(state).children as Array<Record<string, unknown>>)[0]!

function linked(url: string) {
  const state = rich('A safe link')
  paragraph(state).children = [{
    type: 'link', version: 3, id: 'native-link-id', direction: null, format: '', indent: 0,
    fields: { linkType: 'custom', newTab: true, url }, children: [textNode(state)],
  }]
  return state
}

describe('native email rich text', () => {
  it('creates native Lexical paragraphs and line breaks without companion storage', () => {
    const result = applyUnsteadyTextAction({ text: 'Legacy plain text', unknown: 42 }, ['text'], 'native', { type: 'plain', value: 'First\nSecond' })
    expect(getPlainTextFromLexical(result.text)).toBe('First\nSecond')
    expect(canEditRichText(result.text)).toBe(true)
    expect(result.unknown).toBe(42)
    expect(result).not.toHaveProperty('puckRichText')
    expect(unsteadyTextOwner({ text: 'Legacy' }, 'text', 'native').text).toEqual(createLexicalValueFromText('Legacy'))
  })

  it('preserves native formatting until explicitly removed', () => {
    const state = rich()
    textNode(state).format = 9 // bold + underline
    textNode(state).style = 'color: #7a0012'
    const owner = { text: state, extension: { preserved: true } }
    expect(hasRichFormatting(state)).toBe(true)
    expect(() => updateTextField(owner, 'text', 'native', { type: 'plain', value: 'Replacement' })).toThrow('explicitly')
    expect(owner.text).toEqual(state)
    const changed = updateTextField(owner, 'text', 'native', { type: 'replace-rich', value: 'Replacement', defaultBlock: 'h2' })
    expect(getPlainTextFromLexical(changed.text)).toBe('Replacement')
    expect((changed.text as State).root.children[0]).toMatchObject({ type: 'heading', tag: 'h2' })
    expect(changed.extension).toEqual(owner.extension)
  })

  it('keeps a native field in Lexical storage when UI mode changes', () => {
    const owner = { text: rich() }
    expect(updateTextField(owner, 'text', 'native', { type: 'mode', rich: false })).toBe(owner)
    expect(updateTextField(owner, 'text', 'native', { type: 'plain-from-rich' })).toBe(owner)
    expect(applyUnsteadyTextAction(owner, ['text'], 'native', { type: 'mode', rich: false })).toBe(owner)
  })

  it('preserves unsupported Lexical nodes and serialized metadata', () => {
    const state = rich()
    paragraph(state).children = [{ type: 'custom-government-widget', version: 8, preserved: { id: 'foreign' } }]
    const owner = { text: state }
    expect(canEditRichText(state)).toBe(false)
    expect(() => updateTextField(owner, 'text', 'native', { type: 'replace-rich', value: 'Replacement' })).toThrow('preserved')
    expect(owner.text).toEqual(state)
    const custom = rich()
    textNode(custom).futureMetadata = { id: 'preserve-me' }
    expect(canEditRichText(custom)).toBe(false)
  })

  it('accepts native links with stable IDs and clones incoming rich content', () => {
    const state = linked('https://example.gov/news')
    expect(canEditRichText(state)).toBe(true)
    const owner = updateTextField({ text: rich('Before') }, 'text', 'native', { type: 'rich', value: state })
    expect(owner.text).toEqual(state)
    expect(owner.text).not.toBe(state)
    ;((paragraph(state).children as Array<Record<string, unknown>>)[0]!.fields as Record<string, unknown>).url = 'https://changed.example.gov'
    expect(((paragraph(owner.text as State).children as Array<Record<string, unknown>>)[0]!.fields as Record<string, unknown>).url).toBe('https://example.gov/news')
  })

  it.each(['javascript:alert(1)', 'java\tscript:alert(1)', 'data:text/html,<script>bad</script>', 'vbscript:bad', 'file:///etc/passwd'])('rejects unsafe rich link protocol %s', url => {
    const state = linked(url)
    expect(canEditRichText(state)).toBe(false)
    expect(() => updateTextField({ text: rich() }, 'text', 'native', { type: 'rich', value: state })).toThrow('supported Lexical')
  })

  it('accepts Gov supported list and horizontal rule nodes', () => {
    const state = rich()
    state.root.children.push({ type: 'horizontalrule', version: 1 })
    state.root.children.push({
      type: 'list', version: 1, direction: null, format: '', indent: 0, listType: 'number', tag: 'ol', start: 1,
      children: [{ type: 'listitem', version: 1, direction: null, format: '', indent: 0, value: 1, children: [textNode(rich('First item'))] }],
    })
    expect(canEditRichText(state)).toBe(true)
    expect(hasRichFormatting(state)).toBe(true)
  })

  it('rejects malformed known nodes, cyclic trees, and unrecognized fields', () => {
    const invalid = rich()
    textNode(invalid).format = 'bold'
    expect(canEditRichText(invalid)).toBe(false)
    const nested = rich()
    paragraph(nested).children = [rich().root]
    expect(canEditRichText(nested)).toBe(false)
    const cyclic = rich()
    paragraph(cyclic).children = [paragraph(cyclic)]
    expect(canEditRichText(cyclic)).toBe(false)
    const malformed = rich()
    textNode(malformed).style = 'color: expression(alert(1))'
    expect(canEditRichText(malformed)).toBe(false)
    expect(canEditRichText({ root: { type: 'root', version: 1, children: [{ type: 'text', version: 1, text: 'Missing paragraph' }] } })).toBe(false)
  })

  it('keeps stable row addresses valid after rows move', () => {
    const state = { rows: [{ id: 'a', text: rich('First') }, { id: 'b', text: rich('Second') }] }
    const address = captureTextAddress(state, ['rows', 0, 'text'])
    const reordered = { rows: [state.rows[1]!, state.rows[0]!] }
    expect(getPlainTextFromLexical(readAddress(reordered, address))).toBe('First')
    const changed = applyUnsteadyTextAction(reordered, address, 'native', { type: 'plain', value: 'Updated first' })
    expect(getPlainTextFromLexical((changed.rows as typeof state.rows)[0]!.text)).toBe('Second')
    expect(getPlainTextFromLexical((changed.rows as typeof state.rows)[1]!.text)).toBe('Updated first')
    expect(getPlainTextFromLexical(state.rows[0]!.text)).toBe('First')
  })

  it('rejects unsafe text addresses and has no Campaign companion capabilities', () => {
    expect(() => readAddress({}, ['constructor', 'prototype'])).toThrow('Invalid text field')
    expect(isUnsteadyCompanionTextField('heroFamily', ['heading'])).toBe(false)
    expect(getUnsteadyCompanionFields('emailText', [])).toEqual([])
  })
})
