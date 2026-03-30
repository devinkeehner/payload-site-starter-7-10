import type { Block } from 'payload'

export const TaxReliefHighlightGraphicBlockConfig: Block = {
  slug: 'taxReliefHighlightGraphic',
  interfaceName: 'TaxReliefHighlightGraphicBlock',
  labels: {
    singular: 'Tax Relief Highlight Graphic',
    plural: 'Tax Relief Highlight Graphics',
  },
  fields: [
    {
      name: 'amountLine',
      type: 'text',
      required: true,
      defaultValue: '$275 Million',
    },
    {
      name: 'subtitle',
      type: 'text',
      required: true,
      defaultValue: 'in permanent tax relief',
    },
    {
      name: 'highlights',
      type: 'array',
      minRows: 3,
      defaultValue: [
        { label: 'BROAD-BASED TAX CREDIT INCREASES' },
        { label: 'MAX. CREDIT OF $650 PER PERSON' },
        { label: 'MORE THAN DOUBLE THE CURRENT AMOUNT' },
      ],
      fields: [
        {
          name: 'label',
          type: 'text',
          required: true,
        },
      ],
    },
  ],
}
