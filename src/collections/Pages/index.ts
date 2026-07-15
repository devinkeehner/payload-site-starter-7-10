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
import { MediaGalleryBlockConfig } from '@/components/blocks/media-gallery-block/config'
import { PolicyVoicesBlockConfig } from '@/components/blocks/policy-voices-block/config'
import { PetitionDriveBlockConfig } from '@/components/blocks/petition-drive-block/config'
import { LunchComparisonGraphicBlockConfig } from '@/components/blocks/lunch-comparison-graphic/config'
import { SolutionTimelineGraphicBlockConfig } from '@/components/blocks/solution-timeline-graphic/config'
import { TaxReliefHighlightGraphicBlockConfig } from '@/components/blocks/tax-relief-highlight-graphic/config'
import { PropertyTaxCreditTableBlockConfig } from '@/components/blocks/property-tax-credit-table/config'
import { BudgetPlanFeatureConfig } from '@/components/blocks/budget-plan-feature/config'
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
              blocks: [
                CallToActionConfig,
                ContentConfig,
                MediaBlockConfig,
                MediaGalleryBlockConfig,
                RichTextBlockConfig,
                ArchiveConfig,
                FormBlockConfig,
                BannerConfig,
                PolicyVoicesBlockConfig,
                PetitionDriveBlockConfig,
                LunchComparisonGraphicBlockConfig,
                SolutionTimelineGraphicBlockConfig,
                TaxReliefHighlightGraphicBlockConfig,
                PropertyTaxCreditTableBlockConfig,
                BudgetPlanFeatureConfig,
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
    ...slugField(),
  ],
  hooks: {
    afterChange: [revalidatePage, rebuildSitemapsAfterPublishedChange],
    beforeChange: [populatePublishedAt],
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
