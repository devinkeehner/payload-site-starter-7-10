import type { Block, Field } from 'payload'

import { link } from '@/collections/fields/link'

const bubbleFields: Field[] = [
  {
    name: 'text',
    type: 'text',
    required: true,
  },
  {
    name: 'side',
    type: 'select',
    required: true,
    options: [
      { label: 'Affordability', value: 'affordability' },
      { label: 'Accountability', value: 'accountability' },
    ],
  },
  {
    name: 'x',
    label: 'Desktop X position (%)',
    type: 'number',
    min: 0,
    max: 100,
    required: true,
  },
  {
    name: 'y',
    label: 'Desktop Y position (px)',
    type: 'number',
    min: 0,
    required: true,
  },
  link({
    appearances: false,
    disableLabel: true,
  }),
]

const cardFields: Field[] = [
  {
    name: 'title',
    type: 'text',
    required: true,
  },
  {
    name: 'description',
    type: 'textarea',
    required: true,
  },
  {
    name: 'side',
    type: 'select',
    required: true,
    options: [
      { label: 'Affordability', value: 'affordability' },
      { label: 'Accountability', value: 'accountability' },
    ],
  },
  {
    name: 'icon',
    type: 'select',
    options: [
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
    ],
  },
  {
    name: 'anchorId',
    label: 'Anchor ID (for in-page links)',
    type: 'text',
  },
  link({
    appearances: false,
  }),
]

export const PolicyVoicesBlockConfig: Block = {
  slug: 'policyVoices',
  interfaceName: 'PolicyVoicesBlock',
  labels: {
    singular: 'Policy Voices',
    plural: 'Policy Voices',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: false,
      defaultValue: 'Real Affordability & Accountability',
    },
    {
      name: 'titleImage',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'leftLabel',
      type: 'text',
      defaultValue: 'Affordability',
    },
    {
      name: 'rightLabel',
      type: 'text',
      defaultValue: 'Accountability',
    },
    {
      name: 'backgroundImage',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'ctaLabel',
      type: 'text',
      defaultValue: 'Learn More',
    },
    link({
      appearances: false,
      disableLabel: true,
      overrides: {
        name: 'ctaLink',
      },
    }),
    {
      name: 'speechBubbles',
      type: 'array',
      admin: {
        initCollapsed: true,
      },
      fields: bubbleFields,
    },
    {
      name: 'cards',
      type: 'array',
      admin: {
        initCollapsed: true,
      },
      fields: cardFields,
    },
  ],
}
