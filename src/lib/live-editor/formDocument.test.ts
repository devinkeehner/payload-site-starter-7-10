import { describe, expect, it } from 'vitest'

import { ensureDocumentIds, getSlots } from './document'
import {
  editorLayoutToFormFields,
  formFieldsToEditorLayout,
  getFormEditorSchema,
} from './formDocument'
import { getFormRowWidths } from './formRowWidths'
import { reconcileSavedFormNames } from './formFieldNames'

describe('shared editor form rows', () => {
  it('round-trips native field ordering, identifiers, fractional widths, and media', () => {
    const fields = [
      { blockType: 'message', id: 'intro', message: { root: { children: [] } } },
      { blockType: 'text', id: 'name', name: 'old_name', width: 42.5, label: 'Name' },
      {
        blockType: 'image-select',
        id: 'choice',
        name: 'image-choice',
        width: 57.5,
        options: [{ id: 'choice-1', label: 'Map', value: 'map', image: 'media-id' }],
      },
      { blockType: 'email', id: 'email', name: 'Email', required: true },
      { blockType: 'checkbox', id: 'yes', name: 'agree', width: 25, defaultValue: true },
    ]
    const schemas = getFormEditorSchema()
    const document = ensureDocumentIds(
      { collection: 'forms', layout: formFieldsToEditorLayout(fields) },
      { schemas },
    )
    const row = document.layout?.[1]
    expect(row?.blockType).toBe('emailGrid')
    expect(getFormRowWidths(row!)).toEqual([42.5, 57.5])
    const slots = getSlots(document, { schemas })
    expect(slots.find((slot) => slot.path === 'rightBlocks')?.items[0]?.id).toBe('choice')
    expect(slots.find((slot) => slot.path === 'rightBlocks')?.allowedSlugs).not.toContain('message')
    expect(editorLayoutToFormFields(document.layout, fields)).toEqual(fields)
  })

  it('writes native widths for a new row without persisting the row block', () => {
    const layout = [
      {
        blockType: 'emailGrid',
        id: 'row',
        layout: 'twoColumnsRightWide',
        leftBlocks: [{ blockType: 'email', name: 'email', width: 100 }],
        rightBlocks: [{ blockType: 'textarea', name: 'feedback' }],
      },
    ]
    expect(editorLayoutToFormFields(layout)).toEqual([
      { blockType: 'email', name: 'email', width: 33 },
      { blockType: 'textarea', name: 'feedback', width: 66 },
    ])
  })

  it('keeps existing submission keys when a copied field is moved ahead of the original', () => {
    const savedField = { blockType: 'text', id: 'original', name: 'firstName' }
    const layout = [{ ...savedField, id: 'copy' }, savedField]
    expect(editorLayoutToFormFields(layout, [savedField]).map((field) => field.name)).toEqual([
      'firstName2',
      'firstName',
    ])
  })

  it('keeps the widths of legacy rows that exceed the shared editor column count', () => {
    const fields = Array.from({ length: 5 }, (_, index) => ({
      blockType: 'text',
      id: `field-${index}`,
      name: `text${index}`,
      width: 20,
    }))
    expect(editorLayoutToFormFields(formFieldsToEditorLayout(fields), fields)).toEqual(fields)
  })

  it('rejects hidden fields and stacked columns without losing them on save', () => {
    const field = { blockType: 'text', name: 'name' }
    const row = { blockType: 'emailGrid', layout: 'twoColumns' }
    expect(() => editorLayoutToFormFields([{ ...row, centerBlocks: [field] }])).toThrow(
      'hidden column',
    )
    expect(() => editorLayoutToFormFields([{ ...row, rightBlocks: [field, field] }])).toThrow(
      'one field',
    )
  })

  it('adopts saved names after reordering without overwriting a concurrent rename', () => {
    const left = { blockType: 'text', id: 'field-1', name: 'textField' }
    const right = { blockType: 'text', id: 'field-2', name: 'textField' }
    const submitted = { layout: [left, right] }
    const row = {
      blockType: 'emailGrid',
      layout: 'twoColumns',
      leftBlocks: [left],
      rightBlocks: [{ ...right, name: 'textField2' }],
    }
    const reconcile = reconcileSavedFormNames(submitted, { layout: [row] })
    expect(reconcile({ layout: [right, left] }).layout).toEqual([
      { ...right, name: 'textField2' },
      left,
    ])
    const concurrent = { layout: [left, { ...right, name: 'address' }] }
    expect(reconcile(concurrent)).toBe(concurrent)
  })
})
