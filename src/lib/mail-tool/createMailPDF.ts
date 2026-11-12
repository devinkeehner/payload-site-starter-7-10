import { PDFDocument, PrintScaling, clip, degrees, endPath, popGraphicsState, pushGraphicsState, rectangle, type PDFPage } from 'pdf-lib'

/** All dimensions are PDF points (72 per inch), measured from the bottom left. */
export const MAIL_LAYOUT = {
  sheetWidth: 612,
  sheetHeight: 792,
  designWidth: 576,
  designHeight: 360,
  margin: 18,
  cutY: 396,
  positions: [414, 18],
} as const

export type MailArtwork = { name: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> }
export type MailInput =
  | { mode: 'combined'; file: MailArtwork }
  | { mode: 'separate'; front: MailArtwork; back: MailArtwork }

class ArtworkError extends Error {}

function validateRatio(width: number, height: number, label: string) {
  if (!(width > 0 && height > 0) || Math.abs(width / height / 1.6 - 1) > 0.005) {
    throw new ArtworkError(`${label}: use an 8 × 5 inch landscape design, without bleed or crop marks. This file has a different aspect ratio.`)
  }
}

async function readArtwork(file: MailArtwork) {
  if (file.size === 0) throw new ArtworkError(`${file.name}: the file is empty.`)
  if (file.size > 50 * 1024 * 1024) throw new ArtworkError(`${file.name}: the maximum file size is 50 MB.`)
  const bytes = new Uint8Array(await file.arrayBuffer())
  const header = new TextDecoder('latin1').decode(bytes.subarray(0, 1024))
  const kind = header.includes('%PDF-') ? 'pdf'
    : bytes[0] === 0xff && bytes[1] === 0xd8 ? 'jpeg'
      : bytes.subarray(0, 8).join(',') === '137,80,78,71,13,10,26,10' ? 'png' : null
  if (!kind) throw new ArtworkError(`${file.name}: choose a PDF, JPEG, or PNG file.`)
  return { bytes, kind }
}

function validatePDFPage(page: PDFPage, label: string) {
  const rotation = ((page.getRotation().angle % 360) + 360) % 360
  const box = page.getCropBox()
  const swapped = rotation === 90 || rotation === 270
  validateRatio(swapped ? box.height : box.width, swapped ? box.width : box.height, label)
  if (![0, 90, 180, 270].includes(rotation)) throw new ArtworkError(`${label}: unsupported PDF rotation. Re-export from Canva.`)
  return { box, rotation }
}

/** Embed original PDF content and original image bytes; never rasterize PDF artwork. */
export async function createMailPDF(input: MailInput): Promise<{ bytes: Uint8Array; warnings: string[] }> {
  const output = await PDFDocument.create()
  const warnings: string[] = []

  async function addPDFPage(sourcePage: PDFPage, label: string) {
    const { box, rotation } = validatePDFPage(sourcePage, label)
    const embedded = await output.embedPage(sourcePage, {
      left: box.x, bottom: box.y, right: box.x + box.width, top: box.y + box.height,
    })
    const sheet = output.addPage([MAIL_LAYOUT.sheetWidth, MAIL_LAYOUT.sheetHeight])
    const swapped = rotation === 90 || rotation === 270
    for (const y of MAIL_LAYOUT.positions) {
      sheet.drawPage(embedded, {
        x: MAIL_LAYOUT.margin + (rotation === 180 || rotation === 270 ? MAIL_LAYOUT.designWidth : 0),
        y: y + (rotation === 90 || rotation === 180 ? MAIL_LAYOUT.designHeight : 0),
        width: swapped ? MAIL_LAYOUT.designHeight : MAIL_LAYOUT.designWidth,
        height: swapped ? MAIL_LAYOUT.designWidth : MAIL_LAYOUT.designHeight,
        rotate: degrees(-rotation),
      })
    }
  }

  async function loadPDF(bytes: Uint8Array, label: string, expectedPages: number) {
    const pdf = await PDFDocument.load(bytes)
    if (pdf.getPageCount() !== expectedPages) {
      throw new ArtworkError(`${label}: expected ${expectedPages === 2 ? 'exactly two pages (front, then back)' : 'exactly one page'}. Found ${pdf.getPageCount()}.`)
    }
    return pdf
  }

  async function addSide(file: MailArtwork, side: string) {
    const { bytes, kind } = await readArtwork(file)
    if (kind === 'pdf') {
      const pdf = await loadPDF(bytes, side, 1)
      await addPDFPage(pdf.getPage(0), side)
    } else {
      const image = kind === 'png' ? await output.embedPng(bytes) : await output.embedJpg(bytes)
      validateRatio(image.width, image.height, side)
      if (Math.min(image.width / 8, image.height / 5) < 300) {
        warnings.push(`${side}: image resolution is below 300 dpi at 8 × 5 inches. Prefer a print-ready PDF or an image at least 2400 × 1500 pixels.`)
      }
      const sheet = output.addPage([MAIL_LAYOUT.sheetWidth, MAIL_LAYOUT.sheetHeight])
      for (const y of MAIL_LAYOUT.positions) {
        // Clip image interpolation at the design edge to protect the print margins.
        sheet.pushOperators(pushGraphicsState(), rectangle(MAIL_LAYOUT.margin, y, MAIL_LAYOUT.designWidth, MAIL_LAYOUT.designHeight), clip(), endPath())
        sheet.drawImage(image, { x: MAIL_LAYOUT.margin, y, width: MAIL_LAYOUT.designWidth, height: MAIL_LAYOUT.designHeight })
        sheet.pushOperators(popGraphicsState())
      }
    }
  }

  try {
    if (input.mode === 'combined') {
      const { bytes, kind } = await readArtwork(input.file)
      if (kind !== 'pdf') throw new ArtworkError('For one file, choose a two-page PDF. For images, choose separate front and back files.')
      const pdf = await loadPDF(bytes, input.file.name, 2)
      await addPDFPage(pdf.getPage(0), 'Front (page 1)')
      await addPDFPage(pdf.getPage(1), 'Back (page 2)')
    } else {
      await addSide(input.front, 'Front')
      await addSide(input.back, 'Back')
    }
    output.setTitle('Two-up mailer - front and back')
    output.catalog.getOrCreateViewerPreferences().setPrintScaling(PrintScaling.None)
    return { bytes: await output.save(), warnings }
  } catch (error) {
    if (error instanceof ArtworkError) throw error
    throw new Error('Could not read this artwork. Use an unprotected, print-ready PDF exported from Canva without bleed or crop marks, or a valid JPEG/PNG.')
  }
}
