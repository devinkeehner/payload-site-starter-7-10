import type { Block } from 'payload'

export const SolutionTimelineGraphicBlockConfig: Block = {
  slug: 'solutionTimelineGraphic',
  interfaceName: 'SolutionTimelineGraphicBlock',
  labels: {
    singular: 'Solution Timeline Graphic',
    plural: 'Solution Timeline Graphics',
  },
  fields: [
    {
      name: 'headline',
      type: 'text',
      required: true,
      defaultValue: 'PERMANENT SOLUTIONS',
    },
    {
      name: 'items',
      type: 'array',
      minRows: 4,
      maxRows: 4,
      defaultValue: [
        {
          outlet: 'wshu | Public Radio',
          quote: 'House GOP budget: Boost K-12, cut care for undocumented',
          date: 'April 26, 2024',
          position: 'topLeft',
        },
        {
          outlet: 'ct mirror',
          quote: 'Plan would trim electric rates, bolster schools, freeze wages and cut care for undocumented residents',
          date: 'May 1, 2025',
          position: 'topRight',
        },
        {
          outlet: 'NEWS8 wtnh.com',
          quote: 'House GOP “aiming for $1.16 billion in total tax cuts.”',
          date: 'May 2, 2023',
          position: 'bottomLeft',
        },
        {
          outlet: 'Inside Investigator',
          quote: '“Roughly $60 million in new proposed spending for special education.”',
          date: 'April 25, 2024',
          position: 'bottomRight',
        },
      ],
      fields: [
        {
          name: 'outlet',
          type: 'text',
          required: true,
        },
        {
          name: 'quote',
          type: 'textarea',
          required: true,
        },
        {
          name: 'date',
          type: 'text',
          required: true,
        },
        {
          name: 'position',
          type: 'select',
          required: true,
          options: [
            { label: 'Top Left', value: 'topLeft' },
            { label: 'Top Right', value: 'topRight' },
            { label: 'Bottom Left', value: 'bottomLeft' },
            { label: 'Bottom Right', value: 'bottomRight' },
          ],
        },
      ],
    },
  ],
}
