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
      type: 'collapsible',
      label: 'Advanced fields',
      admin: {
        initCollapsed: true,
      },
      fields: [
        {
          type: 'group',
          name: 'display',
          label: false,
          admin: {
            description:
              'Control the image width and position. When this block is inserted inside rich text, half- and one-third-width images let the following text wrap around them on larger screens.',
            hideGutter: true,
          },
          fields: [
            {
              name: 'linkURL',
              type: 'text',
              label: 'Make image clickable (optional)',
              admin: {
                description:
                  'Enter a full URL (https://...) or a site path (for example, /donate).',
              },
            },
            {
              name: 'width',
              type: 'radio',
              defaultValue: 'natural',
              label: 'Image width',
              options: [
                { label: 'Original size', value: 'natural' },
                { label: 'Full width', value: 'full' },
                { label: 'Half', value: 'half' },
                { label: 'One third', value: 'oneThird' },
              ],
              admin: {
                description:
                  'Half and one third stack at full width on small screens for readability.',
                layout: 'horizontal',
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
                description: 'Choose which side of the content container the image sits on.',
                layout: 'horizontal',
              },
            },
          ],
        },
      ],
    },
  ],
}
