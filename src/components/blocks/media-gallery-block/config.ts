import type { Block } from 'payload'

// Media Gallery Block
// Allows editors to upload and order multiple images within page content.
// Renders as an array of Media items (relation to `media` collection).
export const MediaGalleryBlockConfig: Block = {
  slug: 'mediaGallery',
  interfaceName: 'MediaGalleryBlock',
  labels: {
    singular: 'Media Gallery',
    plural: 'Media Galleries',
  },
  fields: [
    {
      name: 'images',
      type: 'array',
      minRows: 1,
      fields: [
        {
          name: 'media',
          type: 'upload',
          relationTo: 'media',
          required: true,
        },
        {
          name: 'caption',
          type: 'text',
        },
      ],
    },
  ],
}
