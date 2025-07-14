import type { CollectionConfig } from 'payload'

import { authenticated } from '@/lib/access/authenticated'

export const Users: CollectionConfig = {
  slug: 'users',
  access: {
    admin: authenticated,
    create: authenticated,
    delete: authenticated,
    read: authenticated,
    update: authenticated,
  },
  admin: {
    group: 'Admin',
    defaultColumns: ['name', 'email'],
    useAsTitle: 'name',
  },
  auth: true,
  fields: [
    {
      name: 'name',
      type: 'text',
    },

    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      options: [
        {
          label: 'Super Admin',
          value: 'super',
        },
      ],
      defaultValue: [],
      admin: { position: 'sidebar' },
    },
  ],
  timestamps: true,
}
