import type { Block } from 'payload'

import {
  FixedToolbarFeature,
  HeadingFeature,
  HorizontalRuleFeature,
  InlineToolbarFeature,
  lexicalEditor,
  OrderedListFeature,
  UnorderedListFeature,
} from '@payloadcms/richtext-lexical'

import { TextColorFeature } from '@/lib/rich-text/textColorFeature.server'

const alignmentOptions = [
  { label: 'Left', value: 'left' },
  { label: 'Center', value: 'center' },
  { label: 'Right', value: 'right' },
]

const buttonVariantOptions = [
  { label: 'Primary', value: 'primary' },
  { label: 'Secondary', value: 'secondary' },
  { label: 'Outline', value: 'outline' },
]

const richTextEditor = lexicalEditor({
  features: ({ rootFeatures }) => {
    return [
      ...rootFeatures,
      TextColorFeature(),
      HeadingFeature({ enabledHeadingSizes: ['h2', 'h3', 'h4'] }),
      UnorderedListFeature(),
      OrderedListFeature(),
      HorizontalRuleFeature(),
      FixedToolbarFeature(),
      InlineToolbarFeature(),
    ]
  },
})

const richTextDefault = (text: string) => ({
  root: {
    type: 'root',
    children: [
      {
        type: 'paragraph',
        children: [
          {
            type: 'text',
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text,
            version: 1,
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        version: 1,
      },
    ],
    direction: null,
    format: '',
    indent: 0,
    version: 1,
  },
})

export const PostBodyBlock: Block = {
  slug: 'postBody',
  admin: {
    group: 'Post',
  },
  fields: [],
  interfaceName: 'PostBodyBlock',
  labels: {
    plural: 'Post Body Blocks',
    singular: 'Post Body',
  },
}

export const PostRichTextBlock: Block = {
  slug: 'postRichText',
  admin: {
    group: 'Post',
  },
  fields: [
    {
      name: 'content',
      type: 'richText',
      defaultValue: richTextDefault('Add post copy.'),
      editor: richTextEditor,
      label: false,
      required: true,
    },
  ],
  interfaceName: 'PostRichTextBlock',
  labels: {
    plural: 'Post Rich Text Blocks',
    singular: 'Post Rich Text',
  },
}

export const PostCalloutBlock: Block = {
  slug: 'postCallout',
  admin: {
    group: 'Post',
  },
  fields: [
    {
      name: 'tone',
      type: 'select',
      defaultValue: 'note',
      options: [
        { label: 'Note', value: 'note' },
        { label: 'Accent', value: 'accent' },
        { label: 'Strong', value: 'strong' },
      ],
      required: true,
    },
    {
      name: 'heading',
      type: 'text',
      defaultValue: 'Important update',
    },
    {
      name: 'content',
      type: 'richText',
      defaultValue: richTextDefault('Add supporting copy for this callout.'),
      editor: richTextEditor,
      label: false,
      required: true,
    },
  ],
  interfaceName: 'PostCalloutBlock',
  labels: {
    plural: 'Post Callouts',
    singular: 'Post Callout',
  },
}

export const PostButtonBlock: Block = {
  slug: 'postButton',
  admin: {
    group: 'Post',
  },
  fields: [
    {
      name: 'label',
      type: 'text',
      defaultValue: 'Read more',
      required: true,
    },
    {
      name: 'url',
      type: 'text',
      defaultValue: '/',
      required: true,
    },
    {
      name: 'variant',
      type: 'select',
      defaultValue: 'primary',
      options: buttonVariantOptions,
      required: true,
    },
    {
      name: 'align',
      type: 'select',
      defaultValue: 'left',
      options: alignmentOptions,
      required: true,
    },
  ],
  interfaceName: 'PostButtonBlock',
  labels: {
    plural: 'Post Buttons',
    singular: 'Post Button',
  },
}

export const PostImageBlock: Block = {
  slug: 'postImage',
  admin: {
    group: 'Post',
  },
  fields: [
    {
      name: 'media',
      type: 'upload',
      relationTo: 'media',
      required: true,
    },
    {
      name: 'caption',
      type: 'text',
    },
  ],
  interfaceName: 'PostImageBlock',
  labels: {
    plural: 'Post Images',
    singular: 'Post Image',
  },
}

export const PostGalleryBlock: Block = {
  slug: 'postGallery',
  admin: {
    group: 'Post',
  },
  fields: [
    {
      name: 'layout',
      type: 'select',
      defaultValue: 'grid',
      options: [
        { label: 'Grid', value: 'grid' },
        { label: 'Stacked', value: 'stacked' },
      ],
      required: true,
    },
    {
      name: 'items',
      type: 'array',
      minRows: 1,
      maxRows: 12,
      fields: [
        {
          name: 'media',
          type: 'upload',
          relationTo: 'media',
          required: true,
        },
        {
          name: 'caption',
          type: 'text',
        },
      ],
    },
  ],
  interfaceName: 'PostGalleryBlock',
  labels: {
    plural: 'Post Galleries',
    singular: 'Post Gallery',
  },
}

export const PostListBlock: Block = {
  slug: 'postList',
  admin: {
    group: 'Post',
  },
  fields: [
    {
      name: 'style',
      type: 'select',
      defaultValue: 'simple',
      options: [
        { label: 'Simple', value: 'simple' },
        { label: 'With images', value: 'imageLeft' },
      ],
      required: true,
    },
    {
      name: 'items',
      type: 'array',
      minRows: 1,
      maxRows: 12,
      fields: [
        {
          name: 'media',
          type: 'upload',
          relationTo: 'media',
        },
        {
          name: 'title',
          type: 'text',
          required: true,
        },
        {
          name: 'body',
          type: 'textarea',
        },
      ],
    },
  ],
  interfaceName: 'PostListBlock',
  labels: {
    plural: 'Post Lists',
    singular: 'Post List',
  },
}

export const PostLinksBlock: Block = {
  slug: 'postLinks',
  admin: {
    group: 'Post',
  },
  fields: [
    {
      name: 'variant',
      type: 'select',
      defaultValue: 'card',
      options: [
        { label: 'Card', value: 'card' },
        { label: 'Footer', value: 'footer' },
      ],
      required: true,
    },
    {
      name: 'heading',
      type: 'text',
      defaultValue: 'Related links',
    },
    {
      name: 'body',
      type: 'textarea',
    },
    {
      name: 'links',
      type: 'array',
      minRows: 1,
      maxRows: 12,
      fields: [
        {
          name: 'label',
          type: 'text',
          required: true,
        },
        {
          name: 'url',
          type: 'text',
          required: true,
        },
      ],
    },
  ],
  interfaceName: 'PostLinksBlock',
  labels: {
    plural: 'Post Link Groups',
    singular: 'Post Link Group',
  },
}

export const PostDividerBlock: Block = {
  slug: 'postDivider',
  admin: {
    group: 'Post',
  },
  fields: [],
  interfaceName: 'PostDividerBlock',
  labels: {
    plural: 'Post Dividers',
    singular: 'Post Divider',
  },
}

export const PostSpacerBlock: Block = {
  slug: 'postSpacer',
  admin: {
    group: 'Post',
  },
  fields: [
    {
      name: 'size',
      type: 'number',
      defaultValue: 24,
      min: 4,
      max: 96,
      required: true,
    },
  ],
  interfaceName: 'PostSpacerBlock',
  labels: {
    plural: 'Post Spacers',
    singular: 'Post Spacer',
  },
}

export const PostBentoGridBlock: Block = {
  slug: 'postBentoGrid',
  admin: {
    group: 'Post',
  },
  fields: [
    {
      name: 'heading',
      type: 'text',
      defaultValue: 'Highlights',
    },
    {
      name: 'items',
      type: 'array',
      minRows: 1,
      maxRows: 6,
      fields: [
        {
          name: 'size',
          type: 'select',
          defaultValue: 'normal',
          options: [
            { label: 'Normal', value: 'normal' },
            { label: 'Wide', value: 'wide' },
          ],
          required: true,
        },
        {
          name: 'media',
          type: 'upload',
          relationTo: 'media',
        },
        {
          name: 'alt',
          type: 'text',
        },
        {
          name: 'title',
          type: 'text',
          defaultValue: 'Bento item',
          required: true,
        },
        {
          name: 'body',
          type: 'textarea',
        },
      ],
    },
  ],
  interfaceName: 'PostBentoGridBlock',
  labels: {
    plural: 'Post Bento Grids',
    singular: 'Post Bento Grid',
  },
}

const POST_NESTED_LAYOUT_BLOCKS = [
  PostBodyBlock,
  PostRichTextBlock,
  PostCalloutBlock,
  PostButtonBlock,
  PostImageBlock,
  PostGalleryBlock,
  PostListBlock,
  PostLinksBlock,
  PostDividerBlock,
  PostSpacerBlock,
  PostBentoGridBlock,
]

export const PostGridBlock: Block = {
  slug: 'postGrid',
  admin: {
    group: 'Post',
  },
  fields: [
    {
      name: 'layout',
      type: 'select',
      defaultValue: 'twoColumns',
      options: [
        { label: 'One row, one column', value: 'oneColumn' },
        { label: 'One row, two columns', value: 'twoColumns' },
        { label: 'One row, left column wide', value: 'twoColumnsLeftWide' },
        { label: 'One row, right column wide', value: 'twoColumnsRightWide' },
        { label: 'One row, three columns', value: 'threeColumns' },
        { label: 'One row, four columns', value: 'fourColumns' },
      ],
      required: true,
    },
    {
      name: 'leftBlocks',
      type: 'blocks',
      blocks: POST_NESTED_LAYOUT_BLOCKS,
      admin: {
        initCollapsed: true,
      },
    },
    {
      name: 'centerBlocks',
      type: 'blocks',
      blocks: POST_NESTED_LAYOUT_BLOCKS,
      admin: {
        initCollapsed: true,
      },
    },
    {
      name: 'rightBlocks',
      type: 'blocks',
      blocks: POST_NESTED_LAYOUT_BLOCKS,
      admin: {
        initCollapsed: true,
      },
    },
    {
      name: 'fourthBlocks',
      type: 'blocks',
      blocks: POST_NESTED_LAYOUT_BLOCKS,
      admin: {
        initCollapsed: true,
      },
    },
  ],
  interfaceName: 'PostGridBlock',
  labels: {
    plural: 'Post Grids',
    singular: 'Post Grid',
  },
}

export const POST_LAYOUT_BLOCKS = [
  PostBodyBlock,
  PostRichTextBlock,
  PostCalloutBlock,
  PostButtonBlock,
  PostImageBlock,
  PostGalleryBlock,
  PostListBlock,
  PostLinksBlock,
  PostDividerBlock,
  PostSpacerBlock,
  PostBentoGridBlock,
  PostGridBlock,
]
