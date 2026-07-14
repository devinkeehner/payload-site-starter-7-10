'use client'

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Bold,
  BringToFront,
  Circle,
  ClipboardPaste,
  Copy,
  Download,
  Eye,
  EyeOff,
  GripVertical,
  ImageIcon,
  ImageUp,
  Italic,
  Layers,
  Link,
  List,
  ListOrdered,
  Lock,
  Minus,
  Palette,
  Redo2,
  RotateCw,
  Save,
  SendToBack,
  Shapes,
  SlidersHorizontal,
  Square,
  Strikethrough,
  Trash2,
  Type,
  Underline,
  Undo2,
  Unlock,
} from 'lucide-react'
import Image from 'next/image'
import NextLink from 'next/link'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { PuckMediaField, getMediaResource } from '@/components/admin/puck/PuckMediaField'
import {
  buildSelfContainedGraphicSvg,
  createGraphicScenePdfBlob,
  downloadGraphicBlob,
  renderGraphicSceneToPngBlob,
  sanitizeGraphicRichHtml,
} from '@/lib/graphics/studioExport.client'
import {
  GRAPHIC_CANVAS_PRESETS,
  createGraphicLayerId,
  type GraphicCanvasPreset,
  type GraphicImageLayer,
  type GraphicLayer,
  type GraphicScene,
  type GraphicShapeLayer,
  type GraphicTextLayer,
} from '@/lib/graphics/studioTypes'

import styles from './graphic-design-studio.module.css'

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'
type PointerMode = 'drag' | 'resize' | 'rotate' | 'line-start' | 'line-end'
type ToolPanel = 'colors' | 'elements' | 'images' | 'layers' | 'properties' | 'text'
type PointerSession = {
  hasMoved: boolean
  layer: GraphicLayer
  mode: PointerMode
  pointerX: number
  pointerY: number
}
type ContextMenuState = {
  layerId: string | null
  x: number
  y: number
}

const MIN_LAYER_SIZE = 32
const MAX_HISTORY = 30
const LINE_HANDLE_PADDING = 18
const FONT_OPTIONS = [
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Arial Black', value: '"Arial Black", Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Trebuchet MS', value: 'Trebuchet MS, sans-serif' },
  { label: 'Tahoma', value: 'Tahoma, Verdana, sans-serif' },
  { label: 'Courier New', value: '"Courier New", Courier, monospace' },
  { label: 'Impact', value: 'Impact, Haettenschweiler, sans-serif' },
] as const
const FONT_SIZE_OPTIONS = [12, 16, 20, 24, 32, 40, 48, 56, 64, 72, 84, 96, 120, 144] as const
const RICH_BLOCK_OPTIONS = [
  { label: 'Paragraph', value: 'p' },
  { label: 'Heading 1', value: 'h1' },
  { label: 'Heading 2', value: 'h2' },
  { label: 'Heading 3', value: 'h3' },
  { label: 'Heading 4', value: 'h4' },
] as const
type RichBlockFormat = (typeof RICH_BLOCK_OPTIONS)[number]['value']
const GENERAL_COLORS = ['#ffffff', '#111827', '#2563eb', '#dc2626', '#f59e0b', '#16a34a', '#7c3aed', '#ec4899']

function getLayerLabel(layer: GraphicLayer) {
  return layer.name || (layer.type === 'text' ? 'Text' : layer.type === 'image' ? 'Image' : 'Shape')
}

function getExportFilename(title: string, extension: 'pdf' | 'png' | 'svg') {
  const safeTitle = (title || 'graphic').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim() || 'graphic'
  return `${safeTitle}.${extension}`
}

function getRichBlockFormat(range: Range, editable: HTMLDivElement): RichBlockFormat {
  const startElement = range.startContainer instanceof Element
    ? range.startContainer
    : range.startContainer.parentElement
  const block = startElement?.closest('p,h1,h2,h3,h4')
  if (!block || !editable.contains(block)) return 'p'
  const tagName = block.tagName.toLowerCase()
  return RICH_BLOCK_OPTIONS.some((option) => option.value === tagName) ? tagName as RichBlockFormat : 'p'
}


function snapLineDelta(width: number, height: number) {
  const length = Math.hypot(width, height)
  if (!length) return { height, width }
  const angle = Math.atan2(height, width)
  const snappedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4)
  return { width: Math.cos(snappedAngle) * length, height: Math.sin(snappedAngle) * length }
}

function getLineFrame(layer: GraphicShapeLayer) {
  const endX = layer.x + layer.width
  const endY = layer.y + layer.height
  const left = Math.min(layer.x, endX) - LINE_HANDLE_PADDING
  const top = Math.min(layer.y, endY) - LINE_HANDLE_PADDING
  return {
    endX: endX - left,
    endY: endY - top,
    height: Math.max(Math.abs(layer.height) + LINE_HANDLE_PADDING * 2, LINE_HANDLE_PADDING * 2),
    left,
    startX: layer.x - left,
    startY: layer.y - top,
    top,
    width: Math.max(Math.abs(layer.width) + LINE_HANDLE_PADDING * 2, LINE_HANDLE_PADDING * 2),
  }
}

export function GraphicDesignStudioEditor({
  designId,
  initialScene,
  sourcePostId,
  tenantId,
  tenantColors,
  title,
}: {
  designId: string | null
  initialScene: GraphicScene
  sourcePostId?: string | null
  tenantId?: string | null
  tenantColors: { accent: string; background: string; primary: string }
  title: string
}) {
  const [scene, setScene] = useState<GraphicScene>(initialScene)
  const [designTitle, setDesignTitle] = useState(title)
  const [selectedId, setSelectedId] = useState<string | null>(initialScene.layers[0]?.id || null)
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const [activeBlockFormat, setActiveBlockFormat] = useState<RichBlockFormat>('p')
  const [activePanel, setActivePanel] = useState<ToolPanel>('elements')
  const [zoom, setZoom] = useState(0.6)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [exportStatus, setExportStatus] = useState<string | null>(null)
  const [history, setHistory] = useState<GraphicScene[]>([])
  const [future, setFuture] = useState<GraphicScene[]>([])
  const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null)
  const [layerOrderPreview, setLayerOrderPreview] = useState<string[] | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [hasCopiedLayer, setHasCopiedLayer] = useState(false)
  const pointerSession = useRef<PointerSession | null>(null)
  const pendingCaretPoint = useRef<{ x: number; y: number } | null>(null)
  const richSelectionRef = useRef<Range | null>(null)
  const copiedLayerRef = useRef<GraphicLayer | null>(null)
  const pasteCountRef = useRef(0)
  const sceneRef = useRef(scene)
  const titleRef = useRef(designTitle)
  const initialized = useRef(false)
  const editableRef = useRef<HTMLDivElement | null>(null)
  const selectedLayer = useMemo(() => scene.layers.find((layer) => layer.id === selectedId) || null, [scene.layers, selectedId])
  const editingTextLayer = useMemo(
    () => scene.layers.find((layer): layer is GraphicTextLayer => layer.id === editingTextId && layer.type === 'text') || null,
    [editingTextId, scene.layers],
  )
  const displayLayers = useMemo(() => {
    const layersById = new Map(scene.layers.map((layer) => [layer.id, layer]))
    const order = layerOrderPreview || [...scene.layers].reverse().map((layer) => layer.id)
    return order.flatMap((id) => {
      const layer = layersById.get(id)
      return layer ? [layer] : []
    })
  }, [layerOrderPreview, scene.layers])
  const tenantPalette = useMemo(() => Array.from(new Set([tenantColors.primary, tenantColors.accent, tenantColors.background])), [tenantColors])

  useEffect(() => {
    sceneRef.current = scene
  }, [scene])

  useEffect(() => {
    titleRef.current = designTitle
  }, [designTitle])

  useEffect(() => {
    if (!editingTextId || !editableRef.current) return
    const layer = sceneRef.current.layers.find((item) => item.id === editingTextId)
    if (layer?.type !== 'text') return
    editableRef.current.innerHTML = sanitizeGraphicRichHtml(layer.html)
    editableRef.current.focus({ preventScroll: true })
    const point = pendingCaretPoint.current
    pendingCaretPoint.current = null
    const selection = window.getSelection()
    const range = document.createRange()
    const caretPosition = point ? document.caretPositionFromPoint?.(point.x, point.y) : null
    if (caretPosition && editableRef.current.contains(caretPosition.offsetNode)) {
      range.setStart(caretPosition.offsetNode, caretPosition.offset)
    } else {
      range.selectNodeContents(editableRef.current)
      range.collapse(false)
    }
    range.collapse(true)
    selection?.removeAllRanges()
    selection?.addRange(range)
    richSelectionRef.current = range.cloneRange()
    setActiveBlockFormat(getRichBlockFormat(range, editableRef.current))
  }, [editingTextId])

  const startTextEditing = useCallback((id: string, point?: { x: number; y: number }) => {
    const layer = sceneRef.current.layers.find((item) => item.id === id)
    if (layer?.type !== 'text' || layer.locked) return
    pointerSession.current = null
    pendingCaretPoint.current = point || null
    setSelectedId(id)
    setEditingTextId((current) => {
      if (current === id) {
        window.requestAnimationFrame(() => editableRef.current?.focus({ preventScroll: true }))
      }
      return id
    })
  }, [])

  const commitScene = useCallback((updater: (current: GraphicScene) => GraphicScene, recordHistory = true) => {
    setScene((current) => {
      const next = updater(current)
      if (next === current) return current
      if (recordHistory) {
        setHistory((items) => [...items.slice(-(MAX_HISTORY - 1)), current])
        setFuture([])
      }
      return next
    })
    setSaveState('dirty')
  }, [])

  const updateLayer = useCallback((id: string, patch: Partial<GraphicLayer>, recordHistory = true) => {
    commitScene(
      (current) => ({
        ...current,
        layers: current.layers.map((layer) => (layer.id === id ? ({ ...layer, ...patch } as GraphicLayer) : layer)),
      }),
      recordHistory,
    )
  }, [commitScene])

  const save = useCallback(async () => {
    if (!designId) return
    setSaveState('saving')
    setSaveError(null)
    try {
      const response = await fetch(`/api/graphic-designs/${encodeURIComponent(designId)}?draft=true`, {
        body: JSON.stringify({ studioScene: sceneRef.current, title: titleRef.current.trim() || 'Untitled design' }),
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          ...(tenantId ? { 'X-Payload-Tenant': tenantId } : {}),
        },
        method: 'PATCH',
      })
      if (!response.ok) throw new Error(await response.text())
      setSaveState('saved')
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save design')
      setSaveState('error')
    }
  }, [designId, tenantId])

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true
      return
    }
    if (saveState !== 'dirty' || !designId) return
    const timer = window.setTimeout(() => void save(), 900)
    return () => window.clearTimeout(timer)
  }, [designId, save, saveState, scene])

  const undo = useCallback(() => {
    const previous = history.at(-1)
    if (!previous) return
    setHistory((items) => items.slice(0, -1))
    setFuture((items) => [sceneRef.current, ...items].slice(0, MAX_HISTORY))
    setScene(previous)
    setSaveState('dirty')
  }, [history])

  const redo = useCallback(() => {
    const next = future[0]
    if (!next) return
    setFuture((items) => items.slice(1))
    setHistory((items) => [...items, sceneRef.current].slice(-MAX_HISTORY))
    setScene(next)
    setSaveState('dirty')
  }, [future])

  const addText = () => {
    const layer: GraphicTextLayer = {
      color: tenantColors.primary,
      fontFamily: FONT_OPTIONS[0].value,
      fontSize: 72,
      height: 180,
      html: '<p>Edit this text</p>',
      id: createGraphicLayerId('text'),
      lineHeight: 1.1,
      name: 'Text',
      rotation: 0,
      textAlign: 'left',
      type: 'text',
      width: 640,
      x: 120,
      y: 120,
    }
    commitScene((current) => ({ ...current, layers: [...current.layers, layer] }))
    setSelectedId(layer.id)
    setEditingTextId(layer.id)
  }

  const addShape = (shape: GraphicShapeLayer['shape']) => {
    const layer: GraphicShapeLayer = {
      borderColor: tenantColors.primary,
      borderRadius: 0,
      borderWidth: shape === 'line' ? 8 : 0,
      fill: tenantColors.primary,
      height: shape === 'line' ? 0 : 280,
      id: createGraphicLayerId('shape'),
      name: shape.charAt(0).toUpperCase() + shape.slice(1),
      rotation: 0,
      shape,
      type: 'shape',
      width: 420,
      x: 180,
      y: 180,
    }
    commitScene((current) => ({ ...current, layers: [...current.layers, layer] }))
    setSelectedId(layer.id)
  }

  const addImage = (value: unknown) => {
    const media = getMediaResource(value)
    if (!media?.url) return
    const layer: GraphicImageLayer = {
      alt: media.alt || media.filename || 'Graphic image',
      height: 420,
      id: createGraphicLayerId('image'),
      mediaId: media.id == null ? undefined : String(media.id),
      name: media.alt || media.filename || 'Image',
      objectFit: 'cover',
      rotation: 0,
      type: 'image',
      url: media.url,
      width: 420,
      x: 160,
      y: 160,
    }
    commitScene((current) => ({ ...current, layers: [...current.layers, layer] }))
    setSelectedId(layer.id)
  }

  const duplicateSelected = useCallback(() => {
    if (!selectedLayer) return
    const copy = {
      ...selectedLayer,
      id: createGraphicLayerId(selectedLayer.type),
      name: `${selectedLayer.name} copy`,
      x: selectedLayer.x + 28,
      y: selectedLayer.y + 28,
    } as GraphicLayer
    commitScene((current) => ({ ...current, layers: [...current.layers, copy] }))
    setSelectedId(copy.id)
  }, [commitScene, selectedLayer])

  const copySelected = useCallback(() => {
    if (!selectedLayer) return
    copiedLayerRef.current = { ...selectedLayer }
    pasteCountRef.current = 0
    setHasCopiedLayer(true)
  }, [selectedLayer])

  const pasteCopied = useCallback(() => {
    const source = copiedLayerRef.current
    if (!source) return
    pasteCountRef.current += 1
    const offset = pasteCountRef.current * 28
    const pastedLayer = {
      ...source,
      id: createGraphicLayerId(source.type),
      name: `${source.name} copy`,
      x: source.x + offset,
      y: source.y + offset,
    } as GraphicLayer
    commitScene((current) => ({ ...current, layers: [...current.layers, pastedLayer] }))
    setSelectedId(pastedLayer.id)
    setEditingTextId(null)
  }, [commitScene])

  const deleteSelected = useCallback(() => {
    if (!selectedLayer || selectedLayer.locked) return
    commitScene((current) => ({ ...current, layers: current.layers.filter((layer) => layer.id !== selectedLayer.id) }))
    setSelectedId(null)
    setEditingTextId(null)
  }, [commitScene, selectedLayer])

  const moveLayer = useCallback((direction: 'back' | 'front') => {
    if (!selectedLayer) return
    commitScene((current) => {
      const layers = current.layers.filter((layer) => layer.id !== selectedLayer.id)
      if (direction === 'front') layers.push(selectedLayer)
      else layers.unshift(selectedLayer)
      return { ...current, layers }
    })
  }, [commitScene, selectedLayer])

  const openContextMenu = (event: React.MouseEvent, layerId: string | null) => {
    const target = event.target as HTMLElement
    if (target.closest('[contenteditable="true"]')) return
    event.preventDefault()
    event.stopPropagation()
    setSelectedId(layerId)
    setEditingTextId(null)
    setContextMenu({
      layerId,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 228)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 380)),
    })
  }

  const runContextAction = (action: () => void) => {
    action()
    setContextMenu(null)
  }

  const previewLayerReorder = (targetId: string) => {
    if (!draggedLayerId) return
    setLayerOrderPreview((current) => {
      const order = current || [...sceneRef.current.layers].reverse().map((layer) => layer.id)
      const sourceIndex = order.indexOf(draggedLayerId)
      if (sourceIndex < 0 || sourceIndex === order.indexOf(targetId)) return order
      const next = order.filter((id) => id !== draggedLayerId)
      const targetIndex = next.indexOf(targetId)
      if (targetIndex < 0) return order
      const draggedId = order[sourceIndex]
      if (!draggedId) return order
      next.splice(targetIndex, 0, draggedId)
      return next
    })
  }

  const finishLayerReorder = () => {
    const preview = layerOrderPreview
    const original = [...sceneRef.current.layers].reverse().map((layer) => layer.id)
    setDraggedLayerId(null)
    setLayerOrderPreview(null)
    if (!preview || preview.every((id, index) => id === original[index])) return
    commitScene((current) => {
      const layersById = new Map(current.layers.map((layer) => [layer.id, layer]))
      const reordered = preview.flatMap((id) => {
        const layer = layersById.get(id)
        return layer ? [layer] : []
      })
      return { ...current, layers: reordered.reverse() }
    })
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName || '')) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        duplicateSelected()
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
        if (!selectedLayer) return
        event.preventDefault()
        copySelected()
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
        if (!copiedLayerRef.current) return
        event.preventDefault()
        pasteCopied()
        return
      }
      if (event.key === 'Escape' && contextMenu) {
        event.preventDefault()
        setContextMenu(null)
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        deleteSelected()
        return
      }
      if (!selectedLayer || selectedLayer.locked || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
      event.preventDefault()
      const distance = event.shiftKey ? 10 : 1
      updateLayer(selectedLayer.id, {
        x: selectedLayer.x + (event.key === 'ArrowLeft' ? -distance : event.key === 'ArrowRight' ? distance : 0),
        y: selectedLayer.y + (event.key === 'ArrowUp' ? -distance : event.key === 'ArrowDown' ? distance : 0),
      })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [contextMenu, copySelected, deleteSelected, duplicateSelected, pasteCopied, redo, selectedLayer, undo, updateLayer])

  useEffect(() => {
    if (!contextMenu) return
    const dismissContextMenu = () => setContextMenu(null)
    window.addEventListener('pointerdown', dismissContextMenu)
    window.addEventListener('resize', dismissContextMenu)
    window.addEventListener('blur', dismissContextMenu)
    return () => {
      window.removeEventListener('pointerdown', dismissContextMenu)
      window.removeEventListener('resize', dismissContextMenu)
      window.removeEventListener('blur', dismissContextMenu)
    }
  }, [contextMenu])

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const session = pointerSession.current
      if (!session) return
      const deltaX = (event.clientX - session.pointerX) / zoom
      const deltaY = (event.clientY - session.pointerY) / zoom
      if (!session.hasMoved) {
        if (Math.abs(deltaX) + Math.abs(deltaY) < 0.75) return
        session.hasMoved = true
        setHistory((items) => [...items.slice(-(MAX_HISTORY - 1)), sceneRef.current])
        setFuture([])
      }
      if (session.mode === 'drag') {
        updateLayer(session.layer.id, { x: session.layer.x + deltaX, y: session.layer.y + deltaY }, false)
      } else if (session.mode === 'resize') {
        updateLayer(session.layer.id, {
          height: Math.max(MIN_LAYER_SIZE, session.layer.height + deltaY),
          width: Math.max(MIN_LAYER_SIZE, session.layer.width + deltaX),
        }, false)
      } else if (session.mode === 'line-end' && session.layer.type === 'shape') {
        const delta = event.shiftKey
          ? snapLineDelta(session.layer.width + deltaX, session.layer.height + deltaY)
          : { width: session.layer.width + deltaX, height: session.layer.height + deltaY }
        updateLayer(session.layer.id, delta, false)
      } else if (session.mode === 'line-start' && session.layer.type === 'shape') {
        const endX = session.layer.x + session.layer.width
        const endY = session.layer.y + session.layer.height
        const candidateX = session.layer.x + deltaX
        const candidateY = session.layer.y + deltaY
        const delta = event.shiftKey
          ? snapLineDelta(endX - candidateX, endY - candidateY)
          : { width: endX - candidateX, height: endY - candidateY }
        updateLayer(session.layer.id, { x: endX - delta.width, y: endY - delta.height, ...delta }, false)
      } else if (session.mode === 'rotate') {
        const centerX = session.layer.x + session.layer.width / 2
        const centerY = session.layer.y + session.layer.height / 2
        const canvas = document.querySelector(`.${styles.canvas}`)?.getBoundingClientRect()
        if (!canvas) return
        const x = (event.clientX - canvas.left) / zoom
        const y = (event.clientY - canvas.top) / zoom
        updateLayer(session.layer.id, { rotation: Math.round((Math.atan2(y - centerY, x - centerX) * 180) / Math.PI + 90) }, false)
      }
    }
    const onPointerUp = () => {
      if (pointerSession.current?.hasMoved) setSaveState('dirty')
      pointerSession.current = null
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [updateLayer, zoom])

  const beginPointer = (event: React.PointerEvent, layer: GraphicLayer, mode: PointerMode) => {
    event.stopPropagation()
    if (layer.locked || editingTextId === layer.id) return
    if (layer.type !== 'text' || mode !== 'drag') event.preventDefault()
    setSelectedId(layer.id)
    pointerSession.current = { hasMoved: false, layer, mode, pointerX: event.clientX, pointerY: event.clientY }
  }

  const rememberRichSelection = () => {
    const selection = window.getSelection()
    if (!selection?.rangeCount || !editableRef.current) return
    const range = selection.getRangeAt(0)
    if (editableRef.current.contains(range.commonAncestorContainer)) {
      richSelectionRef.current = range.cloneRange()
      setActiveBlockFormat(getRichBlockFormat(range, editableRef.current))
    }
  }

  const syncEditedHtml = (recordHistory = true) => {
    if (!editingTextId || !editableRef.current) return
    const html = sanitizeGraphicRichHtml(editableRef.current.innerHTML)
    const currentLayer = sceneRef.current.layers.find((layer) => layer.id === editingTextId)
    if (currentLayer?.type !== 'text' || currentLayer.html === html) return
    updateLayer(editingTextId, { html }, recordHistory)
  }

  const applyRichCommand = (command: string, value?: string) => {
    editableRef.current?.focus()
    if (richSelectionRef.current) {
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(richSelectionRef.current)
    }
    document.execCommand(command, false, value)
    rememberRichSelection()
    syncEditedHtml()
  }

  const applyBlockFormat = (format: RichBlockFormat) => {
    applyRichCommand('formatBlock', format)
    setActiveBlockFormat(format)
  }

  const changeTextFont = (fontFamily: string) => {
    if (!editingTextId) return
    updateLayer(editingTextId, { fontFamily })
  }

  const changePreset = (preset: GraphicCanvasPreset) => {
    const dimensions = GRAPHIC_CANVAS_PRESETS[preset]
    commitScene((current) => ({ ...current, preset, width: dimensions.width, height: dimensions.height }))
  }

  const exportSvg = async () => {
    setExportStatus('Preparing SVG…')
    try {
      const svg = await buildSelfContainedGraphicSvg(sceneRef.current)
      downloadGraphicBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), getExportFilename(designTitle, 'svg'))
      setExportStatus('SVG downloaded')
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : 'SVG export failed')
    }
  }

  const exportPng = async () => {
    setExportStatus('Preparing PNG…')
    try {
      const blob = await renderGraphicSceneToPngBlob(sceneRef.current)
      downloadGraphicBlob(blob, getExportFilename(designTitle, 'png'))
      setExportStatus('PNG downloaded')
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : 'PNG export failed')
    }
  }

  const exportPdf = async () => {
    setExportStatus('Preparing print-quality PDF…')
    try {
      const blob = await createGraphicScenePdfBlob(sceneRef.current, designTitle || 'Graphic design')
      downloadGraphicBlob(blob, getExportFilename(designTitle, 'pdf'))
      setExportStatus('PDF downloaded')
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : 'PDF export failed')
    }
  }

  const saveToPostSeo = async () => {
    if (!designId || !sourcePostId || !tenantId) {
      setExportStatus('This design must be linked to a Post and tenant before it can become the SEO image.')
      return
    }

    setExportStatus('Rendering and saving the Post SEO image…')
    try {
      await save()
      const blob = await renderGraphicSceneToPngBlob(sceneRef.current)
      const filenameBase = (designTitle || 'post-graphic')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'post-graphic'
      const formData = new FormData()
      formData.append('file', new File([blob], `${filenameBase}.png`, { type: 'image/png' }))
      formData.append('alt', designTitle || 'Post social graphic')
      formData.append('tenant', tenantId)

      const uploadResponse = await fetch('/api/media-canvas/upload', {
        body: formData,
        credentials: 'include',
        headers: { 'X-Payload-Tenant': tenantId },
        method: 'POST',
      })
      const uploadPayload = await uploadResponse.json() as { doc?: { id?: string | number }; id?: string | number; message?: string }
      if (!uploadResponse.ok) throw new Error(uploadPayload.message || 'Unable to upload the SEO image')
      const mediaId = uploadPayload.doc?.id ?? uploadPayload.id
      if (mediaId == null) throw new Error('The media upload did not return an ID')

      const postResponse = await fetch(`/api/posts/${encodeURIComponent(sourcePostId)}?draft=true&depth=0`, {
        cache: 'no-store',
        credentials: 'include',
        headers: { 'X-Payload-Tenant': tenantId },
      })
      const postPayload = await postResponse.json() as { meta?: Record<string, unknown>; message?: string }
      if (!postResponse.ok) throw new Error(postPayload.message || 'Unable to load the Post before updating its SEO image')

      const [designResponse, updatePostResponse] = await Promise.all([
        fetch(`/api/graphic-designs/${encodeURIComponent(designId)}?draft=true`, {
          body: JSON.stringify({ exportedMedia: mediaId, studioScene: sceneRef.current, title: titleRef.current.trim() || 'Untitled design' }),
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-Payload-Tenant': tenantId },
          method: 'PATCH',
        }),
        fetch(`/api/posts/${encodeURIComponent(sourcePostId)}?draft=true`, {
          body: JSON.stringify({
            graphicDesign: designId,
            meta: { ...(postPayload.meta || {}), image: mediaId },
          }),
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-Payload-Tenant': tenantId },
          method: 'PATCH',
        }),
      ])
      if (!designResponse.ok) throw new Error(await designResponse.text())
      if (!updatePostResponse.ok) throw new Error(await updatePostResponse.text())

      setExportStatus('Saved to the Media Gallery and set as this Post’s SEO/social image.')
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : 'Unable to save the Post SEO image')
    }
  }

  const applyColor = (color: string) => {
    if (!selectedLayer) {
      commitScene((current) => ({ ...current, background: color }))
    } else if (selectedLayer.type === 'text') {
      updateLayer(selectedLayer.id, { color })
    } else if (selectedLayer.type === 'shape') {
      updateLayer(selectedLayer.id, selectedLayer.shape === 'line' ? { borderColor: color } : { fill: color })
    }
  }

  const openPanel = (panel: ToolPanel) => setActivePanel(panel)

  if (!designId) return <div className={styles.createNotice}>Save this Graphic Design first, then open the Design Studio tab.</div>

  const toolButtons: Array<{ icon: React.ReactNode; id: ToolPanel; label: string }> = [
    { icon: <Shapes />, id: 'elements', label: 'Elements' },
    { icon: <ImageIcon />, id: 'images', label: 'Images' },
    { icon: <Type />, id: 'text', label: 'Text' },
    { icon: <Palette />, id: 'colors', label: 'Colors' },
    { icon: <Layers />, id: 'layers', label: 'Layers' },
    { icon: <SlidersHorizontal />, id: 'properties', label: 'Properties' },
  ]

  return (
    <div className={styles.wrapper} data-hro-fullscreen-builder="graphic-design">
      <header className={styles.header}>
        <div><input aria-label="Design title" className={styles.titleInput} maxLength={120} onChange={(event) => { setDesignTitle(event.target.value); setSaveState('dirty') }} value={designTitle} /><span>{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save failed' : saveState === 'dirty' ? 'Unsaved changes' : 'Ready'}</span></div>
        <div className={styles.headerControls}>
          <select aria-label="Canvas size" onChange={(event) => changePreset(event.target.value as GraphicCanvasPreset)} value={scene.preset}>
            {Object.entries(GRAPHIC_CANVAS_PRESETS).map(([value, preset]) => <option key={value} value={value}>{preset.label} · {preset.width}×{preset.height}</option>)}
          </select>
          <label>Zoom <input max="1.25" min="0.2" onChange={(event) => setZoom(Number(event.target.value))} step="0.05" type="range" value={zoom} /><span>{Math.round(zoom * 100)}%</span></label>
        </div>
        <div className={styles.headerActions}>
          <button disabled={!history.length} onClick={undo} title="Undo" type="button"><Undo2 /></button>
          <button disabled={!future.length} onClick={redo} title="Redo" type="button"><Redo2 /></button>
          <button onClick={() => void save()} title="Save now" type="button"><Save /> Save</button>
          <button onClick={() => void exportSvg()} title="Download SVG" type="button"><Download /> SVG</button>
          <button onClick={() => void exportPng()} title="Download PNG" type="button"><Download /> PNG</button>
          <button onClick={() => void exportPdf()} title="Download print-quality PDF" type="button"><Download /> PDF</button>
          {sourcePostId ? <button onClick={() => void saveToPostSeo()} title="Save to Post SEO image and Media Gallery" type="button"><ImageUp /> Post SEO</button> : null}
          <NextLink className={styles.backButton} href="/admin/collections/graphic-designs"><ArrowLeft />Back to Payload</NextLink>
        </div>
      </header>

      <div aria-hidden={!editingTextId} className={`${styles.richToolbar} ${editingTextId ? '' : styles.richToolbarIdle}`}>
        {editingTextId ? (
          <>
          <select aria-label="Font family" className={styles.fontPicker} onChange={(event) => changeTextFont(event.target.value)} value={editingTextLayer?.fontFamily || FONT_OPTIONS[0].value}>
            {editingTextLayer && !FONT_OPTIONS.some((font) => font.value === editingTextLayer.fontFamily) ? <option value={editingTextLayer.fontFamily}>Current font</option> : null}
            {FONT_OPTIONS.map((font) => <option key={font.value} style={{ fontFamily: font.value }} value={font.value}>{font.label}</option>)}
          </select>
          <label className={styles.fontSizePicker}>Size
            <select aria-label="Base font size" onChange={(event) => { if (editingTextId) updateLayer(editingTextId, { fontSize: Number(event.target.value) }) }} value={editingTextLayer?.fontSize || FONT_SIZE_OPTIONS[5]}>
              {editingTextLayer && !FONT_SIZE_OPTIONS.some((size) => size === editingTextLayer.fontSize) ? <option value={editingTextLayer.fontSize}>{editingTextLayer.fontSize}</option> : null}
              {FONT_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
          <select aria-label="Paragraph or heading style" onChange={(event) => applyBlockFormat(event.target.value as RichBlockFormat)} value={activeBlockFormat}>
            {RICH_BLOCK_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <button onMouseDown={(event) => event.preventDefault()} onClick={() => applyRichCommand('bold')} title="Bold" type="button"><Bold /></button>
          <button onMouseDown={(event) => event.preventDefault()} onClick={() => applyRichCommand('italic')} title="Italic" type="button"><Italic /></button>
          <button onMouseDown={(event) => event.preventDefault()} onClick={() => applyRichCommand('underline')} title="Underline" type="button"><Underline /></button>
          <button onMouseDown={(event) => event.preventDefault()} onClick={() => applyRichCommand('strikeThrough')} title="Strike" type="button"><Strikethrough /></button>
          <button onMouseDown={(event) => event.preventDefault()} onClick={() => applyRichCommand('insertUnorderedList')} title="Bulleted list" type="button"><List /></button>
          <button onMouseDown={(event) => event.preventDefault()} onClick={() => applyRichCommand('insertOrderedList')} title="Numbered list" type="button"><ListOrdered /></button>
          <button onMouseDown={(event) => event.preventDefault()} onClick={() => applyRichCommand('justifyLeft')} title="Align left" type="button"><AlignLeft /></button>
          <button onMouseDown={(event) => event.preventDefault()} onClick={() => applyRichCommand('justifyCenter')} title="Align center" type="button"><AlignCenter /></button>
          <button onMouseDown={(event) => event.preventDefault()} onClick={() => applyRichCommand('justifyRight')} title="Align right" type="button"><AlignRight /></button>
          <button onMouseDown={(event) => event.preventDefault()} onClick={() => { const url = window.prompt('Link URL'); if (url) applyRichCommand('createLink', url) }} title="Link" type="button"><Link /></button>
          <button className={styles.doneButton} onClick={() => setEditingTextId(null)} type="button">Done editing</button>
          </>
        ) : null}
      </div>

      <main className={styles.workspace}>
        <nav aria-label="Design tools" className={styles.toolRail}>
          {toolButtons.map((tool) => (
            <button aria-pressed={activePanel === tool.id} className={activePanel === tool.id ? styles.toolButtonActive : styles.toolButton} disabled={tool.id === 'properties' && !selectedLayer} key={tool.id} onClick={() => openPanel(tool.id)} title={tool.label} type="button">{tool.icon}<span>{tool.label}</span></button>
          ))}
        </nav>

        <aside className={styles.toolDrawer}>
          {activePanel === 'elements' ? <><h2>Elements</h2><p>Add a shape, then drag its handles directly on the canvas.</p><div className={styles.elementGrid}><button onClick={() => addShape('rectangle')} type="button"><Square />Rectangle</button><button onClick={() => addShape('circle')} type="button"><Circle />Circle</button><button onClick={() => addShape('line')} type="button"><Minus />Line</button></div></> : null}
          {activePanel === 'images' ? <><h2>Images</h2><p>Upload a new image or choose one visually from this tenant’s media library.</p><PuckMediaField display="gallery" onChange={addImage} value={null} /></> : null}
          {activePanel === 'text' ? <><h2>Text</h2><p>Add text, then double-click it on the canvas to type and format it.</p><button className={styles.primaryDrawerButton} onClick={addText} type="button"><Type /> Add text</button>{selectedLayer?.type === 'text' ? <button onClick={() => startTextEditing(selectedLayer.id)} type="button">Edit selected text</button> : null}</> : null}
          {activePanel === 'colors' ? <><h2>Colors</h2><p>{selectedLayer ? `Apply a color to ${getLayerLabel(selectedLayer)}.` : 'Set the canvas background color.'}</p><strong className={styles.drawerLabel}>Tenant colors</strong><div className={styles.swatches}>{tenantPalette.map((color) => <button aria-label={`Use tenant color ${color}`} key={color} onClick={() => applyColor(color)} style={{ backgroundColor: color }} type="button" />)}</div><strong className={styles.drawerLabel}>More colors</strong><div className={styles.swatches}>{GENERAL_COLORS.map((color) => <button aria-label={`Use color ${color}`} key={color} onClick={() => applyColor(color)} style={{ backgroundColor: color }} type="button" />)}</div><label className={styles.customColor}>Custom color<input onChange={(event) => applyColor(event.target.value)} type="color" value={selectedLayer?.type === 'text' ? selectedLayer.color : selectedLayer?.type === 'shape' ? (selectedLayer.shape === 'line' ? selectedLayer.borderColor : selectedLayer.fill) : scene.background} /></label></> : null}
          {activePanel === 'layers' ? <><h2>Layers</h2><p>Drag rows to change stacking order. The list moves with you; top rows appear in front.</p><div className={styles.layerList}>{displayLayers.map((layer) => <div aria-grabbed={draggedLayerId === layer.id} className={`${layer.id === selectedId ? styles.layerRowActive : styles.layerRow} ${draggedLayerId === layer.id ? styles.layerRowDragging : ''}`} draggable={!layer.locked} key={layer.id} onClick={() => setSelectedId(layer.id)} onContextMenu={(event) => openContextMenu(event, layer.id)} onDragEnd={finishLayerReorder} onDragEnter={() => previewLayerReorder(layer.id)} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }} onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', layer.id); setDraggedLayerId(layer.id); setLayerOrderPreview([...scene.layers].reverse().map((item) => item.id)) }} onDrop={(event) => event.preventDefault()}><GripVertical /><span>{layer.type === 'text' ? <Type /> : layer.type === 'image' ? <ImageIcon /> : <Square />}{getLayerLabel(layer)}</span><button aria-label={layer.hidden ? 'Show layer' : 'Hide layer'} onClick={(event) => { event.stopPropagation(); updateLayer(layer.id, { hidden: !layer.hidden }) }} type="button">{layer.hidden ? <EyeOff /> : <Eye />}</button><button aria-label={layer.locked ? 'Unlock layer' : 'Lock layer'} onClick={(event) => { event.stopPropagation(); updateLayer(layer.id, { locked: !layer.locked }) }} type="button">{layer.locked ? <Lock /> : <Unlock />}</button></div>)}</div></> : null}
          {activePanel === 'properties' && selectedLayer ? <><h2>{getLayerLabel(selectedLayer)}</h2><label>Name<input onChange={(event) => updateLayer(selectedLayer.id, { name: event.target.value })} value={selectedLayer.name} /></label>{selectedLayer.type === 'shape' && selectedLayer.shape === 'line' ? <><div className={styles.twoColumns}><label>Start X<input onChange={(event) => updateLayer(selectedLayer.id, { x: Number(event.target.value) })} type="number" value={Math.round(selectedLayer.x)} /></label><label>Start Y<input onChange={(event) => updateLayer(selectedLayer.id, { y: Number(event.target.value) })} type="number" value={Math.round(selectedLayer.y)} /></label></div><div className={styles.twoColumns}><label>End X<input onChange={(event) => updateLayer(selectedLayer.id, { width: Number(event.target.value) - selectedLayer.x })} type="number" value={Math.round(selectedLayer.x + selectedLayer.width)} /></label><label>End Y<input onChange={(event) => updateLayer(selectedLayer.id, { height: Number(event.target.value) - selectedLayer.y })} type="number" value={Math.round(selectedLayer.y + selectedLayer.height)} /></label></div><div className={styles.inlineButtons}><button onClick={() => updateLayer(selectedLayer.id, { height: 0 })} type="button">Horizontal</button><button onClick={() => updateLayer(selectedLayer.id, { width: 0 })} type="button">Vertical</button></div></> : <><div className={styles.twoColumns}><label>X<input onChange={(event) => updateLayer(selectedLayer.id, { x: Number(event.target.value) })} type="number" value={Math.round(selectedLayer.x)} /></label><label>Y<input onChange={(event) => updateLayer(selectedLayer.id, { y: Number(event.target.value) })} type="number" value={Math.round(selectedLayer.y)} /></label></div><div className={styles.twoColumns}><label>Width<input min={MIN_LAYER_SIZE} onChange={(event) => updateLayer(selectedLayer.id, { width: Number(event.target.value) })} type="number" value={Math.round(selectedLayer.width)} /></label><label>Height<input min={MIN_LAYER_SIZE} onChange={(event) => updateLayer(selectedLayer.id, { height: Number(event.target.value) })} type="number" value={Math.round(selectedLayer.height)} /></label></div><label>Rotation<input max="180" min="-180" onChange={(event) => updateLayer(selectedLayer.id, { rotation: Number(event.target.value) })} type="range" value={selectedLayer.rotation || 0} /><span>{Math.round(selectedLayer.rotation || 0)}°</span></label></>}<label>Opacity<input max="1" min="0" onChange={(event) => updateLayer(selectedLayer.id, { opacity: Number(event.target.value) })} step="0.05" type="range" value={selectedLayer.opacity ?? 1} /></label>{selectedLayer.type === 'text' ? <><button className={styles.primaryDrawerButton} onClick={() => startTextEditing(selectedLayer.id)} type="button">Edit text</button><label>Font<select onChange={(event) => updateLayer(selectedLayer.id, { fontFamily: event.target.value })} value={selectedLayer.fontFamily}>{!FONT_OPTIONS.some((font) => font.value === selectedLayer.fontFamily) ? <option value={selectedLayer.fontFamily}>Current font</option> : null}{FONT_OPTIONS.map((font) => <option key={font.value} style={{ fontFamily: font.value }} value={font.value}>{font.label}</option>)}</select></label><label>Base font size<input min="8" onChange={(event) => updateLayer(selectedLayer.id, { fontSize: Number(event.target.value) })} type="number" value={selectedLayer.fontSize} /></label><label>Line height<input max="3" min="0.7" onChange={(event) => updateLayer(selectedLayer.id, { lineHeight: Number(event.target.value) })} step="0.05" type="number" value={selectedLayer.lineHeight} /></label></> : null}{selectedLayer.type === 'image' ? <label>Image fit<select onChange={(event) => updateLayer(selectedLayer.id, { objectFit: event.target.value as GraphicImageLayer['objectFit'] })} value={selectedLayer.objectFit}><option value="cover">Cover</option><option value="contain">Contain</option></select></label> : null}{selectedLayer.type === 'shape' ? <><label>Stroke width<input min="0" onChange={(event) => updateLayer(selectedLayer.id, { borderWidth: Number(event.target.value) })} type="number" value={selectedLayer.borderWidth} /></label>{selectedLayer.shape === 'rectangle' ? <label>Corner radius<input min="0" onChange={(event) => updateLayer(selectedLayer.id, { borderRadius: Number(event.target.value) })} type="number" value={selectedLayer.borderRadius} /></label> : null}</> : null}</> : null}
          {saveError ? <p className={styles.error}>{saveError}</p> : null}
          {exportStatus ? <p className={styles.exportStatus}>{exportStatus}</p> : null}
        </aside>

        <section className={styles.canvasViewport} onContextMenu={(event) => openContextMenu(event, null)} onPointerDown={() => { setSelectedId(null); setEditingTextId(null); setContextMenu(null) }}>
          {selectedLayer ? <div className={styles.selectionToolbar}><button onClick={duplicateSelected} title="Duplicate" type="button"><Copy /></button><button onClick={() => moveLayer('front')} title="Bring to front" type="button"><BringToFront /></button><button onClick={() => moveLayer('back')} title="Send to back" type="button"><SendToBack /></button><button onClick={() => updateLayer(selectedLayer.id, { hidden: !selectedLayer.hidden })} title="Show or hide" type="button">{selectedLayer.hidden ? <EyeOff /> : <Eye />}</button><button onClick={() => updateLayer(selectedLayer.id, { locked: !selectedLayer.locked })} title="Lock or unlock" type="button">{selectedLayer.locked ? <Lock /> : <Unlock />}</button><button onClick={deleteSelected} title="Delete" type="button"><Trash2 /></button></div> : null}
          <div className={styles.canvasSizer} style={{ height: scene.height * zoom, width: scene.width * zoom }}>
            <div className={styles.canvas} style={{ background: scene.background, height: scene.height, transform: `scale(${zoom})`, width: scene.width }}>
              {scene.layers.map((layer) => {
                if (layer.hidden) return null
                const selected = layer.id === selectedId
                if (layer.type === 'shape' && layer.shape === 'line') {
                  const frame = getLineFrame(layer)
                  return <div className={`${styles.canvasLayer} ${styles.lineLayer} ${selected ? styles.lineLayerSelected : ''}`} key={layer.id} onContextMenu={(event) => openContextMenu(event, layer.id)} onPointerDown={(event) => beginPointer(event, layer, 'drag')} style={{ height: frame.height, left: frame.left, opacity: layer.opacity ?? 1, position: 'absolute', top: frame.top, width: frame.width }}><svg height="100%" overflow="visible" width="100%"><line stroke={layer.borderColor} strokeLinecap="butt" strokeWidth={Math.max(1, layer.borderWidth)} x1={frame.startX} x2={frame.endX} y1={frame.startY} y2={frame.endY} /></svg>{selected && !layer.locked ? <><button aria-label="Move line start" className={styles.lineEndpoint} onPointerDown={(event) => beginPointer(event, layer, 'line-start')} style={{ left: frame.startX - 9, top: frame.startY - 9 }} type="button" /><button aria-label="Move line end" className={styles.lineEndpoint} onPointerDown={(event) => beginPointer(event, layer, 'line-end')} style={{ left: frame.endX - 9, top: frame.endY - 9 }} type="button" /></> : null}</div>
                }
                const commonStyle: React.CSSProperties = { height: layer.height, left: layer.x, opacity: layer.opacity ?? 1, position: 'absolute', top: layer.y, transform: `rotate(${layer.rotation || 0}deg)`, width: layer.width }
                return <div className={`${styles.canvasLayer} ${selected ? styles.canvasLayerSelected : ''}`} key={layer.id} onContextMenu={(event) => openContextMenu(event, layer.id)} onDoubleClick={(event) => { if (layer.type !== 'text' || layer.locked || editingTextId === layer.id) return; event.preventDefault(); event.stopPropagation(); startTextEditing(layer.id, { x: event.clientX, y: event.clientY }) }} onPointerDown={(event) => beginPointer(event, layer, 'drag')} style={commonStyle}>{layer.type === 'image' ? <Image alt={layer.alt} draggable={false} fill sizes={`${Math.round(layer.width * zoom)}px`} src={layer.url} style={{ objectFit: layer.objectFit }} unoptimized /> : null}{layer.type === 'shape' ? <div style={{ background: layer.fill, border: `${layer.borderWidth}px solid ${layer.borderColor}`, borderRadius: layer.shape === 'circle' ? '50%' : layer.borderRadius, height: '100%', width: '100%' }} /> : null}{layer.type === 'text' && editingTextId === layer.id ? <div aria-label={`Editing ${getLayerLabel(layer)}`} className={styles.richTextLayer} contentEditable onBlur={(event) => { rememberRichSelection(); updateLayer(layer.id, { html: sanitizeGraphicRichHtml(event.currentTarget.innerHTML) }) }} onInput={(event) => { rememberRichSelection(); updateLayer(layer.id, { html: sanitizeGraphicRichHtml(event.currentTarget.innerHTML) }, false) }} onKeyUp={rememberRichSelection} onMouseUp={rememberRichSelection} ref={editableRef} role="textbox" spellCheck suppressContentEditableWarning style={{ color: layer.color, fontFamily: layer.fontFamily, fontSize: layer.fontSize, lineHeight: layer.lineHeight, textAlign: layer.textAlign }} /> : null}{layer.type === 'text' && editingTextId !== layer.id ? <div className={`${styles.richTextLayer} ${styles.richTextLayerPreview}`} dangerouslySetInnerHTML={{ __html: sanitizeGraphicRichHtml(layer.html) }} style={{ color: layer.color, fontFamily: layer.fontFamily, fontSize: layer.fontSize, lineHeight: layer.lineHeight, textAlign: layer.textAlign }} /> : null}{selected && !layer.locked && editingTextId !== layer.id ? <><button aria-label="Rotate layer" className={styles.rotateHandle} onPointerDown={(event) => beginPointer(event, layer, 'rotate')} type="button"><RotateCw /></button><button aria-label="Resize layer" className={styles.resizeHandle} onPointerDown={(event) => beginPointer(event, layer, 'resize')} type="button" /></> : null}</div>
              })}
            </div>
          </div>
        </section>
      </main>
      {contextMenu ? (
        <div className={styles.contextMenu} onPointerDown={(event) => event.stopPropagation()} role="menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <div className={styles.contextMenuTitle}>{contextMenu.layerId && selectedLayer ? getLayerLabel(selectedLayer) : 'Canvas'}</div>
          {contextMenu.layerId && selectedLayer ? <button onClick={() => runContextAction(copySelected)} role="menuitem" type="button"><Copy /><span>Copy</span><kbd>Ctrl+C</kbd></button> : null}
          <button disabled={!hasCopiedLayer} onClick={() => runContextAction(pasteCopied)} role="menuitem" type="button"><ClipboardPaste /><span>Paste</span><kbd>Ctrl+V</kbd></button>
          {contextMenu.layerId && selectedLayer ? <>
            <button onClick={() => runContextAction(duplicateSelected)} role="menuitem" type="button"><Copy /><span>Duplicate</span><kbd>Ctrl+D</kbd></button>
            <div className={styles.contextMenuDivider} />
            <button onClick={() => runContextAction(() => moveLayer('front'))} role="menuitem" type="button"><BringToFront /><span>Bring to front</span></button>
            <button onClick={() => runContextAction(() => moveLayer('back'))} role="menuitem" type="button"><SendToBack /><span>Send to back</span></button>
            <div className={styles.contextMenuDivider} />
            <button onClick={() => runContextAction(() => updateLayer(selectedLayer.id, { hidden: !selectedLayer.hidden }))} role="menuitem" type="button">{selectedLayer.hidden ? <Eye /> : <EyeOff />}<span>{selectedLayer.hidden ? 'Show' : 'Hide'}</span></button>
            <button onClick={() => runContextAction(() => updateLayer(selectedLayer.id, { locked: !selectedLayer.locked }))} role="menuitem" type="button">{selectedLayer.locked ? <Unlock /> : <Lock />}<span>{selectedLayer.locked ? 'Unlock' : 'Lock'}</span></button>
            <div className={styles.contextMenuDivider} />
            <button className={styles.contextMenuDanger} disabled={selectedLayer.locked} onClick={() => runContextAction(deleteSelected)} role="menuitem" type="button"><Trash2 /><span>Delete</span><kbd>Del</kbd></button>
          </> : null}
        </div>
      ) : null}
    </div>
  )
}
