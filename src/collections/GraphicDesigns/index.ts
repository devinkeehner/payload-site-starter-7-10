import type { CollectionConfig } from 'payload'

import { authenticated } from '@/lib/access/authenticated'
import { defaultGraphicScene } from '@/lib/graphics/defaultScene'

export const GraphicDesigns: CollectionConfig = {
  slug: 'graphic-designs',
  labels: {
    singular: 'Graphic Design',
    plural: 'Graphic Designs',
  },
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'sourcePost', 'updatedAt'],
    description: 'Editable generated graphics linked to posts and reusable templates.',
  },
  access: {
    create: authenticated,
    delete: authenticated,
    read: authenticated,
    update: authenticated,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'template',
      type: 'relationship',
      relationTo: 'graphic-templates',
      required: false,
    },
    {
      name: 'sourceCollection',
      type: 'select',
      required: true,
      defaultValue: 'posts',
      options: [
        { label: 'Posts', value: 'posts' },
        { label: 'Pages', value: 'pages' },
      ],
    },
    {
      name: 'sourcePost',
      label: 'Source Post',
      type: 'relationship',
      relationTo: 'posts',
      required: false,
    },
    {
      name: 'primaryTenant',
      type: 'relationship',
      relationTo: 'tenants',
      required: false,
    },
    {
      name: 'secondaryTenant',
      type: 'relationship',
      relationTo: 'tenants',
      required: false,
    },
    {
      name: 'backgroundImage',
      label: 'Background Image',
      type: 'upload',
      relationTo: 'media',
      required: false,
    },
    {
      name: 'titleOverride',
      type: 'textarea',
      required: false,
    },
    {
      name: 'scene',
      type: 'json',
      required: true,
      defaultValue: defaultGraphicScene,
    },
    {
      name: 'exportedMedia',
      label: 'Exported Media',
      type: 'relationship',
      relationTo: 'media',
      required: false,
    },
    {
      name: 'notes',
      type: 'textarea',
      required: false,
    },
  ],
}

export default GraphicDesigns
