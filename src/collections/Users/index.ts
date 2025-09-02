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
  auth: {
    useAPIKey: true,
  },
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
      saveToJWT: true,
    },
    {
      name: 'tenants',
      type: 'relationship',
      relationTo: 'tenants',
      hasMany: true,
      admin: { position: 'sidebar' },
      // Persist assigned sites into JWT so filters apply immediately on login
      saveToJWT: true,
    },
  ],
  timestamps: true,
}
