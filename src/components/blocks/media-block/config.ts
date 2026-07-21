import type { Block } from 'payload'

export const MediaBlockConfig: Block = {
  slug: 'mediaBlock',
  interfaceName: 'MediaBlock',
  fields: [
    {
      name: 'media',
      label: 'Image',
      type: 'upload',
      relationTo: 'media',
      required: true,
      admin: {
        description: 'Choose the image to display in this Media Block.',
      },
    },
    {
      type: 'group',
      name: 'display',
      label: 'Image display',
      admin: {
        description:
          'Use these options to make the image clickable and position its natural-width display on the left or right.',
      },
      fields: [
        {
          name: 'linkURL',
          type: 'text',
          label: 'Make image clickable (optional)',
          admin: {
            description: 'Enter a full URL (https://...) or a site path (for example, /donate).',
          },
        },
        {
          name: 'alignment',
          type: 'radio',
          defaultValue: 'left',
          label: 'Position image',
          options: [
            { label: 'Left', value: 'left' },
            { label: 'Right', value: 'right' },
          ],
          admin: {
            description:
              'The image keeps its natural width instead of expanding to the full content width.',
            layout: 'horizontal',
          },
        },
      ],
    },
  ],
}
