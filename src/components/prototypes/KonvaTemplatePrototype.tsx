'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import type Konva from 'konva'
import { Group, Image as KonvaImage, Layer, Rect, Stage, Text, Transformer } from 'react-konva'

const STAGE_WIDTH = 1200
const STAGE_HEIGHT = 630
const SAFE_MARGIN = 36

const HEADSHOT_DEFAULT = { x: 56, y: 72, size: 436 }
const HEADSHOT_BOUNDS = { minX: 16, maxX: 200, minY: 40, maxY: 160, minSize: 240, maxSize: 520 }
const TITLE_DEFAULT = { x: 622, y: 248, width: 484, height: 170 }
const REP_NAME_BOX = { x: 452, y: 52, width: 320, height: 36 }
const NEWSROOM_TOP_BOX = { x: 676, y: 60, width: 300, height: 28 }
const NEWSROOM_MAIN_BOX = { x: 592, y: 86, width: 542, height: 132 }
const UNDERLINE_BOX = { x: 700, y: 220, width: 382, height: 4 }
const HANDLE_BOX = { x: 798, y: 498, width: 240, height: 30 }
const SOCIAL_BOX = { x: 790, y: 532, width: 250, height: 40 }

const CANDELORA_PROFILE = {
  tenantSlug: 'candelora',
  repName: 'REP. CANDELORA',
  officeTitle: 'State Representative | House Republican Leader',
  district: '86th District',
  mobileHeadshotUrl:
    '/api/media-proxy?url=https%3A%2F%2Fmedia.cthousegop.com%2F.%2FCandelora_Circle%20headshot.png',
  handle: '@cthousegop',
}

type Align = 'left' | 'center'
type Selection = 'headshot' | 'title' | null

type SamplePost = {
  id: string
  label: string
  title: string
}

type TitleBox = {
  x: number
  y: number
  width: number
  align: Align
}

type HeadshotCrop = {
  zoom: number
  offsetX: number
  offsetY: number
}

type HeadshotFrame = {
  x: number
  y: number
  size: number
}

type FittedText = {
  fontSize: number
  lineHeight: number
  lines: string[]
}

const SAMPLE_POSTS: SamplePost[] = [
  {
    id: 'sample',
    label: 'Your example headline',
    title:
      'Statement on Democrats Limiting Testimony on Vaccine Mandates and Attack on Religious Freedom',
  },
  {
    id: 'utility',
    label: 'Utility bill headline',
    title:
      'House Republicans demand action on rising utility bills and the cost burden facing Connecticut families',
  },
  {
    id: 'budget',
    label: 'Budget headline',
    title:
      'House Republican leaders unveil an affordability agenda focused on tax relief, energy stability, and public accountability',
  },
]

const KEYBOARD_KEYS = [
  { x: 12, y: 0, width: 214, height: 150, rotate: -10 },
  { x: 216, y: -12, width: 252, height: 170, rotate: 10 },
  { x: 472, y: 4, width: 232, height: 170, rotate: -12 },
  { x: 732, y: -14, width: 248, height: 178, rotate: 10 },
  { x: 994, y: 10, width: 188, height: 146, rotate: -10 },
  { x: 48, y: 178, width: 246, height: 172, rotate: 10 },
  { x: 324, y: 162, width: 254, height: 180, rotate: -12 },
  { x: 602, y: 188, width: 236, height: 170, rotate: 11 },
  { x: 862, y: 178, width: 214, height: 164, rotate: -10 },
  { x: 84, y: 384, width: 252, height: 172, rotate: -11 },
  { x: 364, y: 374, width: 246, height: 176, rotate: 9 },
  { x: 636, y: 392, width: 252, height: 176, rotate: -12 },
  { x: 924, y: 384, width: 224, height: 164, rotate: 10 },
]

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function useLoadedImage(src: string) {
  const [image, setImage] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    let cancelled = false
    const nextImage = new window.Image()
    nextImage.crossOrigin = 'anonymous'
    nextImage.onload = () => {
      if (!cancelled) setImage(nextImage)
    }
    nextImage.src = src
    return () => {
      cancelled = true
    }
  }, [src])

  return image
}

function useContainerWidth() {
  const ref = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const updateWidth = () => setWidth(element.clientWidth)
    updateWidth()

    const observer = new ResizeObserver(() => updateWidth())
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return { ref, width }
}

function wrapText(text: string, font: string, maxWidth: number) {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return ['']

  if (typeof document === 'undefined') {
    const match = /(\d+)px/.exec(font)
    const fontSize = match?.[1] ? Number(match[1]) : 34
    const approxCharWidth = fontSize * 0.52
    const maxChars = Math.max(10, Math.floor(maxWidth / approxCharWidth))
    const lines: string[] = []
    let current = words[0] || ''

    for (const word of words.slice(1)) {
      const next = `${current} ${word}`
      if (next.length <= maxChars) {
        current = next
      } else {
        lines.push(current)
        current = word
      }
    }

    lines.push(current)
    return lines
  }

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return [text]

  context.font = font
  const lines: string[] = []
  let current = words[0] || ''

  for (const word of words.slice(1)) {
    const next = `${current} ${word}`
    if (context.measureText(next).width <= maxWidth) {
      current = next
    } else {
      lines.push(current)
      current = word
    }
  }

  lines.push(current)
  return lines
}

function fitTitleText(text: string, width: number, height: number): FittedText {
  const clean = text.trim() || 'Headline'

  for (let fontSize = 34; fontSize >= 20; fontSize -= 1) {
    const lineHeight = Math.round(fontSize * 1.1)
    const lines = wrapText(clean, `${fontSize}px Georgia, Times New Roman, serif`, width)
    const totalHeight = lines.length * lineHeight
    if (lines.length <= 4 && totalHeight <= height) {
      return { fontSize, lineHeight, lines }
    }
  }

  const lines = wrapText(clean, '20px Georgia, Times New Roman, serif', width).slice(0, 4)
  return { fontSize: 20, lineHeight: 22, lines }
}

function computeHeadshotPlacement(
  image: HTMLImageElement | null,
  crop: HeadshotCrop,
  frame: { width: number; height: number },
) {
  if (!image) {
    return {
      width: frame.width,
      height: frame.height,
      x: 0,
      y: 0,
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
    }
  }

  const baseScale = Math.max(frame.width / image.width, frame.height / image.height)
  const scale = baseScale * crop.zoom
  const width = image.width * scale
  const height = image.height * scale
  const centeredX = (frame.width - width) / 2
  const centeredY = (frame.height - height) / 2
  const minX = Math.min(0, frame.width - width)
  const minY = Math.min(0, frame.height - height)
  const x = clamp(centeredX + crop.offsetX, minX, 0)
  const y = clamp(centeredY + crop.offsetY, minY, 0)

  return { width, height, x, y, minX, maxX: 0, minY, maxY: 0 }
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const anchor = document.createElement('a')
  anchor.href = dataUrl
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
}

export default function KonvaTemplatePrototype() {
  const stageRef = useRef<Konva.Stage | null>(null)
  const headshotGroupRef = useRef<Konva.Group | null>(null)
  const headshotTransformerRef = useRef<Konva.Transformer | null>(null)
  const { ref: stageContainerRef, width: stageContainerWidth } = useContainerWidth()

  const [selectedPostId, setSelectedPostId] = useState(SAMPLE_POSTS[0]?.id ?? 'sample')
  const [titleOverride, setTitleOverride] = useState('')
  const [selection, setSelection] = useState<Selection>('headshot')
  const [headshotCrop, setHeadshotCrop] = useState<HeadshotCrop>({ zoom: 1, offsetX: 0, offsetY: 0 })
  const [headshotFrame, setHeadshotFrame] = useState<HeadshotFrame>({
    x: HEADSHOT_DEFAULT.x,
    y: HEADSHOT_DEFAULT.y,
    size: HEADSHOT_DEFAULT.size,
  })
  const [titleBox, setTitleBox] = useState<TitleBox>({
    x: TITLE_DEFAULT.x,
    y: TITLE_DEFAULT.y,
    width: TITLE_DEFAULT.width,
    align: 'center',
  })

  const selectedPost = useMemo(
    () => SAMPLE_POSTS.find((post) => post.id === selectedPostId) ?? SAMPLE_POSTS[0]!,
    [selectedPostId],
  )
  const resolvedTitle = titleOverride.trim() || selectedPost.title
  const fittedTitle = useMemo(
    () => fitTitleText(resolvedTitle, titleBox.width, TITLE_DEFAULT.height),
    [resolvedTitle, titleBox.width],
  )
  const selectedImage = useLoadedImage(CANDELORA_PROFILE.mobileHeadshotUrl)

  const previewScale = useMemo(() => {
    if (!stageContainerWidth) return 1
    return Math.min(stageContainerWidth / STAGE_WIDTH, 1)
  }, [stageContainerWidth])

  useEffect(() => {
    const transformer = headshotTransformerRef.current
    const group = headshotGroupRef.current
    if (!transformer || !group) return

    if (selection === 'headshot') {
      transformer.nodes([group])
    } else {
      transformer.nodes([])
    }

    transformer.getLayer()?.batchDraw()
  }, [selection])

  const headshotBox = useMemo(
    () => ({ width: headshotFrame.size, height: headshotFrame.size }),
    [headshotFrame.size],
  )

  const headshotPlacement = useMemo(
    () => computeHeadshotPlacement(selectedImage, headshotCrop, headshotBox),
    [headshotBox, headshotCrop, selectedImage],
  )

  const titleBounds = {
    minX: 560,
    maxX: STAGE_WIDTH - SAFE_MARGIN - titleBox.width,
    minY: 228,
    maxY: 310,
  }

  const resetTweaks = () => {
    setSelection('headshot')
    setTitleOverride('')
    setHeadshotCrop({ zoom: 1, offsetX: 0, offsetY: 0 })
    setHeadshotFrame({ x: HEADSHOT_DEFAULT.x, y: HEADSHOT_DEFAULT.y, size: HEADSHOT_DEFAULT.size })
    setTitleBox({
      x: TITLE_DEFAULT.x,
      y: TITLE_DEFAULT.y,
      width: TITLE_DEFAULT.width,
      align: 'center',
    })
  }

  const exportPng = () => {
    const stage = stageRef.current
    if (!stage) return
    downloadDataUrl(stage.toDataURL({ pixelRatio: 2 }), 'newsroom-prototype.png')
  }

  return (
    <div
      style={{
        display: 'grid',
        gap: 20,
        gridTemplateColumns: 'minmax(300px, 360px) minmax(0, 1fr)',
      }}
    >
      <aside
        style={{
          borderRadius: 20,
          border: '1px solid rgba(17, 24, 39, 0.12)',
          background: 'rgba(255,255,255,0.82)',
          padding: 20,
          boxShadow: '0 18px 50px rgba(15, 23, 42, 0.08)',
          display: 'grid',
          gap: 18,
          alignSelf: 'start',
        }}
      >
        <section style={{ display: 'grid', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Newsroom Card Prototype</h2>
          <p style={{ margin: 0, color: '#4b5563', fontSize: 14, lineHeight: 1.6 }}>
            This version uses the real Candelora `standard-media.mobileHeadshot` asset and pushes
            the layout closer to the newsroom example you shared.
          </p>
        </section>

        <section style={{ display: 'grid', gap: 10 }}>
          <div style={sectionLabelStyle}>Payload Sources</div>
          <div style={hintStyle}>
            Tenant: <strong>{CANDELORA_PROFILE.tenantSlug}</strong>
            <br />
            Headshot source: <strong>`standard-media.mobileHeadshot`</strong>
            <br />
            Rep label: <strong>{CANDELORA_PROFILE.repName}</strong>
          </div>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={fieldLabelStyle}>Post title source</span>
            <select
              value={selectedPostId}
              onChange={(event) => setSelectedPostId(event.target.value)}
              style={controlStyle}
            >
              {SAMPLE_POSTS.map((post) => (
                <option key={post.id} value={post.id}>
                  {post.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={fieldLabelStyle}>Title override</span>
            <textarea
              rows={5}
              value={titleOverride}
              onChange={(event) => setTitleOverride(event.target.value)}
              placeholder="Leave blank to use the selected post title"
              style={{ ...controlStyle, resize: 'vertical', minHeight: 108 }}
            />
          </label>
        </section>

        <section style={{ display: 'grid', gap: 10 }}>
          <div style={sectionLabelStyle}>Allowed User Tweaks</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setSelection('headshot')} style={chipStyle(selection === 'headshot')}>
              Edit headshot crop
            </button>
            <button type="button" onClick={() => setSelection('title')} style={chipStyle(selection === 'title')}>
              Edit title block
            </button>
          </div>

          {selection === 'headshot' ? (
            <>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={fieldLabelStyle}>Zoom</span>
                <input
                  type="range"
                  min={1}
                  max={1.8}
                  step={0.01}
                  value={headshotCrop.zoom}
                  onChange={(event) =>
                    setHeadshotCrop((current) => ({
                      ...current,
                      zoom: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <div style={hintStyle}>
                Drag the headshot directly on the canvas to reposition it. Use the corner handles
                to resize the circular frame, then use zoom to tighten the crop.
              </div>
            </>
          ) : null}

          {selection === 'title' ? (
            <>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={fieldLabelStyle}>Title width</span>
                <input
                  type="range"
                  min={400}
                  max={560}
                  step={1}
                  value={titleBox.width}
                  onChange={(event) => {
                    const nextWidth = Number(event.target.value)
                    setTitleBox((current) => ({
                      ...current,
                      width: nextWidth,
                      x: clamp(current.x, titleBounds.minX, STAGE_WIDTH - SAFE_MARGIN - nextWidth),
                    }))
                  }}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={fieldLabelStyle}>Alignment</span>
                <select
                  value={titleBox.align}
                  onChange={(event) =>
                    setTitleBox((current) => ({ ...current, align: event.target.value as Align }))
                  }
                  style={controlStyle}
                >
                  <option value="center">Center</option>
                  <option value="left">Left</option>
                </select>
              </label>
              <div style={hintStyle}>
                Users can reposition the title block inside the headline area. Autofit reduces the
                serif title size when the copy gets longer.
              </div>
            </>
          ) : null}
        </section>

        <section style={{ display: 'grid', gap: 10 }}>
          <div style={sectionLabelStyle}>Autofit Diagnostics</div>
          <div style={statGridStyle}>
            <div style={statCardStyle}>
              <div style={statLabelStyle}>Font size</div>
              <div style={statValueStyle}>{fittedTitle.fontSize}px</div>
            </div>
            <div style={statCardStyle}>
              <div style={statLabelStyle}>Line count</div>
              <div style={statValueStyle}>{fittedTitle.lines.length}</div>
            </div>
            <div style={statCardStyle}>
              <div style={statLabelStyle}>Title width</div>
              <div style={statValueStyle}>{titleBox.width}px</div>
            </div>
            <div style={statCardStyle}>
              <div style={statLabelStyle}>Selection</div>
              <div style={statValueStyle}>{selection ?? 'none'}</div>
            </div>
            <div style={statCardStyle}>
              <div style={statLabelStyle}>Headshot X</div>
              <div style={statValueStyle}>{headshotFrame.x}px</div>
            </div>
            <div style={statCardStyle}>
              <div style={statLabelStyle}>Headshot Y</div>
              <div style={statValueStyle}>{headshotFrame.y}px</div>
            </div>
            <div style={statCardStyle}>
              <div style={statLabelStyle}>Headshot size</div>
              <div style={statValueStyle}>{headshotFrame.size}px</div>
            </div>
          </div>
        </section>

        <section style={{ display: 'grid', gap: 10 }}>
          <div style={sectionLabelStyle}>Guardrails</div>
          <ul style={{ margin: 0, paddingLeft: 18, color: '#374151', fontSize: 14, lineHeight: 1.7 }}>
            <li>Users can swap data-bound post titles and override them when necessary.</li>
            <li>Users can drag and resize the headshot frame on the canvas and crop and zoom the real image.</li>
            <li>Users can move the title block within a safe region and adjust width and alignment.</li>
            <li>Users cannot redesign the card structure, colors, logo treatment, or typography system.</li>
          </ul>
        </section>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={resetTweaks} style={secondaryButtonStyle}>
            Reset tweaks
          </button>
          <button type="button" onClick={exportPng} style={primaryButtonStyle}>
            Export PNG
          </button>
        </div>
      </aside>

      <section
        style={{
          borderRadius: 24,
          border: '1px solid rgba(17, 24, 39, 0.12)',
          background: 'rgba(255,255,255,0.82)',
          padding: 16,
          boxShadow: '0 18px 50px rgba(15, 23, 42, 0.08)',
        }}
      >
        <div ref={stageContainerRef} style={{ width: '100%' }}>
          <Stage
            ref={stageRef}
            width={STAGE_WIDTH * previewScale}
            height={STAGE_HEIGHT * previewScale}
            scaleX={previewScale}
            scaleY={previewScale}
            style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 18 }}
            onMouseDown={(event) => {
              if (event.target === event.target.getStage()) setSelection(null)
            }}
          >
            <Layer>
              <Rect width={STAGE_WIDTH} height={STAGE_HEIGHT} fill="#f7f4ef" />
              {KEYBOARD_KEYS.map((key, index) => (
                <Rect
                  key={index}
                  x={key.x}
                  y={key.y}
                  width={key.width}
                  height={key.height}
                  rotation={key.rotate}
                  cornerRadius={22}
                  stroke="rgba(160, 166, 179, 0.12)"
                  strokeWidth={5}
                />
              ))}

              <Text
                x={REP_NAME_BOX.x}
                y={REP_NAME_BOX.y}
                width={REP_NAME_BOX.width}
                text={CANDELORA_PROFILE.repName}
                fontFamily="Georgia, Times New Roman, serif"
                fontSize={28}
                fill="#aa2426"
              />

              <Group
                ref={headshotGroupRef}
                x={headshotFrame.x}
                y={headshotFrame.y}
                draggable={selection === 'headshot'}
                onClick={() => setSelection('headshot')}
                onTap={() => setSelection('headshot')}
                dragBoundFunc={(position) => ({
                  x: clamp(position.x, HEADSHOT_BOUNDS.minX, HEADSHOT_BOUNDS.maxX),
                  y: clamp(position.y, HEADSHOT_BOUNDS.minY, HEADSHOT_BOUNDS.maxY),
                })}
                onDragEnd={(event) =>
                  setHeadshotFrame((current) => ({
                    ...current,
                    x: event.target.x(),
                    y: event.target.y(),
                  }))
                }
                onTransformEnd={(event) => {
                  const node = event.target
                  const scale = Math.max(node.scaleX(), node.scaleY())
                  const nextSize = clamp(
                    Math.round(headshotFrame.size * scale),
                    HEADSHOT_BOUNDS.minSize,
                    HEADSHOT_BOUNDS.maxSize,
                  )
                  node.scaleX(1)
                  node.scaleY(1)
                  setHeadshotFrame({
                    x: clamp(node.x(), HEADSHOT_BOUNDS.minX, HEADSHOT_BOUNDS.maxX),
                    y: clamp(node.y(), HEADSHOT_BOUNDS.minY, HEADSHOT_BOUNDS.maxY),
                    size: nextSize,
                  })
                }}
              >
                <Group
                  clipFunc={(ctx) => {
                    ctx.beginPath()
                    ctx.arc(
                      headshotFrame.size / 2,
                      headshotFrame.size / 2,
                      headshotFrame.size / 2,
                      0,
                      Math.PI * 2,
                    )
                    ctx.closePath()
                  }}
                >
                  <Rect width={headshotFrame.size} height={headshotFrame.size} fill="transparent" />
                  {selectedImage ? (
                    <KonvaImage
                      image={selectedImage}
                      x={headshotPlacement.x}
                      y={headshotPlacement.y}
                      width={headshotPlacement.width}
                      height={headshotPlacement.height}
                      onClick={() => setSelection('headshot')}
                      onTap={() => setSelection('headshot')}
                    />
                  ) : null}
                </Group>
              </Group>
              <Transformer
                ref={headshotTransformerRef}
                rotateEnabled={false}
                flipEnabled={false}
                enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
                borderStroke="#0ea5e9"
                anchorStroke="#0ea5e9"
                anchorFill="#ffffff"
                anchorSize={10}
                boundBoxFunc={(_, newBox) => {
                  const nextSize = clamp(
                    Math.max(newBox.width, newBox.height),
                    HEADSHOT_BOUNDS.minSize,
                    HEADSHOT_BOUNDS.maxSize,
                  )
                  return {
                    x: clamp(newBox.x, HEADSHOT_BOUNDS.minX, HEADSHOT_BOUNDS.maxX),
                    y: clamp(newBox.y, HEADSHOT_BOUNDS.minY, HEADSHOT_BOUNDS.maxY),
                    width: nextSize,
                    height: nextSize,
                    rotation: 0,
                  }
                }}
              />

              <Text
                x={NEWSROOM_TOP_BOX.x}
                y={NEWSROOM_TOP_BOX.y}
                width={NEWSROOM_TOP_BOX.width}
                text="FROM THE"
                fontFamily="Inter, Arial, sans-serif"
                fontStyle="800 italic"
                fontSize={16}
                fill="#152b70"
                align="center"
                letterSpacing={1}
              />
              <Text
                x={NEWSROOM_MAIN_BOX.x}
                y={NEWSROOM_MAIN_BOX.y}
                width={NEWSROOM_MAIN_BOX.width}
                text="CT HOUSE GOP"
                fontFamily="Inter, Arial, sans-serif"
                fontStyle="800"
                fontSize={50}
                fill="#b91c1c"
                align="center"
              />
              <Text
                x={NEWSROOM_MAIN_BOX.x}
                y={NEWSROOM_MAIN_BOX.y + 42}
                width={NEWSROOM_MAIN_BOX.width}
                text="NEWSROOM"
                fontFamily="Inter, Arial, sans-serif"
                fontStyle="900 italic"
                fontSize={74}
                fill="#b91c1c"
                align="center"
              />
              <Rect
                x={UNDERLINE_BOX.x}
                y={UNDERLINE_BOX.y}
                width={UNDERLINE_BOX.width}
                height={UNDERLINE_BOX.height}
                fill="#172c70"
                cornerRadius={999}
              />

              <Group
                x={titleBox.x}
                y={titleBox.y}
                draggable={selection === 'title'}
                onClick={() => setSelection('title')}
                onTap={() => setSelection('title')}
                dragBoundFunc={(position) => ({
                  x: clamp(position.x, titleBounds.minX, titleBounds.maxX),
                  y: clamp(position.y, titleBounds.minY, titleBounds.maxY),
                })}
                onDragEnd={(event) =>
                  setTitleBox((current) => ({
                    ...current,
                    x: event.target.x(),
                    y: event.target.y(),
                  }))
                }
              >
                <Rect
                  x={-12}
                  y={-8}
                  width={titleBox.width + 24}
                  height={TITLE_DEFAULT.height + 16}
                  cornerRadius={18}
                  fill={selection === 'title' ? 'rgba(125, 211, 252, 0.12)' : 'transparent'}
                  stroke={selection === 'title' ? '#7dd3fc' : 'transparent'}
                  dash={selection === 'title' ? [10, 8] : []}
                />
                <Text
                  width={titleBox.width}
                  text={fittedTitle.lines.join('\n')}
                  fontFamily="Georgia, Times New Roman, serif"
                  fontSize={fittedTitle.fontSize}
                  lineHeight={fittedTitle.lineHeight / fittedTitle.fontSize}
                  fill="#a02626"
                  align={titleBox.align}
                />
              </Group>

              <Text
                x={HANDLE_BOX.x}
                y={HANDLE_BOX.y}
                width={HANDLE_BOX.width}
                text={CANDELORA_PROFILE.handle}
                fontFamily="Inter, Arial, sans-serif"
                fontStyle="700 italic"
                fontSize={18}
                fill="#172c70"
                align="center"
              />
              <Text
                x={SOCIAL_BOX.x}
                y={SOCIAL_BOX.y}
                width={SOCIAL_BOX.width}
                text="f  ig  x"
                fontFamily="Inter, Arial, sans-serif"
                fontStyle="700"
                fontSize={34}
                fill="#172c70"
                align="center"
              />
            </Layer>
          </Stage>
        </div>
      </section>
    </div>
  )
}

const controlStyle: React.CSSProperties = {
  border: '1px solid rgba(17, 24, 39, 0.12)',
  borderRadius: 12,
  background: '#ffffff',
  color: '#111827',
  padding: '10px 12px',
  fontSize: 14,
  lineHeight: 1.4,
  width: '100%',
}

const hintStyle: React.CSSProperties = {
  borderRadius: 14,
  background: '#f7fafc',
  border: '1px solid rgba(17, 24, 39, 0.08)',
  padding: '12px 14px',
  color: '#4b5563',
  fontSize: 13,
  lineHeight: 1.6,
}

const sectionLabelStyle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 13,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#374151',
}

const statGridStyle: React.CSSProperties = {
  display: 'grid',
  gap: 10,
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
}

const statCardStyle: React.CSSProperties = {
  borderRadius: 16,
  border: '1px solid rgba(17, 24, 39, 0.08)',
  background: '#ffffff',
  padding: '12px 14px',
}

const statLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#6b7280',
  marginBottom: 6,
}

const statValueStyle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 800,
  color: '#111827',
}

const primaryButtonStyle: React.CSSProperties = {
  border: 'none',
  borderRadius: 999,
  background: '#102145',
  color: '#ffffff',
  padding: '12px 16px',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
}

const secondaryButtonStyle: React.CSSProperties = {
  border: '1px solid rgba(17, 24, 39, 0.12)',
  borderRadius: 999,
  background: '#ffffff',
  color: '#111827',
  padding: '12px 16px',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
}

const chipStyle = (active: boolean): React.CSSProperties => ({
  border: active ? '1px solid #0ea5e9' : '1px solid rgba(17, 24, 39, 0.12)',
  borderRadius: 999,
  background: active ? 'rgba(14, 165, 233, 0.12)' : '#ffffff',
  color: '#111827',
  padding: '10px 12px',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
})
