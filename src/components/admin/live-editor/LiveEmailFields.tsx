'use client'

import { useId, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Check, Copy, Plus, Trash2 } from 'lucide-react'
import type { PuckBlockSchema, PuckFieldSchema } from '@/lib/puck/types'
import { booleanFieldValue } from '@/lib/live-editor/relationships'
import { formatFieldLabel } from '@/lib/live-editor/fieldLabels'
import { canEditRichText, defaultTextBlock, hasRichFormatting, readTextField, updateTextField, type TextAction, type TextStorage } from '@/lib/live-editor/textFields'
import { createLexicalValueFromText, getPlainTextFromLexical } from '@/lib/live-editor/lexical'
import { buildUnsteadyDefaults, cloneUnsteadyRow, createUnsteadyBlock, flattenUnsteadyFields, isUnsteadyInternalField, unsteadyID } from '@/lib/live-editor/catalog'
import { isUnsteadyCompanionTextField } from '@/lib/live-editor/textCapabilities'
import { LiveEmailLexicalTextEditor } from './LiveEmailLexicalTextEditor'
import { LiveEmailMediaField } from './LiveEmailMediaField'
import { LiveEmailRelationshipField } from './LiveEmailRelationshipField'
import { LiveEmailResourceContext } from './LiveEmailResourceContext'
import styles from './live-editor-fields.module.css'

type EmailFieldSchema = PuckFieldSchema & { hasMany?: boolean }
type RecordValue = Record<string, unknown>
type Path = Array<string | number>
export type LiveEmailArrayAction = {
  path: Path
  type: 'add' | 'duplicate' | 'remove' | 'move'
  index?: number
  toIndex?: number
  item?: RecordValue
}
export type LiveEmailTextRenderProps = {
  owner: RecordValue
  field: EmailFieldSchema
  path: Path
  storage: TextStorage
  readOnly?: boolean
  onAction: (action: TextAction) => void
}
export type LiveEmailFieldsProps = {
  schema: PuckBlockSchema
  value: RecordValue
  onChange: (next: RecordValue) => void
  lexicalBlockSchemas: PuckBlockSchema[]
  readOnly?: boolean
  emailId?: string | number
  tenantId?: string | number
  onArrayAction?: (action: LiveEmailArrayAction) => void
  renderText?: (props: LiveEmailTextRenderProps) => ReactNode
}
type FieldContext = Pick<LiveEmailFieldsProps, 'lexicalBlockSchemas' | 'readOnly' | 'onArrayAction' | 'renderText'> & { blockType: string; textBase: number }
const record = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}
const labelFor = (field: EmailFieldSchema) => field.label || formatFieldLabel(field.name)

const SWATCHES: Record<string, string> = {
  default: 'linear-gradient(135deg, #fff 48%, #8b93a3 49%, #8b93a3 51%, #fff 52%)',
  inherit: 'linear-gradient(135deg, #fff 48%, #8b93a3 49%, #8b93a3 51%, #fff 52%)',
  none: 'linear-gradient(135deg, #fff 48%, #e45555 49%, #e45555 51%, #fff 52%)',
  foreground: '#111827', background: '#fff',
  primary: '#0b1e3a', accent: '#7a0012',
  white: '#fff', dark: '#0f172a', muted: '#f6f7f9',
}

export function LiveEmailFields(props: LiveEmailFieldsProps) {
  return <LiveEmailResourceContext.Provider value={{ emailId: props.emailId, tenantId: props.tenantId }}><div className={styles.inspector} data-live-editor-inspector>
    <Fields fields={props.schema.fields} value={props.value} onChange={props.onChange} path={[]}
      context={{ ...props, blockType: props.schema.slug, textBase: 0 }} />
  </div></LiveEmailResourceContext.Provider>
}

function Fields({ fields, value, onChange, path, context, conditionalLinkType }: {
  fields: PuckFieldSchema[]; value: RecordValue; onChange: (next: RecordValue) => void; path: Path; context: FieldContext; conditionalLinkType?: unknown
}) {
  const flat = flattenUnsteadyFields(fields)
  const isLink = flat.some(field => field.name === 'reference') && flat.some(field => field.name === 'url') && flat.some(field => field.name === 'type')
  const linkType = isLink ? value.type ?? flat.find(field => field.name === 'type')?.defaultValue ?? 'custom' : conditionalLinkType
  return <div className={styles.fieldList}>{fields.map((field, index) => {
    if (isUnsteadyInternalField(field.name) || field.type === 'ui') return null
    if (linkType !== undefined && (field.name === 'reference' && linkType !== 'reference' || field.name === 'url' && linkType === 'reference')) return null
    if (field.type === 'row') return <Fields key={`row-${index}`} fields={field.fields || []} value={value} onChange={onChange} path={path} context={context} conditionalLinkType={linkType} />
    if (field.type === 'collapsible') return <details className={styles.group} key={`group-${index}`}>
      <summary>{labelFor(field)}</summary>
      <Fields fields={field.fields || []} value={value} onChange={onChange} path={path} context={context} conditionalLinkType={linkType} />
    </details>
    return <Field key={field.name} field={field} owner={value} onOwnerChange={onChange} path={[...path, field.name]} context={context} />
  })}</div>
}

function Field({ field, owner, onOwnerChange, path, context }: {
  field: EmailFieldSchema; owner: RecordValue; onOwnerChange: (next: RecordValue) => void; path: Path; context: FieldContext
}) {
  const id = useId()
  const value = owner[field.name]
  const label = labelFor(field)
  const change = (next: unknown) => { if (!context.readOnly) onOwnerChange({ ...owner, [field.name]: next }) }
  if (field.type === 'group') return <details className={styles.group} data-live-editor-field-path={JSON.stringify(path)} open>
    <summary>{label}</summary><Fields fields={field.fields || []} value={record(value)} onChange={change} path={path} context={context} />
  </details>
  if (field.type === 'array' || field.type === 'blocks') return <ArrayField field={field} value={value} onChange={change} path={path} context={context} />

  const textStorage = field.type === 'richText' ? 'native' : ['text', 'textarea'].includes(field.type) &&
    isUnsteadyCompanionTextField(context.blockType, path.slice(context.textBase)) ? 'companion' : null
  if (textStorage) {
    const companion = readTextField(owner, field.name, 'companion')
    const activeNativeOverride = textStorage === 'native' && companion.enabled &&
      isUnsteadyCompanionTextField(context.blockType, path.slice(context.textBase))
    // Legacy native fields may have a visible companion override. Edit that
    // visible version while retaining both the native Lexical type and fallback.
    const visibleValue = activeNativeOverride ? companion.rich : owner[field.name]
    const textOwner = activeNativeOverride || textStorage === 'native' && typeof visibleValue === 'string'
      ? { ...owner, [field.name]: textStorage === 'native' && typeof visibleValue === 'string' ? createLexicalValueFromText(visibleValue) : visibleValue } : owner
    const textProps: LiveEmailTextRenderProps = { field, owner: textOwner, path, storage: textStorage, readOnly: context.readOnly,
      onAction: action => {
        if (context.readOnly) return
        const next = updateTextField(textOwner, field.name, textStorage, action)
        onOwnerChange(activeNativeOverride
          ? updateTextField(owner, field.name, 'companion', { type: 'rich', value: next[field.name] }) : next)
      } }
    return context.renderText ? context.renderText(textProps) : <TextField {...textProps} context={context} />
  }

  let input: ReactNode
  if (field.type === 'checkbox') {
    const checked = booleanFieldValue(value, field.defaultValue)
    input = <div className={styles.choices} role="radiogroup" aria-labelledby={`${id}-label`}>
      {[true, false].map(option => <label className={styles.choice} data-selected={checked === option} key={String(option)}>
        <input type="radio" name={id} checked={checked === option} disabled={context.readOnly} onChange={() => change(option)} />
        <span>{option ? 'Yes' : 'No'}</span>{checked === option ? <Check size={15} aria-hidden /> : null}
      </label>)}
    </div>
  } else if (field.type === 'relationship' || field.type === 'upload') {
    input = field.relationTo === 'media' && !field.hasMany
      ? <LiveEmailMediaField value={value} onChange={change} readOnly={context.readOnly} uploadAccept={field.mimeTypes?.join(',') || 'image/*'} />
      : <LiveEmailRelationshipField field={field} value={value} onChange={change} readOnly={context.readOnly} />
  } else if (field.options?.length) {
    const options = field.options
    const selected = field.hasMany ? Array.isArray(value) ? value : [] : [value ?? field.defaultValue]
    const colorOptions = !field.hasMany && options.every(option => typeof option.value === 'string' && Object.hasOwn(SWATCHES, option.value))
    if (colorOptions || field.type === 'radio' || field.hasMany) {
      input = <div className={colorOptions ? styles.swatches : styles.choices} role={field.hasMany ? 'group' : 'radiogroup'} aria-labelledby={`${id}-label`}>
        {options.map((option, index) => {
          const active = selected.includes(option.value)
          return <label className={styles.choice} data-selected={active} key={index}>
            <input type={field.hasMany ? 'checkbox' : 'radio'} name={id} disabled={context.readOnly} checked={active}
              onChange={() => change(field.hasMany ? active ? selected.filter(item => item !== option.value) : [...selected, option.value] : option.value)} />
            {colorOptions ? <span aria-hidden className={styles.swatch} style={{ background: SWATCHES[String(option.value)] }} /> : null}
            <span>{option.label || String(option.value)}</span>{active ? <Check size={14} aria-hidden /> : null}
          </label>
        })}
      </div>
    } else {
      const selectedIndex = options.findIndex(option => option.value === selected[0])
      input = <select id={id} value={selectedIndex < 0 ? '' : String(selectedIndex)} disabled={context.readOnly}
        onChange={event => change(event.target.value === '' ? null : options[Number(event.target.value)]?.value)}>
        <option value="">{selected[0] != null && selectedIndex < 0 ? `Current: ${String(selected[0])}` : 'Choose…'}</option>
        {options.map((option, index) => <option key={index} value={index}>{option.label || String(option.value)}</option>)}
      </select>
    }
  } else if (field.type === 'json' || field.type === 'point') {
    input = <JSONField value={value} onChange={change} readOnly={context.readOnly} label={label} />
  } else if (field.type === 'textarea') {
    input = <textarea id={id} rows={4} value={typeof value === 'string' ? value : ''} readOnly={context.readOnly} onChange={event => change(event.target.value)} />
  } else if (field.type === 'number') {
    input = <input id={id} type="number" step="any" value={typeof value === 'number' ? value : ''} readOnly={context.readOnly}
      onChange={event => change(event.target.value === '' ? null : Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : value)} />
  } else {
    input = <input id={id} type={field.type === 'email' ? 'email' : 'text'} value={typeof value === 'string' || typeof value === 'number' ? String(value) : ''}
      readOnly={context.readOnly} onChange={event => change(event.target.value)} />
  }
  return <div className={styles.field} data-live-editor-field-path={JSON.stringify(path)}><label className={styles.label} id={`${id}-label`} htmlFor={id}>{label}{field.required ? <span title="Required"> *</span> : null}</label>{input}</div>
}

function TextField({ owner, field, path, storage, readOnly, onAction, context }: LiveEmailTextRenderProps & { context: FieldContext }) {
  const state = readTextField(owner, field.name, storage)
  const [nativePlain, setNativePlain] = useState(false)
  const [choice, setChoice] = useState<'rich' | 'plain-version' | 'replace' | null>(null)
  const [pending, setPending] = useState('')
  const [error, setError] = useState('')
  const rich = storage === 'native' ? !nativePlain : state.enabled
  const supported = canEditRichText(state.rich)
  const label = labelFor(field)
  const defaultBlock = defaultTextBlock(context.blockType, path.slice(context.textBase).map(part => typeof part === 'number' ? '[]' : part), field.name)
  const send = (action: TextAction) => {
    if (readOnly) return
    try { onAction(action.type === 'mode' || action.type === 'replace-rich' ? { ...action, defaultBlock } : action); setError('') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update text.') }
  }
  const toggle = () => {
    if (storage === 'native') { setChoice(null); setNativePlain(!nativePlain); return }
    if (state.rich != null && getPlainTextFromLexical(state.rich) !== state.plain) setChoice(rich ? 'plain-version' : 'rich')
    else send({ type: 'mode', rich: !rich })
  }
  return <div className={styles.field} data-live-editor-field-path={JSON.stringify(path)}>
    <div className={styles.textHeader}><span className={styles.label}>{label}</span>
      <button type="button" className={styles.smallButton} disabled={readOnly || choice === 'replace'} onClick={toggle} aria-pressed={rich}>Use {rich ? 'plain' : 'rich'} text</button>
    </div>
    {rich ? supported ? <LiveEmailLexicalTextEditor blockSchemas={context.lexicalBlockSchemas} hideAdvancedJson toolbarLabel={label}
      value={state.rich ?? createLexicalValueFromText(state.plain, { blockType: defaultBlock })} onChange={next => send({ type: 'rich', value: next })} readOnly={readOnly} />
      : <div className={styles.notice}><p>{getPlainTextFromLexical(state.rich)}</p>This content is preserved. Use Payload’s document editor to change its unsupported formatting or embedded content.</div>
      : <textarea aria-label={label} rows={field.type === 'text' ? 2 : 4} value={choice === 'replace' ? pending : state.plain}
        readOnly={readOnly || storage === 'native' && !supported} onChange={event => {
          if (storage === 'native' && hasRichFormatting(state.rich)) { setPending(event.target.value); setChoice('replace') }
          else send({ type: 'plain', value: event.target.value })
        }} />}
    {choice ? <div className={styles.notice} role="group" aria-label="Choose text version">
      <p>{choice === 'replace' ? 'This plain text edit removes formatting and links.' : 'The plain and formatted versions have different wording. Choose the version to use.'}</p>
      <button type="button" disabled={readOnly} onClick={() => {
        if (choice !== 'replace') send({ type: 'mode', rich: choice === 'rich' })
        setChoice(null)
      }}>{choice === 'replace' ? 'Keep formatting' : choice === 'rich' ? 'Restore formatted version' : 'Restore plain version'}</button>
      <button type="button" disabled={readOnly || !supported && choice !== 'plain-version'} onClick={() => {
        send(choice === 'plain-version' ? { type: 'plain-from-rich' } : { type: 'replace-rich', value: choice === 'replace' ? pending : state.plain })
        setChoice(null)
      }}>{choice === 'plain-version' ? 'Use formatted wording as plain text' : 'Use plain wording; remove formatting'}</button>
      <button type="button" onClick={() => setChoice(null)}>Cancel</button>
    </div> : null}
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
  </div>
}

function ArrayField({ field, value, onChange, path, context }: {
  field: EmailFieldSchema; value: unknown; onChange: (next: unknown) => void; path: Path; context: FieldContext
}) {
  const rows = Array.isArray(value) ? value : []
  const [blockType, setBlockType] = useState(field.blocks?.[0]?.slug || '')
  const [error, setError] = useState('')
  const max = field.maxRows ?? Infinity
  const min = field.minRows ?? 0
  const label = labelFor(field)
  const mutate = (action: Omit<LiveEmailArrayAction, 'path'>) => {
    if (context.readOnly || (['add', 'duplicate'].includes(action.type) && rows.length >= max) || action.type === 'remove' && rows.length <= min) return
    try {
      if (context.onArrayAction) context.onArrayAction({ ...action, path })
      else {
        const next: RecordValue[] = rows.map(row => ({ ...record(row), id: record(row).id || unsteadyID() }))
        const index = action.index ?? next.length
        if (action.type === 'add') next.splice(index, 0, { ...action.item, id: action.item?.id || unsteadyID() })
        else if (index >= 0 && index < next.length) {
          if (action.type === 'remove') next.splice(index, 1)
          else if (action.type === 'move' && action.toIndex != null && action.toIndex >= 0 && action.toIndex < next.length) next.splice(action.toIndex, 0, next.splice(index, 1)[0]!)
          else if (action.type === 'duplicate') {
            const row = next[index]!
            const fields = field.type === 'blocks' ? field.blocks?.find(block => block.slug === row.blockType)?.fields || [] : field.fields || []
            next.splice(index + 1, 0, cloneUnsteadyRow(fields, row))
          }
        }
        onChange(next)
      }
      setError('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to change items.') }
  }
  return <section className={styles.array} aria-label={label} data-live-editor-field-path={JSON.stringify(path)}>
    <div className={styles.arrayHeading}><strong>{label}</strong><span>{rows.length}{Number.isFinite(max) ? ` / ${max}` : ''}</span></div>
    {rows.map((item, index) => {
      const row = record(item)
      const schema = field.type === 'blocks' ? field.blocks?.find(block => block.slug === row.blockType) : undefined
      const title = row.label || row.heading || row.title || row.name || schema?.label || `Item ${index + 1}`
      return <details className={styles.arrayRow} key={typeof row.id === 'string' || typeof row.id === 'number' ? row.id : index} open={rows.length === 1 || undefined}>
        <summary><span>{String(title).slice(0, 80)}</span><small>{index + 1}</small></summary>
        <div className={styles.rowActions}>
          <button type="button" title="Move earlier" aria-label={`Move ${title} earlier`} disabled={context.readOnly || index === 0} onClick={() => mutate({ type: 'move', index, toIndex: index - 1 })}><ArrowUp size={15} />Earlier</button>
          <button type="button" title="Move later" aria-label={`Move ${title} later`} disabled={context.readOnly || index === rows.length - 1} onClick={() => mutate({ type: 'move', index, toIndex: index + 1 })}><ArrowDown size={15} />Later</button>
          <button type="button" aria-label={`Duplicate ${title}`} disabled={context.readOnly || rows.length >= max} onClick={() => mutate({ type: 'duplicate', index })}><Copy size={15} />Copy</button>
          <button type="button" aria-label={`Remove ${title}`} disabled={context.readOnly || rows.length <= min} onClick={() => mutate({ type: 'remove', index })}><Trash2 size={15} />Remove</button>
        </div>
        {field.type === 'blocks' && !schema ? <p className={styles.notice}>This saved block is preserved. Its fields are not available in this editor.</p>
          : <Fields fields={schema?.fields || field.fields || []} value={row} path={[...path, index]}
            context={schema ? { ...context, blockType: schema.slug, textBase: path.length + 1 } : context}
            onChange={nextRow => onChange(rows.map((candidate, rowIndex) => rowIndex === index ? nextRow : candidate))} />}
      </details>
    })}
    {!rows.length ? <p className={styles.empty}>No {label.toLowerCase()} yet.</p> : null}
    <div className={styles.addRow}>
      {field.type === 'blocks' ? <select aria-label={`New ${label} type`} value={blockType} disabled={context.readOnly || rows.length >= max} onChange={event => setBlockType(event.target.value)}>
        {field.blocks?.map(block => <option value={block.slug} key={block.slug}>{block.label}</option>)}
      </select> : null}
      <button type="button" disabled={context.readOnly || rows.length >= max || field.type === 'blocks' && !blockType} onClick={() => {
        const schema = field.blocks?.find(block => block.slug === blockType)
        const item = field.type === 'blocks' && schema ? createUnsteadyBlock(schema) : { ...buildUnsteadyDefaults(field.fields || []), id: unsteadyID() }
        mutate({ type: 'add', item })
      }}><Plus size={16} aria-hidden />Add {field.type === 'blocks' ? 'block' : 'item'}</button>
    </div>
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
  </section>
}

function JSONField({ value, onChange, label, readOnly }: { value: unknown; onChange: (next: unknown) => void; label: string; readOnly?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState('')
  return <div className={styles.jsonField}>
    <textarea aria-label={label} rows={6} spellCheck={false} readOnly={readOnly} value={draft ?? JSON.stringify(value ?? null, null, 2)} onChange={event => setDraft(event.target.value)} />
    {draft != null ? <div className={styles.rowActions}><button type="button" disabled={readOnly} onClick={() => {
      try { onChange(JSON.parse(draft)); setDraft(null); setError('') } catch { setError('Enter valid JSON before applying.') }
    }}>Apply JSON</button><button type="button" onClick={() => { setDraft(null); setError('') }}>Cancel</button></div> : null}
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
  </div>
}
