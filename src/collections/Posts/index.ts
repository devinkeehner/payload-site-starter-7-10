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
    tags: true,
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
        })

        return path
      },
    },
    preview: (data, { req }) =>
      generatePreviewPath({
        slug: typeof data?.slug === 'string' ? data.slug : '',
        collection: 'posts',
        req,
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
                version: '25',
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
          const toCreate = allowedTenantIDs
          const results: any[] = []
          for (const tID of toCreate) {
            if (tID && sourceTenantId && tID === sourceTenantId) {
              results.push({ tenantID: tID, skipped: true, reason: 'same-tenant' })
              continue
            }
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
            const heroImage =
              typeof (source as any)?.heroImage === 'string'
                ? (source as any).heroImage
                : (source as any)?.heroImage?.id
            const metaImage =
              typeof (source as any)?.meta?.image === 'string'
                ? (source as any).meta.image
                : (source as any)?.meta?.image?.id
            const keyTakeaways = Array.isArray((source as any)?.keyTakeaways)
              ? (source as any).keyTakeaways
                  .map((k: any) => ({ point: String(k?.point || '') }))
                  .filter((k: any) => k.point)
              : []
            const articleType =
              typeof (source as any)?.articleType === 'string'
                ? (source as any).articleType
                : (source as any)?.articleType?.id
            const data: any = {
              title: (source as any)?.title,
              // Avoid cross-tenant media references; let editors set media per site
              heroImage: undefined,
              content: (() => {
                const normalize = (node: any): any => {
                  if (Array.isArray(node)) return node.map(normalize)
                  if (!node || typeof node !== 'object') return node
                  if (node.type === 'upload' && node.relationTo === 'media' && node.value && typeof node.value === 'object') {
                    const id = (node.value as any)?.id ?? (node.value as any)?._id
                    return { ...node, value: id }
                  }
                  const out: any = { ...node }
                  for (const k of Object.keys(node)) out[k] = normalize((node as any)[k])
                  return out
                }
                return normalize((source as any)?.content)
              })(),
              meta: {
                title: (source as any)?.meta?.title,
                description: (source as any)?.meta?.description,
                image: undefined,
              },
              categories,
              keyTakeaways,
              articleType,
              tags,
              // Avoid cross-tenant posts relationships
              relatedPosts: undefined,
              publishedAt: null,
              slug: (source as any)?.slug,
              slugLock: (source as any)?.slugLock,
              tenant: tID,
              _status: 'draft',
            }
            try {
              // Ensure create runs within the target tenant scope
              const scopedReq = { ...(req as any), tenant: tID }
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
              name: 'heroImage',
              type: 'upload',
              relationTo: 'media',
            },
            {
              name: 'content',
              type: 'richText',
              editor: lexicalEditor({
                features: ({ rootFeatures }) => {
                  return [
                    ...rootFeatures,
                    HeadingFeature({ enabledHeadingSizes: ['h1', 'h2', 'h3', 'h4'] }),
                    BlocksFeature({ blocks: [BannerConfig, CodeBlockConfig, MediaBlockConfig] }),
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
              name: 'articleType',
              type: 'relationship',
              relationTo: 'article-types',
              required: true,
            },
            {
              name: 'tags',
              type: 'relationship',
              relationTo: 'tags',
              hasMany: true,
            },
            {
              name: 'relatedPosts',
              type: 'relationship',
              relationTo: 'posts',
              hasMany: true,
              filterOptions: ({ id }) => ({
                id: {
                  not_in: [id],
                },
              }),
            },
          ],
        },
        {
          label: 'Share',
          fields: [
            {
              name: 'share',
              type: 'ui',
              label: 'Share',
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
        interval: 100, // We set this interval for optimal live preview
      },
      schedulePublish: true,
    },
    maxPerDoc: 50,
  },
}
