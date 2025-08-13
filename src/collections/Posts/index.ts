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
