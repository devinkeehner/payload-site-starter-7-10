import type { Block, Field } from 'payload'

import {
  FixedToolbarFeature,
  HeadingFeature,
  InlineToolbarFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'

const campaignRichTextEditor = lexicalEditor({
  features: ({ rootFeatures }) => [
    ...rootFeatures,
    HeadingFeature({ enabledHeadingSizes: ['h1', 'h2', 'h3', 'h4'] }),
    FixedToolbarFeature(),
    InlineToolbarFeature(),
  ],
})

const mediaSourceOptions = [
  { label: 'Link', value: 'link' },
  { label: 'Upload', value: 'upload' },
]

const createRichTextField = (name: string, label: string, required = false): Field => ({
  name,
  label,
  type: 'richText',
  required,
  editor: campaignRichTextEditor,
})

const createImageAssetGroup = (
  name: string,
  label: string,
  defaultExternalURL?: string,
  description?: string,
): Field => ({
  name,
  label,
  type: 'group',
  fields: [
    {
      name: 'source',
      type: 'select',
      required: true,
      defaultValue: 'link',
      options: mediaSourceOptions,
      admin: {
        description: description || 'Use a direct URL or upload a file from the Media library.',
      },
    },
    {
      name: 'media',
      type: 'upload',
      relationTo: 'media',
      admin: {
        condition: (_data, siblingData) => siblingData?.source !== 'link',
      },
    },
    {
      name: 'externalURL',
      label: 'Source URL',
      type: 'text',
      defaultValue: defaultExternalURL,
      admin: {
        condition: (_data, siblingData) => siblingData?.source === 'link',
        description: 'Paste a direct image URL. Prefer a branded source when using a placeholder.',
      },
    },
    {
      name: 'alt',
      label: 'Alt Text',
      type: 'text',
      required: true,
    },
  ],
})

const createVideoAssetGroup = (
  name: string,
  label: string,
  defaultPosterExternalURL?: string,
  description?: string,
): Field => ({
  name,
  label,
  type: 'group',
  fields: [
    {
      name: 'source',
      type: 'select',
      required: true,
      defaultValue: 'link',
      options: mediaSourceOptions,
      admin: {
        description: description || 'Use a direct video URL or upload a video file from the Media library.',
      },
    },
    {
      name: 'media',
      type: 'upload',
      relationTo: 'media',
      admin: {
        condition: (_data, siblingData) => siblingData?.source !== 'link',
      },
    },
    {
      name: 'externalURL',
      label: 'Video URL',
      type: 'text',
      admin: {
        condition: (_data, siblingData) => siblingData?.source === 'link',
        description: 'Use a direct video URL or a YouTube/Vimeo link.',
      },
    },
    {
      name: 'posterSource',
      label: 'Poster Source',
      type: 'select',
      required: true,
      defaultValue: 'link',
      options: mediaSourceOptions,
    },
    {
      name: 'posterMedia',
      label: 'Poster Image',
      type: 'upload',
      relationTo: 'media',
      admin: {
        condition: (_data, siblingData) => siblingData?.posterSource !== 'link',
      },
    },
    {
      name: 'posterExternalURL',
      label: 'Poster URL',
      type: 'text',
      defaultValue: defaultPosterExternalURL,
      admin: {
        condition: (_data, siblingData) => siblingData?.posterSource === 'link',
        description: 'Use a direct image URL for the preview/poster frame.',
      },
    },
    {
      name: 'posterAlt',
      label: 'Poster Alt Text',
      type: 'text',
      required: true,
    },
    {
      name: 'title',
      label: 'Video Title',
      type: 'text',
      required: true,
    },
  ],
})

const iconOptions = [
  { label: 'Dollar Sign', value: 'DollarSign' },
  { label: 'Receipt', value: 'Receipt' },
  { label: 'Zap', value: 'Zap' },
  { label: 'Heart', value: 'Heart' },
  { label: 'Home', value: 'Home' },
  { label: 'Building', value: 'Building2' },
  { label: 'Shield', value: 'Shield' },
  { label: 'Vote', value: 'Vote' },
  { label: 'Users', value: 'Users' },
  { label: 'Landmark', value: 'Landmark' },
  { label: 'File Check', value: 'FileCheck' },
  { label: 'Scale', value: 'Scale' },
]

const createBulletArrayFields = (description: string): Field[] => [
  {
    name: 'icon',
    type: 'select',
    defaultValue: 'DollarSign',
    options: iconOptions,
  },
  {
    name: 'title',
    type: 'text',
    required: true,
  },
  {
    name: 'detail',
    type: 'richText',
    editor: campaignRichTextEditor,
    admin: {
      description,
    },
  },
]

export const BudgetPlanFeatureConfig: Block = {
  slug: 'budgetPlanFeature',
  interfaceName: 'BudgetPlanFeatureBlock',
  labels: {
    singular: 'Budget Plan Feature',
    plural: 'Budget Plan Features',
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Hero',
          fields: [
            createImageAssetGroup(
              'budgetLogo',
              'Budget Plan Logo',
              'https://realitycheckct.com/ct_house_gop_logo.webp',
              'Use the branded logo source link or upload a local asset.',
            ),
            createRichTextField('heroTitle', 'Hero Title'),
            createRichTextField('heroIntro', 'Hero Intro'),
          ],
        },
        {
          label: 'Press',
          fields: [
            createImageAssetGroup(
              'groupPhoto',
              'Group Photo from Presser',
              'https://media.cthousegop.com/Candelora_5833-1920x1244.jpg',
              'Use a real press photo source link or upload a local asset.',
            ),
            createRichTextField('newsReleaseTitle', 'News Release Title'),
            createRichTextField('newsReleaseBody', 'News Release Body'),
            {
              name: 'newsReleaseLinkLabel',
              label: 'News Release Link Label',
              type: 'text',
              defaultValue: 'Read the full release',
            },
            {
              name: 'newsReleaseLinkURL',
              label: 'News Release Link URL',
              type: 'text',
              admin: {
                description: 'Optional direct link to the release or PDF.',
              },
            },
            createVideoAssetGroup(
              'presserVideo',
              'Video from Presser',
              'https://media.cthousegop.com/Candelora_5833-1920x1244.jpg',
              'Use a real press photo or poster frame source link.',
            ),
          ],
        },
        {
          label: 'Budget',
          fields: [
            createRichTextField('fastFactsTitle', 'Fast Facts Title'),
            createRichTextField('fastFactsIntro', 'Fast Facts Intro'),
            {
              name: 'fastFacts',
              label: 'Fast Facts',
              type: 'array',
              fields: createBulletArrayFields('Use short supporting copy with inline links when needed.'),
            },
            createRichTextField('affordabilityTitle', 'Key Affordability Measures Title'),
            createRichTextField('affordabilityIntro', 'Key Affordability Measures Intro'),
            {
              name: 'affordabilityItems',
              label: 'Key Affordability Measures',
              type: 'array',
              fields: createBulletArrayFields('Use this for the affordability section above the save/invest boxes.'),
            },
            createRichTextField('whereWeSaveTitle', 'Where We Save Title'),
            createRichTextField('whereWeSaveIntro', 'Where We Save Intro'),
            {
              name: 'whereWeSaveItems',
              label: 'Where We Save Items',
              type: 'array',
              fields: createBulletArrayFields('Keep each saving item concise and scannable.'),
            },
            createRichTextField('whereWeInvestTitle', 'Where We Invest Title'),
            createRichTextField('whereWeInvestIntro', 'Where We Invest Intro'),
            {
              name: 'whereWeInvestItems',
              label: 'Where We Invest Items',
              type: 'array',
              fields: createBulletArrayFields('Use this for the investment side of the budget story.'),
            },
          ],
        },
        {
          label: 'Relief Fund',
          fields: [
            createImageAssetGroup(
              'secondaryLogo',
              'Secondary Logo',
              'https://realitycheckct.com/ct_house_gop_logo.webp',
              'Use a smaller branded logo source link or upload a local asset.',
            ),
            createRichTextField('reliefTitle', 'Relief Fund Title'),
            createRichTextField('reliefIntro', 'Relief Fund Intro'),
            createRichTextField('townChartTitle', 'Town Chart Title'),
            createRichTextField('townChartIntro', 'Town Chart Intro'),
            {
              name: 'townSearchPlaceholder',
              label: 'Town Search Placeholder',
              type: 'text',
              defaultValue: 'Start typing a town',
            },
            {
              name: 'districtFilterLabel',
              label: 'District Filter Label',
              type: 'text',
              defaultValue: 'Select a district',
            },
            {
              name: 'sortLabel',
              label: 'Sort Label',
              type: 'text',
              defaultValue: 'Sort towns',
            },
            {
              name: 'townRows',
              label: 'Town Rows',
              type: 'array',
              fields: [
                {
                  name: 'town',
                  type: 'text',
                  required: true,
                },
                {
                  name: 'districts',
                  label: 'Districts',
                  type: 'array',
                  minRows: 1,
                  fields: [
                    {
                      name: 'district',
                      type: 'text',
                      required: true,
                    },
                  ],
                },
                {
                  name: 'amount',
                  label: 'Amount',
                  type: 'number',
                  required: true,
                  min: 0,
                },
                {
                  name: 'amountLabel',
                  label: 'Amount Label',
                  type: 'text',
                  admin: {
                    description: 'Optional formatted label if the amount needs custom display text.',
                  },
                },
                {
                  name: 'notes',
                  type: 'richText',
                  editor: campaignRichTextEditor,
                  admin: {
                    description: 'Optional supporting note for the town row.',
                  },
                },
                {
                  name: 'featured',
                  type: 'checkbox',
                  defaultValue: false,
                },
              ],
            },
            {
              name: 'emptyStateTitle',
              label: 'Empty State Title',
              type: 'text',
              defaultValue: 'Add town data to see the relief breakdown',
            },
            {
              name: 'emptyStateBody',
              label: 'Empty State Body',
              type: 'richText',
              editor: campaignRichTextEditor,
            },
          ],
        },
        {
          label: 'Support',
          fields: [
            createRichTextField('supportTitle', 'Support Title'),
            createRichTextField('supportIntro', 'Support Intro'),
            {
              name: 'supportForm',
              label: 'Support Form',
              type: 'relationship',
              relationTo: 'forms',
              filterOptions: ({ req }) => {
                const t = (req as { tenant?: unknown })?.tenant
                const tenantID = typeof t === 'string' ? t : (t as { id?: string | null } | null)?.id
                return tenantID ? { tenant: { equals: tenantID } } : true
              },
            },
            {
              name: 'supportSubmitLabel',
              label: 'Support Submit Label',
              type: 'text',
              defaultValue: 'Sign up for updates',
            },
          ],
        },
      ],
    },
  ],
}
