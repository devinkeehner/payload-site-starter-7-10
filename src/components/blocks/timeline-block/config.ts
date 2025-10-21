import type { Block } from 'payload'

import {
  FixedToolbarFeature,
  HeadingFeature,
  InlineToolbarFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'

export const TimelineBlockConfig: Block = {
  slug: 'timeline',
  interfaceName: 'TimelineBlock',
  labels: {
    singular: 'Timeline',
    plural: 'Timelines',
  },
  fields: [
    {
      name: 'items',
      type: 'array',
      minRows: 1,
      admin: {
        initCollapsed: true,
      },
      fields: [
        {
          name: 'dateLabel',
          type: 'text',
          required: true,
        },
        {
          name: 'title',
          type: 'text',
          required: true,
        },
        {
          name: 'content',
          type: 'richText',
          required: true,
          editor: lexicalEditor({
            features: ({ rootFeatures }) => [
              ...rootFeatures,
              HeadingFeature({ enabledHeadingSizes: ['h2', 'h3', 'h4'] }),
              FixedToolbarFeature(),
              InlineToolbarFeature(),
            ],
          }),
        },
      ],
    },
  ],
}
