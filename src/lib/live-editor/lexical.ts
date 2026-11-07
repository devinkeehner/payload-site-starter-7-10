import type { SerializedEditorState } from 'lexical'

type LexicalRecord = Record<string, unknown>

type TextNode = {
  detail: 0
  format: 0
  mode: 'normal'
  style: string
  text: string
  type: 'text'
  version: 1
}

type LineBreakNode = {
  type: 'linebreak'
  version: 1
}

type RichTextBlockType = 'paragraph' | 'h1' | 'h2' | 'h3' | 'h4'

type CreateLexicalValueOptions = {
  alignment?: '' | 'center' | 'justify' | 'left' | 'right'
  blockType?: RichTextBlockType
  color?: string
}

export function isLexicalEditorState(value: unknown): value is LexicalRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && 'root' in value)
}

function createTextNode(text: string, color?: string): TextNode {
  return {
    detail: 0,
    format: 0,
    mode: 'normal',
    style: color ? `color: ${color}` : '',
    text,
    type: 'text',
    version: 1,
  }
}

function createInlineChildren(text: string, color?: string): Array<TextNode | LineBreakNode> {
  const parts = text.split(/\r?\n/)

  return parts.flatMap((part, index): Array<TextNode | LineBreakNode> => {
    const nodes: Array<TextNode | LineBreakNode> = []
    if (index > 0) {
      nodes.push({
        type: 'linebreak',
        version: 1,
      })
    }
    if (part) {
      nodes.push(createTextNode(part, color))
    }
    return nodes
  })
}

export function createLexicalValueFromText(
  text: string,
  options: CreateLexicalValueOptions = {},
): SerializedEditorState {
  const blockType = options.blockType || 'paragraph'
  const isHeading = blockType !== 'paragraph'
  const children = createInlineChildren(text, options.color)

  return {
    root: {
      children: [
        {
          children,
          direction: 'ltr',
          format: options.alignment || '',
          indent: 0,
          ...(isHeading ? { tag: blockType } : {}),
          textFormat: 0,
          textStyle: '',
          type: isHeading ? 'heading' : 'paragraph',
          version: 1,
        },
      ],
      direction: 'ltr',
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  } as unknown as SerializedEditorState
}

function getNodeChildren(node: unknown): unknown[] {
  return node && typeof node === 'object' && Array.isArray((node as { children?: unknown }).children)
    ? ((node as { children: unknown[] }).children)
    : []
}

function getNodeText(node: unknown): string {
  if (!node || typeof node !== 'object') return ''

  const record = node as LexicalRecord
  if (record.type === 'text') {
    return typeof record.text === 'string' ? record.text : ''
  }

  if (record.type === 'linebreak') {
    return '\n'
  }

  return getNodeChildren(record).map(getNodeText).join('')
}

export function getPlainTextFromLexical(value: unknown): string {
  if (!isLexicalEditorState(value)) return ''

  const root = (value.root && typeof value.root === 'object' ? value.root : {}) as LexicalRecord
  return getNodeChildren(root)
    .map(getNodeText)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
}
