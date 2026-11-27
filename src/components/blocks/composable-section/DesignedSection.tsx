import { Fragment, type CSSProperties, type ReactNode } from 'react'

const tags = ['div', 'header', 'aside', 'section', 'footer'] as const
type DesignTag = typeof tags[number]

const properties = [
  'display', 'gridTemplateColumns', 'gap', 'columnGap', 'rowGap', 'flexDirection',
  'flexWrap', 'alignItems', 'alignContent', 'justifyContent', 'alignSelf',
  'padding', 'paddingBlock', 'paddingInline', 'margin', 'marginBlock', 'marginInline',
  'maxWidth', 'width', 'minHeight', 'backgroundColor', 'color', 'border',
  'borderTop', 'borderBottom', 'borderRadius', 'fontFamily', 'fontSize', 'fontWeight',
  'lineHeight', 'letterSpacing', 'textAlign', 'textTransform',
] as const

type DesignStyle = Partial<Record<typeof properties[number], string>>
export type DesignNode = {
  tag?: DesignTag
  field?: string
  style?: DesignStyle
  children?: DesignNode[]
}

const safeValue = /^[a-z\d#% .(),+*/'-]{1,120}$/i
const supportedFunctions = new Set(['rgb', 'rgba', 'hsl', 'hsla', 'clamp', 'min', 'max', 'calc', 'minmax', 'repeat'])
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

export function parseDesignLayout(input: unknown): DesignNode {
  let count = 0
  const fields = new Set<string>()
  function visit(value: unknown, depth: number): DesignNode {
    if (!record(value) || depth > 8 || ++count > 64) throw new Error('Use a design tree with at most 64 nodes and 8 levels.')
    if (Object.keys(value).some(key => !['tag', 'field', 'style', 'children'].includes(key))) {
      throw new Error('Design nodes accept tag, field, style and children only.')
    }
    const node: DesignNode = {}
    if (value.style !== undefined) {
      if (!record(value.style)) throw new Error('Use a style object on each design node.')
      const style: DesignStyle = {}
      for (const [name, entry] of Object.entries(value.style)) {
        const property = properties.find(key => key === name)
        if (!property || typeof entry !== 'string' || !safeValue.test(entry) || entry.includes('/*') ||
            [...entry.matchAll(/([a-z-]+)\s*\(/gi)].some(match => !supportedFunctions.has(match[1]!.toLowerCase()))) {
          throw new Error(`Unsupported design style: ${name}.`)
        }
        style[property] = entry
      }
      node.style = style
    }
    if (value.field !== undefined) {
      if (value.tag !== undefined || value.children !== undefined || typeof value.field !== 'string' ||
          !value.field.trim() || value.field.trim() !== value.field || value.field.length > 80 || fields.has(value.field)) {
        throw new Error('Use a unique editable field label of up to 80 characters on each leaf.')
      }
      fields.add(value.field)
      return { ...node, field: value.field }
    }
    const tag = tags.find(name => name === (value.tag ?? 'div'))
    if (!tag || !Array.isArray(value.children) || !value.children.length) {
      throw new Error('Use div, header, aside, section or footer with at least one child.')
    }
    return { ...node, tag, children: value.children.map(child => visit(child, depth + 1)) }
  }
  const layout = visit(input, 1)
  if (layout.field || !fields.size) throw new Error('Use a container with at least one editable field.')
  return layout
}

type DesignNodeControls = { attributes?: Record<`data-${string}`, string | number | boolean | undefined>; handle?: ReactNode }

function designNodeKey(node: DesignNode): string {
  if (node.field) return node.field
  return node.children!.map(designNodeKey).reduce((first, name) => name < first ? name : first)
}

export function DesignedSection({ layout, blocks, renderField, nodeControls, className = '', gridClassName = '' }: {
  layout: unknown
  blocks: Record<string, unknown>[]
  renderField: (block: Record<string, unknown>, index: number, path?: number[], siblingCount?: number) => ReactNode
  nodeControls?: (node: DesignNode, path: number[], siblingCount: number) => DesignNodeControls
  className?: string
  gridClassName?: string
}) {
  let design: DesignNode
  try { design = parseDesignLayout(layout) } catch {
    return <>{blocks.map((block, index) =>
      <Fragment key={String(block.id ?? index)}>{renderField(block, index)}</Fragment>
    )}</>
  }
  const unused = new Set(blocks.keys())
  function render(node: DesignNode, path: number[], siblingCount: number): ReactNode {
    const { gridTemplateColumns, ...style } = node.style ?? {}
    const css = { ...style, '--design-columns': gridTemplateColumns } as CSSProperties
    const classNames = gridTemplateColumns ? `${className} ${gridClassName}` : className
    const controls = nodeControls?.(node, path, siblingCount)
    if (node.field) {
      const match = blocks.findIndex((block, i) => unused.has(i) && block.blockName === node.field)
      if (match < 0) return null
      unused.delete(match)
      return <div key={node.field} className={classNames} data-designed-field style={css} {...controls?.attributes}>{renderField(blocks[match]!, match, path, siblingCount)}</div>
    }
    const Tag = node.tag ?? 'div'
    return <Tag key={designNodeKey(node)} className={classNames} style={css} {...controls?.attributes}>
      {controls?.handle}
      {node.children?.map((child, index, siblings) => render(child, [...path, index], siblings.length))}
    </Tag>
  }
  const rendered = render(design, [], 1)
  return <>{rendered}{[...unused].map(index =>
    <Fragment key={String(blocks[index]!.id ?? index)}>{renderField(blocks[index]!, index)}</Fragment>
  )}</>
}
