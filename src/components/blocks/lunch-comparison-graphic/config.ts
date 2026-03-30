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
      name: 'media',
      label: 'Foreground Image',
      type: 'upload',
      relationTo: 'media',
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
  ],
}
