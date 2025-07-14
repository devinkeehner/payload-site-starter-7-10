import type { CollectionConfig } from 'payload'

export const Authors: CollectionConfig<'authors'> = {
  slug: 'authors',
  admin: {
    group: 'Content',
    useAsTitle: 'login',
    defaultColumns: ['login', 'name'],
  },
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  fields: [
    {
      name: 'login',
      type: 'text',
      required: true,
      unique: true,
    },
    {
      name: 'name',
      type: 'text',
    },
  ],
}
