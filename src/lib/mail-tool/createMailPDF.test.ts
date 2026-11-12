import { describe, expect, it } from 'vitest'
import { PDFDocument, PDFArray, PDFRawStream, PrintScaling, decodePDFRawStream, degrees, rgb } from 'pdf-lib'
import sharp from 'sharp'
import { createMailPDF, MAIL_LAYOUT, type MailArtwork } from './createMailPDF'

function file(bytes: Uint8Array, name = 'artwork.pdf'): MailArtwork {
  return { name, size: bytes.length, arrayBuffer: async () => Uint8Array.from(bytes).buffer }
}

async function artwork(pages = 2, width = 576, height = 360, rotation = 0) {
  const pdf = await PDFDocument.create()
  for (let i = 0; i < pages; i++) {
    const page = pdf.addPage([width, height])
    page.setRotation(degrees(rotation))
    page.drawRectangle({ x: 0, y: 0, width, height, color: i === 0 ? rgb(1, 0, 0) : rgb(0, 0, 1) })
    page.drawText(i === 0 ? 'FRONT' : 'BACK', { x: 24, y: 30 })
  }
  return file(await pdf.save())
}

function content(pdf: PDFDocument, pageIndex: number) {
  const contents = pdf.getPage(pageIndex).node.Contents() as PDFArray
  return Array.from({ length: contents.size() }, (_, index) => {
    const stream = contents.lookup(index, PDFRawStream)
    return new TextDecoder().decode(decodePDFRawStream(stream).decode())
  }).join('\n')
}

describe('Mail Tool print PDF', () => {
  it('creates two Letter pages with two vector copies at exact quarter-inch margins', async () => {
    const result = await createMailPDF({ mode: 'combined', file: await artwork() })
    const pdf = await PDFDocument.load(result.bytes)
    expect(pdf.getPageCount()).toBe(2)
    expect(result.warnings).toEqual([])
    expect(pdf.catalog.getOrCreateViewerPreferences().getPrintScaling()).toBe(PrintScaling.None)
    for (let i = 0; i < 2; i++) {
      expect(pdf.getPage(i).getSize()).toEqual({ width: 612, height: 792 })
      const operators = content(pdf, i)
      expect(operators.match(/ Do/g)).toHaveLength(2)
      expect(operators).toContain('1 0 0 1 18 414 cm')
      expect(operators).toContain('1 0 0 1 18 18 cm')
      expect(operators).toContain('1 0 0 1 0 0 cm')
    }
    expect(MAIL_LAYOUT.cutY - (18 + 360)).toBe(18)
    expect(414 - MAIL_LAYOUT.cutY).toBe(18)
  })

  it('accepts separate one-page PDFs and scales matching landscape artwork', async () => {
    const result = await createMailPDF({ mode: 'separate', front: await artwork(1, 1152, 720), back: await artwork(1) })
    expect((await PDFDocument.load(result.bytes)).getPageCount()).toBe(2)
  })

  it.each([90, 180, 270])('handles PDF page rotation %i', async (rotation) => {
    const swapped = rotation !== 180
    const result = await createMailPDF({ mode: 'combined', file: await artwork(2, swapped ? 360 : 576, swapped ? 576 : 360, rotation) })
    expect((await PDFDocument.load(result.bytes)).getPageCount()).toBe(2)
  })

  it('accepts PNG and JPEG originals and warns about low resolution', async () => {
    const front = await sharp({ create: { width: 800, height: 500, channels: 3, background: '#ff0000' } }).png().toBuffer()
    const back = await sharp({ create: { width: 2400, height: 1500, channels: 3, background: '#0000ff' } }).jpeg().toBuffer()
    const result = await createMailPDF({ mode: 'separate', front: file(front, 'front.png'), back: file(back, 'back.jpg') })
    expect((await PDFDocument.load(result.bytes)).getPageCount()).toBe(2)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('Front')
  })

  it.each([1, 3])('rejects combined PDFs with %i pages', async (pages) => {
    await expect(createMailPDF({ mode: 'combined', file: await artwork(pages) })).rejects.toThrow('exactly two pages')
  })

  it('rejects multi-page separate artwork', async () => {
    await expect(createMailPDF({ mode: 'separate', front: await artwork(), back: await artwork(1) })).rejects.toThrow('exactly one page')
  })

  it('rejects the wrong aspect ratio rather than distorting or cropping artwork', async () => {
    await expect(createMailPDF({ mode: 'combined', file: await artwork(2, 612, 792) })).rejects.toThrow('different aspect ratio')
  })

  it('rejects unsupported, empty, oversized and corrupt files', async () => {
    for (const [input, message] of [
      [file(new Uint8Array()), 'empty'],
      [{ ...file(new Uint8Array([1])), size: 51 * 1024 * 1024 }, '50 MB'],
      [file(new Uint8Array([1, 2, 3])), 'choose a PDF'],
      [file(new TextEncoder().encode('%PDF-invalid')), 'Could not read'],
    ] as const) {
      await expect(createMailPDF({ mode: 'combined', file: input })).rejects.toThrow(message)
    }
  })
})
