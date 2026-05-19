export function getPuckInnerItemAttributes(
  arrayName: string,
  index: number,
  label?: string | number | null,
) {
  return {
    'data-puck-array': arrayName,
    'data-puck-index': String(index),
    'data-puck-inner-item': 'true',
    draggable: true,
    ...(label ? { 'data-puck-label': String(label) } : {}),
  }
}
