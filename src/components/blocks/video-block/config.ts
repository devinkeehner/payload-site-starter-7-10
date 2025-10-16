import type { Block } from 'payload'

export const VideoBlockConfig: Block = {
  slug: 'videoBlock',
  interfaceName: 'VideoBlock',
  fields: [
    {
      name: 'source',
      type: 'radio',
      options: [
        { label: 'Upload', value: 'upload' },
        { label: 'Link', value: 'link' },
      ],
      defaultValue: 'upload',
      admin: { layout: 'horizontal' },
    },
    {
      name: 'media',
      label: 'Image/Video',
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
  ],
}
