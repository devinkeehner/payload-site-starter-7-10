import { tinyURLAliasField } from '@/lib/tinyurl/fields'
import { contentLinkEndpoint, syncPublishedContent, protectLinkedContentDelete, captureContentOperation, protectLinkedContent } from '@/lib/tinyurl/service'
import type { CollectionConfig } from 'payload'

import { authenticated } from '@/lib/access/authenticated'
import { authenticatedOrPublished } from '@/lib/access/authenticatedOrPublished'
import { PAGE_LAYOUT_BLOCKS } from '@/lib/blocks/pageLayoutBlocks'
import { canUseBuilders } from '@/lib/access/isSuperUser'
import { HeroConfig } from '@/components/heros/config'
import { slugField } from '@/collections/fields/slug'
import { populatePublishedAt } from '@/lib/hooks/populatePublishedAt'
import { generatePreviewPath } from '@/lib/utilities/generatePreviewPath'
import { generatePreviewAPIUrl } from '@/lib/utilities/generatePreviewAPIUrl'
import { revalidateDelete, revalidatePage } from './hooks/revalidatePage'
import { rebuildSitemapsAfterPublishedChange, rebuildSitemapsAfterPublishedDelete } from '@/lib/hooks/rebuildSitemaps'

import {
  MetaDescriptionField,
  MetaImageField,
  MetaTitleField,
  OverviewField,
  PreviewField,
} from '@payloadcms/plugin-seo/fields'

const resolveTenantId = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value !== null && 'id' in value && typeof value.id === 'string') {
    return value.id
  }
  return undefined
}

export const Pages: CollectionConfig<'pages'> = {
  slug: 'pages',
  access: {
    create: authenticated,
    delete: authenticated,
    read: authenticatedOrPublished,
    update: authenticated,
  },
  defaultPopulate: {
    title: true,
    slug: true,
  },
  admin: {
    group: 'Content',
    defaultColumns: ['title', 'slug', 'updatedAt'],
    components: {
      views: {
        edit: {
          default: {
            Component: '@/components/admin/live-preview/ResponsiveEditView#default',
            tab: { label: 'Editor', order: 10 },
          },
          visual: {
            path: '/visual',
            Component: '@/components/admin/page/LivePageBuilderView#default',
            tab: {
              href: '/visual',
              label: 'Live Editor',
              order: 75,
              condition: ({ req }) => canUseBuilders(req.user),
            },
          },
        },
      },
    },
    livePreview: {
      url: ({ data }) => {
        const path = generatePreviewAPIUrl({
          slug: typeof data?.slug === 'string' ? data.slug : '',
          collection: 'pages',
          tenantId: resolveTenantId(data?.tenant),
        })

        return path
      },
    },
    preview: (data, { req }) =>
      generatePreviewPath({
        slug: typeof data?.slug === 'string' ? data.slug : '',
        collection: 'pages',
        req,
        tenantId: resolveTenantId(data?.tenant),
      }),
    useAsTitle: 'title',
  },
  endpoints: [
    { path: '/:id/short-link', method: 'post', handler: contentLinkEndpoint('pages') },
    { path: '/:id/short-link', method: 'get', handler: contentLinkEndpoint('pages') },
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
              name: 'layout',
              type: 'blocks',
              blocks: PAGE_LAYOUT_BLOCKS,
              required: true,
              admin: {
                initCollapsed: true,
              },
            },
          ],
          label: 'Content',
        },
        {
          name: 'meta',
          label: 'SEO',
          fields: [
            OverviewField({
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
              imagePath: 'meta.image',
            }),
            MetaTitleField({
              hasGenerateFn: true,
            }),
            MetaImageField({
              relationTo: 'media',
            }),

            MetaDescriptionField({}),
            PreviewField({
              hasGenerateFn: true,
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
            }),
          ],
        },
        {
          fields: [HeroConfig],
          label: 'Hero',
        },
        {
          label: 'Share',
          fields: [
            {
              name: 'draftShareLink',
              label: 'Copy draft URL',
              type: 'ui',
              admin: {
                components: {
                  Field: {
                    path: '@/components/admin/DraftShareField#DraftShareField',
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
        position: 'sidebar',
      },
    },
    {
      name: 'draftShareToken',
      type: 'text',
      admin: {
        hidden: true,
      },
    },
    tinyURLAliasField,
    ...slugField(),
  ],
  hooks: {
    beforeOperation: [captureContentOperation<'pages'>()],
    beforeChange: [protectLinkedContent, populatePublishedAt],
    beforeDelete: [protectLinkedContentDelete],
    afterChange: [syncPublishedContent, revalidatePage, rebuildSitemapsAfterPublishedChange],
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
