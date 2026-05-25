import type { CollectionConfig } from 'payload'

import { authenticated } from '@/lib/access/authenticated'
import { isSuperUser } from '@/lib/access/isSuperUser'

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
    hidden: ({ user }) => !isSuperUser(user),
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
        {
          label: 'Alpha Tester',
          value: 'alphaTester',
        },
      ],
      defaultValue: [],
      admin: { position: 'sidebar' },
      saveToJWT: true,
    },
  ],
  timestamps: true,
}
