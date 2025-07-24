import type { CollectionConfig } from 'payload'
import { getTenantAccess } from '@payloadcms/plugin-multi-tenant/utilities'

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
    read: ({ req }) => {
      if (req.user?.roles?.includes('super')) {
        return true
      }

      const rawReferer = (req.headers as any)?.referer as string | string[] | undefined
      const referer = (Array.isArray(rawReferer) ? rawReferer[0] : rawReferer ?? '') as string
      if (referer.includes('/admin/collections/users')) {
        // allow users to see all tenants when editing a user profile
        return true
      }

      if (req.user) {
        return getTenantAccess({ fieldName: 'id', user: req.user })
      }

      return false
    },
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
