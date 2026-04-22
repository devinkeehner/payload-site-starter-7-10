import type { Block, Field, TextFieldSingleValidation, TextareaFieldValidation } from 'payload'

import { link } from '@/collections/fields/link'

const validateBubbleText: TextFieldSingleValidation = (value, options) => {
  const siblingData = options?.siblingData as Record<string, unknown> | undefined
  const hasText = typeof value === 'string' && value.trim().length > 0
  const hasImage = Boolean(siblingData?.image)

  if (!hasText && !hasImage) {
    return 'Provide bubble text or a bubble image.'
  }

  return true
}

const validateColumnEntryDescription: TextareaFieldValidation = (value, options) => {
  const siblingData = options?.siblingData as Record<string, unknown> | undefined
  const isSubheading = siblingData?.entryType === 'subheading'

  if (isSubheading) return true

  return typeof value === 'string' && value.trim().length > 0 ? true : 'Description is required for card entries.'
}

const bubbleFields: Field[] = [
  {
    name: 'text',
    label: 'Bubble Text',
    type: 'text',
    required: false,
    validate: validateBubbleText,
  },
  {
    name: 'image',
    label: 'Bubble Image',
    type: 'upload',
    relationTo: 'media',
    admin: {
      description: 'Optional. If set, this image is rendered instead of text.',
    },
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
    name: 'useAutoPosition',
    label: 'Use Auto Position',
    type: 'checkbox',
    defaultValue: true,
  },
  {
    name: 'x',
    label: 'Desktop X position (%)',
    type: 'number',
    min: 0,
    max: 100,
    admin: {
      condition: (_data, siblingData) => siblingData?.useAutoPosition !== true,
    },
  },
  {
    name: 'y',
    label: 'Desktop Y position (px)',
    type: 'number',
    min: 0,
    admin: {
      condition: (_data, siblingData) => siblingData?.useAutoPosition !== true,
    },
  },
  {
    name: 'floatDelay',
    label: 'Float Delay (seconds)',
    type: 'number',
    defaultValue: 0,
    min: 0,
    max: 4,
  },
  link({
    appearances: false,
    disableLabel: true,
  }),
]

const columnEntryFields: Field[] = [
  {
    name: 'entryType',
    type: 'select',
    defaultValue: 'card',
    required: true,
    options: [
      { label: 'Card', value: 'card' },
      { label: 'Subheading', value: 'subheading' },
    ],
  },
  {
    name: 'title',
    type: 'text',
    required: true,
  },
  {
    name: 'description',
    type: 'textarea',
    required: false,
    validate: validateColumnEntryDescription,
    admin: {
      condition: (_data, siblingData) => siblingData?.entryType !== 'subheading',
    },
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
    admin: {
      condition: (_data, siblingData) => siblingData?.entryType !== 'subheading',
    },
  },
  {
    name: 'anchorId',
    label: 'Anchor ID (for in-page links)',
    type: 'text',
  },
  {
    name: 'stageOrder',
    label: 'Stage Order',
    type: 'number',
    admin: {
      description: 'Optional order for scroll stages. Lower numbers appear first.',
    },
  },
  {
    name: 'stageTitle',
    label: 'Stage Title',
    type: 'text',
    admin: {
      description: 'Optional heading shown above this card in scroll mode.',
    },
  },
  link({
    appearances: false,
    overrides: {
      admin: {
        condition: (_data, siblingData) => siblingData?.entryType !== 'subheading',
      },
    },
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
      name: 'leftLabelImage',
      label: 'Left Label Image',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description: 'Optional. If set, this image is used instead of the left label text pill.',
      },
    },
    {
      name: 'rightLabel',
      type: 'text',
      defaultValue: 'Accountability',
    },
    {
      name: 'rightLabelImage',
      label: 'Right Label Image',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description: 'Optional. If set, this image is used instead of the right label text pill.',
      },
    },
    {
      name: 'backgroundImage',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'layoutMode',
      type: 'select',
      defaultValue: 'scroll',
      options: [
        { label: 'Scroll (Viewport Sticky)', value: 'scroll' },
        { label: 'Static', value: 'static' },
      ],
    },
    {
      name: 'interactionMode',
      type: 'select',
      defaultValue: 'continuous',
      options: [
        { label: 'Continuous (Voices Parity)', value: 'continuous' },
        { label: 'Stage Swap', value: 'stage' },
      ],
      admin: {
        description: 'Choose between continuous card flow and stage-by-stage swapping.',
        condition: (_data, siblingData) => siblingData?.layoutMode !== 'static',
      },
    },
    {
      name: 'cardStyleMode',
      type: 'select',
      defaultValue: 'glass',
      options: [
        { label: 'Glass (Transparent)', value: 'glass' },
        { label: 'Solid', value: 'solid' },
      ],
    },
    {
      name: 'bubblePlacementMode',
      type: 'select',
      defaultValue: 'hybrid',
      options: [
        { label: 'Auto', value: 'auto' },
        { label: 'Hybrid (Auto + manual overrides)', value: 'hybrid' },
        { label: 'Manual', value: 'manual' },
      ],
      admin: {
        description: 'Auto assigns speech bubble positions if x/y are not set.',
      },
    },
    {
      name: 'enableBubbleFloat',
      type: 'checkbox',
      defaultValue: true,
    },
    {
      name: 'enableMobileSwipeFilter',
      type: 'checkbox',
      defaultValue: true,
    },
    {
      name: 'highlightDurationMs',
      type: 'number',
      defaultValue: 4000,
      min: 1000,
      max: 10000,
      admin: {
        description: 'How long bubble-triggered card highlighting lasts.',
      },
    },
    {
      name: 'scrollStageHeightVh',
      type: 'number',
      defaultValue: 100,
      min: 60,
      max: 180,
      admin: {
        description: 'Height of each scroll stage in viewport units.',
        condition: (_data, siblingData) => siblingData?.layoutMode !== 'static',
      },
    },
    {
      name: 'enableParallax',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        condition: (_data, siblingData) => siblingData?.layoutMode !== 'static',
      },
    },
    {
      name: 'parallaxStrength',
      type: 'number',
      defaultValue: 0.08,
      min: 0,
      max: 0.2,
      admin: {
        description: 'Background parallax strength from 0 to 0.2.',
        condition: (_data, siblingData) => siblingData?.layoutMode !== 'static' && siblingData?.enableParallax,
      },
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
      name: 'supportDockEnabled',
      label: 'Enable Support Dock',
      type: 'checkbox',
      defaultValue: true,
    },
    {
      name: 'supportForm',
      label: 'Support Form',
      type: 'relationship',
      relationTo: 'forms',
      admin: {
        description: 'Form used by the bottom sticky support tab/sheet.',
        condition: (_data, siblingData) => siblingData?.supportDockEnabled !== false,
      },
    },
    {
      name: 'supportDockTabLabel',
      label: 'Support Dock Tab Label',
      type: 'text',
      defaultValue: 'Help Promote These Policies',
      admin: {
        condition: (_data, siblingData) => siblingData?.supportDockEnabled !== false,
      },
    },
    {
      name: 'supportDockTitle',
      label: 'Support Dock Panel Title',
      type: 'text',
      defaultValue: 'Join the Support Team',
      admin: {
        condition: (_data, siblingData) => siblingData?.supportDockEnabled !== false,
      },
    },
    {
      name: 'supportDockDescription',
      label: 'Support Dock Panel Description',
      type: 'textarea',
      defaultValue: 'Share your contact info and how you want to help promote these policy priorities.',
      admin: {
        condition: (_data, siblingData) => siblingData?.supportDockEnabled !== false,
      },
    },
    {
      name: 'supportDockSubmitLabel',
      label: 'Support Submit Button Label',
      type: 'text',
      defaultValue: 'Submit Supporter Info',
      admin: {
        condition: (_data, siblingData) => siblingData?.supportDockEnabled !== false,
      },
    },
    {
      name: 'supportDockSuccessTitle',
      label: 'Support Success Title',
      type: 'text',
      defaultValue: 'Submission received',
      admin: {
        condition: (_data, siblingData) => siblingData?.supportDockEnabled !== false,
      },
    },
    {
      name: 'supportDockSuccessDescription',
      label: 'Support Success Description',
      type: 'textarea',
      defaultValue: 'Thanks for offering to help. Our team will follow up soon.',
      admin: {
        condition: (_data, siblingData) => siblingData?.supportDockEnabled !== false,
      },
    },
    {
      name: 'speechBubbles',
      type: 'array',
      admin: {
        initCollapsed: true,
      },
      fields: bubbleFields,
    },
    {
      name: 'affordabilityEntries',
      label: 'Affordability Entries',
      type: 'array',
      admin: {
        initCollapsed: true,
      },
      fields: columnEntryFields,
    },
    {
      name: 'accountabilityEntries',
      label: 'Accountability Entries',
      type: 'array',
      admin: {
        initCollapsed: true,
      },
      fields: columnEntryFields,
    },
    {
      name: 'cards',
      label: 'Legacy Mixed Cards (Deprecated)',
      type: 'array',
      admin: {
        initCollapsed: true,
        description: 'Deprecated. Existing content is still read, but use the separate column arrays above.',
      },
      fields: [
        ...columnEntryFields,
        {
          name: 'side',
          type: 'select',
          required: true,
          options: [
            { label: 'Affordability', value: 'affordability' },
            { label: 'Accountability', value: 'accountability' },
          ],
        },
      ],
    },
  ],
}
