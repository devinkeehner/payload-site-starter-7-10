import type { Block } from 'payload'

const defaultSections = [
  {
    title: 'Single AGI',
    rows: [
      { incomeRange: '$1 – $70,000', credit: '$650' },
      { incomeRange: '$70,001 – $80,000', credit: '$550' },
      { incomeRange: '$80,001 – $90,000', credit: '$460' },
      { incomeRange: '$90,001 – $100,000', credit: '$360' },
      { incomeRange: '$100,001 – $110,000', credit: '$260' },
      { incomeRange: '$110,001 – $120,000', credit: '$200' },
      { incomeRange: '$120,001 – $130,000', credit: '$200' },
      { incomeRange: '$130,001 and up', credit: '–' },
    ],
  },
  {
    title: 'Joint AGI',
    rows: [
      { incomeRange: '$1 – $100,000', credit: '$650' },
      { incomeRange: '$100,001 – $110,000', credit: '$550' },
      { incomeRange: '$110,001 – $120,000', credit: '$460' },
      { incomeRange: '$120,001 – $130,000', credit: '$360' },
      { incomeRange: '$130,001 – $140,000', credit: '$260' },
      { incomeRange: '$140,001 – $150,000', credit: '$200' },
      { incomeRange: '$150,001 – $200,000', credit: '$200' },
      { incomeRange: '$200,001 and up', credit: '–' },
    ],
  },
  {
    title: 'Married Separate AGI',
    rows: [
      { incomeRange: '$1 – $50,000', credit: '$650' },
      { incomeRange: '$50,001 – $55,000', credit: '$550' },
      { incomeRange: '$55,001 – $60,000', credit: '$460' },
      { incomeRange: '$60,001 – $65,000', credit: '$360' },
      { incomeRange: '$65,001 – $70,000', credit: '$260' },
      { incomeRange: '$70,001 – $75,000', credit: '$200' },
      { incomeRange: '$75,001 – $80,000', credit: '$200' },
      { incomeRange: '$80,001 and up', credit: '–' },
    ],
  },
  {
    title: 'Head of Household AGI',
    rows: [
      { incomeRange: '$1 – $80,000', credit: '$650' },
      { incomeRange: '$80,001 – $90,000', credit: '$550' },
      { incomeRange: '$90,001 – $100,000', credit: '$460' },
      { incomeRange: '$100,001 – $110,000', credit: '$360' },
      { incomeRange: '$110,001 – $120,000', credit: '$260' },
      { incomeRange: '$120,001 – $130,000', credit: '$200' },
      { incomeRange: '$130,001 – $140,000', credit: '$200' },
      { incomeRange: '$140,001 and up', credit: '–' },
    ],
  },
] as const

export const PropertyTaxCreditTableBlockConfig: Block = {
  slug: 'propertyTaxCreditTable',
  interfaceName: 'PropertyTaxCreditTableBlock',
  labels: {
    singular: 'Property Tax Credit Table',
    plural: 'Property Tax Credit Tables',
  },
  fields: [
    {
      name: 'eyebrow',
      type: 'text',
      defaultValue: 'Connecticut House Republicans | March 30, 2026',
    },
    {
      name: 'title',
      type: 'text',
      required: true,
      defaultValue: 'Connecticut State Property Tax Credit',
    },
    {
      name: 'subtitle',
      type: 'text',
      defaultValue: 'Proposed $650 Maximum',
    },
    {
      name: 'caption',
      type: 'text',
      defaultValue: 'House Republican Proposal – All figures in dollars ($)',
    },
    {
      name: 'sections',
      type: 'array',
      minRows: 4,
      defaultValue: defaultSections,
      fields: [
        {
          name: 'title',
          type: 'text',
          required: true,
        },
        {
          name: 'rows',
          type: 'array',
          required: true,
          fields: [
            {
              name: 'incomeRange',
              type: 'text',
              required: true,
            },
            {
              name: 'credit',
              type: 'text',
              required: true,
            },
          ],
        },
      ],
    },
    {
      name: 'footnote',
      type: 'text',
      defaultValue:
        'Eligible property: primary residence and/or owned or leased motor vehicle. Credit applied against state income tax; does not affect municipal revenue.',
    },
    {
      name: 'footerLeft',
      type: 'text',
      defaultValue: '@cthousegop',
    },
    {
      name: 'footerRight',
      type: 'text',
      defaultValue: 'cthousegop.com',
    },
  ],
}
