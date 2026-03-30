import type { Block } from 'payload'

export const LunchComparisonGraphicBlockConfig: Block = {
  slug: 'lunchComparisonGraphic',
  interfaceName: 'LunchComparisonGraphicBlock',
  labels: {
    singular: 'Lunch Comparison Graphic',
    plural: 'Lunch Comparison Graphics',
  },
  fields: [
    {
      name: 'source',
      type: 'radio',
      defaultValue: 'upload',
      options: [
        { label: 'Upload', value: 'upload' },
        { label: 'Link', value: 'link' },
      ],
      admin: {
        layout: 'horizontal',
      },
    },
    {
      name: 'media',
      label: 'Foreground Image',
      type: 'upload',
      relationTo: 'media',
      admin: {
        condition: (_data, siblingData) => (siblingData?.source ?? 'upload') === 'upload',
      },
    },
    {
      name: 'externalURL',
      label: 'External Image/Video URL',
      type: 'text',
      admin: {
        condition: (_data, siblingData) => siblingData?.source === 'link',
      },
    },
    {
      name: 'headline',
      type: 'textarea',
      defaultValue: 'New York is eating our lunch.',
      required: true,
    },
    {
      name: 'subheadline',
      type: 'textarea',
      defaultValue: 'CT taxpayers are picking up the tab.',
    },
    {
      name: 'bottleLabel',
      type: 'text',
      defaultValue: 'Bottle Deposit Chaos',
    },
    {
      name: 'plateLabel',
      type: 'text',
      defaultValue: 'Natural Gas Expansion',
    },
    {
      name: 'sliceLabel',
      type: 'text',
      defaultValue: 'Remote Worker Convenience Tax',
    },
    {
      name: 'form',
      type: 'relationship',
      relationTo: 'forms',
      filterOptions: ({ req }) => {
        const t = (req as { tenant?: unknown })?.tenant
        const tenantID = typeof t === 'string' ? t : (t as { id?: string | null } | null)?.id
        return tenantID ? { tenant: { equals: tenantID } } : true
      },
    },
    {
      name: 'formHeading',
      type: 'text',
      defaultValue: 'Get updates directly from House Republicans',
      admin: {
        condition: (_data, siblingData) => Boolean(siblingData?.form),
      },
    },
    {
      name: 'formButtonText',
      type: 'text',
      defaultValue: 'Get Updates',
      admin: {
        condition: (_data, siblingData) => Boolean(siblingData?.form),
      },
    },
  ],
}
