import type { CollectionConfig } from 'payload'

import { authenticated } from '@/lib/access/authenticated'
import { authenticatedOrPublished } from '@/lib/access/authenticatedOrPublished'
import { BannerConfig } from '@/components/blocks/banner-block/config'
import { ArchiveConfig } from '@/components/blocks/archive-block/config'
import { CallToActionConfig } from '@/components/blocks/cta-block/config'
import { ContentConfig } from '@/components/blocks/content-block/config'
import { RichTextBlockConfig } from '@/components/blocks/richtext-block/config'
import { FormBlockConfig } from '@/components/blocks/form-block/config'
import { MediaBlockConfig } from '@/components/blocks/media-block/config'
import { HeroConfig } from '@/components/heros/config'
import { slugField } from '@/collections/fields/slug'
import { populatePublishedAt } from '@/lib/hooks/populatePublishedAt'
import { generatePreviewPath } from '@/lib/utilities/generatePreviewPath'
import { revalidateDelete, revalidatePage } from './hooks/revalidatePage'

import {
  MetaDescriptionField,
  MetaImageField,
  MetaTitleField,
  OverviewField,
  PreviewField,
} from '@payloadcms/plugin-seo/fields'

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
    livePreview: {
      url: ({ data, req }) => {
        const path = generatePreviewPath({
          slug: typeof data?.slug === 'string' ? data.slug : '',
          collection: 'pages',
          req,
        })

        return path
      },
    },
    preview: (data, { req }) =>
      generatePreviewPath({
        slug: typeof data?.slug === 'string' ? data.slug : '',
        collection: 'pages',
        req,
      }),
    useAsTitle: 'title',
  },
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
          fields: [HeroConfig],
          label: 'Hero',
        },
        {
          fields: [
            {
              name: 'layout',
              type: 'blocks',
              blocks: [
                CallToActionConfig,
                ContentConfig,
                MediaBlockConfig,
                RichTextBlockConfig,
                ArchiveConfig,
                FormBlockConfig,
                BannerConfig,
              ],
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
      ],
    },
    {
      name: 'publishedAt',
      type: 'date',
      admin: {
        position: 'sidebar',
      },
    },
    ...slugField(),
  ],
  hooks: {
    afterChange: [revalidatePage],
    beforeChange: [populatePublishedAt],
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
