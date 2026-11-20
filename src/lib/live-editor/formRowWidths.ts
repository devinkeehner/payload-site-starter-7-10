import { getEmailGridColumnFields, type BlockRecord } from './document'

const presetWidths = {
  oneColumn: [100],
  twoColumns: [50, 50],
  // The website's 12-column form grid maps values through 66 to eight columns.
  twoColumnsLeftWide: [66, 33],
  twoColumnsRightWide: [33, 66],
  threeColumns: [33, 33, 33],
  fourColumns: [25, 25, 25, 25],
} as const

export function getFormRowWidths(row: BlockRecord): readonly number[] {
  const widths = row.formColumnWidths
  if (
    row.layout === row.formWidthLayout &&
    Array.isArray(widths) &&
    widths.length === getEmailGridColumnFields(row.layout).length &&
    widths.every(
      (width) => typeof width === 'number' && Number.isFinite(width) && width >= 1 && width <= 100,
    )
  ) {
    return widths
  }
  const preset = String(row.layout)
  return Object.hasOwn(presetWidths, preset)
    ? presetWidths[preset as keyof typeof presetWidths]
    : presetWidths.twoColumns
}
