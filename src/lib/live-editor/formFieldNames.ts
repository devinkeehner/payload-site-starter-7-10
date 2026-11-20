import { EMAIL_GRID_FIELDS, type BlockRecord, type PageDocument } from './document'

function mapFormFields(
  layout: BlockRecord[],
  update: (field: BlockRecord) => BlockRecord,
): BlockRecord[] {
  const next = layout.map((block) => {
    if (block.blockType !== 'emailGrid') return update(block)
    let row = block
    for (const column of EMAIL_GRID_FIELDS) {
      const fields = block[column]
      if (!Array.isArray(fields)) continue
      const updated = mapFormFields(fields, update)
      if (updated !== fields) row = { ...row, [column]: updated }
    }
    return row
  })
  return next.some((block, index) => block !== layout[index]) ? next : layout
}

/**
 * Apply the saved field names by ID because saving may regroup the native field widths.
 * Keep edits made since the save started, including moves and renames.
 */
export function reconcileSavedFormNames(
  submitted: PageDocument,
  persisted: PageDocument,
): (current: PageDocument) => PageDocument {
  const submittedNames = new Map<string, unknown>()
  const savedNames = new Map<string, string>()
  mapFormFields(submitted.layout ?? [], (field) => {
    if (field.id != null) submittedNames.set(String(field.id), field.name)
    return field
  })
  mapFormFields(persisted.layout ?? [], (field) => {
    if (field.id != null && typeof field.name === 'string') {
      const id = String(field.id)
      if (submittedNames.has(id) && field.name !== submittedNames.get(id)) {
        savedNames.set(id, field.name)
      }
    }
    return field
  })

  return (current) => {
    if (!current.layout || !savedNames.size) return current
    const layout = mapFormFields(current.layout, (field) => {
      if (field.id == null) return field
      const id = String(field.id)
      const name = savedNames.get(id)
      return name !== undefined && field.name === submittedNames.get(id)
        ? { ...field, name }
        : field
    })
    return layout === current.layout ? current : { ...current, layout }
  }
}
