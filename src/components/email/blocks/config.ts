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

const textColorOptions = [
  { label: 'Default', value: 'default' },
  { label: 'Foreground', value: 'foreground' },
  { label: 'Primary', value: 'primary' },
  { label: 'Accent', value: 'accent' },
  { label: 'White', value: 'white' },
]

const alignmentOptions = [
  { label: 'Left', value: 'left' },
  { label: 'Center', value: 'center' },
  { label: 'Right', value: 'right' },
]

const dividerAlignmentOptions = [
  ...alignmentOptions,
  { label: 'Justify', value: 'justify' },
]

const dividerColorOptions = [
  { label: 'Default', value: 'border' },
  ...textColorOptions.filter((option) => option.value !== 'default'),
]

const buttonVariantOptions = [
  { label: 'Primary', value: 'primary' },
  { label: 'Accent', value: 'accent' },
  { label: 'Outline', value: 'outline' },
]

const socialPlatformOptions = [
  { label: 'Facebook', value: 'facebook' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'LinkedIn', value: 'linkedin' },
  { label: 'X', value: 'x' },
  { label: 'YouTube', value: 'youtube' },
  { label: 'Flickr', value: 'flickr' },
  { label: 'Website', value: 'website' },
]

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

export const EmailHeadingBlock: Block = {
  slug: 'emailHeading',
  admin: {
    group: 'Email',
  },
  fields: [
    {
      name: 'text',
      type: 'text',
      defaultValue: 'Email heading',
      required: true,
    },
    {
      name: 'level',
      type: 'select',
      defaultValue: 'h1',
      options: [
        { label: 'Heading 1', value: 'h1' },
        { label: 'Heading 2', value: 'h2' },
        { label: 'Heading 3', value: 'h3' },
      ],
      required: true,
    },
    {
      name: 'align',
      type: 'select',
      defaultValue: 'left',
      options: alignmentOptions,
      required: true,
    },
    {
      name: 'color',
      type: 'select',
      defaultValue: 'foreground',
      options: textColorOptions,
      required: true,
    },
  ],
  interfaceName: 'EmailHeadingBlock',
  labels: {
    plural: 'Email Headings',
    singular: 'Email Heading',
  },
}

export const EmailHeaderSocialBlock: Block = {
  slug: 'emailHeaderSocial',
  admin: {
    group: 'Email',
  },
  fields: [
    {
      name: 'logoText',
      type: 'text',
      defaultValue: 'Campaign Update',
      required: true,
    },
    {
      name: 'subtitle',
      type: 'text',
      defaultValue: 'Latest news and updates',
    },
    {
      name: 'socialLinks',
      type: 'array',
      maxRows: 6,
      defaultValue: [
        { platform: 'facebook', url: 'https://' },
        { platform: 'instagram', url: 'https://' },
      ],
      fields: [
        {
          name: 'platform',
          type: 'select',
          defaultValue: 'facebook',
          options: socialPlatformOptions,
          required: true,
        },
        {
          name: 'url',
          type: 'text',
          defaultValue: 'https://',
          required: true,
        },
      ],
    },
  ],
  interfaceName: 'EmailHeaderSocialBlock',
  labels: {
    plural: 'Email Headers With Social Icons',
    singular: 'Email Header With Social Icons',
  },
}

export const EmailTextBlock: Block = {
  slug: 'emailText',
  admin: {
    group: 'Email',
  },
  fields: [
    {
      name: 'text',
      type: 'richText',
      defaultValue: richTextDefault('Write the body copy for this email.'),
      editor: lexicalEditor({
        features: ({ rootFeatures }) => {
          return [
            ...rootFeatures,
            TextColorFeature(),
            HeadingFeature({ enabledHeadingSizes: ['h1', 'h2', 'h3'] }),
            UnorderedListFeature(),
            OrderedListFeature(),
            HorizontalRuleFeature(),
            FixedToolbarFeature(),
            InlineToolbarFeature(),
          ]
        },
      }),
      required: true,
    },
    {
      name: 'align',
      type: 'select',
      defaultValue: 'left',
      options: alignmentOptions,
      required: true,
    },
    {
      name: 'color',
      type: 'select',
      defaultValue: 'foreground',
      options: textColorOptions,
      required: true,
    },
  ],
  interfaceName: 'EmailTextBlock',
  labels: {
    plural: 'Email Text Blocks',
    singular: 'Email Text',
  },
}

export const EmailInlineLinkBlock: Block = {
  slug: 'emailInlineLink',
  admin: {
    group: 'Email',
  },
  fields: [
    {
      name: 'beforeText',
      type: 'text',
      defaultValue: 'Read the full update ',
    },
    {
      name: 'label',
      type: 'text',
      defaultValue: 'online',
      required: true,
    },
    {
      name: 'url',
      type: 'text',
      defaultValue: 'https://',
      required: true,
    },
    {
      name: 'afterText',
      type: 'text',
      defaultValue: '.',
    },
    {
      name: 'align',
      type: 'select',
      defaultValue: 'left',
      options: alignmentOptions,
      required: true,
    },
  ],
  interfaceName: 'EmailInlineLinkBlock',
  labels: {
    plural: 'Email Inline Links',
    singular: 'Email Inline Link',
  },
}

export const EmailButtonBlock: Block = {
  slug: 'emailButton',
  admin: {
    group: 'Email',
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
      defaultValue: 'https://',
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
  interfaceName: 'EmailButtonBlock',
  labels: {
    plural: 'Email Buttons',
    singular: 'Email Button',
  },
}

export const EmailTwoButtonBlock: Block = {
  slug: 'emailTwoButtons',
  admin: {
    group: 'Email',
  },
  fields: [
    {
      name: 'primaryLabel',
      type: 'text',
      defaultValue: 'Primary action',
      required: true,
    },
    {
      name: 'primaryUrl',
      type: 'text',
      defaultValue: 'https://',
      required: true,
    },
    {
      name: 'primaryVariant',
      type: 'select',
      defaultValue: 'primary',
      options: buttonVariantOptions,
      required: true,
    },
    {
      name: 'secondaryLabel',
      type: 'text',
      defaultValue: 'Secondary action',
      required: true,
    },
    {
      name: 'secondaryUrl',
      type: 'text',
      defaultValue: 'https://',
      required: true,
    },
    {
      name: 'secondaryVariant',
      type: 'select',
      defaultValue: 'outline',
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
  interfaceName: 'EmailTwoButtonBlock',
  labels: {
    plural: 'Email Two Button Rows',
    singular: 'Email Two Button Row',
  },
}

export const EmailListBlock: Block = {
  slug: 'emailList',
  admin: {
    group: 'Email',
  },
  fields: [
    {
      name: 'style',
      type: 'select',
      defaultValue: 'simple',
      options: [
        { label: 'Simple list', value: 'simple' },
        { label: 'List with image on left', value: 'imageLeft' },
      ],
      required: true,
    },
    {
      name: 'items',
      type: 'array',
      minRows: 1,
      maxRows: 8,
      defaultValue: [
        { title: 'First item', body: 'Add supporting detail here.' },
        { title: 'Second item', body: 'Add supporting detail here.' },
      ],
      fields: [
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
          defaultValue: 'List item',
          required: true,
        },
        {
          name: 'body',
          type: 'textarea',
        },
      ],
    },
  ],
  interfaceName: 'EmailListBlock',
  labels: {
    plural: 'Email Lists',
    singular: 'Email List',
  },
}

export const EmailMarkdownBlock: Block = {
  slug: 'emailMarkdown',
  admin: {
    group: 'Email',
  },
  fields: [
    {
      name: 'markdown',
      type: 'textarea',
      defaultValue: '## Markdown section\n\nAdd **formatted** copy with links, lists, and headings.',
      required: true,
    },
  ],
  interfaceName: 'EmailMarkdownBlock',
  labels: {
    plural: 'Email Markdown Blocks',
    singular: 'Email Markdown',
  },
}

export const EmailImageBlock: Block = {
  slug: 'emailImage',
  admin: {
    group: 'Email',
  },
  fields: [
    {
      name: 'media',
      type: 'upload',
      relationTo: 'media',
      required: true,
    },
    {
      name: 'alt',
      type: 'text',
    },
    {
      name: 'href',
      type: 'text',
    },
    {
      name: 'width',
      type: 'number',
      defaultValue: 640,
      min: 120,
      max: 640,
    },
  ],
  interfaceName: 'EmailImageBlock',
  labels: {
    plural: 'Email Images',
    singular: 'Email Image',
  },
}

export const EmailVideoBlock: Block = {
  slug: 'emailVideo',
  admin: {
    group: 'Email',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      defaultValue: 'Video title',
      required: true,
    },
    {
      name: 'videoMedia',
      label: 'Uploaded video',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description: 'Upload a video file, or leave this blank and use a YouTube URL.',
      },
    },
    {
      name: 'youtubeUrl',
      label: 'YouTube URL',
      type: 'text',
      admin: {
        description: 'Paste a YouTube watch, share, shorts, or embed URL.',
      },
    },
    {
      name: 'thumbnailMedia',
      label: 'Thumbnail image',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description: 'Optional. YouTube videos will use the YouTube thumbnail when this is blank.',
      },
    },
    {
      name: 'thumbnailAlt',
      label: 'Thumbnail alt text',
      type: 'text',
    },
    {
      name: 'width',
      type: 'number',
      defaultValue: 640,
      min: 240,
      max: 640,
    },
  ],
  interfaceName: 'EmailVideoBlock',
  labels: {
    plural: 'Email Videos',
    singular: 'Email Video',
  },
}

export const EmailArticleImageRightBlock: Block = {
  slug: 'emailArticleImageRight',
  admin: {
    group: 'Email',
  },
  fields: [
    {
      name: 'heading',
      type: 'text',
      defaultValue: 'Article headline',
      required: true,
    },
    {
      name: 'body',
      type: 'textarea',
      defaultValue: 'Add the article summary or teaser copy here.',
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
      name: 'url',
      type: 'text',
      defaultValue: 'https://',
    },
    {
      name: 'linkLabel',
      type: 'text',
      defaultValue: 'Read article',
    },
  ],
  interfaceName: 'EmailArticleImageRightBlock',
  labels: {
    plural: 'Email Articles With Image Right',
    singular: 'Email Article With Image Right',
  },
}

export const EmailArticleTwoCardsBlock: Block = {
  slug: 'emailArticleTwoCards',
  admin: {
    group: 'Email',
  },
  fields: [
    {
      name: 'cards',
      type: 'array',
      minRows: 1,
      maxRows: 2,
      defaultValue: [
        { heading: 'First article', body: 'Add article summary copy.', url: 'https://', linkLabel: 'Read more' },
        { heading: 'Second article', body: 'Add article summary copy.', url: 'https://', linkLabel: 'Read more' },
      ],
      fields: [
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
          name: 'heading',
          type: 'text',
          defaultValue: 'Article headline',
          required: true,
        },
        {
          name: 'body',
          type: 'textarea',
          defaultValue: 'Add article summary copy.',
        },
        {
          name: 'url',
          type: 'text',
          defaultValue: 'https://',
        },
        {
          name: 'linkLabel',
          type: 'text',
          defaultValue: 'Read more',
        },
      ],
    },
  ],
  interfaceName: 'EmailArticleTwoCardsBlock',
  labels: {
    plural: 'Email Article Two Card Blocks',
    singular: 'Email Article Two Cards',
  },
}

export const EmailGalleryBlock: Block = {
  slug: 'emailGallery',
  admin: {
    group: 'Email',
  },
  fields: [
    {
      name: 'layout',
      type: 'select',
      defaultValue: 'fourGrid',
      options: [
        { label: 'Four images in a grid', value: 'fourGrid' },
        { label: 'Three columns with images', value: 'threeColumns' },
        { label: 'Images on horizontal grid', value: 'horizontalGrid' },
        { label: 'Images on vertical grid', value: 'verticalGrid' },
      ],
      required: true,
    },
    {
      name: 'items',
      type: 'array',
      minRows: 1,
      maxRows: 8,
      defaultValue: [{}, {}, {}, {}],
      fields: [
        {
          name: 'media',
          type: 'upload',
          relationTo: 'media',
          required: true,
        },
        {
          name: 'alt',
          type: 'text',
        },
        {
          name: 'href',
          type: 'text',
        },
        {
          name: 'caption',
          type: 'text',
        },
      ],
    },
  ],
  interfaceName: 'EmailGalleryBlock',
  labels: {
    plural: 'Email Galleries',
    singular: 'Email Gallery',
  },
}

export const EmailFeatureThreeCenteredBlock: Block = {
  slug: 'emailFeatureThreeCentered',
  admin: {
    group: 'Email',
  },
  fields: [
    {
      name: 'heading',
      type: 'text',
      defaultValue: 'What to know',
      required: true,
    },
    {
      name: 'paragraphs',
      type: 'array',
      minRows: 1,
      maxRows: 3,
      defaultValue: [
        { text: 'Add the first centered paragraph.' },
        { text: 'Add the second centered paragraph.' },
        { text: 'Add the third centered paragraph.' },
      ],
      fields: [
        {
          name: 'text',
          type: 'textarea',
          defaultValue: 'Add a centered feature paragraph.',
          required: true,
        },
      ],
    },
  ],
  interfaceName: 'EmailFeatureThreeCenteredBlock',
  labels: {
    plural: 'Email Three Centered Paragraph Features',
    singular: 'Email Three Centered Paragraph Feature',
  },
}

export const EmailBentoGridBlock: Block = {
  slug: 'emailBentoGrid',
  admin: {
    group: 'Email',
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
      defaultValue: [
        { size: 'wide', title: 'Primary highlight', body: 'Add the main marketing message.' },
        { size: 'normal', title: 'Supporting point', body: 'Add supporting copy.' },
        { size: 'normal', title: 'Supporting point', body: 'Add supporting copy.' },
      ],
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
          defaultValue: 'Add concise marketing copy.',
        },
      ],
    },
  ],
  interfaceName: 'EmailBentoGridBlock',
  labels: {
    plural: 'Email Bento Grids',
    singular: 'Email Bento Grid',
  },
}

export const EmailDividerBlock: Block = {
  slug: 'emailDivider',
  admin: {
    group: 'Email',
  },
  fields: [
    {
      name: 'color',
      type: 'select',
      defaultValue: 'border',
      options: dividerColorOptions,
      required: true,
    },
    {
      name: 'width',
      label: 'Width (%)',
      type: 'number',
      defaultValue: 100,
      min: 10,
      max: 100,
    },
    {
      name: 'align',
      label: 'Justification',
      type: 'select',
      defaultValue: 'justify',
      options: dividerAlignmentOptions,
      required: true,
    },
    {
      name: 'spacing',
      type: 'number',
      defaultValue: 24,
      min: 0,
      max: 64,
    },
  ],
  interfaceName: 'EmailDividerBlock',
  labels: {
    plural: 'Email Dividers',
    singular: 'Email Divider',
  },
}

export const EmailSpacerBlock: Block = {
  slug: 'emailSpacer',
  admin: {
    group: 'Email',
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
  interfaceName: 'EmailSpacerBlock',
  labels: {
    plural: 'Email Spacers',
    singular: 'Email Spacer',
  },
}

export const EmailCalloutBlock: Block = {
  slug: 'emailCallout',
  admin: {
    group: 'Email',
  },
  fields: [
    {
      name: 'heading',
      type: 'text',
      defaultValue: 'Important update',
    },
    {
      name: 'body',
      type: 'textarea',
      defaultValue: 'Add a short highlighted note for readers.',
      required: true,
    },
    {
      name: 'variant',
      type: 'select',
      defaultValue: 'accent',
      options: [
        { label: 'Accent', value: 'accent' },
        { label: 'Primary', value: 'primary' },
        { label: 'Neutral', value: 'neutral' },
      ],
      required: true,
    },
  ],
  interfaceName: 'EmailCalloutBlock',
  labels: {
    plural: 'Email Callouts',
    singular: 'Email Callout',
  },
}

export const EmailFooterOneColumnBlock: Block = {
  slug: 'emailFooterOneColumn',
  admin: {
    group: 'Email',
  },
  fields: [
    {
      name: 'heading',
      type: 'text',
      defaultValue: 'Stay connected',
    },
    {
      name: 'body',
      type: 'textarea',
      defaultValue: 'Thank you for reading.',
    },
    {
      name: 'address',
      type: 'textarea',
    },
    {
      name: 'links',
      type: 'array',
      maxRows: 6,
      defaultValue: [
        { label: 'Website', url: 'https://' },
        { label: 'Contact', url: 'https://' },
      ],
      fields: [
        {
          name: 'label',
          type: 'text',
          defaultValue: 'Footer link',
          required: true,
        },
        {
          name: 'url',
          type: 'text',
          defaultValue: 'https://',
          required: true,
        },
      ],
    },
    {
      name: 'socialLinks',
      label: 'Social links',
      type: 'array',
      maxRows: 8,
      fields: [
        {
          name: 'platform',
          type: 'select',
          defaultValue: 'facebook',
          options: socialPlatformOptions,
          required: true,
        },
        {
          name: 'url',
          type: 'text',
          defaultValue: 'https://',
          required: true,
        },
      ],
    },
    {
      name: 'towns',
      label: 'District towns',
      type: 'array',
      maxRows: 20,
      fields: [
        {
          name: 'town',
          type: 'text',
          required: true,
        },
        {
          name: 'url',
          label: 'Town website URL',
          type: 'text',
        },
      ],
    },
    {
      name: 'copyright',
      type: 'text',
      defaultValue: 'Copyright 2026',
    },
  ],
  interfaceName: 'EmailFooterOneColumnBlock',
  labels: {
    plural: 'Email One Column Footers',
    singular: 'Email One Column Footer',
  },
}

const EMAIL_NESTED_LAYOUT_BLOCKS = [
  EmailHeadingBlock,
  EmailTextBlock,
  EmailInlineLinkBlock,
  EmailButtonBlock,
  EmailTwoButtonBlock,
  EmailImageBlock,
  EmailVideoBlock,
  EmailGalleryBlock,
  EmailListBlock,
  EmailMarkdownBlock,
  EmailDividerBlock,
  EmailSpacerBlock,
  EmailCalloutBlock,
]

export const EmailGridBlock: Block = {
  slug: 'emailGrid',
  admin: {
    group: 'Email',
  },
  fields: [
    {
      name: 'layout',
      type: 'select',
      defaultValue: 'twoColumns',
      options: [
        { label: 'One column', value: 'oneColumn' },
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
      blocks: EMAIL_NESTED_LAYOUT_BLOCKS,
      admin: {
        initCollapsed: true,
      },
    },
    {
      name: 'centerBlocks',
      type: 'blocks',
      blocks: EMAIL_NESTED_LAYOUT_BLOCKS,
      admin: {
        initCollapsed: true,
      },
    },
    {
      name: 'rightBlocks',
      type: 'blocks',
      blocks: EMAIL_NESTED_LAYOUT_BLOCKS,
      admin: {
        initCollapsed: true,
      },
    },
    {
      name: 'fourthBlocks',
      type: 'blocks',
      blocks: EMAIL_NESTED_LAYOUT_BLOCKS,
      admin: {
        initCollapsed: true,
      },
    },
  ],
  interfaceName: 'EmailGridBlock',
  labels: {
    plural: 'Email Rows',
    singular: 'Email Row',
  },
}

export const EMAIL_LAYOUT_BLOCKS = [
  EmailHeaderSocialBlock,
  EmailHeadingBlock,
  EmailTextBlock,
  EmailInlineLinkBlock,
  EmailButtonBlock,
  EmailTwoButtonBlock,
  EmailImageBlock,
  EmailVideoBlock,
  EmailGalleryBlock,
  EmailGridBlock,
  EmailListBlock,
  EmailMarkdownBlock,
  EmailArticleImageRightBlock,
  EmailArticleTwoCardsBlock,
  EmailFeatureThreeCenteredBlock,
  EmailBentoGridBlock,
  EmailDividerBlock,
  EmailSpacerBlock,
  EmailCalloutBlock,
  EmailFooterOneColumnBlock,
]
