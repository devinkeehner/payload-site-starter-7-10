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
    create: () => true,  // allow admin to add new tenants
    update: () => true,  // allow editing tenant metadata later
    delete: () => false, // still prevent accidental deletion
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
    // add more tenant-level metadata here (e.g., domain, theme)
  ],
}

export default Tenants;
