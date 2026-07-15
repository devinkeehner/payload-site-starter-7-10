import type { Field } from 'payload'

import {
  BlocksFeature,
  FixedToolbarFeature,
  HeadingFeature,
  InlineToolbarFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'

import { BannerConfig } from '@/components/blocks/banner-block/config'
import { CodeBlockConfig } from '@/components/blocks/code-block/config'
import { FormBlockConfig } from '@/components/blocks/form-block/config'
import { MediaBlockConfig } from '@/components/blocks/media-block/config'
import { MediaGalleryBlockConfig } from '@/components/blocks/media-gallery-block/config'
import { VideoBlockConfig } from '@/components/blocks/video-block/config'
import { linkGroup } from '@/collections/fields/linkGroup'
import { link } from '@/collections/fields/link'

export const HeroConfig: Field = {
  name: 'hero',
  type: 'group',
  required: false,
  fields: [
    {
      name: 'type',
      type: 'select',
      defaultValue: 'lowImpact',
      label: 'Type',
      options: [
        {
          label: 'None',
          value: 'none',
        },
        {
          label: 'High Impact',
          value: 'highImpact',
        },
        {
          label: 'Medium Impact',
          value: 'mediumImpact',
        },
        {
          label: 'Low Impact',
          value: 'lowImpact',
        },
      ],
      required: false,
    },
    {
      name: 'richText',
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
              ],
            }),
            FixedToolbarFeature(),
            InlineToolbarFeature(),
          ]
        },
      }),
      label: false,
      required: false,
    },
    linkGroup({
      overrides: {
        maxRows: 2,
        required: false,
      },
    }),
    {
      name: 'media',
      type: 'upload',
      admin: {
        condition: (_, { type } = {}) => ['highImpact', 'mediumImpact'].includes(type),
      },
      relationTo: 'media',
      required: false,
    },
    link({
      overrides: { name: 'callToAction', required: false },
    }),
  ],
  label: false,
}
