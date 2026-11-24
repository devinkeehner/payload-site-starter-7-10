import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import configPromise from '@payload-config'
import { randomUUID } from 'node:crypto'
import { createPayloadRequest } from 'payload'

export const runtime = 'nodejs'

const pdfContentType = 'application/pdf'
const maxPDFBytes = 100 * 1024 * 1024
const downloadLifetimeSeconds = 7 * 24 * 60 * 60
const filename = 'mailer-two-up-letter.pdf'

class PDFUploadError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

async function readPDF(request: Request) {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== pdfContentType) throw new PDFUploadError('Upload a PDF file.', 415)

  const tooLarge = () => new PDFUploadError('The print PDF exceeds the 100 MB upload limit.', 413)
  const expectedLength = Number(request.headers.get('content-length'))
  if (expectedLength > maxPDFBytes) throw tooLarge()

  const reader = request.body?.getReader()
  if (!reader) throw new PDFUploadError('The print PDF is empty.', 400)

  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxPDFBytes) {
        void reader.cancel().catch(() => undefined)
        throw tooLarge()
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const pdf = Buffer.concat(chunks, size)
  if (pdf.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new PDFUploadError('Upload a valid print PDF.', 400)
  }
  return pdf
}

export async function POST(request: Request): Promise<Response> {
  const { payload, user } = await createPayloadRequest({ config: configPromise, request, canSetHeaders: false })
  if (!user) return Response.json({ message: 'Sign in to save a print PDF.' }, { status: 401 })

  const endpoint = process.env.R2_ENDPOINT?.trim()
  const bucket = process.env.R2_BUCKET?.trim()
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim()
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    return Response.json({ message: 'Print PDF storage is unavailable.' }, { status: 503 })
  }

  let pdf: Buffer
  try {
    pdf = await readPDF(request)
  } catch (error) {
    if (error instanceof PDFUploadError) {
      return Response.json({ message: error.message }, { status: error.status })
    }
    return Response.json({ message: 'Could not read the print PDF.' }, { status: 400 })
  }

  const key = `mail-tool/${randomUUID()}.pdf`
  const client = new S3Client({
    credentials: { accessKeyId, secretAccessKey },
    endpoint,
    forcePathStyle: true,
    region: 'auto',
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
  try {
    const signingDate = new Date(Math.floor(Date.now() / 1000) * 1000)
    const downloadUrl = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
      expiresIn: downloadLifetimeSeconds,
      signingDate,
    })
    await client.send(new PutObjectCommand({
      Body: pdf,
      Bucket: bucket,
      CacheControl: 'private, no-store',
      ContentDisposition: `attachment; filename="${filename}"`,
      ContentLength: pdf.byteLength,
      ContentType: pdfContentType,
      Key: key,
    }))
    const expiresAt = new Date(signingDate.getTime() + downloadLifetimeSeconds * 1000).toISOString()
    return Response.json({ downloadUrl, expiresAt }, {
      headers: { 'Cache-Control': 'private, no-store' },
      status: 201,
    })
  } catch (error) {
    payload.logger.error({ err: error }, 'Could not store Mail Tool print PDF')
    return Response.json({ message: 'Could not save the print PDF.' }, { status: 502 })
  } finally {
    client.destroy()
  }
}
