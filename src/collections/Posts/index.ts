import type { CheckboxFieldValidation, CollectionConfig, PayloadHandler, PayloadRequest } from 'payload'

import {
  BlocksFeature,
  FixedToolbarFeature,
  HeadingFeature,
  HorizontalRuleFeature,
  InlineToolbarFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'
import { convertLexicalToHTML } from '@payloadcms/richtext-lexical/html'

import { authenticated } from '../../lib/access/authenticated'
import { authenticatedOrPublished } from '../../lib/access/authenticatedOrPublished'
import { BannerConfig } from '@/components/blocks/banner-block/config'
import { CodeBlockConfig } from '@/components/blocks/code-block/config'
import { MediaBlockConfig } from '@/components/blocks/media-block/config'
import { MediaGalleryBlockConfig } from '@/components/blocks/media-gallery-block/config'
import { FormBlockConfig } from '@/components/blocks/form-block/config'
import { VideoBlockConfig } from '@/components/blocks/video-block/config'
import { LunchComparisonGraphicBlockConfig } from '@/components/blocks/lunch-comparison-graphic/config'
import { PropertyTaxCreditTableBlockConfig } from '@/components/blocks/property-tax-credit-table/config'
import { TenantTownTableBlockConfig } from '@/components/blocks/tenant-town-table/config'
import { POST_LAYOUT_BLOCKS } from '@/lib/blocks/postLayoutBlocks'
import { generatePreviewPath } from '@/lib/utilities/generatePreviewPath'
import { revalidateDelete, revalidatePost } from './hooks/revalidatePost'
import { rebuildSitemapsAfterPublishedChange, rebuildSitemapsAfterPublishedDelete } from '@/lib/hooks/rebuildSitemaps'

import {
  MetaDescriptionField,
  MetaImageField,
  MetaTitleField,
  PreviewField,
} from '@payloadcms/plugin-seo/fields'
import { slugField } from '@/collections/fields/slug'
import { canUseBuilders, isSuperUser } from '@/lib/access/isSuperUser'
import {
  DEFAULT_SEO_ASSISTANT_SETTINGS,
  type SeoAssistantSettings,
  type SeoAssistantTone,
  normalizeSeoAssistantSettings,
} from '@/lib/seo/assistantConfig'

type UnknownRecord = Record<string, unknown>
type TenantLike = string | { id?: string | null } | null | undefined

type EndpointReq = PayloadRequest & {
  body?: unknown
  json?: () => Promise<unknown>
  originalUrl?: string
  params?: Record<string, string | undefined>
  query?: Record<string, unknown>
  routeParams?: Record<string, string | undefined>
  text?: () => Promise<string>
  url?: string
}

type EndpointRes = {
  status?: (status: number) => {
    json: (body: unknown) => unknown
  }
}

const asRecord = (value: unknown): UnknownRecord =>
  typeof value === 'object' && value !== null ? (value as UnknownRecord) : {}

const getString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined

const resolveTenantId = (value: TenantLike): string | undefined => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && typeof value.id === 'string') return value.id
  return undefined
}

const validateDescriptionApproval: CheckboxFieldValidation = (value, options) => {
  const data = options?.data as Record<string, unknown> | undefined
  const status = data?._status ?? data?.status

  if (status === 'published' && !value) {
    return 'Description must be approved before publishing.'
  }

  return true
}

const validateKeyTakeawaysApproval: CheckboxFieldValidation = (value, options) => {
  const data = options?.data as Record<string, unknown> | undefined
  const status = data?._status ?? data?.status

  if (status === 'published' && !value) {
    return 'Key takeaways must be approved before publishing.'
  }

  return true
}

const toMetadataValue = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, 512)
}

const buildOpenAIMetadata = (entries: Array<[string, unknown]>): Record<string, string> => {
  const metadata: Record<string, string> = {}

  for (const [key, rawValue] of entries) {
    const value = toMetadataValue(rawValue)
    if (!value) continue
    metadata[key] = value
  }

  return metadata
}

const getErrorData = (err: unknown): { message?: string; code?: string; type?: string; name?: string; stack?: string } => {
  const record = asRecord(err)
  return {
    message: getString(record.message),
    code: getString(record.code),
    type: getString(record.type),
    name: getString(record.name),
    stack: getString(record.stack),
  }
}

const parseRequestBody = async (req: EndpointReq): Promise<UnknownRecord> => {
  let raw: unknown = req?.body

  if (raw && typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      raw = {}
    }
  } else if (raw && typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) {
    try {
      raw = JSON.parse(raw.toString('utf-8'))
    } catch {
      raw = {}
    }
  }

  const rawRecord = asRecord(raw)
  const looksLikeReadableStream =
    !!raw &&
    typeof raw === 'object' &&
    (typeof rawRecord.getReader === 'function' || typeof rawRecord.tee === 'function')
  const missingExpectedKeys =
    !raw ||
    typeof raw !== 'object' ||
    (!('tone' in rawRecord) && !('additionalInstructions' in rawRecord))

  if (looksLikeReadableStream || missingExpectedKeys) {
    try {
      if (typeof req?.json === 'function') {
        const parsed = await req.json()
        if (parsed && typeof parsed === 'object') raw = parsed
      } else if (typeof req?.text === 'function') {
        const text = await req.text()
        raw = text ? JSON.parse(text) : raw || {}
      }
    } catch {
      raw = missingExpectedKeys ? rawRecord : raw
    }
  }

  return asRecord(raw)
}

const isSeoAssistantTone = (value: unknown): value is SeoAssistantTone =>
  value === 'neutral' || value === 'lean-right' || value === 'strong-right'

const readSeoAssistantSettings = async (req: EndpointReq): Promise<SeoAssistantSettings> => {
  try {
    const doc = await req.payload.findGlobal({
      slug: 'seo-generator-settings',
      depth: 0,
      draft: true,
      overrideAccess: true,
      req,
    })
    return normalizeSeoAssistantSettings(doc)
  } catch {
    return DEFAULT_SEO_ASSISTANT_SETTINGS
  }
}

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
    components: {
      views: {
        edit: {
          default: {
            Component: '@/components/admin/live-preview/ResponsiveEditView#default',
            tab: {
              label: 'Editor',
              order: 10,
            },
          },
          visual: {
            path: '/visual',
            Component: '@/components/admin/post/PuckPostBuilderView',
            tab: {
              href: '/visual',
              label: 'Visual Builder',
              order: 75,
              condition: ({ req }) => canUseBuilders(req.user),
            },
          },
        },
      },
    },
    livePreview: {
      url: ({ data, req }) => {
        const path = generatePreviewPath({
          slug: typeof data?.slug === 'string' ? data.slug : '',
          collection: 'posts',
          req,
          tenantId: resolveTenantId(data?.tenant as TenantLike),
        })

        return path
      },
    },
    preview: (data, { req }) =>
      generatePreviewPath({
        slug: typeof data?.slug === 'string' ? data.slug : '',
        collection: 'posts',
        req,
        tenantId: resolveTenantId(data?.tenant as TenantLike),
      }),
    useAsTitle: 'title',
  },
  endpoints: [
    {
      path: '/assistant-config',
      method: 'get',
      handler: (async (req: EndpointReq, res: EndpointRes | undefined) => {
        const send = (status: number, body: unknown) => {
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

          const settings = await readSeoAssistantSettings(req)
          return send(200, { settings })
        } catch (err: unknown) {
          const errorData = getErrorData(err)
          return send(500, { error: errorData.message || 'Unable to load assistant config' })
        }
      }) as unknown as PayloadHandler,
    },
    {
      path: '/:id/generate-seo',
      method: 'post',
      handler: (async (req: EndpointReq, res: EndpointRes | undefined, _next: unknown) => {
        const send = (status: number, body: unknown) => {
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
            id = req?.params?.id || req?.routeParams?.id || getString(req?.query?.id)
            if (!id) {
              const url: string = req?.url || req?.originalUrl || ''
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

          const requestBody = await parseRequestBody(req)
          const tone = isSeoAssistantTone(requestBody.tone) ? requestBody.tone : undefined
          const additionalInstructions = getString(requestBody.additionalInstructions)?.trim() || undefined
          const title: string = post?.title || ''
          const tenantId = resolveTenantId(post?.tenant as TenantLike)
          let tenantSlug =
            typeof post?.tenant === 'object' && post?.tenant
              ? getString(asRecord(post.tenant).slug)
              : undefined
          if (!tenantSlug && tenantId) {
            try {
              const tenantDoc = await req.payload.findByID({
                collection: 'tenants',
                id: tenantId,
                depth: 0,
                overrideAccess: true,
                req,
              })
              tenantSlug = getString(asRecord(tenantDoc).slug)
            } catch {
              tenantSlug = undefined
            }
          }

          const userRecord = asRecord(req.user)
          const userId = getString(userRecord.id)
          const userEmail = getString(userRecord.email)
          const content = post?.content
          const contentHTML =
            typeof content === 'string'
              ? content
              : convertLexicalToHTML({ data: Array.isArray(content) ? content : content || {} })

          // Gather options the model must choose from
          const [categories, articleTypes, assistantSettings] = await Promise.all([
            req.payload.find({ collection: 'categories', limit: 1000 }),
            req.payload.find({ collection: 'article-types', limit: 1000 }),
            readSeoAssistantSettings(req),
          ])

          const categoryOptions = (categories?.docs || []).map((c) => {
            const item = asRecord(c)
            return {
              id: getString(item.id),
              slug: getString(item.slug),
              title: getString(item.title),
            }
          })
          const articleTypeOptions = (articleTypes?.docs || []).map((a) => {
            const item = asRecord(a)
            return {
              id: getString(item.id),
              slug: getString(item.slug),
              title: getString(item.title),
            }
          })
          if (!categoryOptions.length) {
            return send(400, { error: 'No categories available' })
          }
          if (!articleTypeOptions.length) {
            return send(400, { error: 'No article types available' })
          }

          let generated
          try {
            const { generatePostSeo } = await import('@/lib/seo/generatePostSeo')
            generated = await generatePostSeo({
              additionalInstructions,
              apiKey,
              articleTypeOptions,
              categoryOptions,
              contentHtml: contentHTML,
              metadata: buildOpenAIMetadata([
                ['feature', 'post_seo_generation'],
                ['post_id', post?.id],
                ['post_slug', post?.slug],
                ['tenant_id', tenantId],
                ['tenant_slug', tenantSlug],
                ['user_id', userId],
                ['user_email', userEmail],
              ]),
              safetyIdentifier: userId || userEmail,
              settings: assistantSettings,
              title,
              tone,
            })
          } catch (e: unknown) {
            const errorData = getErrorData(e)
            return send(502, {
              error: errorData.message || 'OpenAI request failed',
              code: errorData.code,
              type: errorData.type,
            })
          }

          // Map slugs to IDs
          const categoryIDs = generated.categories
            .map((s: string) => String(s).trim().toLowerCase())
            .map((s: string) =>
              categoryOptions.find(
                (c) => c.slug?.toLowerCase() === s || c.title?.toLowerCase() === s,
              )?.id,
            )
            .filter(Boolean)
          const atLookup = (val?: string) => {
            if (!val) return undefined
            const s = String(val).trim().toLowerCase()
            return (
              articleTypeOptions.find(
                (a) => a.slug?.toLowerCase() === s || a.title?.toLowerCase() === s,
              )?.id || undefined
            )
          }
          const articleTypeID = atLookup(generated.articleType)

          if (categoryIDs.length !== 1) {
            return send(502, {
              error: 'Model returned an unmapped category slug.',
              raw: generated.categories,
            })
          }

          if (!articleTypeID) {
            return send(502, {
              error: 'Model returned an unmapped article type slug.',
              raw: generated.articleType,
            })
          }

          return send(200, {
            metaTitle: generated.metaTitle,
            description: generated.description,
            keyTakeawaysNormalized: generated.keyTakeaways.map((k) => ({ point: String(k) })),
            categoryIDs,
            articleTypeID,
            settings: {
              model: generated.model,
              reasoning: generated.reasoning,
              tone: generated.tone,
            },
          })
        } catch (err: unknown) {
          // Log to server for diagnosis
          console.error('[generate-seo] Unhandled error', err)
          const errorData = getErrorData(err)
          const body: UnknownRecord = { error: errorData.message || 'Server error' }
          if (process.env.NODE_ENV !== 'production') {
            body.name = errorData.name
            body.stack = errorData.stack
          }
          return send(500, body)
        }
      }) as unknown as PayloadHandler,
    },
    {
      path: '/:id/share',
      method: 'post',
      handler: (async (req: EndpointReq, res: EndpointRes | undefined) => {
        const send = (status: number, body: unknown) => {
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
            id = req?.params?.id || req?.routeParams?.id || getString(req?.query?.id)
            if (!id) {
              const url: string = req?.originalUrl || req?.url || ''
              const match = url.match(/\/api\/posts\/([^\/]+)\/share/)
              if (match?.[1]) id = match[1]
            }
          } catch {}
          if (!id) return send(400, { error: 'Missing post id' })
          // Robustly parse body across adapters (Express vs Next)
          let raw: unknown = req?.body
          // If body is a string or Buffer, try to parse JSON
          if (raw && typeof raw === 'string') {
            try { raw = JSON.parse(raw) } catch { /* keep as-is */ }
          } else if (raw && typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) {
            try { raw = JSON.parse(raw.toString('utf-8')) } catch { raw = {} }
          }
          // Heuristic: Next.js Request body may be a ReadableStream, or body may be present but not parsed
          const rawObj = asRecord(raw)
          const looksLikeReadableStream =
            !!raw &&
            typeof raw === 'object' &&
            (typeof rawObj.getReader === 'function' || typeof rawObj.tee === 'function')
          const rawRecord = asRecord(raw)
          const rawMissingKeys = !raw || typeof raw !== 'object' || (!('tenantIDs' in rawRecord) && !('tenantIds' in rawRecord) && !('tenant_ids' in rawRecord) && !('tenants' in rawRecord) && !('sourceTenantID' in rawRecord) && !('sourceTenantId' in rawRecord))
          if (looksLikeReadableStream || rawMissingKeys) {
            try {
              if (typeof req?.json === 'function') {
                const parsed = await req.json()
                if (parsed && typeof parsed === 'object') raw = parsed
              } else if (typeof req?.text === 'function') {
                const txt = await req.text()
                raw = txt ? JSON.parse(txt) : raw || {}
              }
            } catch {
              // keep best-effort raw
            }
          }
          // Extract tenantIDs from body or query in multiple shapes
          const extractIDs = (val: unknown): string[] => {
            if (!val) return []
            if (Array.isArray(val)) {
              return val
                .map((v) => (typeof v === 'string' ? v : getString(asRecord(v).id) || getString(asRecord(v).value)))
                .filter((v): v is string => typeof v === 'string' && v.length > 0)
            }
            if (typeof val === 'string') return val.split(',').map((s) => s.trim()).filter(Boolean)
            if (typeof val === 'object') {
              // Support bracket syntax: tenantIDs[0]=idA&tenantIDs[1]=idB
              const valRecord = asRecord(val)
              const keys = Object.keys(valRecord).filter((k) => k.startsWith('tenantIDs['))
              if (keys.length) {
                return keys.map((k) => getString(valRecord[k])).filter((v): v is string => Boolean(v))
              }
            }
            return []
          }
          const rawResolved = asRecord(raw)
          let tenantIDs: string[] = []
          tenantIDs = extractIDs(rawResolved.tenantIDs)
          if (!tenantIDs.length) tenantIDs = extractIDs(rawResolved.tenantIds)
          if (!tenantIDs.length) tenantIDs = extractIDs(rawResolved.tenant_ids)
          if (!tenantIDs.length) tenantIDs = extractIDs(rawResolved.tenants)
          // Source tenant id (the tenant of the post being copied from)
          const sourceTenantID: string | undefined =
            typeof rawResolved.sourceTenantID === 'string'
              ? rawResolved.sourceTenantID
              : typeof rawResolved.sourceTenantId === 'string'
              ? rawResolved.sourceTenantId
              : undefined
          // Query param fallback
          if (!tenantIDs.length) {
            const q = req?.query || {}
            tenantIDs = extractIDs(q?.tenantIDs) || extractIDs(q?.tenantIds)
            if (!tenantIDs.length && (typeof req?.originalUrl === 'string' || typeof req?.url === 'string')) {
              try {
                const urlStr: string = req.originalUrl || req.url || ''
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
            const debug: UnknownRecord = {}
            try {
              debug.bodyType = typeof req?.body
              debug.rawType = typeof raw
              debug.rawKeys = raw && typeof raw === 'object' ? Object.keys(raw) : undefined
              debug.queryKeys = req?.query ? Object.keys(req.query) : undefined
              debug.url = req?.originalUrl || req?.url
            } catch {}
            const body: UnknownRecord = { error: 'No tenantIDs provided' }
            if (process.env.NODE_ENV !== 'production') body.debug = debug
            return send(400, body)
          }
          const isSuper = isSuperUser(req.user)
          const userTenants = asRecord(req.user).tenants
          const userTenantIDs: string[] = Array.isArray(userTenants)
            ? (userTenants as unknown[])
                .map((t) => {
                  const tenant = asRecord(t).tenant
                  return typeof tenant === 'string' ? tenant : getString(asRecord(tenant).id)
                })
                .filter((tenantId): tenantId is string => typeof tenantId === 'string' && tenantId.length > 0)
            : []
          const allowedTenantIDs = isSuper ? tenantIDs : tenantIDs.filter((t) => userTenantIDs.includes(t))
          if (!allowedTenantIDs.length) return send(403, { error: 'You do not have access to the selected tenants' })
          // Load source post (draft-aware), scoping to the source tenant if provided
          let source: unknown
          try {
            if (sourceTenantID) {
              source = await req.payload.findByID({
                collection: 'posts',
                id,
                draft: true,
                depth: 0,
                req: { ...req, tenant: sourceTenantID } as EndpointReq & { tenant: string },
              })
            } else {
              source = await req.payload.findByID({
                collection: 'posts',
                id,
                draft: true,
                depth: 0,
              })
            }
          } catch (_e: unknown) {
            return send(404, { error: 'Post not found or inaccessible for the current tenant scope' })
          }
          if (!source) return send(404, { error: 'Post not found' })
          const sourceRecord = asRecord(source)
          const sourceTenantId: string | undefined =
            typeof sourceRecord.tenant === 'string' ? sourceRecord.tenant : getString(asRecord(sourceRecord.tenant).id)

          const tenantCache = new Map<string, { id: string; slug?: string | null }>()
          const mediaDocCache = new Map<string, unknown>()
          const mediaCloneCache = new Map<string, string>()
          const formDocCache = new Map<string, unknown>()
          const formCloneCache = new Map<string, string>()

          const extractMediaId = (value: unknown): string | undefined => {
            if (!value) return undefined
            if (typeof value === 'string') return value
            if (typeof value === 'object') {
              const valueRecord = asRecord(value)
              if (typeof valueRecord.id === 'string') return valueRecord.id
              if (typeof valueRecord._id === 'string') return valueRecord._id
              if (typeof valueRecord.value === 'string') return valueRecord.value
              if (typeof valueRecord.value === 'object') return extractMediaId(valueRecord.value)
            }
            return undefined
          }

          const extractFormId = (value: unknown): string | undefined => {
            if (!value) return undefined
            if (typeof value === 'string') return value
            if (typeof value === 'object') {
              const valueRecord = asRecord(value)
              if (typeof valueRecord.id === 'string') return valueRecord.id
              if (typeof valueRecord._id === 'string') return valueRecord._id
              if (typeof valueRecord.value === 'string') return valueRecord.value
              if (typeof valueRecord.value === 'object') return extractFormId(valueRecord.value)
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
            const info = { id: tenantId, slug: getString(asRecord(tenantDoc).slug) ?? undefined }
            tenantCache.set(tenantId, info)
            return info
          }

          const buildMediaUrl = (doc: unknown): string | undefined => {
            const docRecord = asRecord(doc)
            if (typeof docRecord.url === 'string' && docRecord.url) return docRecord.url
            const base = process.env.R2_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_MEDIA_BASE_URL
            if (!base) return undefined
            const prefix = typeof docRecord.prefix === 'string' ? docRecord.prefix.replace(/\/+$/u, '') : ''
            const filename = typeof docRecord.filename === 'string' ? docRecord.filename.replace(/^\/+/, '') : ''
            if (!filename) return undefined
            const key = prefix ? `${prefix}/${filename}` : filename
            return `${base.replace(/\/+$/u, '')}/${key.replace(/^\/+/, '')}`
          }

          const fetchMediaDoc = async (mediaId: string) => {
            if (mediaDocCache.has(mediaId)) return mediaDocCache.get(mediaId)!
            const scopedSourceReq = sourceTenantId
              ? ({ ...req, tenant: sourceTenantId } as EndpointReq & { tenant: string })
              : req
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

          const ensureMediaClone = async (mediaId: string | undefined, tenantId: string, scopedReq: EndpointReq | (EndpointReq & { tenant: string })): Promise<string | undefined> => {
            if (!mediaId) return undefined
            const cacheKey = `${mediaId}:${tenantId}`
            if (mediaCloneCache.has(cacheKey)) return mediaCloneCache.get(cacheKey)!

            const mediaDoc = await fetchMediaDoc(mediaId).catch((error: unknown) => {
              const errorData = getErrorData(error)
              throw new Error(`Failed to load media ${mediaId}: ${errorData.message || String(error)}`)
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
            const mediaDocRecord = asRecord(mediaDoc)
            const filename =
              typeof mediaDocRecord.filename === 'string' && mediaDocRecord.filename
                ? mediaDocRecord.filename.replace(/\\/gu, '/').split('/').pop() || mediaDocRecord.filename
                : `${mediaId}`
            const mimeType = typeof mediaDocRecord.mimeType === 'string' ? mediaDocRecord.mimeType : 'application/octet-stream'
            const captionClone = mediaDocRecord.caption ? JSON.parse(JSON.stringify(mediaDocRecord.caption)) : undefined

            const dot = filename.lastIndexOf('.')
            const base = dot > 0 ? filename.slice(0, dot) : filename
            const ext = dot > 0 ? filename.slice(dot) : ''
            const tenantSlug = typeof tenantInfo?.slug === 'string' ? tenantInfo.slug : ''
            const safeTenant = (tenantSlug || tenantId).replace(/[^a-z0-9_-]+/giu, '-')
            const preferredFilename = `${safeTenant}-${base}-${mediaId}${ext}`

            let createdMedia: unknown
            try {
              const createWithName = async (name: string) =>
                await req.payload.create({
                  collection: 'media',
                  data: {
                    alt: getString(mediaDocRecord.alt) || name,
                    caption: captionClone,
                    tenant: tenantId,
                  },
                  file: {
                    data: fileBuffer,
                    size: fileBuffer.length,
                    name,
                    mimetype: mimeType,
                  },
                  req: scopedReq,
                  overrideAccess: true,
                  context: { disableRevalidate: true },
                })

              try {
                createdMedia = await createWithName(preferredFilename)
              } catch (error: unknown) {
                const message = String(getErrorData(error).message || error)

                if (message.includes('filename')) {
                  const nonce = Date.now().toString(36)
                  const uniqueFilename = `${safeTenant}-${base}-${mediaId}-${nonce}${ext}`
                  createdMedia = await createWithName(uniqueFilename)
                } else {
                  throw error
                }
              }
            } catch (error: unknown) {
              const fileKeys = ['data', 'size', 'name', 'mimetype']
              const errorData = getErrorData(error)
              throw new Error(
                `Failed to clone media ${mediaId} for tenant ${tenantId}: ${errorData.message || String(error)}. Media URL: ${mediaUrl}. File keys: ${fileKeys.join(', ')}`,
              )
            }

            const newId = getString(asRecord(createdMedia).id)
            if (typeof newId !== 'string') throw new Error(`Cloned media for ${mediaId} did not return an ID`)

            mediaCloneCache.set(cacheKey, newId)
            return newId
          }

          const fetchFormDoc = async (formId: string) => {
            if (formDocCache.has(formId)) return formDocCache.get(formId)!
            const scopedSourceReq = sourceTenantId
              ? ({ ...req, tenant: sourceTenantId } as EndpointReq & { tenant: string })
              : req
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

          const cloneFormFieldOptions = async (options: unknown[], tenantId: string, scopedReq: EndpointReq | (EndpointReq & { tenant: string })) => {
            if (!Array.isArray(options)) return options
            const clonedOptions: UnknownRecord[] = []
            for (const option of options) {
              if (!option) continue
              const nextOption: Record<string, unknown> = { ...asRecord(option) }
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

          const cloneFormFields = async (fields: unknown[], tenantId: string, scopedReq: EndpointReq | (EndpointReq & { tenant: string })) => {
            if (!Array.isArray(fields)) return fields
            const clonedFields: UnknownRecord[] = []
            for (const field of fields) {
              if (!field) continue
              const nextField: Record<string, unknown> = JSON.parse(JSON.stringify(field))
              delete nextField.id
              delete nextField._id
              if (Array.isArray(nextField.options as unknown[])) {
                nextField.options = await cloneFormFieldOptions(nextField.options as unknown[], tenantId, scopedReq)
              }
              clonedFields.push(nextField)
            }
            return clonedFields
          }

          const ensureFormClone = async (formId: string | undefined, tenantId: string, scopedReq: EndpointReq | (EndpointReq & { tenant: string })): Promise<string | undefined> => {
            if (!formId) return undefined
            const cacheKey = `${formId}:${tenantId}`
            if (formCloneCache.has(cacheKey)) return formCloneCache.get(cacheKey)!

            const formDoc = await fetchFormDoc(formId).catch((error: unknown) => {
              const errorData = getErrorData(error)
              throw new Error(`Failed to load form ${formId}: ${errorData.message || String(error)}`)
            })
            if (!formDoc) throw new Error(`Form ${formId} not found`)
            const formDocRecord = asRecord(formDoc)

            const cloneKeys = [
              'title',
              'fields',
              'submitButtonLabel',
              'confirmationType',
              'confirmationMessage',
              'redirect',
              'emails',
            ]

            const data: Record<string, unknown> = {}
            for (const key of cloneKeys) {
              if (typeof formDocRecord[key] !== 'undefined') {
                data[key] = JSON.parse(JSON.stringify(formDocRecord[key]))
              }
            }

            data.fields = await cloneFormFields((data.fields as unknown[]) || [], tenantId, scopedReq)
            if (Array.isArray(data.emails as unknown[])) {
              data.emails = (data.emails as unknown[]).map((email: unknown) => {
                if (!email) return email
                const nextEmail: UnknownRecord = { ...asRecord(email) }
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
              req: scopedReq,
              overrideAccess: true,
              context: { disableRevalidate: true },
            })

            const newId = getString(asRecord(createdForm).id)
            if (typeof newId !== 'string') throw new Error(`Cloned form for ${formId} did not return an ID`)

            formCloneCache.set(cacheKey, newId)
            return newId
          }

          const cloneRichTextUploads = async (value: unknown, tenantId: string, scopedReq: EndpointReq | (EndpointReq & { tenant: string })): Promise<unknown> => {
            const walk = async (node: unknown): Promise<unknown> => {
              if (Array.isArray(node)) {
                const next: unknown[] = []
                for (const item of node) {
                  next.push(await walk(item))
                }
                return next
              }
              if (!node || typeof node !== 'object') return node
              const nodeRecord = asRecord(node)

              if (nodeRecord.type === 'upload' && nodeRecord.relationTo === 'media') {
                const uploadId = extractMediaId(nodeRecord.value)
                const clonedId = await ensureMediaClone(uploadId, tenantId, scopedReq)
                return { ...nodeRecord, value: clonedId }
              }

              const entries = Object.entries(nodeRecord)
              const updated: Record<string, unknown> = { ...nodeRecord }
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
                  const relationTo = asRecord(val).relationTo
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
          const results: UnknownRecord[] = []
          for (const tID of toCreate) {
            if (tID && sourceTenantId && tID === sourceTenantId) {
              results.push({ tenantID: tID, skipped: true, reason: 'same-tenant' })
              continue
            }
            const scopedReq = { ...req, tenant: tID } as EndpointReq & { tenant: string }
            try {
              // Normalize relationships to IDs and strip system fields
              const categories = Array.isArray(sourceRecord.categories)
                ? sourceRecord.categories.map((c: unknown) => (typeof c === 'string' ? c : getString(asRecord(c).id))).filter(Boolean)
                : []
              const tags = Array.isArray(sourceRecord.tags)
                ? sourceRecord.tags.map((c: unknown) => (typeof c === 'string' ? c : getString(asRecord(c).id))).filter(Boolean)
                : []
              const heroImageId = extractMediaId(sourceRecord.heroImage)
              const metaImageId = extractMediaId(asRecord(sourceRecord.meta).image)
              const keyTakeaways = Array.isArray(sourceRecord.keyTakeaways)
                ? sourceRecord.keyTakeaways
                    .map((k: unknown) => ({ point: String(asRecord(k).point || '') }))
                    .filter((k: { point: string }) => k.point)
                : []
              const articleType =
                typeof sourceRecord.articleType === 'string'
                  ? sourceRecord.articleType
                  : getString(asRecord(sourceRecord.articleType).id)

              const [clonedHeroImage, clonedMetaImage, clonedContent] = await Promise.all([
                ensureMediaClone(heroImageId, tID, scopedReq),
                ensureMediaClone(metaImageId, tID, scopedReq),
                cloneRichTextUploads(sourceRecord.content, tID, scopedReq),
              ])

              const data: Record<string, unknown> = {
                title: sourceRecord.title,
                heroSource: sourceRecord.heroSource,
                heroImage: clonedHeroImage,
                heroExternalURL: sourceRecord.heroExternalURL,
                content: clonedContent,
                meta: {
                  title: asRecord(sourceRecord.meta).title,
                  description: asRecord(sourceRecord.meta).description,
                  image: clonedMetaImage,
                },
                categories,
                keyTakeaways,
                articleType,
                tags,
                relatedPosts: undefined,
                publishedAt: null,
                slug: sourceRecord.slug,
                slugLock: sourceRecord.slugLock,
                tenant: tID,
                _status: 'draft',
              }

              const created = await req.payload.create({
                collection: 'posts',
                data,
                draft: true,
                depth: 0,
                req: scopedReq,
              })
              results.push({ tenantID: tID, id: created?.id, slug: created?.slug, _status: created?._status || 'draft' })
            } catch (_e: unknown) {
              const errorData = getErrorData(_e)
              results.push({ tenantID: tID, error: errorData.message || 'create failed' })
            }
          }
          return send(200, { ok: true, count: results.filter((r) => !r.skipped && !r.error).length, results })
        } catch (err: unknown) {
          console.error('[posts/:id/share] error', err)
          const errorData = getErrorData(err)
          const body: UnknownRecord = { error: errorData.message || 'Server error' }
          if (process.env.NODE_ENV !== 'production') {
            body.stack = errorData.stack
          }
          return send(500, body)
        }
      }) as unknown as PayloadHandler,
    },
  ],
  fields: [
    {
      name: 'title',
      label: 'Post title',
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
                { label: 'Upload from Media', value: 'upload' },
                { label: 'Use a link', value: 'link' },
              ],
              defaultValue: 'upload',
              admin: { layout: 'horizontal' },
            },
            {
              name: 'heroImage',
              label: 'Featured image or video',
              type: 'upload',
              relationTo: 'media',
              admin: {
                condition: (_data, siblingData) => (siblingData?.heroSource ?? 'upload') === 'upload',
              },
            },
            {
              name: 'heroExternalURL',
              label: 'Image or video URL',
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
                    BlocksFeature({
                      blocks: [
                        BannerConfig,
                        CodeBlockConfig,
                        MediaBlockConfig,
                        VideoBlockConfig,
                        MediaGalleryBlockConfig,
                        FormBlockConfig,
                        LunchComparisonGraphicBlockConfig,
                        PropertyTaxCreditTableBlockConfig,
                        TenantTownTableBlockConfig,
                      ],
                    }),
                    FixedToolbarFeature(),
                    InlineToolbarFeature(),
                    HorizontalRuleFeature(),
                  ]
                },
              }),
              label: 'Post content',
              required: true,
            },
            {
              name: 'layout',
              label: 'Optional visual layout',
              type: 'blocks',
              admin: {
                description: 'Optional. Leave this closed to publish the rich-text article above exactly as before.',
                initCollapsed: true,
              },
              blocks: POST_LAYOUT_BLOCKS,
            },
          ],
          label: 'Write',
        },
        {
          label: 'Search & Social',
          fields: [
            {
              name: 'publishingAssistant',
              type: 'ui',
              label: 'Search & Social Assistant',
              admin: {
                components: {
                  Field: {
                    path: './components/admin/PostPublishingAssistant#PostPublishingAssistant',
                  },
                },
              },
            },
            {
              name: 'graphicTemplate',
              label: 'Graphic Template Link',
              type: 'relationship',
              relationTo: 'graphic-templates',
              required: false,
              admin: {
                hidden: true,
              },
            },
            {
              name: 'graphicDesign',
              label: 'Saved Graphic Link',
              type: 'relationship',
              relationTo: 'graphic-designs',
              required: false,
              admin: {
                hidden: true,
              },
            },
            {
              name: 'meta',
              label: 'SEO',
              type: 'group',
              fields: [
                MetaTitleField({
                  overrides: {
                    label: 'Search title',
                    required: true,
                    admin: {
                      description:
                        'The headline shown in search results. Aim for a clear title between 50 and 60 characters.',
                    },
                  },
                }),
                MetaDescriptionField({
                  overrides: {
                    label: 'Search description',
                    required: true,
                    admin: {
                      description:
                        'A concise summary for search results. Aim for 120 to 160 characters.',
                    },
                  },
                }),
                MetaImageField({
                  relationTo: 'media',
                  overrides: {
                    label: 'Social image',
                    required: true,
                    admin: {
                      description: 'Used when this post is shared on social platforms. Recommended size: 1200 × 630 pixels.',
                    },
                  },
                }),
                {
                  name: 'descriptionApproved',
                  label: 'Description Approved',
                  type: 'checkbox',
                  required: true,
                  validate: validateDescriptionApproval,
                },
                PreviewField({
                  titlePath: 'meta.title',
                  descriptionPath: 'meta.description',
                }),
              ],
            },
            {
              type: 'collapsible',
              label: 'Key takeaways & approval',
              admin: {
                initCollapsed: true,
              },
              fields: [
                {
                  name: 'keyTakeaways',
                  label: 'Key takeaways / TL;DR',
                  type: 'array',
                  required: true,
                  admin: {
                    description: 'Four short lines used for packaging and sharing. New assistant output resets approval.',
                  },
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
                  label: 'I reviewed these takeaways',
                  type: 'checkbox',
                  required: true,
                  admin: {
                    description: 'Confirm tone, accuracy, and readability before publishing.',
                  },
                  validate: validateKeyTakeawaysApproval,
                },
              ],
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
      name: 'categories',
      label: 'Category',
      type: 'relationship',
      relationTo: 'categories',
      hasMany: true,
      required: true,
      admin: {
        description: 'Choose the best-fit category for this post.',
        position: 'sidebar',
      },
    },
    {
      name: 'articleType',
      label: 'Article type',
      type: 'relationship',
      relationTo: 'article-types',
      required: true,
      admin: {
        description: 'Choose the type that best describes this post.',
        position: 'sidebar',
      },
    },
    {
      name: 'publishedAt',
      label: 'Publish date',
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
    {
      name: 'draftShareLink',
      label: 'Copy draft URL',
      type: 'ui',
      admin: {
        position: 'sidebar',
        components: {
          Field: {
            path: '@/components/admin/DraftShareField#DraftShareField',
          },
        },
      },
    },
    {
      name: 'draftShareToken',
      type: 'text',
      admin: {
        hidden: true,
      },
    },
    // Author fields removed
    ...slugField(),
  ],
  hooks: {
    afterChange: [revalidatePost, rebuildSitemapsAfterPublishedChange],
    afterDelete: [revalidateDelete, rebuildSitemapsAfterPublishedDelete],
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
