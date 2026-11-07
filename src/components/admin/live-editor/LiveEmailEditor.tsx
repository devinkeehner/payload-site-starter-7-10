'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Check, ChevronDown, ChevronRight, ChevronUp, Copy, ExternalLink, GripHorizontal, Layers, LayoutTemplate, LocateFixed, Monitor, Moon, Move, PanelLeft, Plus, Redo2, Search, Settings2, Smartphone, Sun, Trash2, Undo2, X } from 'lucide-react'
import type { PuckBlockSchema } from '@/lib/puck/types'
import { applyTextAction, captureTextAddress, type FieldAddress, type TextAction } from '@/lib/live-editor/textFields'
import { applyUnsteadyTextAction } from '@/lib/live-editor/text'
import { getPlainTextFromLexical } from '@/lib/live-editor/lexical'
import { createUnsteadyBlock, getUnsteadyBlockGroups } from '@/lib/live-editor/catalog'
import { duplicateBlock, editOwnedArray, ensureDocumentIds, findBlock, getBlock, getSlot, getSlots, insertBlock, moveBlock, removeBlock, ROOT_SLOT, updateBlock, type PageDocument, type SlotAddress } from '@/lib/live-editor/document'
import { LiveEmailBlockRenderer } from './LiveEmailBlockRenderer'
import { LiveEmailInlineText } from './LiveEmailInlineText'
import { LiveEmailFields } from './LiveEmailFields'
import { findUnsteadyCanvasElement, useUnsteadyDrag, type DragItem, type DropTarget } from './useUnsteadyDrag'
import { useUnsteadyHistory } from './useUnsteadyHistory'
import { useUnsteadyAgentTools } from './useUnsteadyAgentTools'
import { LiveEmailViewport } from './LiveEmailViewport'
import { readUnsteadyPreview, scrollUnsteadyPreview } from './previewNavigation'
import { LiveEmailPanelResize } from './LiveEmailPanelResize'
import { LiveEmailMoveMenu } from './LiveEmailMoveMenu'
import styles from './live-editor.module.css'

export type LiveEmailEditorProps = {
  initialPage: PageDocument
  schemas: PuckBlockSchema[]
  emailId?: string | number
  tenantId?: string | number
  onSave: (email: PageDocument) => Promise<void>
  onPreview?: (email: PageDocument) => void | Promise<void>
  previewURL: string | null
  backToPayloadURL?: string
  audienceURL?: string
  storageLabel?: string
}

function textLabel(block: Record<string, unknown>, schema?: PuckBlockSchema) {
  const detail = [block.heading, block.title, block.blockName, typeof block.text === 'string' ? block.text : '', getPlainTextFromLexical(block.text), getPlainTextFromLexical(block.richText)].find(value => typeof value === 'string' && value.trim())
  return typeof detail === 'string' ? detail.length > 72 ? `${detail.slice(0, 69)}…` : detail : schema?.label || String(block.blockType || 'Block')
}

export function LiveEmailEditor({ initialPage, schemas, onSave, onPreview, previewURL, backToPayloadURL, audienceURL, emailId, tenantId, storageLabel = 'Email draft' }: LiveEmailEditorProps) {
  const lexicalBlockSchemas = useMemo<PuckBlockSchema[]>(() => [], [])
  const [initialized] = useState(() => ensureDocumentIds(initialPage, { schemas }))
  const history = useUnsteadyHistory(initialized)
  const { commit, undo, redo, getCurrent } = history
  const page = history.value
  const serialized = useMemo(() => JSON.stringify(page), [page])
  const [selected, setSelected] = useState<string | null>(null)
  const [activeText, setActiveText] = useState<string | null>(null)
  const [panel, setPanel] = useState<'blocks' | 'layers' | 'fields' | 'page'>('blocks')
  const [panelOpen, setPanelOpen] = useState(true)
  const [query, setQuery] = useState('')
  const [library, setLibrary] = useState('All')
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [width, setWidth] = useState<'desktop' | 'mobile'>('desktop')
  const [toolbarTarget, setToolbarTarget] = useState<HTMLDivElement | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(() => JSON.stringify(page))
  const savedDocument = useRef(saved)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const savingRef = useRef(false)
  const [moveMenu, setMoveMenu] = useState<string | null>(null)
  const [insertTarget, setInsertTarget] = useState<SlotAddress>(ROOT_SLOT)
  const scroller = useRef<HTMLDivElement>(null)
  const workspace = useRef<HTMLDivElement>(null)
  const { slots, dropCache } = useMemo(() => ({ slots: getSlots(page, { schemas }), dropCache: new Map<string, boolean>() }), [page, schemas])
  const currentBlock = selected ? findBlock(page, selected, { schemas }) : undefined
  const currentSchema = schemas.find(schema => schema.slug === currentBlock?.blockType)
  const dirty = serialized !== saved
  const groups = useMemo(() => getUnsteadyBlockGroups(schemas), [schemas])

  const announce = useCallback((message: string) => { setError(''); setAnnouncement(message) }, [])
  useEffect(() => {
    if (!announcement) return
    const timeout = window.setTimeout(() => setAnnouncement(''), 4000)
    return () => window.clearTimeout(timeout)
  }, [announcement])
  const attempt = useCallback((operation: () => void) => {
    try { operation(); setError('') } catch (reason) { setError(reason instanceof Error ? reason.message : 'That change could not be completed.') }
  }, [])
  const selectBlock = useCallback((id: string, openFields = true) => {
    setSelected(id); setActiveText(null); setMoveMenu(null)
    if (openFields) { setPanel('fields'); setPanelOpen(true) }
  }, [])
  const move = useCallback((id: string, target: DropTarget) => {
    const slot = getSlots(getCurrent().document, { schemas }).find(item => item.id === target.slotId)
    if (!slot) throw new Error('The destination changed. Choose it again.')
    const before = slot.items[target.index]?.id
    const result = moveBlock(getCurrent().document, id, slot.address, before == null ? null : before, { schemas })
    commit(result.document)
    setSelected(String(result.selectedId || id)); setActiveText(null); setMoveMenu(null)
    announce(`Moved to ${slot.label}.`)
  }, [schemas, commit, announce, getCurrent])
  const add = useCallback((type: string, address: SlotAddress, index?: number) => {
    const schema = schemas.find(item => item.slug === type)
    if (!schema) return
    const slot = getSlot(getCurrent().document, address, { schemas })
    const before = index === undefined ? null : slot.items[index]?.id ?? null
    const result = insertBlock(getCurrent().document, address, createUnsteadyBlock(schema), before, { schemas })
    commit(result.document)
    setSelected(String(result.selectedId)); setActiveText(null)
    announce(`Added ${schema.label}.`)
  }, [schemas, commit, announce, getCurrent])
  const canDrop = useCallback((item: DragItem, target: DropTarget) => {
    const cacheKey = JSON.stringify([item, target])
    if (dropCache.has(cacheKey)) return dropCache.get(cacheKey)!
    const slot = slots.find(candidate => candidate.id === target.slotId)
    if (!slot || slot.active === false) return false
    const type = item.kind === 'palette' ? item.type : String(findBlock(getCurrent().document, item.id, { schemas })?.blockType || '')
    if (slot.allowedSlugs && !slot.allowedSlugs.includes(type)) return false
    if (item.kind === 'block') {
      try { moveBlock(getCurrent().document, item.id, slot.address, slot.items[target.index]?.id ?? null, { schemas }); dropCache.set(cacheKey, true); return true } catch { dropCache.set(cacheKey, false); return false }
    }
    return true
  }, [schemas, slots, dropCache, getCurrent])
  const { drag, start, measure, skipClick } = useUnsteadyDrag({
    canDrop, onDrop: (item, target) => attempt(() => {
      if (item.kind === 'block') move(item.id, target)
      else {
        const slot = slots.find(candidate => candidate.id === target.slotId)
        if (slot) add(item.type, slot.address, target.index)
      }
    }), onCancel: () => announce('Move cancelled.'), scroller, revision: history.revision,
  })

  const agentTools = useUnsteadyAgentTools({
    getState: () => ({ ...getCurrent(), schemas }),
    commit: result => {
      setActiveText(null); measure(); commit(result.document)
      setSelected(result.selectedId == null ? null : String(result.selectedId))
      announce('Draft updated. Undo restores the previous version.')
    },
    undo: () => { setActiveText(null); measure(); undo() },
    redo: () => { setActiveText(null); measure(); redo() },
    preview: { read: () => readUnsteadyPreview(scroller.current), scroll: target => scrollUnsteadyPreview(scroller.current, target) },
  })

  const save = useCallback(async () => {
    if (savingRef.current) return false
    savingRef.current = true
    setSaving(true); setError('')
    const snapshot = getCurrent().document
    try { await onSave(snapshot); savedDocument.current = JSON.stringify(snapshot); setSaved(savedDocument.current); announce(`${storageLabel} saved.`); return true }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save. Your changes remain here.'); return false }
    finally { savingRef.current = false; setSaving(false) }
  }, [onSave, announce, storageLabel, getCurrent])
  const saveForNavigation = async () => {
    const revision = getCurrent().revision
    if (!await save()) return false
    if (getCurrent().revision !== revision) { setError('The email changed while it was saving. Save once more before continuing.'); return false }
    return true
  }

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (event.key === 'Escape') { setActiveText(null); setMoveMenu(null); return }
      if (!(event.ctrlKey || event.metaKey)) return
      if (event.key.toLowerCase() === 's') { event.preventDefault(); void save() }
      const target = event.target as HTMLElement
      if (target.closest('input,textarea,[contenteditable="true"]')) return
      if (['z', 'y'].includes(event.key.toLowerCase())) {
        event.preventDefault(); setActiveText(null); measure()
        if (event.shiftKey || event.key.toLowerCase() === 'y') redo(); else undo()
      }
    }
    document.addEventListener('keydown', keyboard)
    return () => document.removeEventListener('keydown', keyboard)
  }, [save, undo, redo, measure])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { if (JSON.stringify(getCurrent().document) !== savedDocument.current) event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, getCurrent])
  useEffect(() => {
    if (selected && !findBlock(page, selected, { schemas })) { setSelected(null); setActiveText(null) }
  }, [page, selected, schemas])

  const updateText = (id: string, address: FieldAddress, storage: 'plain' | 'companion' | 'native', action: TextAction) => attempt(() => {
    const block = getBlock(getCurrent().document, id, { schemas })
    if (!block) return
    const updated = storage === 'plain' ? applyTextAction(block, address, 'companion', action) : applyUnsteadyTextAction(block, address, storage, action)
    const result = updateBlock(getCurrent().document, id, updated, { schemas })
    history.commit(result.document, `${id}:${JSON.stringify(address)}`)
  })
  const chooseInsertion = (address: SlotAddress) => {
    setInsertTarget(address); setLibrary('All'); setQuery(''); setPanel('blocks'); setPanelOpen(true); setActiveText(null)
  }
  const renderSlot = (address: SlotAddress): ReactNode => {
    const slot = slots.find(item => String(item.ownerId) === String(address.ownerId) && item.path === address.path)
    if (!slot) return null
    const targeted = drag?.target?.slotId === slot.id
    return <div className={styles.zone} data-unsteady-zone={slot.id} role="group" aria-label={slot.label} data-root={address.path === 'layout' || undefined} data-drop-active={targeted || undefined} key={slot.id}>
      {address.path !== 'layout' && <div className={styles.zoneCaption}>{slot.label}</div>}
      {slot.items.map((block, index) => <div key={String(block.id)} data-unsteady-drop-item>
        {targeted && drag.target?.index === index && <div className={styles.dropIndicator}>Drop here</div>}
        {renderBlock(block)}
      </div>)}
      {targeted && drag.target?.index === slot.items.length && <div className={styles.dropIndicator}>Drop here</div>}
      <button type="button" className={styles.addToZone} onClick={event => { event.stopPropagation(); chooseInsertion(slot.address) }} aria-label={`Add to ${slot.label}`}><Plus size={14} />{slot.items.length ? 'Add' : address.path === 'layout' ? 'Add your first email block' : 'Add or drop an email block'}</button>
    </div>
  }
  const renderBlock = (block: Record<string, unknown>): ReactNode => {
    const id = String(block.id)
    const schema = schemas.find(item => item.slug === block.blockType)
    const label = textLabel(block, schema)
    const source = slots.find(slot => slot.items.some(item => String(item.id) === id))
    const sourceIndex = source?.items.findIndex(item => String(item.id) === id) ?? -1
    return <article className={styles.block} data-unsteady-block={id} data-unsteady-block-type={String(block.blockType)} data-testid={`block-${id}`} aria-label={`${schema?.label || block.blockType}: ${label}`} tabIndex={0} data-selected={selected === id || undefined} data-drag-source={drag?.item.kind === 'block' && drag.item.id === id || undefined}
      onKeyDown={event => { if (event.target === event.currentTarget && event.key === 'Enter') { event.preventDefault(); selectBlock(id) } }}
      onClick={event => { event.stopPropagation(); if (!skipClick()) selectBlock(id) }}>
      <div className={styles.blockTools} onClick={event => event.stopPropagation()}>
        <button type="button" className={styles.moveHandle} aria-label={`Move ${label}`} title="Drag to move; use arrow keys to reorder" onPointerDown={event => start(event, { kind: 'block', id, label })}
          aria-expanded={moveMenu === id} aria-controls={moveMenu === id ? `move-menu-${id}` : undefined} aria-haspopup="dialog" data-unsteady-move={id}
          onClick={() => { if (!skipClick()) { setActiveText(null); setSelected(id); setMoveMenu(moveMenu === id ? null : id) } }}
          onKeyDown={event => {
            if (!source || !['ArrowUp', 'ArrowDown'].includes(event.key)) return
            event.preventDefault(); measure()
            const index = event.key === 'ArrowUp' ? Math.max(0, sourceIndex - 1) : Math.min(source.items.length, sourceIndex + 2)
            attempt(() => move(id, { slotId: source.id, index }))
          }}><Move size={14} /><span>{schema?.label || block.blockType as string}</span></button>
        <button type="button" aria-label={`Edit ${label}`} title="Edit block" onClick={() => selectBlock(id)}><Settings2 size={14} /></button>
        <button type="button" aria-label={`Duplicate ${label}`} title="Duplicate" onClick={() => attempt(() => {
          measure(); const result = duplicateBlock(getCurrent().document, id, { schemas }); history.commit(result.document); setSelected(String(result.selectedId)); announce('Block duplicated.')
        })}><Copy size={14} /></button>
        <button type="button" aria-label={`Remove ${label}`} title="Remove" onClick={() => attempt(() => {
          measure(); const result = removeBlock(getCurrent().document, id, { schemas }); history.commit(result.document); setSelected(result.selectedId == null ? null : String(result.selectedId)); setActiveText(null); announce('Block removed. Undo restores it.')
        })}><Trash2 size={14} /></button>
      </div>
      {moveMenu === id && <LiveEmailMoveMenu id={id} label={label} onClose={() => setMoveMenu(null)}>
        {slots.filter(slot => canDrop({ kind: 'block', id, label }, { slotId: slot.id, index: slot.items.length })).map(slot => <button key={slot.id} type="button" onClick={() => attempt(() => { measure(); move(id, { slotId: slot.id, index: slot.items.length }) })}><Move size={13} />{slot.label}</button>)}
      </LiveEmailMoveMenu>}
      <LiveEmailBlockRenderer block={block} schemas={schemas}
        renderSlot={(ownerId, slotName) => renderSlot({ ownerId, path: slotName })}
        renderText={(owner, field, path, storage, fieldLabel) => {
          const address = captureTextAddress(block, path)
          const key = `${id}:${JSON.stringify(address)}`
          return <LiveEmailInlineText key={key} owner={owner} field={field} path={path} blockType={String(block.blockType)} label={fieldLabel || field} storage={storage}
            active={activeText === key} onActivate={() => { setActiveText(key); setSelected(id); setMoveMenu(null) }}
            onAction={action => updateText(id, address, storage, action)} toolbarTarget={toolbarTarget} lexicalBlockSchemas={lexicalBlockSchemas} emailId={emailId ?? initialPage.id as string | number | undefined} tenantId={tenantId ?? initialPage.tenantId as string | number | undefined} />
        }} />
    </article>
  }

  const selectedSlot = useMemo(() => {
    try { return getSlot(page, insertTarget, { schemas }) } catch { return undefined }
  }, [page, insertTarget, schemas])
  const visibleGroups = groups.map(group => ({ ...group, blocks: group.blocks.filter(schema => {
    if (query.trim()) return `${schema.label} ${schema.slug} ${group.label}`.toLowerCase().includes(query.toLowerCase())
    if (library === 'Content') return ['emailHeading', 'emailText', 'emailInlineLink', 'emailButton', 'emailTwoButtons', 'emailList', 'emailMarkdown', 'emailCallout'].includes(schema.slug)
    if (library === 'Media') return ['emailImage', 'emailVideo', 'emailGallery'].includes(schema.slug)
    if (library === 'Layout') return ['emailGrid', 'emailArticleImageRight', 'emailArticleTwoCards', 'emailFeatureThreeCentered', 'emailBentoGrid', 'emailHeaderSocial', 'emailFooterOneColumn', 'emailDivider', 'emailSpacer'].includes(schema.slug)
    return true
  }) })).filter(group => group.blocks.length)

  return <div className={styles.editor} data-unsteady-theme={theme} data-theme={theme} data-live-editor-site-tools={agentTools.status}>
    <header className={styles.header}>
      <div className={styles.identity}>
        {backToPayloadURL && <a className={styles.payloadBack} href={backToPayloadURL}><ArrowLeft size={16} aria-hidden="true" />Back to Payload</a>}
        <button type="button" aria-label={panelOpen ? 'Hide left panel' : 'Show left panel'} onClick={() => setPanelOpen(!panelOpen)}><PanelLeft size={18} /></button><div><span>LIVE EDITOR <small>{storageLabel}</small></span><strong>{String(page.title || 'Untitled email')}</strong></div>
      </div>
      <div className={styles.headerActions}>
        <button type="button" aria-label="Undo" disabled={!history.canUndo} onClick={() => { setActiveText(null); measure(); history.undo() }}><Undo2 size={17} /></button>
        <button type="button" aria-label="Redo" disabled={!history.canRedo} onClick={() => { setActiveText(null); measure(); history.redo() }}><Redo2 size={17} /></button>
        <div className={styles.previewSizes} role="group" aria-label="Preview size">
          <button type="button" aria-pressed={width === 'desktop'} aria-label="Desktop preview" title="Desktop preview" onClick={() => setWidth('desktop')}><Monitor size={16} /></button>
          <button type="button" aria-pressed={width === 'mobile'} aria-label="Mobile preview" title="Mobile preview" onClick={() => setWidth('mobile')}><Smartphone size={16} /></button>
        </div>
        <span className={styles.saveState}>{saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'Saved'}</span>
        <button type="button" aria-label={`Use ${theme === 'light' ? 'dark' : 'light'} editor`} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}</button>
        <a href={previewURL || undefined} aria-disabled={!previewURL || saving} target="_blank" rel="noreferrer" aria-label="Open preview in a new tab" title="Open preview in a new tab" onClick={event => {
          event.preventDefault()
          if (!previewURL || saving) return
          // Open immediately inside the gesture, then load only the saved native draft.
          const preview = window.open('about:blank', '_blank')
          if (preview) preview.opener = null
          void (async () => {
            if (!await saveForNavigation()) { preview?.close(); return }
            try { await onPreview?.(getCurrent().document); if (preview) preview.location.href = previewURL; else window.location.assign(previewURL) }
            catch (reason) { preview?.close(); setError(reason instanceof Error ? reason.message : 'Unable to prepare the preview.') }
          })()
        }}><ExternalLink size={17} /><span>Preview</span></a>
        <button type="button" disabled={!previewURL} aria-label={copied ? 'Preview link copied' : 'Copy preview link'} title="Copy preview link" onClick={() => {
          if (!previewURL) return
          void navigator.clipboard.writeText(new URL(previewURL, window.location.href).href).then(() => {
            setCopied(true); announce('Preview link copied.'); window.setTimeout(() => setCopied(false), 2000)
          }).catch(() => setError('Unable to copy the preview link.'))
        }}>{copied ? <Check size={17} /> : <Copy size={17} />}</button>
        {audienceURL && <button type="button" disabled={saving} onClick={() => { void saveForNavigation().then(success => { if (success) window.location.assign(audienceURL) }) }}>Continue to Audience<ChevronRight size={15} /></button>}
        <button className={styles.primaryButton} type="button" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save draft'}</button>
      </div>
    </header>
    <div className={styles.textToolbarDock} ref={setToolbarTarget} data-unsteady-text-toolbar-host data-active={Boolean(activeText)} />
    <div className={styles.workspace} ref={workspace} data-panel-open={panelOpen}>
      {panelOpen && <aside className={styles.sidebar} id="unsteady-builder-panel" aria-label="Builder panel">
        <nav className={styles.panelTabs} aria-label="Builder tools">
          {([['blocks', LayoutTemplate, 'Blocks'], ['layers', Layers, 'Layers'], ['page', Settings2, 'Email']] as const).map(([key, Icon, label]) => <button key={key} type="button" aria-pressed={panel === key} onClick={() => { setPanel(key); setActiveText(null) }}><Icon size={16} />{label}</button>)}
          <button type="button" className={styles.closePanel} aria-label="Close left panel" onClick={() => setPanelOpen(false)}><X size={16} /></button>
        </nav>
        <div className={styles.panelContent}>
          {panel === 'blocks' && <>
            <div className={styles.panelTitle}><div><h2>Add to your email</h2><p>{schemas.length} block types · your existing library</p></div></div>
            <label className={styles.search}><Search size={16} /><input aria-label="Search blocks" placeholder="Search blocks…" value={query} onChange={event => setQuery(event.target.value)} /></label>
            <div className={styles.libraryTabs}>{['All', 'Content', 'Media', 'Layout'].map(name => <button type="button" key={name} aria-pressed={library === name} onClick={() => { setLibrary(name); setQuery('') }}>{name}</button>)}</div>
            <label className={styles.destination}>Adding to<select aria-label="New block destination" value={selectedSlot?.id || ''} onChange={event => { const slot = slots.find(item => item.id === event.target.value); if (slot) setInsertTarget(slot.address) }}>{!selectedSlot && <option value="" disabled>Destination removed — choose another</option>}{slots.map(slot => <option key={slot.id} value={slot.id} disabled={slot.active === false}>{slot.label}</option>)}</select></label>
            {visibleGroups.map(group => <section key={group.label} className={styles.blockGroup}><h3>{group.label}</h3><div className={styles.blockGrid}>{group.blocks.map(schema => <button className={styles.paletteItem} type="button" key={schema.slug} aria-label={`Add ${schema.label}`} title={`Click to add ${schema.label}, or drag it onto the email`}
              onPointerDown={event => start(event, { kind: 'palette', type: schema.slug, label: schema.label })}
              onClick={() => { if (skipClick()) return; attempt(() => {
                if (!selectedSlot) throw new Error('The selected destination was removed. Choose another destination.')
                if (selectedSlot.allowedSlugs && !selectedSlot.allowedSlugs.includes(schema.slug)) throw new Error(`${schema.label} cannot go in ${selectedSlot.label}. Choose Email body as the destination.`)
                measure(); add(schema.slug, selectedSlot.address)
              }) }}><LayoutTemplate size={23} /><span>{schema.label}</span><Plus className={styles.palettePlus} size={13} /></button>)}</div></section>)}
            {!visibleGroups.length && <p className={styles.emptyState}>No blocks match “{query}”.</p>}
          </>}
          {panel === 'fields' && currentBlock && currentSchema ? <>
            <button type="button" className={styles.backButton} onClick={() => setPanel('blocks')}><ArrowLeft size={15} />Block library</button>
            <div className={styles.panelTitle}><div><h2>{currentSchema.label}</h2><p>Edit text directly in the email, or adjust details here.</p></div></div>
            <LiveEmailFields emailId={emailId ?? initialPage.id as string | number | undefined} tenantId={tenantId ?? initialPage.tenantId as string | number | undefined} key={selected!} schema={currentSchema} value={currentBlock} lexicalBlockSchemas={lexicalBlockSchemas}
              onChange={next => attempt(() => history.commit(updateBlock(getCurrent().document, selected!, next, { schemas }).document))}
              onArrayAction={action => attempt(() => { setActiveText(null); measure(); history.commit(editOwnedArray(getCurrent().document, selected!, action.path, action, { schemas }).document) })} />
          </> : panel === 'fields' && <p className={styles.emptyState}>Select a block in the email.</p>}
          {panel === 'layers' && <><div className={styles.panelTitle}><h2>Email structure</h2></div>{slots.filter(slot => slot.items.length || slot.path === 'layout').map(slot => <div className={styles.layerGroup} key={slot.id}><h3>{slot.label}</h3>{slot.items.map(block => <button type="button" key={String(block.id)} aria-pressed={String(block.id) === selected} onClick={() => { selectBlock(String(block.id)); findUnsteadyCanvasElement(scroller.current, `[data-unsteady-block="${CSS.escape(String(block.id))}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }}><ChevronRight size={14} /><span>{textLabel(block, schemas.find(item => item.slug === block.blockType))}</span></button>)}</div>)}</>}
          {panel === 'page' && <><div className={styles.panelTitle}><h2>Email settings</h2></div>
            {([['title', 'Email title'], ['subject', 'Subject'], ['preheader', 'Preview text'], ['replyTo', 'Reply-to email']] as const).map(([field, label]) => <label className={styles.pageField} key={field}>{label}<input type={field === 'replyTo' ? 'email' : 'text'} value={String(page[field] || '')} onChange={event => history.commit({ ...getCurrent().document, [field]: event.target.value }, `email:${field}`)} /></label>)}
          </>}

        </div>
      </aside>}
      {panelOpen && <LiveEmailPanelResize workspaceRef={workspace} />}
      <main className={styles.stage}>
        <nav className={styles.canvasNavigation} aria-label="Canvas navigation">
          <button type="button" aria-label="Scroll preview up" title="Scroll preview up" onClick={() => attempt(() => { scrollUnsteadyPreview(scroller.current, { direction: 'up' }) })}><ChevronUp size={16} /></button>
          <button type="button" aria-label="Show selected block in preview" title="Show selected block in preview" disabled={!selected} onClick={() => attempt(() => { if (selected) scrollUnsteadyPreview(scroller.current, { blockId: selected }) })}><LocateFixed size={16} /></button>
          <button type="button" aria-label="Scroll preview down" title="Scroll preview down" onClick={() => attempt(() => { scrollUnsteadyPreview(scroller.current, { direction: 'down' }) })}><ChevronDown size={16} /></button>
        </nav>
        <div className={styles.canvasScroller} ref={scroller} onClick={() => { setActiveText(null); setMoveMenu(null) }}>
          <LiveEmailViewport mobile={width === 'mobile'} theme={theme}>
          <div className={styles.canvas} data-viewport={width} style={{ background: '#fff', color: '#111827', fontFamily: 'Arial, sans-serif' }}
            onSubmitCapture={event => event.preventDefault()} onClickCapture={event => {
              if ((event.target as HTMLElement).closest('a')) event.preventDefault()
            }}>
            {renderSlot(ROOT_SLOT)}
          </div>
          </LiveEmailViewport>
        </div>
        <div className={styles.statusBar} data-visible={Boolean(error || announcement)}><span role={error ? 'alert' : 'status'} aria-live="polite">{error || announcement}</span></div>
      </main>
    </div>
    {drag && <div className={styles.dragGhost} style={{ left: drag.x + 16, top: drag.y + 16 }} aria-hidden="true"><GripHorizontal size={18} /><strong>{drag.item.label}</strong><small>{drag.target ? 'Release to place' : 'Move over a drop zone'}</small></div>}
    <pre hidden data-live-editor-document data-unsteady-document data-revision={history.revision}>{serialized}</pre>
  </div>
}
