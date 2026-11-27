import { MAX_CHAT_IMAGE, MAX_CHAT_PDF, type ChatAttachment } from '@/lib/live-editor/designChatProtocol'

const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
const videoTypes = ['video/mp4', 'video/webm']
export const designChatFileAccept = [...imageTypes, ...videoTypes, 'application/pdf', '.txt', '.md', '.csv'].join(',')

export type PendingChatFile = {
  id: string; file: File; kind: 'image' | 'pdf' | 'text' | 'video'; useInDraft: boolean
  uploaded?: Extract<ChatAttachment, { kind: 'media' }>
}
export function prepareDesignChatFile(file: File): PendingChatFile {
  const kind = imageTypes.includes(file.type) ? 'image' : videoTypes.includes(file.type) ? 'video'
    : file.type === 'application/pdf' ? 'pdf' : /\.(txt|md|csv)$/i.test(file.name) ? 'text' : undefined
  if (!kind) throw new Error('Choose an image, PDF, text file, MP4 or WebM.')
  const limit = kind === 'video' ? 25 : kind === 'text' ? 1 : 10
  if (!file.size || file.size > limit * 1024 * 1024) throw new Error(`Choose a nonempty file up to ${limit} MB.`)
  return { id: crypto.randomUUID(), file, kind, useInDraft: kind === 'video' }
}

function dataURL(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Unable to read the attachment.'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })
}

async function resizeImage(file: File) {
  const source = await createImageBitmap(file).catch(() => { throw new Error(`Unable to open ${file.name} as an image.`) })
  try {
    const scale = Math.min(1, 1200 / Math.max(source.width, source.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(source.width * scale))
    canvas.height = Math.max(1, Math.round(source.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Image attachments are unavailable in this browser.')
    context.fillStyle = 'white'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(source, 0, 0, canvas.width, canvas.height)
    const image = canvas.toDataURL('image/jpeg', .78)
    if (image.length > MAX_CHAT_IMAGE) throw new Error(`${file.name} is too detailed. Choose a smaller reference.`)
    return image
  } finally { source.close() }
}

export async function readDesignChatReference({ file, kind, useInDraft }: PendingChatFile): Promise<ChatAttachment | undefined> {
  const name = file.name.slice(0, 240) || 'Attachment'
  if (kind === 'image') return { kind, name, data: await resizeImage(file) }
  if (kind === 'text') return { kind, name, data: await file.slice(0, 25_000).text() }
  if (kind === 'pdf') {
    if (file.size > 2 * 1024 * 1024) {
      if (useInDraft) return
      throw new Error('PDF references can be up to 2 MB. Larger PDFs can be added to the site library.')
    }
    const data = await dataURL(file)
    if (data.length > MAX_CHAT_PDF) throw new Error('This PDF is too large for chat.')
    return { kind, name, data }
  }
}

export async function uploadDesignChatFile(apiURL: string, pending: PendingChatFile, signal: AbortSignal): Promise<Extract<ChatAttachment, { kind: 'media' }>> {
  if (pending.kind === 'text') throw new Error('Use text files as chat references.')
  const form = new FormData()
  form.set('file', pending.file)
  form.set('alt', pending.file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '))
  const response = await fetch(`${apiURL}/media`, { method: 'POST', credentials: 'same-origin', body: form, signal })
  const payload = await response.json().catch(() => null)
  const id = payload?.resource?.id
  if (!response.ok || (typeof id !== 'string' && typeof id !== 'number')) throw new Error(payload?.error || `Unable to upload ${pending.file.name}.`)
  return { kind: 'media', name: pending.file.name.slice(0, 240) || 'Attachment', mediaId: String(id), mediaType: pending.kind }
}
