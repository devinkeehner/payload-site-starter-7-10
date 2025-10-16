import type { CollectionConfig } from 'payload'

import {
  BlocksFeature,
  FixedToolbarFeature,
  HeadingFeature,
  HorizontalRuleFeature,
  InlineToolbarFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'
import { convertLexicalToHTML } from '@payloadcms/richtext-lexical/html'
import OpenAI from 'openai'

import { authenticated } from '../../lib/access/authenticated'
import { authenticatedOrPublished } from '../../lib/access/authenticatedOrPublished'
import { BannerConfig } from '@/components/blocks/banner-block/config'
import { CodeBlockConfig } from '@/components/blocks/code-block/config'
import { MediaBlockConfig } from '@/components/blocks/media-block/config'
import { MediaGalleryBlockConfig } from '@/components/blocks/media-gallery-block/config'
import { FormBlockConfig } from '@/components/blocks/form-block/config'
import { generatePreviewPath } from '@/lib/utilities/generatePreviewPath'
import { revalidateDelete, revalidatePost } from './hooks/revalidatePost'

import {
  MetaDescriptionField,
  MetaImageField,
  MetaTitleField,
  PreviewField,
} from '@payloadcms/plugin-seo/fields'
import { slugField } from '@/collections/fields/slug'

export const Posts: CollectionConfig<'posts'> = {
  slug: 'posts',
  access: {
    create: authenticated,
    delete: authenticated,
    read: authenticatedOrPublished,
    update: authenticated,
  },
  defaultPopulate: {
    title: true,
    slug: true,
    categories: true,
    articleType: true,
    keyTakeaways: true,
    meta: {
      image: true,
      description: true,
    },
  },
  admin: {
    group: 'Content',
    defaultColumns: ['title', 'slug', 'updatedAt'],
    livePreview: {
      url: ({ data, req }) => {
        const path = generatePreviewPath({
          slug: typeof data?.slug === 'string' ? data.slug : '',
          collection: 'posts',
          req,
          tenantId:
            (typeof (data as any)?.tenant === 'string'
              ? ((data as any).tenant as string)
              : (data as any)?.tenant?.id) || undefined,
        })

        return path
      },
    },
    preview: (data, { req }) =>
      generatePreviewPath({
        slug: typeof data?.slug === 'string' ? data.slug : '',
        collection: 'posts',
        req,
        tenantId:
          (typeof (data as any)?.tenant === 'string'
            ? ((data as any).tenant as string)
            : (data as any)?.tenant?.id) || undefined,
      }),
    useAsTitle: 'title',
  },
  endpoints: [
    {
      path: '/:id/generate-seo',
      method: 'post',
      handler: (async (req: any, res: any, _next: any) => {
        const send = (status: number, body: any) => {
          if (res?.status && typeof res.status === 'function') {
            return res.status(status).json(body)
          }
          return new Response(JSON.stringify(body), {
            status,
            headers: { 'content-type': 'application/json' },
          })
        }
        try {
          if (!req.user) {
            return send(401, { error: 'Unauthorized' })
          }

          const apiKey = process.env.OPENAI_API_KEY
          if (!apiKey) {
            return send(400, { error: 'OPENAI_API_KEY not configured' })
          }

          let id: string | undefined
          try {
            id = (req as any)?.params?.id || (req as any)?.routeParams?.id || (req as any)?.query?.id
            if (!id) {
              const url: string = (req as any)?.url || (req as any)?.originalUrl || ''
              const match = url.match(/\/api\/posts\/([^\/]+)\/generate-seo/)
              if (match?.[1]) id = match[1]
            }
          } catch {}
          if (!id) return send(400, { error: 'Missing post id from params or URL' })

          // Load current doc (draft-aware)
          const post = await req.payload.findByID({
            collection: 'posts',
            id,
            draft: true,
          })
          if (!post) {
            return send(404, { error: 'Post not found' })
          }

          const title: string = post?.title || ''
          const content = post?.content
          const contentHTML =
            typeof content === 'string' ? content : convertLexicalToHTML(content || [])

          // Gather options the model must choose from
          const [categories, articleTypes] = await Promise.all([
            req.payload.find({ collection: 'categories', limit: 1000 }),
            req.payload.find({ collection: 'article-types', limit: 1000 }),
          ])

          const categoryOptions = (categories?.docs || []).map((c: any) => ({
            id: c.id,
            slug: c.slug,
            title: c.title,
          }))
          const articleTypeOptions = (articleTypes?.docs || []).map((a: any) => ({
            id: a.id,
            slug: a.slug,
            title: a.title,
          }))
          if (!categoryOptions.length) {
            return send(400, { error: 'No categories available' })
          }
          if (!articleTypeOptions.length) {
            return send(400, { error: 'No article types available' })
          }

          // Prepare summaries to feed into the hosted prompt
          const categoriesList = categoryOptions
            .map((c: any) => `${c.slug || ''} | ${c.title || ''}`.trim())
            .join('\n')
          const articleTypesList = articleTypeOptions
            .map((a: any) => `${a.slug || ''} | ${a.title || ''}`.trim())
            .join('\n')

          const client = new OpenAI({ apiKey })

          // Variables for hosted prompt

          let response
          try {
            response = await client.responses.create({
              prompt: {
                id: 'pmpt_688d35bf76348194bc06464d4d5f202e063e27e2905e1241',
                version: '31',
                // Pass variables to the hosted prompt here
                variables: {
                  // Variables expected by the hosted prompt (v23)
                  title: title,
                  content: contentHTML,
                  categories: categoriesList,
                  article_types: articleTypesList,
                },
              },
              // Simple instruction as a plain string satisfies ResponseInput
              input: 'Respond only with valid json.',
            })
          } catch (e: any) {
            return send(502, {
              error: e?.message || 'OpenAI request failed',
              code: e?.code,
              type: e?.type,
            })
          }

          // Extract text output
          const textOut = (response as any)?.output_text || ''
          let parsed: any
          try {
            parsed = JSON.parse(textOut)
          } catch (e) {
            return send(502, { error: 'Invalid model JSON', raw: textOut })
          }

          const description: string = parsed?.description || ''
          const keyTakeaways: string[] = Array.isArray(parsed?.keyTakeaways)
            ? parsed.keyTakeaways
            : []
          const categoryInputs: string[] = Array.isArray(parsed?.categorySlugs)
            ? parsed.categorySlugs
            : Array.isArray(parsed?.categories)
            ? parsed.categories
            : []
          const articleTypeInput: string | undefined =
            parsed?.articleTypeSlug ?? parsed?.articleType

          // Map slugs to IDs
          const categoryIDs = categoryInputs
            .map((s: string) => String(s).trim().toLowerCase())
            .map((s: string) =>
              categoryOptions.find(
                (c: any) => c.slug?.toLowerCase() === s || c.title?.toLowerCase() === s,
              )?.id,
            )
            .filter(Boolean)
          const atLookup = (val?: string) => {
            if (!val) return undefined
            const s = String(val).trim().toLowerCase()
            return (
              articleTypeOptions.find(
                (a: any) => a.slug?.toLowerCase() === s || a.title?.toLowerCase() === s,
              )?.id || undefined
            )
          }
          const articleTypeID = atLookup(articleTypeInput)

          return send(200, {
            description,
            keyTakeawaysNormalized: keyTakeaways.map((k) => ({ point: String(k) })),
            categoryIDs,
            articleTypeID,
          })
        } catch (err: any) {
          // Log to server for diagnosis
          console.error('[generate-seo] Unhandled error', err)
          const body: any = { error: err?.message || 'Server error' }
          if (process.env.NODE_ENV !== 'production') {
            body.name = err?.name
            body.stack = err?.stack
          }
          return send(500, body)
        }
      }) as any,
    },
    {
      path: '/:id/share',
      method: 'post',
      handler: (async (req: any, res: any) => {
        const send = (status: number, body: any) => {
          if (res?.status && typeof res.status === 'function') {
            return res.status(status).json(body)
          }
          return new Response(JSON.stringify(body), {
            status,
            headers: { 'content-type': 'application/json' },
          })
        }
        try {
          if (!req.user) return send(401, { error: 'Unauthorized' })
          // Resolve ID from params or URL
          let id: string | undefined
          try {
            id = (req as any)?.params?.id || (req as any)?.routeParams?.id || (req as any)?.query?.id
            if (!id) {
              const url: string = (req as any)?.originalUrl || (req as any)?.url || ''
              const match = url.match(/\/api\/posts\/([^\/]+)\/share/)
              if (match?.[1]) id = match[1]
            }
          } catch {}
          if (!id) return send(400, { error: 'Missing post id' })
          // Robustly parse body across adapters (Express vs Next)
          let raw: any = (req as any)?.body
          // If body is a string or Buffer, try to parse JSON
          if (raw && typeof raw === 'string') {
            try { raw = JSON.parse(raw) } catch { /* keep as-is */ }
          } else if (raw && typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) {
            try { raw = JSON.parse(raw.toString('utf-8')) } catch { raw = {} }
          }
          // Heuristic: Next.js Request body may be a ReadableStream, or body may be present but not parsed
          const looksLikeReadableStream = !!raw && typeof raw === 'object' && (typeof raw.getReader === 'function' || typeof raw.tee === 'function')
          const rawMissingKeys = !raw || typeof raw !== 'object' || (!('tenantIDs' in raw) && !('tenantIds' in raw) && !('tenant_ids' in raw) && !('tenants' in raw) && !('sourceTenantID' in raw) && !('sourceTenantId' in raw))
          if (looksLikeReadableStream || rawMissingKeys) {
            try {
              if (typeof (req as any)?.json === 'function') {
                const parsed = await (req as any).json()
                if (parsed && typeof parsed === 'object') raw = parsed
              } else if (typeof (req as any)?.text === 'function') {
                const txt = await (req as any).text()
                raw = txt ? JSON.parse(txt) : raw || {}
              }
            } catch {
              // keep best-effort raw
            }
          }
          // Extract tenantIDs from body or query in multiple shapes
          const extractIDs = (val: any): string[] => {
            if (!val) return []
            if (Array.isArray(val)) return val.map((v) => (typeof v === 'string' ? v : v?.id || v?.value)).filter(Boolean)
            if (typeof val === 'string') return val.split(',').map((s) => s.trim()).filter(Boolean)
            if (typeof val === 'object') {
              // Support bracket syntax: tenantIDs[0]=idA&tenantIDs[1]=idB
              const keys = Object.keys(val).filter((k) => k.startsWith('tenantIDs['))
              if (keys.length) return keys.map((k) => val[k]).filter(Boolean)
            }
            return []
          }
          let tenantIDs: string[] = []
          tenantIDs = extractIDs(raw?.tenantIDs)
          if (!tenantIDs.length) tenantIDs = extractIDs(raw?.tenantIds)
          if (!tenantIDs.length) tenantIDs = extractIDs(raw?.tenant_ids)
          if (!tenantIDs.length) tenantIDs = extractIDs(raw?.tenants)
          // Source tenant id (the tenant of the post being copied from)
          const sourceTenantID: string | undefined =
            typeof raw?.sourceTenantID === 'string'
              ? raw.sourceTenantID
              : typeof raw?.sourceTenantId === 'string'
              ? raw.sourceTenantId
              : undefined
          // Query param fallback
          if (!tenantIDs.length) {
            const q: any = (req as any)?.query || {}
            tenantIDs = extractIDs(q?.tenantIDs) || extractIDs(q?.tenantIds)
            if (!tenantIDs.length && (typeof (req as any)?.originalUrl === 'string' || typeof (req as any)?.url === 'string')) {
              try {
                const urlStr: string = (req as any).originalUrl || (req as any).url
                const u = new URL(urlStr, 'http://local')
                const all = u.searchParams.getAll('tenantIDs')
                if (all && all.length) {
                  tenantIDs = extractIDs(all)
                } else {
                  const qp = u.searchParams.get('tenantIDs') || u.searchParams.get('tenantIds')
                  if (qp) tenantIDs = extractIDs(qp)
                }
              } catch {}
            }
          }
          if (!tenantIDs.length) {
            const debug: any = {}
            try {
              debug.bodyType = typeof (req as any)?.body
              debug.rawType = typeof raw
              debug.rawKeys = raw && typeof raw === 'object' ? Object.keys(raw) : undefined
              debug.queryKeys = (req as any)?.query ? Object.keys((req as any).query) : undefined
              debug.url = (req as any)?.originalUrl || (req as any)?.url
            } catch {}
            const body: any = { error: 'No tenantIDs provided' }
            if (process.env.NODE_ENV !== 'production') body.debug = debug
            return send(400, body)
          }
          const isSuper = !!req.user?.roles?.includes('super')
          const userTenantIDs: string[] = Array.isArray(req.user?.tenants)
            ? (req.user.tenants as any[])
                .map((t) => (typeof t?.tenant === 'string' ? t.tenant : t?.tenant?.id))
                .filter(Boolean)
            : []
          const allowedTenantIDs = isSuper ? tenantIDs : tenantIDs.filter((t) => userTenantIDs.includes(t))
          if (!allowedTenantIDs.length) return send(403, { error: 'You do not have access to the selected tenants' })
          // Load source post (draft-aware), scoping to the source tenant if provided
          let source: any
          try {
            if (sourceTenantID) {
              source = await req.payload.findByID({
                collection: 'posts',
                id,
                draft: true,
                depth: 0,
                req: { ...(req as any), tenant: sourceTenantID } as any,
              })
            } else {
              source = await req.payload.findByID({
                collection: 'posts',
                id,
                draft: true,
                depth: 0,
              })
            }
          } catch (e: any) {
            return send(404, { error: 'Post not found or inaccessible for the current tenant scope' })
          }
          if (!source) return send(404, { error: 'Post not found' })
          const sourceTenantId: string | undefined =
            typeof (source as any)?.tenant === 'string' ? (source as any).tenant : (source as any)?.tenant?.id

          const tenantCache = new Map<string, { id: string; slug?: string | null }>()
          const mediaDocCache = new Map<string, any>()
          const mediaCloneCache = new Map<string, string>()
          const formDocCache = new Map<string, any>()
          const formCloneCache = new Map<string, string>()

          const extractMediaId = (value: any): string | undefined => {
            if (!value) return undefined
            if (typeof value === 'string') return value
            if (typeof value === 'object') {
              if (typeof value.id === 'string') return value.id
              if (typeof value._id === 'string') return value._id
              if (typeof value.value === 'string') return value.value
              if (typeof value.value === 'object') return extractMediaId(value.value)
            }
            return undefined
          }

          const extractFormId = (value: any): string | undefined => {
            if (!value) return undefined
            if (typeof value === 'string') return value
            if (typeof value === 'object') {
              if (typeof value.id === 'string') return value.id
              if (typeof value._id === 'string') return value._id
              if (typeof value.value === 'string') return value.value
              if (typeof value.value === 'object') return extractFormId(value.value)
            }
            return undefined
          }

          const getTenantInfo = async (tenantId: string) => {
            if (tenantCache.has(tenantId)) return tenantCache.get(tenantId)!
            const tenantDoc = await req.payload.findByID({
              collection: 'tenants',
              id: tenantId,
              depth: 0,
              overrideAccess: true,
            })
            const info = { id: tenantId, slug: (tenantDoc as any)?.slug ?? undefined }
            tenantCache.set(tenantId, info)
            return info
          }

          const buildMediaUrl = (doc: any): string | undefined => {
            if (typeof doc?.url === 'string' && doc.url) return doc.url
            const base = process.env.R2_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_MEDIA_BASE_URL
            if (!base) return undefined
            const prefix = typeof doc?.prefix === 'string' ? doc.prefix.replace(/\/+$/u, '') : ''
            const filename = typeof doc?.filename === 'string' ? doc.filename.replace(/^\/+/, '') : ''
            if (!filename) return undefined
            const key = prefix ? `${prefix}/${filename}` : filename
            return `${base.replace(/\/+$/u, '')}/${key.replace(/^\/+/, '')}`
          }

          const fetchMediaDoc = async (mediaId: string) => {
            if (mediaDocCache.has(mediaId)) return mediaDocCache.get(mediaId)!
            const scopedSourceReq = sourceTenantId
              ? ({ ...(req as any), tenant: sourceTenantId } as any)
              : (req as any)
            const doc = await req.payload.findByID({
              collection: 'media',
              id: mediaId,
              depth: 0,
              overrideAccess: true,
              req: scopedSourceReq,
            })
            mediaDocCache.set(mediaId, doc)
            return doc
          }

          const ensureMediaClone = async (mediaId: string | undefined, tenantId: string, scopedReq: any): Promise<string | undefined> => {
            if (!mediaId) return undefined
            const cacheKey = `${mediaId}:${tenantId}`
            if (mediaCloneCache.has(cacheKey)) return mediaCloneCache.get(cacheKey)!

            const mediaDoc = await fetchMediaDoc(mediaId).catch((error: any) => {
              throw new Error(`Failed to load media ${mediaId}: ${error?.message || error}`)
            })
            if (!mediaDoc) throw new Error(`Media ${mediaId} not found`)

            const mediaUrl = buildMediaUrl(mediaDoc)
            if (!mediaUrl) throw new Error(`Media ${mediaId} is missing a resolvable URL`)

            const response = await fetch(mediaUrl)
            if (!response.ok) {
              throw new Error(`Unable to download media ${mediaId} (status ${response.status})`)
            }
            const arrayBuffer = await response.arrayBuffer()
            const fileBuffer = Buffer.from(arrayBuffer)

            const tenantInfo = await getTenantInfo(tenantId)
            const filename =
              typeof mediaDoc?.filename === 'string' && mediaDoc.filename
                ? mediaDoc.filename.replace(/\\/gu, '/').split('/').pop() || mediaDoc.filename
                : `${mediaId}`
            const mimeType = typeof mediaDoc?.mimeType === 'string' ? mediaDoc.mimeType : 'application/octet-stream'
            const captionClone = mediaDoc?.caption ? JSON.parse(JSON.stringify(mediaDoc.caption)) : undefined

            const createdMedia = await req.payload.create({
              collection: 'media',
              data: {
                alt: (mediaDoc as any)?.alt,
                caption: captionClone,
                tenant: tenantId,
              },
              file: {
                data: fileBuffer,
                size: fileBuffer.length,
                name: filename,
                filename,
                mimetype: mimeType,
                mimeType,
                prefix: tenantInfo.slug ? `${tenantInfo.slug.replace(/\/+$/u, '')}/` : undefined,
              } as any,
              req: scopedReq,
              overrideAccess: true,
              context: { disableRevalidate: true } as any,
            })

            const newId = (createdMedia as any)?.id
            if (typeof newId !== 'string') throw new Error(`Cloned media for ${mediaId} did not return an ID`)

            mediaCloneCache.set(cacheKey, newId)
            return newId
          }

          const fetchFormDoc = async (formId: string) => {
            if (formDocCache.has(formId)) return formDocCache.get(formId)!
            const scopedSourceReq = sourceTenantId
              ? ({ ...(req as any), tenant: sourceTenantId } as any)
              : (req as any)
            const doc = await req.payload.findByID({
              collection: 'forms',
              id: formId,
              depth: 2,
              overrideAccess: true,
              req: scopedSourceReq,
            })
            formDocCache.set(formId, doc)
            return doc
          }

          const cloneFormFieldOptions = async (options: any[], tenantId: string, scopedReq: any) => {
            if (!Array.isArray(options)) return options
            const clonedOptions: any[] = []
            for (const option of options) {
              if (!option) continue
              const nextOption: Record<string, any> = { ...option }
              delete nextOption.id
              delete nextOption._id
              if (nextOption.image) {
                const optionImageId = extractMediaId(nextOption.image)
                nextOption.image = await ensureMediaClone(optionImageId, tenantId, scopedReq)
              }
              clonedOptions.push(nextOption)
            }
            return clonedOptions
          }

          const cloneFormFields = async (fields: any[], tenantId: string, scopedReq: any) => {
            if (!Array.isArray(fields)) return fields
            const clonedFields: any[] = []
            for (const field of fields) {
              if (!field) continue
              const nextField: Record<string, any> = JSON.parse(JSON.stringify(field))
              delete nextField.id
              delete nextField._id
              if (Array.isArray(nextField.options)) {
                nextField.options = await cloneFormFieldOptions(nextField.options, tenantId, scopedReq)
              }
              clonedFields.push(nextField)
            }
            return clonedFields
          }

          const ensureFormClone = async (formId: string | undefined, tenantId: string, scopedReq: any): Promise<string | undefined> => {
            if (!formId) return undefined
            const cacheKey = `${formId}:${tenantId}`
            if (formCloneCache.has(cacheKey)) return formCloneCache.get(cacheKey)!

            const formDoc = await fetchFormDoc(formId).catch((error: any) => {
              throw new Error(`Failed to load form ${formId}: ${error?.message || error}`)
            })
            if (!formDoc) throw new Error(`Form ${formId} not found`)

            const cloneKeys = [
              'title',
              'fields',
              'submitButtonLabel',
              'confirmationType',
              'confirmationMessage',
              'redirect',
              'emails',
            ]

            const data: Record<string, any> = {}
            for (const key of cloneKeys) {
              if (typeof formDoc[key] !== 'undefined') {
                data[key] = JSON.parse(JSON.stringify(formDoc[key]))
              }
            }

            data.fields = await cloneFormFields(data.fields, tenantId, scopedReq)
            if (Array.isArray(data.emails)) {
              data.emails = data.emails.map((email: any) => {
                if (!email) return email
                const nextEmail = { ...email }
                delete nextEmail.id
                delete nextEmail._id
                return nextEmail
              })
            }

            data.tenant = tenantId

            const createdForm = await req.payload.create({
              collection: 'forms',
              data,
              draft: true,
              depth: 0,
              req: scopedReq as any,
              overrideAccess: true,
              context: { disableRevalidate: true } as any,
            })

            const newId = (createdForm as any)?.id
            if (typeof newId !== 'string') throw new Error(`Cloned form for ${formId} did not return an ID`)

            formCloneCache.set(cacheKey, newId)
            return newId
          }

          const cloneRichTextUploads = async (value: any, tenantId: string, scopedReq: any): Promise<any> => {
            const walk = async (node: any): Promise<any> => {
              if (Array.isArray(node)) {
                const next: any[] = []
                for (const item of node) {
                  next.push(await walk(item))
                }
                return next
              }
              if (!node || typeof node !== 'object') return node

              if (node.type === 'upload' && node.relationTo === 'media') {
                const uploadId = extractMediaId(node.value)
                const clonedId = await ensureMediaClone(uploadId, tenantId, scopedReq)
                return { ...node, value: clonedId }
              }

              const entries = Object.entries(node)
              const updated: Record<string, any> = Array.isArray(node) ? [] : { ...node }
              for (const [key, val] of entries) {
                if (!val) {
                  updated[key] = val
                  continue
                }
                // Handle common media relationship shapes nested inside blocks
                if (key === 'media' || key === 'image') {
                  const relationId = extractMediaId(val)
                  if (relationId) {
                    updated[key] = await ensureMediaClone(relationId, tenantId, scopedReq)
                    continue
                  }
                }
                if (key === 'form') {
                  const relationId = extractFormId(val)
                  if (relationId) {
                    updated[key] = await ensureFormClone(relationId, tenantId, scopedReq)
                    continue
                  }
                }
                if (!Array.isArray(val) && typeof val === 'object') {
                  const relationTo = (val as any)?.relationTo
                  if (relationTo === 'media') {
                    const relationId = extractMediaId(val)
                    if (relationId) {
                      updated[key] = await ensureMediaClone(relationId, tenantId, scopedReq)
                      continue
                    }
                  }
                  if (relationTo === 'forms') {
                    const relationId = extractFormId(val)
                    if (relationId) {
                      updated[key] = await ensureFormClone(relationId, tenantId, scopedReq)
                      continue
                    }
                  }
                }
                updated[key] = await walk(val)
              }
              return updated
            }

            return walk(value)
          }

          const toCreate = allowedTenantIDs
          const results: any[] = []
          for (const tID of toCreate) {
            if (tID && sourceTenantId && tID === sourceTenantId) {
              results.push({ tenantID: tID, skipped: true, reason: 'same-tenant' })
              continue
            }
            const scopedReq = { ...(req as any), tenant: tID }
            try {
              // Normalize relationships to IDs and strip system fields
              const categories = Array.isArray((source as any)?.categories)
                ? (source as any).categories.map((c: any) => (typeof c === 'string' ? c : c?.id)).filter(Boolean)
                : []
              const tags = Array.isArray((source as any)?.tags)
                ? (source as any).tags.map((c: any) => (typeof c === 'string' ? c : c?.id)).filter(Boolean)
                : []
              const relatedPosts = Array.isArray((source as any)?.relatedPosts)
                ? (source as any).relatedPosts.map((p: any) => (typeof p === 'string' ? p : p?.id)).filter(Boolean)
                : undefined
              const heroImageId = extractMediaId((source as any)?.heroImage)
              const metaImageId = extractMediaId((source as any)?.meta?.image)
              const keyTakeaways = Array.isArray((source as any)?.keyTakeaways)
                ? (source as any).keyTakeaways
                    .map((k: any) => ({ point: String(k?.point || '') }))
                    .filter((k: any) => k.point)
                : []
              const articleType =
                typeof (source as any)?.articleType === 'string'
                  ? (source as any).articleType
                  : (source as any)?.articleType?.id

              const [clonedHeroImage, clonedMetaImage, clonedContent] = await Promise.all([
                ensureMediaClone(heroImageId, tID, scopedReq),
                ensureMediaClone(metaImageId, tID, scopedReq),
                cloneRichTextUploads((source as any)?.content, tID, scopedReq),
              ])

              const data: any = {
                title: (source as any)?.title,
                heroSource: (source as any)?.heroSource,
                heroImage: clonedHeroImage,
                heroExternalURL: (source as any)?.heroExternalURL,
                content: clonedContent,
                meta: {
                  title: (source as any)?.meta?.title,
                  description: (source as any)?.meta?.description,
                  image: clonedMetaImage,
                },
                categories,
                keyTakeaways,
                articleType,
                tags,
                relatedPosts: undefined,
                publishedAt: null,
                slug: (source as any)?.slug,
                slugLock: (source as any)?.slugLock,
                tenant: tID,
                _status: 'draft',
              }

              const created = await req.payload.create({
                collection: 'posts',
                data,
                draft: true,
                depth: 0,
                req: scopedReq as any,
              })
              results.push({ tenantID: tID, id: created?.id, slug: created?.slug, _status: created?._status || 'draft' })
            } catch (e: any) {
              results.push({ tenantID: tID, error: e?.message || 'create failed' })
            }
          }
          return send(200, { ok: true, count: results.filter((r) => !r.skipped && !r.error).length, results })
        } catch (err: any) {
          console.error('[posts/:id/share] error', err)
          const body: any = { error: err?.message || 'Server error' }
          if (process.env.NODE_ENV !== 'production') {
            body.stack = err?.stack
          }
          return send(500, body)
        }
      }) as any,
    },
  ],
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      type: 'tabs',
      tabs: [
        {
          fields: [
            {
              name: 'heroSource',
              type: 'radio',
              options: [
                { label: 'Upload', value: 'upload' },
                { label: 'Link', value: 'link' },
              ],
              defaultValue: 'upload',
              admin: { layout: 'horizontal' },
            },
            {
              name: 'heroImage',
              label: 'Hero Image/Video',
              type: 'upload',
              relationTo: 'media',
              admin: {
                condition: (_data, siblingData) => (siblingData?.heroSource ?? 'upload') === 'upload',
              },
            },
            {
              name: 'heroExternalURL',
              label: 'External Image/Video URL',
              type: 'text',
              admin: {
                condition: (_data, siblingData) => siblingData?.heroSource === 'link',
              },
            },
            {
              name: 'content',
              type: 'richText',
              editor: lexicalEditor({
                features: ({ rootFeatures }) => {
                  return [
                    ...rootFeatures,
                    HeadingFeature({ enabledHeadingSizes: ['h1', 'h2', 'h3', 'h4'] }),
                    BlocksFeature({ blocks: [BannerConfig, CodeBlockConfig, MediaBlockConfig, MediaGalleryBlockConfig, FormBlockConfig] }),
                    FixedToolbarFeature(),
                    InlineToolbarFeature(),
                    HorizontalRuleFeature(),
                  ]
                },
              }),
              label: false,
              required: true,
            },
          ],
          label: 'Content',
        },
        {
          label: 'Meta & SEO',
          fields: [
            {
              name: 'generateSEO',
              type: 'ui',
              label: 'AI Assistant',
              admin: {
                components: {
                  Field: {
                    path: './components/admin/GenerateSEOButton#GenerateSEOButton',
                  },
                },
              },
            },
            {
              name: 'meta',
              label: 'SEO',
              type: 'group',
              fields: [
                MetaTitleField({ hasGenerateFn: true, overrides: { required: true } }),
                MetaImageField({ relationTo: 'media', overrides: { required: true } }),
                MetaDescriptionField({ overrides: { required: true } }),
                {
                  name: 'descriptionApproved',
                  label: 'Description Approved',
                  type: 'checkbox',
                  required: true,
                },
                PreviewField({
                  hasGenerateFn: true,
                  titlePath: 'meta.title',
                  descriptionPath: 'meta.description',
                }),
              ],
            },
            {
              name: 'categories',
              type: 'relationship',
              relationTo: 'categories',
              hasMany: true,
              required: true,
            },
            {
              name: 'keyTakeaways',
              label: 'Key Takeaways / TL;DR',
              type: 'array',
              required: true,
              fields: [
                {
                  name: 'point',
                  type: 'text',
                  required: true,
                },
              ],
            },
            {
              name: 'keyTakeawaysApproved',
              label: 'Key Takeaways Approved',
              type: 'checkbox',
              required: true,
            },
            {
              name: 'articleType',
              type: 'relationship',
              relationTo: 'article-types',
              required: true,
            },
          ],
        },
        {
          label: 'Share',
          fields: [
            {
              name: 'share',
              label: 'Share Copy',
              type: 'ui',
              admin: {
                components: {
                  Field: {
                    path: '@/components/admin/ShareCopyField#ShareCopyField',
                  },
                },
              },
            },
          ],
        },
      ],
    },
    {
      name: 'publishedAt',
      type: 'date',
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
        position: 'sidebar',
      },
      hooks: {
        beforeChange: [
          ({ siblingData, value }) => {
            if (siblingData._status === 'published' && !value) {
              return new Date()
            }
            return value
          },
        ],
      },
    },
    // Author fields removed
    ...slugField(),
  ],
  hooks: {
    afterChange: [revalidatePost],
    afterDelete: [revalidateDelete],
  },
  versions: {
    drafts: {
      autosave: {
        interval: 1500, // We set this interval for optimal live preview
      },
      schedulePublish: true,
    },
    maxPerDoc: 50,
  },
}
