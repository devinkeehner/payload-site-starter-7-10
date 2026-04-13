import type { CollectionConfig } from 'payload'

import { authenticated } from '@/lib/access/authenticated'
import { isSuperUser } from '@/lib/access/isSuperUser'
import { defaultGraphicScene } from '@/lib/graphics/defaultScene'

export const GraphicTemplates: CollectionConfig = {
  slug: 'graphic-templates',
  labels: {
    singular: 'Graphic Template',
    plural: 'Graphic Templates',
  },
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'updatedAt'],
    description: 'Reusable graphics templates shared across all tenants.',
    hidden: ({ user }) => !isSuperUser(user),
  },
  access: {
    create: ({ req }) => isSuperUser(req.user),
    delete: ({ req }) => isSuperUser(req.user),
    read: authenticated,
    update: ({ req }) => isSuperUser(req.user),
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
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
      name: 'backgroundImage',
      label: 'Background Image',
      type: 'upload',
      relationTo: 'media',
      required: false,
    },
    {
      name: 'scene',
      type: 'json',
      required: true,
      defaultValue: defaultGraphicScene,
    },
    {
      name: 'notes',
      type: 'textarea',
      required: false,
    },
  ],
}

export default GraphicTemplates
