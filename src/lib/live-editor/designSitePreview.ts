import { createHash, randomBytes } from 'node:crypto'
import { afterReadTraverseFields, getDataLoader, type Payload, type PayloadRequest } from 'payload'
import { z } from 'zod'
import { getServerSideURL } from '@/lib/utilities/getURL'
import { readDesignChatJSON } from './designChatService'
import { NativeDraftError } from './emailDraft'
import { relationshipID } from './emailAccess'
import { prepareEditorPagePatch, type loadEditorPage } from './pageService'

const previewBody = z.object({
  callId: z.string().uuid(),
  revision: z.number().int().nonnegative(),
  title: z.string().max(500).optional(),
  layout: z.array(z.unknown()).max(300),
}).strict()

export const readDesignSitePreview = (request: Request) => readDesignChatJSON(request, previewBody, 2_000_000)
type PreviewInput = z.infer<typeof previewBody>

type PreviewSnapshot = {
  _id: string
  expiresAt: Date
  page: { id: string; title: string; slug: string; hero: unknown; layout: unknown; _status: string }
  tenantSlug: string
  editorOrigin: string
  revision: number
}

const digest = (ticket: string) => createHash('sha256').update(ticket).digest('hex')
const store = (payload: Payload) => {
  const connection = payload.db.connection
  return connection.getClient().db(connection.name).collection<PreviewSnapshot>('liveEditorDesignPreviews')
}
let ttlIndex: Promise<string> | undefined

export async function stageDesignSitePreview(
  req: PayloadRequest, page: Awaited<ReturnType<typeof loadEditorPage>>, input: PreviewInput,
) {
  const frontend = process.env.PREVIEW_FRONTEND_ORIGIN
  if (!frontend) throw new NativeDraftError('This site has no website preview configured.')
  const url = new URL('/api/live-editor-design-preview', frontend)
  const editorOrigin = new URL(getServerSideURL()).origin
  if (url.origin === editorOrigin) throw new NativeDraftError('The website preview requires a separate frontend origin.')
  const tenantId = relationshipID(page.tenant)
  if (!tenantId) throw new NativeDraftError('Assign this page to a site before previewing it.')
  const tenant = await req.payload.findByID({ collection: 'tenants', id: tenantId, req, depth: 0, overrideAccess: true })
  const { patch, collection } = await prepareEditorPagePatch(req, page, { layout: input.layout, ...(input.title != null ? { title: input.title } : {}) })
  req.payloadDataLoader ??= getDataLoader(req)
  const fieldPromises: Promise<void>[] = []
  const populationPromises: Promise<void>[] = []
  afterReadTraverseFields({
    collection, context: req.context, currentDepth: 1, depth: 2, doc: patch, siblingDoc: patch,
    draft: true, fallbackLocale: null, fields: collection.fields, fieldPromises, populationPromises,
    findMany: false, flattenLocales: true, global: null, locale: req.locale ?? null, overrideAccess: false,
    parentIndexPath: '', parentPath: '', parentSchemaPath: '', req, showHiddenFields: false,
    populate: {
      forms: { title: true, fields: true, submitButtonLabel: true },
      media: { filename: true, url: true, alt: true, width: true, height: true, mimeType: true, sizes: true },
    },
  })
  // Payload field hooks may enqueue relationship reads as the field promises resolve.
  for (let batch = 0; fieldPromises.length || populationPromises.length; batch++) {
    if (batch === 100) throw new Error('Unable to populate preview relationships.')
    await Promise.all([...fieldPromises.splice(0), ...populationPromises.splice(0)])
  }
  const ticket = randomBytes(32).toString('base64url')
  const collectionStore = store(req.payload)
  ttlIndex ??= collectionStore.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(error => {
    ttlIndex = undefined
    throw error
  })
  await ttlIndex
  await collectionStore.insertOne({
    _id: digest(ticket), expiresAt: new Date(Date.now() + 60_000), tenantSlug: tenant.slug,
    editorOrigin, revision: input.revision,
    page: { id: String(page.id), title: typeof patch.title === 'string' ? patch.title : page.title, slug: page.slug || '', hero: page.hero, layout: patch.layout, _status: 'draft' },
  })
  url.searchParams.set('ticket', ticket)
  return { url: url.href }
}

export async function takeDesignSitePreview(payload: Payload, token: string) {
  const snapshot = await store(payload).findOneAndDelete({ _id: digest(token), expiresAt: { $gt: new Date() } })
  if (!snapshot) return null
  return { page: snapshot.page, tenantSlug: snapshot.tenantSlug, revision: snapshot.revision, editorOrigin: snapshot.editorOrigin }
}
