import type { CollectionConfig } from 'payload'

import { authenticated } from '@/lib/access/authenticated'
import { anyone } from '@/lib/access/anyone'

export const MediaCanvas: CollectionConfig = {
  labels: {
    singular: 'Media Canvas',
    plural: 'Media Canvas',
  },
  slug: 'media-canvas',
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'updatedAt'],
  },
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      label: 'Title',
      required: true,
    },
    {
      name: 'image',
      label: 'Image',
      type: 'upload',
      relationTo: 'media',
      required: true,
      admin: {
        description: 'Upload or select an image to compose into a 1200×630 canvas',
      },
    },
    {
      name: 'heading',
      type: 'text',
      label: 'Heading',
    },
    {
      name: 'subheading',
      type: 'text',
      label: 'Subheading',
    },
    // Hidden state fields persisted for the editor
    {
      name: 'posX',
      type: 'number',
      label: 'Position X',
      defaultValue: 0,
      admin: { hidden: true },
    },
    {
      name: 'posY',
      type: 'number',
      label: 'Position Y',
      defaultValue: 0,
      admin: { hidden: true },
    },
    {
      name: 'scale',
      type: 'number',
      label: 'Scale',
      defaultValue: 1,
      admin: { hidden: true },
    },
    // UI Canvas Editor
    {
      name: 'editor',
      type: 'ui',
      label: 'Canvas Editor (1200×630)',
      admin: {
        components: {
          Field: {
            path: '@/components/admin/MediaCanvasField#MediaCanvasField',
          },
        },
      },
    },
  ],
}

export default MediaCanvas
