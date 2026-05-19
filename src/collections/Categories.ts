import type { CollectionConfig } from 'payload'

import { anyone } from '@/lib/access/anyone'
import { slugField } from '@/collections/fields/slug'
import { isSuperUser } from '@/lib/access/isSuperUser'

export const Categories: CollectionConfig = {
  slug: 'categories',
  access: {
    create: ({ req }) => isSuperUser(req.user),
    delete: ({ req }) => isSuperUser(req.user),
    read: anyone,
    update: ({ req }) => isSuperUser(req.user),
  },
  admin: {
    group: 'Admin',
    hidden: ({ user }) => !isSuperUser(user),
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    ...slugField(),
  ],
}
