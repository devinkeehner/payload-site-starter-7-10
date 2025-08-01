import type { CollectionConfig } from 'payload'

export const Tenants: CollectionConfig = {
  slug: 'tenants',
  labels: {
    singular: 'Tenant',
    plural: 'Tenants',
  },
  admin: {
    useAsTitle: 'name',
    group: 'Admin',
  },
  access: {
    read: () => true,
    create: ({ req }) => !!req.user?.roles?.includes('super'),
    update: ({ req }) => !!req.user?.roles?.includes('super'),
    delete: ({ req }) => !!req.user?.roles?.includes('super'), // only super admins can delete
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
    },
    {
      name: 'archived',
      label: 'Archived',
      type: 'checkbox',
      defaultValue: false,
      admin: { position: 'sidebar' },
    },
    // add more tenant-level metadata here (e.g., domain, theme)
  ],
}

export default Tenants;
