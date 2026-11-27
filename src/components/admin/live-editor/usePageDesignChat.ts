'use client'

import { useEffect, useRef, useState } from 'react'
import { createDesignChatTools, captureCanvasTool, captureSitePreviewTool } from '@/lib/live-editor/designChatTools'
import type { UnsteadyAgentBinding } from '@/lib/live-editor/siteTools'
import {
  MAX_CHAT_ATTACHMENTS, MAX_CHAT_BODY, MAX_CHAT_IMAGE, MAX_CHAT_MESSAGE,
  type ChatAttachment, type DesignChatEvent, type DesignChatRequest, type DesignChatThread, type DesignToolCall,
} from '@/lib/live-editor/designChatProtocol'
import { captureDesignSite } from './designChatSiteCapture'
import { prepareDesignChatFile, readDesignChatReference, uploadDesignChatFile, type PendingChatFile } from './designChatAttachments'

async function chatFetch(url: string, signal: AbortSignal, input?: unknown) {
  const response = await fetch(url, {
    signal, credentials: 'same-origin',
    ...(input === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }),
  })
  if (!response.ok) {
    const result = await response.json().catch(() => null)
    throw new Error(result?.error || 'Unable to open the design chat.')
  }
  return response
}

async function readChatEvents(response: Response, onText: (delta: string) => void, onTool: (call: DesignToolCall) => Promise<void>) {
  if (!response.body) throw new Error('The design chat did not send a response.')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) throw new Error('The design chat connection closed before the reply finished.')
      buffer += decoder.decode(value, { stream: true })
      let delimiter = buffer.indexOf('\n')
      while (delimiter !== -1) {
        const event = JSON.parse(buffer.slice(0, delimiter)) as DesignChatEvent
        buffer = buffer.slice(delimiter + 1)
        if (event.type === 'error') throw new Error(event.message)
        if (event.type === 'done') return event.thread
        if (event.type === 'text') onText(event.delta)
        if (event.type === 'tool') await onTool(event.call)
        delimiter = buffer.indexOf('\n')
      }
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}

const editVerbs: Record<string, string> = {
  live_editor_design_section: 'Designed', live_editor_insert_section: 'Added', live_editor_undo: 'Undid an edit',
  live_editor_redo: 'Redid an edit', set_field: 'Updated', edit_text: 'Edited', insert_block: 'Added',
  move_block: 'Moved', duplicate_block: 'Duplicated', remove_block: 'Removed a block',
  reorder_design: 'Reordered', edit_array: 'Updated',
}

function objectValue(value: unknown) {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

export function usePageDesignChat({ apiURL, enabled, binding, selectedId, capture, showEdit }: {
  apiURL: string
  enabled: boolean
  binding: UnsteadyAgentBinding
  selectedId: string | null
  capture: (input: unknown, signal: AbortSignal) => Promise<{ screenshot: string; info: unknown }>
  showEdit: (id: string | null, signal: AbortSignal) => Promise<string | undefined>
}) {
  const url = `${apiURL}/design-chat`
  const [thread, setThread] = useState<DesignChatThread | null>(null)
  const [draft, setDraft] = useState('')
  const [files, setFiles] = useState<PendingChatFile[]>([])
  const [reply, setReply] = useState('')
  const [activity, setActivity] = useState('')
  const [edits, setEdits] = useState<string[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const pending = useRef<AbortController | null>(null)
  const currentEdit = useRef(showEdit)
  const currentCapture = useRef(capture)
  useEffect(() => { currentEdit.current = showEdit; currentCapture.current = capture }, [showEdit, capture])
  useEffect(() => () => {
    const controller = pending.current
    pending.current = null
    controller?.abort()
  }, [url])

  useEffect(() => {
    if (!enabled || pending.current) return
    const controller = new AbortController()
    const { signal } = controller
    let timer: ReturnType<typeof setTimeout>
    const load = async () => {
      try {
        const response = await chatFetch(url, signal)
        const next = await response.json() as DesignChatThread
        if (signal.aborted || pending.current) return
        setThread(next)
        if (next.busy) timer = setTimeout(load, 1500)
      } catch (cause) {
        if (!signal.aborted && !pending.current) setError((cause as Error).message)
      } finally {
        if (!signal.aborted) setLoading(false)
      }
    }
    setLoading(true)
    void load()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [enabled, refresh, url])

  const addFiles = (incoming: File[]) => {
    if (pending.current) return
    const prepared: PendingChatFile[] = []
    for (const file of incoming) {
      try { prepared.push(prepareDesignChatFile(file)) } catch (cause) { setError((cause as Error).message) }
    }
    if (files.length + prepared.length > MAX_CHAT_ATTACHMENTS) setError(`Attach up to ${MAX_CHAT_ATTACHMENTS} files per message.`)
    else if (prepared.length === incoming.length) setError('')
    setFiles(current => [...current, ...prepared].slice(0, MAX_CHAT_ATTACHMENTS))
  }

  const send = async () => {
    if (!thread || thread.busy || pending.current || (!draft.trim() && !files.length)) return
    const controller = new AbortController()
    const { signal } = controller
    pending.current = controller
    setReply(''); setError(''); setEdits([]); setActivity('Preparing your message')
    try {
      const attachments: ChatAttachment[] = []
      for (const pendingFile of files) {
        const reference = await readDesignChatReference(pendingFile)
        if (reference) attachments.push(reference)
      }
      const message = { content: draft.trim().slice(0, MAX_CHAT_MESSAGE), attachments }
      const request: DesignChatRequest = { chatId: thread.id, message, ...(selectedId ? { selectedId } : {}) }
      if (new TextEncoder().encode(JSON.stringify(request)).length > MAX_CHAT_BODY - 4_000) {
        throw new Error('These references are too large together. Remove or reduce a file.')
      }
      for (const pendingFile of files) {
        signal.throwIfAborted()
        if (!pendingFile.useInDraft && !pendingFile.uploaded) continue
        setActivity(`Adding ${pendingFile.file.name} to the site library`)
        const uploaded = pendingFile.uploaded ?? await uploadDesignChatFile(apiURL, pendingFile, signal)
        setFiles(current => current.map(item => item.id === pendingFile.id ? { ...item, uploaded } : item))
        attachments.push(uploaded)
      }
      setActivity('Thinking')
      const response = await chatFetch(url, signal, request)
      signal.throwIfAborted()
      setThread({
        ...thread, messages: [...thread.messages, { id: 'pending', role: 'user', content: message.content, attachments }],
      })
      setDraft(value => value === draft ? '' : value); setFiles([])
      const tools = new Map(createDesignChatTools(binding).map(tool => [tool.name, tool]))
      let imageBytes = 0
      const next = await readChatEvents(response, delta => setReply(text => text + delta), async call => {
        signal.throwIfAborted()
        const tool = tools.get(call.name)
        setActivity(tool?.title ?? (call.name === captureSitePreviewTool.name ? captureSitePreviewTool.title : captureCanvasTool.title))
        let output: string
        let screenshot: string | undefined
        let changed: { id: string | null; operation: string } | undefined
        try {
          if (call.name === captureCanvasTool.name || call.name === captureSitePreviewTool.name) {
            const result = call.name === captureSitePreviewTool.name
              ? await captureDesignSite({ apiURL, binding, call, signal })
              : await currentCapture.current(call.arguments, signal)
            imageBytes += result.screenshot.length
            if (imageBytes <= MAX_CHAT_IMAGE * 8) {
              screenshot = result.screenshot
              output = JSON.stringify(result.info)
            } else {
              output = JSON.stringify({ geometry: result.info, detail: 'This turn has reached its image budget. Inspect the canvas in a follow-up.' })
            }
          } else if (tool) {
            const revision = binding.getState().revision
            const result = await tool.execute(call.arguments, { signal })
            output = JSON.stringify({ ok: !result.isError, data: result.structuredContent })
            if (!result.isError && !tool.annotations.readOnlyHint && binding.getState().revision !== revision) {
              const data = objectValue(result.structuredContent)
              const id = data.sectionId ?? data.selectedId
              const command = objectValue(objectValue(call.arguments).command)
              changed = { id: id == null ? null : String(id), operation: typeof command.type === 'string' ? command.type : call.name }
            }
          } else throw new Error('This action is unavailable in design chat.')
        } catch (cause) {
          output = JSON.stringify({ ok: false, error: cause instanceof Error ? cause.message : 'The editor tool failed.' })
        }
        signal.throwIfAborted()
        if (changed) {
          const verb = editVerbs[changed.operation] ?? 'Updated'
          const label = await currentEdit.current(changed.id, signal)
          signal.throwIfAborted()
          setEdits(current => [...current, label ? `${verb} ${label}` : changed.id ? `${verb} a draft block` : editVerbs[changed.operation] ?? 'Updated the draft'])
          await new Promise(resolve => setTimeout(resolve, 420))
        }
        signal.throwIfAborted()
        if (output.length > 64_000) output = JSON.stringify({
          partial: output.slice(0, 9_000), detail: 'The result is large. Request a specific block or query.',
        })
        await chatFetch(`${url}/tool`, signal, { id: call.id, output, screenshot })
        if (!signal.aborted) setActivity('Thinking')
      })
      if (!signal.aborted) setThread(next)
    } catch (cause) {
      if (pending.current === controller) {
        setError(signal.aborted ? 'Stopped. Any applied edits are in the draft and can be undone.' : (cause as Error).message)
        setRefresh(value => value + 1)
      }
    } finally {
      if (pending.current === controller) {
        pending.current = null
        setReply(''); setActivity('')
      }
    }
  }

  const clear = async () => {
    if (pending.current || !thread || thread.busy) return
    const controller = new AbortController()
    pending.current = controller
    setActivity('Starting a new chat'); setError('')
    try {
      const response = await chatFetch(`${url}/reset`, controller.signal, { chatId: thread.id })
      const next = await response.json() as DesignChatThread
      controller.signal.throwIfAborted()
      setThread(next); setEdits([]); setFiles([]); setDraft('')
    } catch (cause) {
      if (!controller.signal.aborted) { setError((cause as Error).message); setRefresh(value => value + 1) }
    } finally {
      if (pending.current === controller) { pending.current = null; setActivity('') }
    }
  }

  return {
    messages: thread?.messages ?? [], draft, setDraft, files, addFiles, reply, activity, edits, error, send, clear,
    available: Boolean(thread && !thread.busy && !loading && !activity),
    loading, busyElsewhere: Boolean(thread?.busy && !activity),
    retry: () => { setError(''); setRefresh(value => value + 1) },
    stop: () => pending.current?.abort(),
    removeFile: (id: string) => setFiles(current => current.filter(item => item.id !== id)),
    useInDraft: (id: string, checked: boolean) => setFiles(current => current.map(item => item.id === id ? { ...item, useInDraft: checked } : item)),
  }
}
