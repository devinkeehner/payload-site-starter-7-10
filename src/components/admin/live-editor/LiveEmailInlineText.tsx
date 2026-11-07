'use client'

import { useEffect, useRef } from 'react'
import { type SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'
import { LinkJSXConverter, RichText } from '@payloadcms/richtext-lexical/react'
import { LiveEmailLexicalTextEditor } from './LiveEmailLexicalTextEditor'
import { LiveEmailResourceContext } from './LiveEmailResourceContext'
import { canEditRichText, defaultTextBlock, hasRichFormatting, readTextField, type TextAction } from '@/lib/live-editor/textFields'
import { createLexicalValueFromText, getPlainTextFromLexical } from '@/lib/live-editor/lexical'
import type { PuckBlockSchema } from '@/lib/puck/types'
import { unsteadyTextOwner } from '@/lib/live-editor/text'
import styles from './live-editor.module.css'

export function LiveEmailInlineText({ owner, field, path, blockType, label, storage, active, onActivate, onAction, toolbarTarget, lexicalBlockSchemas = [], emailId, tenantId }: {
  owner: Record<string, unknown>
  field: string
  path: Array<string | number>
  blockType: string
  label: string
  storage: 'plain' | 'companion' | 'native'
  active: boolean
  onActivate: () => void
  onAction: (action: TextAction) => void
  toolbarTarget: HTMLElement | null
  lexicalBlockSchemas?: PuckBlockSchema[]
  emailId?: string | number
  tenantId?: string | number
}) {
  const state = storage === 'plain'
    ? { plain: typeof owner[field] === 'string' ? owner[field] : '', rich: undefined, enabled: false }
    : readTextField(unsteadyTextOwner(owner, field, storage), field, storage)
  const defaultBlock = defaultTextBlock(blockType, path.map(part => typeof part === 'number' ? '[]' : part), field)
  const value = state.enabled ? state.rich : createLexicalValueFromText(state.plain, { blockType: defaultBlock })
  const supported = !state.enabled || canEditRichText(state.rich)
  const TextRoot = storage === 'plain' ? 'span' : 'div'
  const root = useRef<HTMLElement | null>(null)
  const plain = useRef<HTMLSpanElement>(null)
  const wasActive = useRef(false)
  useEffect(() => {
    if (active) {
      root.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      if (storage === 'plain') plain.current?.focus()
    }
  }, [active, storage])
  useEffect(() => {
    const element = plain.current
    if (element && element.textContent !== (state.plain || (!active ? label : '')) && (!active || wasActive.current !== active || element.ownerDocument.activeElement !== element)) element.textContent = state.plain || (!active ? label : '')
    wasActive.current = active
  }, [state.plain, active, label])

  return <LiveEmailResourceContext.Provider value={{ emailId, tenantId }}><TextRoot ref={(element: HTMLElement | null) => { root.current = element }} className={styles.inlineText} data-unsteady-text data-unsteady-text-path={JSON.stringify(path)} data-active={active || undefined}
    data-unsteady-text-default={storage === 'companion' ? defaultBlock : undefined}
    onClick={event => { event.stopPropagation(); if (!active) onActivate() }}
    onPointerDown={event => event.stopPropagation()}>
    {storage === 'plain' ? <span ref={plain} tabIndex={0} role={active ? 'textbox' : 'button'} aria-label={active ? label : `Edit ${label}`} aria-multiline={active || undefined}
      contentEditable={active ? 'plaintext-only' : false} suppressContentEditableWarning style={{ whiteSpace: 'pre-wrap', minHeight: '1em' }}
      onInput={event => onAction({ type: 'plain', value: event.currentTarget.innerText.replace(/\r/g, '') })}
      onKeyDown={event => {
        if (!active && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onActivate() }
      }}
     />
      : active && supported ? <LiveEmailLexicalTextEditor
      autoFocus blockSchemas={lexicalBlockSchemas} canvasAppearance="inline" hideAdvancedJson
      surface="canvas" toolbarMode="global" toolbarLabel={label} toolbarTarget={toolbarTarget}
      value={value ?? createLexicalValueFromText('')} onChange={next => {
        if (!state.enabled && !hasRichFormatting(next, defaultBlock)) onAction({ type: 'plain', value: getPlainTextFromLexical(next) })
        else onAction({ type: 'rich', value: next })
      }}
    /> : <div tabIndex={0} role="button" aria-label={`Edit ${label}`} onKeyDown={event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onActivate() }
    }}>
      {state.enabled && supported && value ? <RichText data={value as SerializedEditorState} converters={({ defaultConverters }) => ({
        ...defaultConverters,
        ...LinkJSXConverter({ internalDocToHref: ({ linkNode }) => {
          const doc = linkNode.fields?.doc?.value
          const slug = doc && typeof doc === 'object' && 'slug' in doc && typeof doc.slug === 'string' ? doc.slug : ''
          return slug ? `/${linkNode.fields?.doc?.relationTo === 'posts' ? 'posts/' : ''}${slug}` : '#'
        } }),
      })} /> : <span style={{ whiteSpace: 'pre-wrap' }}>{state.plain || label}</span>}
      {active && !supported && <small className={styles.preserved}>This content is preserved. Its custom text nodes require the Payload editor.</small>}
    </div>}
  </TextRoot></LiveEmailResourceContext.Provider>
}
