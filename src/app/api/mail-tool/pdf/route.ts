import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import configPromise from '@payload-config'
import { randomBytes } from 'node:crypto'
import { createPayloadRequest } from 'payload'

import { getMailPDFStem, mailPDFNameHeader } from '@/lib/mail-tool/filename'

export const runtime = 'nodejs'

const pdfContentType = 'application/pdf'
const maxPDFBytes = 100 * 1024 * 1024
const downloadLifetimeSeconds = 7 * 24 * 60 * 60
const maxUploadAttempts = 3

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

function getRequestStem(request: Request) {
  try {
    return getMailPDFStem(decodeURIComponent(request.headers.get(mailPDFNameHeader) ?? ''))
  } catch {
    return getMailPDFStem()
  }
}

function getAttachmentDisposition(stem: string) {
  const filename = `${stem}.pdf`
  if (/^[a-z0-9-]+$/.test(stem)) return `attachment; filename="${filename}"`

  const ascii = getMailPDFStem(stem.normalize('NFKD').replace(/[^a-z0-9-]/g, ''))
  return `attachment; filename="${ascii}.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

function getPublicDownloadURL(key: string) {
  const base = process.env.R2_PUBLIC_BASE_URL?.trim()
  if (!base || !/^https:\/\//i.test(base) || /[?#]/.test(base)) return null

  try {
    const url = new URL(base)
    if (!url.hostname || url.username || url.password) return null

    url.pathname = `${url.pathname.replace(/\/+$/u, '')}/${key}`
    return url.toString()
  } catch {
    return null
  }
}

async function getDownloadLink(client: S3Client, bucket: string, key: string) {
  const publicURL = getPublicDownloadURL(key)
  if (publicURL) return { downloadUrl: publicURL, expiresAt: null }

  const signingDate = new Date(Math.floor(Date.now() / 1000) * 1000)
  const downloadUrl = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: downloadLifetimeSeconds,
    signingDate,
  })
  const expiresAt = new Date(signingDate.getTime() + downloadLifetimeSeconds * 1000).toISOString()
  return { downloadUrl, expiresAt }
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

  const stem = getRequestStem(request)
  const disposition = getAttachmentDisposition(stem)
  const client = new S3Client({
    credentials: { accessKeyId, secretAccessKey },
    endpoint,
    forcePathStyle: true,
    region: 'auto',
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
  try {
    for (let attempt = 0; attempt < maxUploadAttempts; attempt++) {
      const key = `mail-tool/${stem}-${randomBytes(6).toString('base64url')}.pdf`
      const download = await getDownloadLink(client, bucket, key)
      try {
        await client.send(new PutObjectCommand({
          Body: pdf,
          Bucket: bucket,
          CacheControl: 'private, no-store',
          ContentDisposition: disposition,
          ContentLength: pdf.byteLength,
          ContentType: pdfContentType,
          IfNoneMatch: '*',
          Key: key,
        }))
      } catch (error) {
        const response = error as { $metadata?: { httpStatusCode?: number } } | null
        if (response?.$metadata?.httpStatusCode === 412) continue
        throw error
      }
      return Response.json(download, {
        headers: { 'Cache-Control': 'private, no-store' },
        status: 201,
      })
    }
    throw new Error('Could not reserve a unique Mail Tool PDF key.')
  } catch (error) {
    payload.logger.error({ err: error }, 'Could not store Mail Tool print PDF')
    return Response.json({ message: 'Could not save the print PDF.' }, { status: 502 })
  } finally {
    client.destroy()
  }
}
