'use client'

import {
  $createHorizontalRuleNode,
  $createLinkNode,
  $isLinkNode,
  AutoLinkNode,
  BlockNode as PayloadBlockNode,
  HorizontalRuleNode,
  InlineBlockNode as PayloadInlineBlockNode,
  LinkNode,
  RelationshipNode,
  UploadNode,
} from '@payloadcms/richtext-lexical/client'
import {
  $createParagraphNode,
  $createRangeSelectionFromDom,
  $getSelection,
  $getNodeByKey,
  $insertNodes,
  $isElementNode,
  $isRangeSelection,
  $setSelection,
  COMMAND_PRIORITY_LOW,
  FORMAT_ELEMENT_COMMAND,
  SELECTION_CHANGE_COMMAND,
  type ElementFormatType,
  type EditorState,
  type LexicalNode,
  type NodeKey,
  type RangeSelection,
  type SerializedEditorState,
  type TextFormatType,
} from '@payloadcms/richtext-lexical/lexical'
import {
  $isListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListItemNode,
  ListNode,
} from '@payloadcms/richtext-lexical/lexical/list'
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  $isQuoteNode,
  HeadingNode,
  type HeadingTagType,
  QuoteNode,
} from '@payloadcms/richtext-lexical/lexical/rich-text'
import {
  $getSelectionStyleValueForProperty,
  $patchStyleText,
  $setBlocksType,
} from '@payloadcms/richtext-lexical/lexical/selection'
import { LexicalComposer, type InitialConfigType } from '@payloadcms/richtext-lexical/lexical/react/LexicalComposer'
import { useLexicalComposerContext } from '@payloadcms/richtext-lexical/lexical/react/LexicalComposerContext'
import { ContentEditable } from '@payloadcms/richtext-lexical/lexical/react/LexicalContentEditable'
import { LexicalErrorBoundary } from '@payloadcms/richtext-lexical/lexical/react/LexicalErrorBoundary'
import { HistoryPlugin } from '@payloadcms/richtext-lexical/lexical/react/LexicalHistoryPlugin'
import { ListPlugin } from '@payloadcms/richtext-lexical/lexical/react/LexicalListPlugin'
import { OnChangePlugin } from '@payloadcms/richtext-lexical/lexical/react/LexicalOnChangePlugin'
import { RichTextPlugin } from '@payloadcms/richtext-lexical/lexical/react/LexicalRichTextPlugin'
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type { PuckBlockSchema, PuckFieldSchema } from '@/lib/puck/types'

import { PuckMediaField } from './PuckMediaField'
import styles from './puck-page-builder.module.css'

type LexicalRecord = Record<string, unknown>
type LexicalBlockFields = Record<string, unknown> & {
  blockName?: string
  blockType?: string
  id?: string
}

type ActiveFormats = {
  alignment: ElementFormatType
  blockType: string
  bold: boolean
  code: boolean
  color: string
  italic: boolean
  strikethrough: boolean
  underline: boolean
}

const EMPTY_FORMATS: ActiveFormats = {
  alignment: '',
  blockType: 'paragraph',
  bold: false,
  code: false,
  color: '',
  italic: false,
  strikethrough: false,
  underline: false,
}

const TEXT_COLOR_OPTIONS = [
  {
    label: 'Default',
    swatch: 'linear-gradient(135deg, #fff 0 48%, #d1d5db 48% 52%, #f8fafc 52% 100%)',
    value: '',
  },
  {
    label: 'Foreground',
    swatch: 'var(--tenant-foreground, var(--foreground, #111827))',
    value: 'var(--tenant-foreground, var(--foreground, #111827))',
  },
  { label: 'White', swatch: '#ffffff', value: '#ffffff' },
  { label: 'Primary', swatch: 'var(--tenant-primary, #0b1e3a)', value: 'var(--tenant-primary)' },
  { label: 'Accent', swatch: 'var(--tenant-accent, #7a0012)', value: 'var(--tenant-accent)' },
]

type PuckLexicalBlockContextValue = {
  blockSchemas: PuckBlockSchema[]
  readOnly?: boolean
}

type PuckRichTextToolbarContextValue = {
  activeEditorId: string | null
  setActiveEditorId: React.Dispatch<React.SetStateAction<string | null>>
  target: HTMLElement | null
}

type PuckSpellCheckContextValue = {
  enabled: boolean
  toggle: () => void
}

const PuckLexicalBlockContext = React.createContext<PuckLexicalBlockContextValue>({
  blockSchemas: [],
})

const PuckRichTextToolbarContext = React.createContext<PuckRichTextToolbarContextValue | null>(null)
const PuckSpellCheckContext = React.createContext<PuckSpellCheckContextValue | null>(null)

export function PuckRichTextToolbarProvider({
  children,
  target,
}: {
  children: React.ReactNode
  target: HTMLElement | null
}) {
  const [activeEditorId, setActiveEditorId] = useState<string | null>(null)
  const value = useMemo(
    () => ({ activeEditorId, setActiveEditorId, target }),
    [activeEditorId, target],
  )

  return (
    <PuckRichTextToolbarContext.Provider value={value}>
      {children}
    </PuckRichTextToolbarContext.Provider>
  )
}

function getSerializedBlockFields(serializedNode: LexicalRecord): LexicalBlockFields {
  const fields = serializedNode.fields

  if (
    serializedNode.version === 1 &&
    fields &&
    typeof fields === 'object' &&
    !Array.isArray(fields) &&
    'data' in fields &&
    (fields as LexicalRecord).data &&
    typeof (fields as LexicalRecord).data === 'object'
  ) {
    return (fields as { data: LexicalBlockFields }).data
  }

  return fields && typeof fields === 'object' && !Array.isArray(fields)
    ? (fields as LexicalBlockFields)
    : { blockType: 'unknown' }
}

function withBlockId(fields: LexicalBlockFields): LexicalBlockFields {
  if (typeof fields.id === 'string' && fields.id) return fields

  return {
    ...fields,
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `puck-lexical-${Math.random().toString(36).slice(2)}`,
  }
}

function getDefaultFieldValue(field: PuckFieldSchema): unknown {
  if (typeof field.defaultValue !== 'undefined') return field.defaultValue

  switch (field.type) {
    case 'array':
    case 'blocks':
      return []
    case 'checkbox':
      return false
    case 'group':
      return createDefaultFields(field.fields || [])
    case 'number':
    case 'relationship':
    case 'upload':
      return null
    case 'richText':
      return createEmptyLexicalValue()
    default:
      return ''
  }
}

function createDefaultFields(fields: PuckFieldSchema[]): LexicalBlockFields {
  return fields.reduce<LexicalBlockFields>((acc, field) => {
    if (field.name === '__row') {
      return {
        ...acc,
        ...createDefaultFields(field.fields || []),
      }
    }

    if (field.type === 'collapsible') {
      return {
        ...acc,
        ...createDefaultFields(field.fields || []),
      }
    }

    acc[field.name] = getDefaultFieldValue(field)
    return acc
  }, {})
}

function createDefaultBlockFields(schema: PuckBlockSchema): LexicalBlockFields {
  return withBlockId({
    ...createDefaultFields(schema.fields),
    blockType: schema.slug,
  })
}

function createBlockNodeArgs({
  cacheBuster,
  fields,
  format,
  key,
}: {
  cacheBuster?: number
  fields: LexicalBlockFields
  format?: ElementFormatType
  key?: NodeKey
}): ConstructorParameters<typeof PayloadBlockNode>[0] {
  return {
    cacheBuster,
    fields: withBlockId(fields),
    format,
    key,
  } as ConstructorParameters<typeof PayloadBlockNode>[0]
}

function createInlineBlockNodeArgs({
  cacheBuster,
  fields,
  key,
}: {
  cacheBuster?: number
  fields: LexicalBlockFields
  key?: NodeKey
}): ConstructorParameters<typeof PayloadInlineBlockNode>[0] {
  return {
    cacheBuster,
    fields: withBlockId(fields),
    key,
  } as ConstructorParameters<typeof PayloadInlineBlockNode>[0]
}

class PuckBlockNode extends PayloadBlockNode {
  static override clone(node: PayloadBlockNode): PuckBlockNode {
    const format = (node as unknown as { getFormatType?: () => ElementFormatType }).getFormatType?.()

    return new PuckBlockNode(
      createBlockNodeArgs({
        cacheBuster: node.getCacheBuster(),
        fields: node.getFields() as LexicalBlockFields,
        format,
        key: node.getKey(),
      }),
    )
  }

  static override importJSON(serializedNode: LexicalRecord): PuckBlockNode {
    const node = new PuckBlockNode(
      createBlockNodeArgs({
        fields: getSerializedBlockFields(serializedNode),
      }),
    )

    if (typeof serializedNode.format === 'string') {
      node.setFormat(serializedNode.format as ElementFormatType)
    }

    return node
  }

  override decorate(): React.ReactElement {
    return (
      <LexicalBlockPlaceholder
        fields={this.getFields() as LexicalBlockFields}
        inline={false}
        nodeKey={this.getKey()}
      />
    )
  }
}

class PuckInlineBlockNode extends PayloadInlineBlockNode {
  static override clone(node: PayloadInlineBlockNode): PuckInlineBlockNode {
    return new PuckInlineBlockNode(
      createInlineBlockNodeArgs({
        cacheBuster: node.getCacheBuster(),
        fields: node.getFields() as LexicalBlockFields,
        key: node.getKey(),
      }),
    )
  }

  static override importJSON(serializedNode: LexicalRecord): PuckInlineBlockNode {
    return new PuckInlineBlockNode(
      createInlineBlockNodeArgs({
        fields: getSerializedBlockFields(serializedNode),
      }),
    )
  }

  override decorate(): React.ReactElement {
    return (
      <LexicalBlockPlaceholder
        fields={this.getFields() as LexicalBlockFields}
        inline
        nodeKey={this.getKey()}
      />
    )
  }
}

const lexicalTheme: InitialConfigType['theme'] = {
  heading: {
    h1: styles.richTextHeading1,
    h2: styles.richTextHeading2,
    h3: styles.richTextHeading3,
    h4: styles.richTextHeading4,
    h5: styles.richTextHeading5,
    h6: styles.richTextHeading6,
  },
  hr: styles.richTextHr,
  link: styles.richTextLink,
  list: {
    listitem: styles.richTextListItem,
    ol: styles.richTextOrderedList,
    ul: styles.richTextUnorderedList,
  },
  paragraph: styles.richTextParagraph,
  quote: styles.richTextQuote,
  text: {
    bold: styles.richTextBold,
    code: styles.richTextCode,
    italic: styles.richTextItalic,
    strikethrough: styles.richTextStrikethrough,
    underline: styles.richTextUnderline,
  },
}

function isLexicalEditorState(value: unknown): value is LexicalRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && 'root' in value)
}

function createEmptyLexicalValue(text = ''): SerializedEditorState {
  return {
    root: {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: text
            ? [
                {
                  type: 'text',
                  detail: 0,
                  format: 0,
                  mode: 'normal',
                  style: '',
                  text,
                  version: 1,
                },
              ]
            : [],
          direction: null,
          format: '',
          indent: 0,
          version: 1,
        },
      ],
      direction: null,
      format: '',
      indent: 0,
      version: 1,
    },
  } as unknown as SerializedEditorState
}

function normalizeLexicalValue(value: unknown): SerializedEditorState {
  if (isLexicalEditorState(value)) {
    return value as unknown as SerializedEditorState
  }

  return createEmptyLexicalValue(typeof value === 'string' ? value : '')
}

function serializeLexicalValue(value: SerializedEditorState): string {
  return JSON.stringify(value)
}

function ToolbarButton({
  active,
  children,
  disabled,
  onClick,
  title,
}: {
  active?: boolean
  children: React.ReactNode
  disabled?: boolean
  onClick: () => void
  title: string
}) {
  const handledPointerRef = useRef(false)

  const runAction = useCallback(() => {
    if (!disabled) {
      onClick()
    }
  }, [disabled, onClick])

  return (
    <button
      aria-pressed={active ? 'true' : 'false'}
      className={styles.richTextToolbarButton}
      data-active={active ? 'true' : undefined}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation()
        if (handledPointerRef.current) {
          handledPointerRef.current = false
          return
        }

        runAction()
      }}
      onMouseDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
        handledPointerRef.current = true
        runAction()
      }}
      title={title}
      type="button"
    >
      {children}
    </button>
  )
}

function ToolbarColorButton({
  active,
  disabled,
  onSelect,
  option,
}: {
  active?: boolean
  disabled?: boolean
  onSelect: () => void
  option: { label: string, swatch: string, value: string }
}) {
  const handledPointerRef = useRef(false)

  const runAction = useCallback(() => {
    if (!disabled) {
      onSelect()
    }
  }, [disabled, onSelect])

  return (
    <button
      aria-checked={active}
      className={styles.richTextColorButton}
      data-active={active ? 'true' : undefined}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation()
        if (handledPointerRef.current) {
          handledPointerRef.current = false
          return
        }

        runAction()
      }}
      onMouseDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
        handledPointerRef.current = true
        runAction()
      }}
      role="radio"
      title={option.label}
      type="button"
    >
      <span
        aria-hidden="true"
        className={styles.richTextColorSwatch}
        style={{ background: option.swatch }}
      />
    </button>
  )
}

function getBlockLabel(fields: LexicalBlockFields, schema?: PuckBlockSchema): string {
  const explicit = fields.blockName || fields.label || fields.title || fields.heading

  if (typeof explicit === 'string' && explicit.trim()) return explicit
  if (schema?.label) return schema.label
  if (typeof fields.blockType === 'string' && fields.blockType.trim()) return fields.blockType

  return 'Lexical block'
}

function updateNestedField(
  value: LexicalBlockFields,
  name: string,
  nextValue: unknown,
): LexicalBlockFields {
  return {
    ...value,
    [name]: nextValue,
  }
}

function getRenderableFields(fields: PuckFieldSchema[]): PuckFieldSchema[] {
  return fields.flatMap((field) => {
    if (field.name === '__row') return field.fields || []
    return [field]
  })
}

function GenericFieldEditor({
  field,
  onChange,
  readOnly,
  value,
}: {
  field: PuckFieldSchema
  onChange: (value: unknown) => void
  readOnly?: boolean
  value: unknown
}) {
  if (field.name === '__row') {
    return (
      <div className={styles.lexicalBlockFieldGrid}>
        {getRenderableFields(field.fields || []).map((childField) => (
          <GenericFieldEditor
            key={childField.name}
            field={childField}
            value={(value as Record<string, unknown> | undefined)?.[childField.name]}
            onChange={(nextValue) => {
              const record = value && typeof value === 'object' && !Array.isArray(value)
                ? (value as LexicalBlockFields)
                : {}
              onChange(updateNestedField(record, childField.name, nextValue))
            }}
            readOnly={readOnly}
          />
        ))}
      </div>
    )
  }

  if (field.type === 'collapsible') {
    return (
      <details className={styles.lexicalBlockFieldset} open>
        <summary>{field.label || field.name}</summary>
        {getRenderableFields(field.fields || []).map((childField) => (
          <GenericFieldEditor
            key={childField.name}
            field={childField}
            value={(value as Record<string, unknown> | undefined)?.[childField.name]}
            onChange={(nextValue) => {
              const record = value && typeof value === 'object' && !Array.isArray(value)
                ? (value as LexicalBlockFields)
                : {}
              onChange(updateNestedField(record, childField.name, nextValue))
            }}
            readOnly={readOnly}
          />
        ))}
      </details>
    )
  }

  const label = field.label || field.name

  switch (field.type) {
    case 'text':
    case 'email':
    case 'date':
      return (
        <label className={styles.lexicalBlockField}>
          <span>{label}</span>
          <input
            type={field.type === 'email' ? 'email' : field.type === 'date' ? 'date' : 'text'}
            value={typeof value === 'string' || typeof value === 'number' ? String(value) : ''}
            disabled={readOnly}
            spellCheck={field.type === 'text'}
            onChange={(event) => onChange(event.target.value)}
          />
        </label>
      )
    case 'textarea':
    case 'code':
      return (
        <label className={styles.lexicalBlockField}>
          <span>{label}</span>
          <textarea
            value={typeof value === 'string' ? value : ''}
            disabled={readOnly}
            spellCheck={field.type === 'textarea'}
            onChange={(event) => onChange(event.target.value)}
          />
        </label>
      )
    case 'number':
      return (
        <label className={styles.lexicalBlockField}>
          <span>{label}</span>
          <input
            type="number"
            value={typeof value === 'number' || typeof value === 'string' ? String(value) : ''}
            disabled={readOnly}
            onChange={(event) => onChange(event.target.value === '' ? undefined : Number(event.target.value))}
          />
        </label>
      )
    case 'checkbox':
      return (
        <label className={styles.lexicalBlockCheckboxField}>
          <input
            type="checkbox"
            checked={Boolean(value)}
            disabled={readOnly}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span>{label}</span>
        </label>
      )
    case 'select':
    case 'radio':
      return (
        <label className={styles.lexicalBlockField}>
          <span>{label}</span>
          <select
            value={typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : ''}
            disabled={readOnly}
            onChange={(event) => onChange(event.target.value)}
          >
            <option value="">Default</option>
            {(field.options || []).map((option) => (
              <option key={String(option.value)} value={String(option.value)}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )
    case 'upload':
      return (
        <div className={styles.lexicalBlockField}>
          <span>{label}</span>
          <PuckMediaField value={value} onChange={onChange} readOnly={readOnly} />
        </div>
      )
    case 'array': {
      const rows = Array.isArray(value) ? value : []

      return (
        <div className={styles.lexicalBlockArrayField}>
          <div className={styles.lexicalBlockArrayHeader}>
            <span>{label}</span>
            <button
              type="button"
              disabled={readOnly}
              onClick={() => {
                const nextRow = getRenderableFields(field.fields || []).reduce<Record<string, unknown>>((acc, childField) => {
                  if (childField.name !== '__row') {
                    acc[childField.name] = childField.defaultValue ?? ''
                  }
                  return acc
                }, {})
                onChange([...rows, nextRow])
              }}
            >
              Add
            </button>
          </div>
          {rows.map((row, index) => (
            <div className={styles.lexicalBlockArrayItem} key={index}>
              {getRenderableFields(field.fields || []).map((childField) => (
                <GenericFieldEditor
                  key={childField.name}
                  field={childField}
                  value={(row as Record<string, unknown> | undefined)?.[childField.name]}
                  onChange={(nextValue) => {
                    const nextRows = [...rows]
                    const record = row && typeof row === 'object' && !Array.isArray(row) ? row as LexicalBlockFields : {}
                    nextRows[index] = updateNestedField(record, childField.name, nextValue)
                    onChange(nextRows)
                  }}
                  readOnly={readOnly}
                />
              ))}
              <button
                type="button"
                disabled={readOnly}
                onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}
              >
                Remove item
              </button>
            </div>
          ))}
        </div>
      )
    }
    case 'group': {
      const record = value && typeof value === 'object' && !Array.isArray(value)
        ? (value as LexicalBlockFields)
        : {}

      return (
        <fieldset className={styles.lexicalBlockFieldset}>
          <legend>{label}</legend>
          {getRenderableFields(field.fields || []).map((childField) => (
            <GenericFieldEditor
              key={childField.name}
              field={childField}
              value={record[childField.name]}
              onChange={(nextValue) => onChange(updateNestedField(record, childField.name, nextValue))}
              readOnly={readOnly}
            />
          ))}
        </fieldset>
      )
    }
    default:
      return (
        <div className={styles.lexicalBlockField}>
          <span>{label}</span>
          <JsonEditor value={value} onChange={onChange} readOnly={readOnly} />
        </div>
      )
  }
}

function LexicalBlockPlaceholder({
  fields,
  inline,
  nodeKey,
}: {
  fields: LexicalBlockFields
  inline?: boolean
  nodeKey: NodeKey
}) {
  const [editor] = useLexicalComposerContext()
  const { blockSchemas, readOnly } = React.useContext(PuckLexicalBlockContext)
  const [isOpen, setIsOpen] = useState(false)
  const [draft, setDraft] = useState<LexicalBlockFields>(fields)
  const blockType = typeof fields.blockType === 'string' ? fields.blockType : ''
  const schema = blockSchemas.find((candidate) => candidate.slug === blockType)
  const label = getBlockLabel(fields, schema)

  useEffect(() => {
    if (!isOpen) setDraft(fields)
  }, [fields, isOpen])

  const saveDraft = useCallback(() => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (
        node &&
        typeof (node as { setFields?: unknown }).setFields === 'function'
      ) {
        ;(node as unknown as { setFields: (fields: LexicalBlockFields) => void }).setFields({
          ...draft,
          blockType: blockType || draft.blockType,
        })
      }
    })
    setIsOpen(false)
  }, [blockType, draft, editor, nodeKey])

  const removeNode = useCallback(() => {
    editor.update(() => {
      $getNodeByKey(nodeKey)?.remove()
    })
    setIsOpen(false)
  }, [editor, nodeKey])

  const chip = (
    <button
      className={inline ? styles.lexicalInlineBlockChip : styles.lexicalBlockChip}
      contentEditable={false}
      disabled={readOnly}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        setDraft(fields)
        setIsOpen(true)
      }}
      type="button"
    >
      {inline ? 'Inline block' : 'Block'}: {label}
    </button>
  )

  return (
    <>
      {chip}
      {isOpen ? (
        <div className={styles.lexicalBlockModalBackdrop} role="presentation">
          <div
            aria-modal="true"
            className={styles.lexicalBlockModal}
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.lexicalBlockModalHeader}>
              <div>
                <strong>{label}</strong>
                <span>{blockType || 'unknown'}</span>
              </div>
              <button type="button" onClick={() => setIsOpen(false)}>
                Close
              </button>
            </div>
            <div className={styles.lexicalBlockModalBody}>
              {schema ? (
                getRenderableFields(schema.fields).map((field) => (
                  <GenericFieldEditor
                    key={field.name}
                    field={field}
                    value={draft[field.name]}
                    onChange={(nextValue) => setDraft((current) => updateNestedField(current, field.name, nextValue))}
                    readOnly={readOnly}
                  />
                ))
              ) : (
                <JsonEditor value={draft} onChange={(nextValue) => setDraft(nextValue as LexicalBlockFields)} readOnly={readOnly} />
              )}
            </div>
            <div className={styles.lexicalBlockModalFooter}>
              <button type="button" onClick={removeNode} disabled={readOnly}>
                Remove
              </button>
              <button type="button" onClick={saveDraft} disabled={readOnly}>
                Save block
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

function getSelectionBlockType(): string {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return 'paragraph'

  const anchorNode = selection.anchor.getNode()
  const element = anchorNode.getKey() === 'root' ? anchorNode : anchorNode.getTopLevelElementOrThrow()
  const parent = element.getParent()

  if ($isHeadingNode(element)) return element.getTag()
  if ($isQuoteNode(element)) return 'quote'
  if ($isListNode(element)) return element.getListType()
  if ($isListNode(parent)) return parent.getListType()

  return element.getType()
}

function getSelectionAlignment(): ElementFormatType {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return ''

  const anchorNode = selection.anchor.getNode()
  const element = anchorNode.getKey() === 'root' ? anchorNode : anchorNode.getTopLevelElementOrThrow()
  const parent = element.getParent()

  if ($isElementNode(element)) return element.getFormatType()
  if ($isElementNode(parent)) return parent.getFormatType()

  return ''
}

function getLinkAncestor(node: LexicalNode) {
  let parent = node.getParent()

  while (parent) {
    if ($isLinkNode(parent)) return parent
    parent = parent.getParent()
  }

  return null
}

function unwrapLinkNode(linkNode: LinkNode) {
  const children = linkNode.getChildren()
  children.forEach((child) => linkNode.insertBefore(child))
  linkNode.remove()
}

function applyCustomLink(url: string | null) {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return

  const nodes = selection.extract()

  if (!url) {
    nodes.forEach((node) => {
      const linkNode = $isLinkNode(node) ? node : getLinkAncestor(node)
      if (linkNode) unwrapLinkNode(linkNode)
    })
    return
  }

  if (nodes.length === 0) return

  const firstNode = nodes[0]!
  const existingLink = $isLinkNode(firstNode) ? firstNode : getLinkAncestor(firstNode)

  if (existingLink) {
    existingLink.setFields({
      doc: null,
      linkType: 'custom',
      newTab: false,
      url,
    })
    return
  }

  const linkNode = $createLinkNode({
    fields: {
      doc: null,
      linkType: 'custom',
      newTab: false,
      url,
    },
  })

  firstNode.insertBefore(linkNode)

  nodes.forEach((node) => {
    if ($isElementNode(node) && !node.isInline()) return

    if ($isLinkNode(node)) {
      linkNode.append(...node.getChildren())
      node.remove()
      return
    }

    linkNode.append(node)
  })
}

function RichTextToolbar({ readOnly }: { readOnly?: boolean }) {
  const [editor] = useLexicalComposerContext()
  const { blockSchemas } = React.useContext(PuckLexicalBlockContext)
  const spellCheck = React.useContext(PuckSpellCheckContext)
  const [activeFormats, setActiveFormats] = useState<ActiveFormats>(EMPTY_FORMATS)
  const [selectedBlockType, setSelectedBlockType] = useState(() => blockSchemas[0]?.slug || '')
  const lastRangeSelectionRef = useRef<RangeSelection | null>(null)

  useEffect(() => {
    if (!blockSchemas.length) return
    setSelectedBlockType((current) => (
      current && blockSchemas.some((schema) => schema.slug === current)
        ? current
        : blockSchemas[0]?.slug || ''
    ))
  }, [blockSchemas])

  const updateToolbarState = useCallback(() => {
    const selection = $getSelection()
    if (!$isRangeSelection(selection)) {
      setActiveFormats(EMPTY_FORMATS)
      return
    }

    lastRangeSelectionRef.current = selection.clone()

    setActiveFormats({
      alignment: getSelectionAlignment(),
      blockType: getSelectionBlockType(),
      bold: selection.hasFormat('bold'),
      code: selection.hasFormat('code'),
      color: $getSelectionStyleValueForProperty(selection, 'color', ''),
      italic: selection.hasFormat('italic'),
      strikethrough: selection.hasFormat('strikethrough'),
      underline: selection.hasFormat('underline'),
    })
  }, [])

  useEffect(() => {
    const unregisterUpdate = editor.registerUpdateListener(({ editorState }) => {
      editorState.read(updateToolbarState)
    })

    const unregisterSelection = editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        updateToolbarState()
        return false
      },
      COMMAND_PRIORITY_LOW,
    )

    return () => {
      unregisterUpdate()
      unregisterSelection()
    }
  }, [editor, updateToolbarState])

  const restoreToolbarSelection = useCallback((): RangeSelection | null => {
    const rootElement = editor.getRootElement()
    const domSelection = rootElement?.ownerDocument.getSelection() ?? null
    const domRangeSelection = domSelection && domSelection.rangeCount > 0
      ? $createRangeSelectionFromDom(domSelection, editor)
      : null

    if ($isRangeSelection(domRangeSelection)) {
      $setSelection(domRangeSelection)
      lastRangeSelectionRef.current = domRangeSelection.clone()
      return domRangeSelection
    }

    const selection = $getSelection()
    if ($isRangeSelection(selection)) {
      lastRangeSelectionRef.current = selection.clone()
      return selection
    }

    const lastSelection = lastRangeSelectionRef.current
    if (!lastSelection) return null

    try {
      const restoredSelection = lastSelection.clone()
      $setSelection(restoredSelection)
      return restoredSelection
    } catch {
      lastRangeSelectionRef.current = null
      return null
    }
  }, [editor])

  const runToolbarUpdate = useCallback(
    (callback: (selection: RangeSelection | null) => void) => {
      editor.update(
        () => {
          const selection = restoreToolbarSelection()
          callback(selection)

          const nextSelection = $getSelection()
          if ($isRangeSelection(nextSelection)) {
            lastRangeSelectionRef.current = nextSelection.clone()
          }
        },
        {
          discrete: true,
          onUpdate: () => {
            editor.focus(undefined, { defaultSelection: 'rootEnd' })
          },
        },
      )
    },
    [editor, restoreToolbarSelection],
  )

  const formatText = useCallback(
    (format: TextFormatType) => {
      runToolbarUpdate((selection) => {
        selection?.formatText(format)
      })
    },
    [runToolbarUpdate],
  )

  const formatBlock = useCallback(
    (blockType: 'paragraph' | 'quote' | HeadingTagType) => {
      runToolbarUpdate((selection) => {
        if (!selection) return

        if (blockType === 'paragraph') {
          $setBlocksType(selection, () => $createParagraphNode())
          return
        }

        if (blockType === 'quote') {
          $setBlocksType(selection, () => $createQuoteNode())
          return
        }

        $setBlocksType(selection, () => $createHeadingNode(blockType))
      })
    },
    [runToolbarUpdate],
  )

  const formatAlignment = useCallback(
    (alignment: ElementFormatType) => {
      runToolbarUpdate(() => {
        editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, alignment)
      })
    },
    [editor, runToolbarUpdate],
  )

  const setTextColor = useCallback(
    (color: string) => {
      runToolbarUpdate((selection) => {
        if (selection) {
          $patchStyleText(selection, { color: color || null })
        }
      })
    },
    [runToolbarUpdate],
  )

  const insertHorizontalRule = useCallback(() => {
    runToolbarUpdate(() => {
      $insertNodes([$createHorizontalRuleNode()])
    })
  }, [runToolbarUpdate])

  const insertLexicalBlock = useCallback(
    () => {
      const schema = blockSchemas.find((candidate) => candidate.slug === selectedBlockType)
      if (!schema) return

      runToolbarUpdate(() => {
        const fields = createDefaultBlockFields(schema)
        const node = new PuckBlockNode(createBlockNodeArgs({ fields }))

        $insertNodes([node])
      })
    },
    [blockSchemas, runToolbarUpdate, selectedBlockType],
  )

  const setLink = useCallback(() => {
    const url = window.prompt('Link URL')
    if (url === null) return

    runToolbarUpdate(() => {
      if (!url.trim()) {
        applyCustomLink(null)
        return
      }

      applyCustomLink(url.trim())
    })
  }, [runToolbarUpdate])

  return (
    <>
      <div className={styles.richTextToolbar} role="toolbar">
        <ToolbarButton
          active={activeFormats.bold}
          disabled={readOnly}
          title="Bold"
          onClick={() => formatText('bold')}
        >
          B
        </ToolbarButton>
        <ToolbarButton
          active={activeFormats.italic}
          disabled={readOnly}
          title="Italic"
          onClick={() => formatText('italic')}
        >
          I
        </ToolbarButton>
        <ToolbarButton
          active={activeFormats.underline}
          disabled={readOnly}
          title="Underline"
          onClick={() => formatText('underline')}
        >
          U
        </ToolbarButton>
        <ToolbarButton
          active={activeFormats.strikethrough}
          disabled={readOnly}
          title="Strikethrough"
          onClick={() => formatText('strikethrough')}
        >
          S
        </ToolbarButton>
        <ToolbarButton
          active={activeFormats.code}
          disabled={readOnly}
          title="Inline code"
          onClick={() => formatText('code')}
        >
          {'</>'}
        </ToolbarButton>
        <span className={styles.richTextToolbarDivider} />
        <ToolbarButton
          active={activeFormats.blockType === 'paragraph'}
          disabled={readOnly}
          title="Paragraph"
          onClick={() => formatBlock('paragraph')}
        >
          P
        </ToolbarButton>
        <ToolbarButton
          active={activeFormats.blockType === 'h1'}
          disabled={readOnly}
          title="Heading 1"
          onClick={() => formatBlock('h1')}
        >
          H1
        </ToolbarButton>
        <ToolbarButton
          active={activeFormats.blockType === 'h2'}
          disabled={readOnly}
          title="Heading 2"
          onClick={() => formatBlock('h2')}
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          active={activeFormats.blockType === 'h3'}
          disabled={readOnly}
          title="Heading 3"
          onClick={() => formatBlock('h3')}
        >
          H3
        </ToolbarButton>
        <ToolbarButton
          active={activeFormats.blockType === 'h4'}
          disabled={readOnly}
          title="Heading 4"
          onClick={() => formatBlock('h4')}
        >
          H4
        </ToolbarButton>
        <ToolbarButton
          active={activeFormats.blockType === 'quote'}
          disabled={readOnly}
          title="Quote"
          onClick={() => formatBlock('quote')}
        >
          Quote
        </ToolbarButton>
        <span className={styles.richTextToolbarDivider} />
        <ToolbarButton
          active={activeFormats.blockType === 'bullet'}
          disabled={readOnly}
          title="Bullet list"
          onClick={() => runToolbarUpdate(() => {
            editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)
          })}
        >
          *
        </ToolbarButton>
        <ToolbarButton
          active={activeFormats.blockType === 'number'}
          disabled={readOnly}
          title="Numbered list"
          onClick={() => runToolbarUpdate(() => {
            editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)
          })}
        >
          1.
        </ToolbarButton>
        <ToolbarButton
          disabled={readOnly}
          title="Link"
          onClick={setLink}
        >
          Link
        </ToolbarButton>
        {spellCheck ? (
          <ToolbarButton
            active={spellCheck.enabled}
            disabled={readOnly}
            title="Toggle browser spellcheck"
            onClick={spellCheck.toggle}
          >
            Spell
          </ToolbarButton>
        ) : null}
        <ToolbarButton
          disabled={readOnly}
          title="Horizontal rule"
          onClick={insertHorizontalRule}
        >
          HR
        </ToolbarButton>
        {blockSchemas.length > 0 ? (
          <>
            <span className={styles.richTextToolbarDivider} />
            <label className={styles.richTextToolbarInsertGroup}>
              <span>Block</span>
              <select
                className={styles.richTextToolbarSelect}
                disabled={readOnly}
                onChange={(event) => setSelectedBlockType(event.target.value)}
                value={selectedBlockType}
              >
                {blockSchemas.map((schema) => (
                  <option key={schema.slug} value={schema.slug}>
                    {schema.label}
                  </option>
                ))}
              </select>
            </label>
            <ToolbarButton
              disabled={readOnly || !selectedBlockType}
              title="Insert block"
              onClick={insertLexicalBlock}
            >
              Insert
            </ToolbarButton>
          </>
        ) : null}
        <span className={styles.richTextToolbarDivider} />
        <ToolbarButton
          active={activeFormats.alignment === 'left'}
          disabled={readOnly}
          title="Align left"
          onClick={() => formatAlignment('left')}
        >
          Left
        </ToolbarButton>
        <ToolbarButton
          active={activeFormats.alignment === 'center'}
          disabled={readOnly}
          title="Align center"
          onClick={() => formatAlignment('center')}
        >
          Center
        </ToolbarButton>
        <ToolbarButton
          active={activeFormats.alignment === 'right'}
          disabled={readOnly}
          title="Align right"
          onClick={() => formatAlignment('right')}
        >
          Right
        </ToolbarButton>
        <ToolbarButton
          active={activeFormats.alignment === 'justify'}
          disabled={readOnly}
          title="Justify"
          onClick={() => formatAlignment('justify')}
        >
          Justify
        </ToolbarButton>
        <div className={styles.richTextColorSwatches} role="radiogroup" aria-label="Text color">
          <span>Color</span>
          {TEXT_COLOR_OPTIONS.map((option) => {
            const active = activeFormats.color === option.value

            return (
              <ToolbarColorButton
                key={option.label}
                active={active}
                disabled={readOnly}
                onSelect={() => setTextColor(option.value)}
                option={option}
              />
            )
          })}
        </div>
      </div>
    </>
  )
}

function RichTextGlobalToolbar({
  editorId,
  label,
  readOnly,
}: {
  editorId: string
  label?: string
  readOnly?: boolean
}) {
  const toolbarContext = React.useContext(PuckRichTextToolbarContext)
  const target = toolbarContext?.target

  if (!target || toolbarContext?.activeEditorId !== editorId) return null

  return createPortal(
    <div
      className={styles.richTextGlobalToolbar}
      data-puck-overlay-portal="true"
      data-puck-rich-text-toolbar="true"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <span className={styles.richTextGlobalToolbarLabel}>{label || 'Text'}</span>
      <RichTextToolbar readOnly={readOnly} />
    </div>,
    target,
  )
}

function RichTextFocusPlugin({
  editorId,
  toolbarMode,
}: {
  editorId: string
  toolbarMode: 'global' | 'inline'
}) {
  const [editor] = useLexicalComposerContext()
  const toolbarContext = React.useContext(PuckRichTextToolbarContext)
  const setActiveEditorId = toolbarContext?.setActiveEditorId

  useEffect(() => {
    if (toolbarMode !== 'global' || !setActiveEditorId) return

    const handleFocusIn = () => setActiveEditorId(editorId)

    const unregisterRoot = editor.registerRootListener((rootElement, prevRootElement) => {
      prevRootElement?.removeEventListener('focusin', handleFocusIn)
      rootElement?.addEventListener('focusin', handleFocusIn)
    })

    return () => {
      editor.getRootElement()?.removeEventListener('focusin', handleFocusIn)
      unregisterRoot()
      setActiveEditorId((current) => (current === editorId ? null : current))
    }
  }, [editor, editorId, setActiveEditorId, toolbarMode])

  return null
}

function ExternalValuePlugin({
  latestSerializedRef,
  onParseError,
  value,
}: {
  latestSerializedRef: React.MutableRefObject<string>
  onParseError: (message: string | null) => void
  value: SerializedEditorState
}) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    const serializedValue = serializeLexicalValue(value)
    if (latestSerializedRef.current === serializedValue) return

    latestSerializedRef.current = serializedValue

    try {
      editor.setEditorState(editor.parseEditorState(serializedValue))
      onParseError(null)
    } catch (error) {
      onParseError(error instanceof Error ? error.message : 'Unable to parse rich text')
    }
  }, [editor, latestSerializedRef, onParseError, value])

  return null
}

function AutoFocusPlugin({ enabled }: { enabled?: boolean }) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    if (!enabled) return

    window.requestAnimationFrame(() => {
      editor.focus()
    })
  }, [editor, enabled])

  return null
}

export function PuckLexicalTextEditor({
  autoFocus = false,
  blockSchemas = [],
  contentEditableStyle,
  hideAdvancedJson = false,
  onChange,
  readOnly,
  surface = 'field',
  toolbarLabel,
  toolbarMode = 'inline',
  value,
}: {
  autoFocus?: boolean
  blockSchemas?: PuckBlockSchema[]
  contentEditableStyle?: React.CSSProperties
  hideAdvancedJson?: boolean
  onChange: (value: unknown) => void
  readOnly?: boolean
  surface?: 'canvas' | 'field'
  toolbarLabel?: string
  toolbarMode?: 'global' | 'inline'
  value: unknown
}) {
  const editorId = useId()
  const normalizedValue = useMemo(() => normalizeLexicalValue(value), [value])
  const [initialEditorState] = useState(() => serializeLexicalValue(normalizedValue))
  const latestSerializedRef = useRef(initialEditorState)
  const fieldRef = useRef<HTMLDivElement | null>(null)
  const canvasToolbarRef = useRef<HTMLDivElement | null>(null)
  const [canvasToolbarTarget, setCanvasToolbarTarget] = useState<HTMLElement | null>(null)
  const [editorError, setEditorError] = useState<string | null>(null)
  const [isCanvasToolbarOpen, setIsCanvasToolbarOpen] = useState(false)
  const [spellCheckEnabled, setSpellCheckEnabled] = useState(true)
  const toolbarContext = React.useContext(PuckRichTextToolbarContext)
  const shouldUseCanvasToolbar = toolbarMode === 'global' && surface === 'canvas'
  const shouldUseHeaderToolbar = toolbarMode === 'global' && !shouldUseCanvasToolbar && Boolean(toolbarContext?.target)
  const shouldHideDefaultToolbar = shouldUseHeaderToolbar || shouldUseCanvasToolbar

  useEffect(() => {
    if (!shouldUseCanvasToolbar) return

    setCanvasToolbarTarget(fieldRef.current?.ownerDocument.body ?? null)
  }, [shouldUseCanvasToolbar])

  useEffect(() => {
    if (!shouldUseCanvasToolbar || !isCanvasToolbarOpen) return

    const ownerDocument = fieldRef.current?.ownerDocument
    if (!ownerDocument) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target && fieldRef.current?.contains(target as Node)) return
      if (target && canvasToolbarRef.current?.contains(target as Node)) return

      setIsCanvasToolbarOpen(false)
    }

    ownerDocument.addEventListener('pointerdown', handlePointerDown, true)

    return () => {
      ownerDocument.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [isCanvasToolbarOpen, shouldUseCanvasToolbar])

  const initialConfig = useMemo<InitialConfigType>(
    () => ({
      editable: !readOnly,
      editorState: initialEditorState,
      namespace: 'PuckLexicalTextEditor',
      nodes: [
        AutoLinkNode,
        HeadingNode,
        HorizontalRuleNode,
        LinkNode,
        ListItemNode,
        ListNode,
        PuckBlockNode,
        PuckInlineBlockNode,
        QuoteNode,
        RelationshipNode,
        UploadNode,
      ],
      onError: (error) => {
        setEditorError(error.message)
      },
      theme: lexicalTheme,
    }),
    [initialEditorState, readOnly],
  )

  const handleChange = useCallback(
    (editorState: EditorState) => {
      const nextValue = editorState.toJSON() as SerializedEditorState
      latestSerializedRef.current = serializeLexicalValue(nextValue)
      setEditorError(null)
      onChange(nextValue)
    },
    [onChange],
  )

  const handleParseError = useCallback((message: string | null) => {
    setEditorError(message)
  }, [])

  const spellCheckContext = useMemo(
    () => ({
      enabled: spellCheckEnabled,
      toggle: () => setSpellCheckEnabled((current) => !current),
    }),
    [spellCheckEnabled],
  )

  return (
    <div
      className={styles.lexicalField}
      data-surface={surface}
      ref={fieldRef}
      onFocusCapture={() => {
        if (shouldUseCanvasToolbar) setIsCanvasToolbarOpen(true)
      }}
      onPointerDownCapture={() => {
        if (shouldUseCanvasToolbar) setIsCanvasToolbarOpen(true)
      }}
    >
      <PuckLexicalBlockContext.Provider value={{ blockSchemas, readOnly }}>
        <PuckSpellCheckContext.Provider value={spellCheckContext}>
        <LexicalComposer initialConfig={initialConfig}>
          {shouldHideDefaultToolbar ? null : <RichTextToolbar readOnly={readOnly} />}
          <RichTextFocusPlugin
            editorId={editorId}
            toolbarMode={shouldUseHeaderToolbar ? 'global' : 'inline'}
          />
          {shouldUseHeaderToolbar ? (
            <RichTextGlobalToolbar
              editorId={editorId}
              label={toolbarLabel}
              readOnly={readOnly}
            />
          ) : null}
          {shouldUseCanvasToolbar && isCanvasToolbarOpen && canvasToolbarTarget
            ? createPortal(
                <div
                  className={styles.richTextCanvasToolbar}
                  data-puck-overlay-portal="true"
                  data-puck-rich-text-toolbar="true"
                  onClick={(event) => event.stopPropagation()}
                  onMouseDown={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                  ref={canvasToolbarRef}
                >
                  <span className={styles.richTextCanvasToolbarLabel}>{toolbarLabel || 'Text'}</span>
                  <RichTextToolbar readOnly={readOnly} />
                </div>,
                canvasToolbarTarget,
              )
            : null}
          <div className={styles.richTextEditor}>
            <RichTextPlugin
              contentEditable={
                <ContentEditable
                  aria-placeholder="Write rich text"
                  autoCapitalize="sentences"
                  autoCorrect="on"
                  className={styles.richTextContentEditable}
                  placeholder={<div className={styles.richTextPlaceholder}>Write rich text</div>}
                  spellCheck={spellCheckEnabled}
                  style={contentEditableStyle}
                />
              }
              ErrorBoundary={LexicalErrorBoundary}
              placeholder={null}
            />
            <HistoryPlugin />
            <ListPlugin />
            <OnChangePlugin ignoreSelectionChange onChange={handleChange} />
            <AutoFocusPlugin enabled={autoFocus} />
            <ExternalValuePlugin
              latestSerializedRef={latestSerializedRef}
              onParseError={handleParseError}
              value={normalizedValue}
            />
          </div>
        </LexicalComposer>
        </PuckSpellCheckContext.Provider>
      </PuckLexicalBlockContext.Provider>

      {editorError ? <div className={styles.fieldError}>{editorError}</div> : null}

      {hideAdvancedJson ? null : (
        <details>
          <summary>Advanced JSON</summary>
          <JsonEditor value={value} onChange={onChange} readOnly={readOnly} />
        </details>
      )}
    </div>
  )
}

function JsonEditor({
  value,
  onChange,
  readOnly,
}: {
  value: unknown
  onChange: (value: unknown) => void
  readOnly?: boolean
}) {
  const [draft, setDraft] = useState(() => JSON.stringify(value ?? null, null, 2))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDraft(JSON.stringify(value ?? null, null, 2))
  }, [value])

  return (
    <div className={styles.jsonField}>
      <textarea
        value={draft}
        readOnly={readOnly}
        spellCheck={false}
        onChange={(event) => {
          const next = event.target.value
          setDraft(next)
          try {
            onChange(JSON.parse(next))
            setError(null)
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Invalid JSON')
          }
        }}
      />
      {error ? <div className={styles.fieldError}>{error}</div> : null}
    </div>
  )
}
