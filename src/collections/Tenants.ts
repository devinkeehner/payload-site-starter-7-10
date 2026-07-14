import type { CollectionConfig } from 'payload'
import { isSuperUser } from '@/lib/access/isSuperUser'
import { rebuildSitemapsAfterTenantChange, rebuildSitemapsAfterTenantDelete } from '@/lib/hooks/rebuildSitemaps'

export const Tenants: CollectionConfig = {
  slug: 'tenants',
  labels: {
    singular: 'Site',
    plural: 'Sites',
  },
  admin: {
    useAsTitle: 'name',
    group: 'Admin',
  },
  access: {
    read: () => true,
    create: ({ req }) => isSuperUser(req.user),
    update: ({ req }) => isSuperUser(req.user),
    delete: ({ req }) => isSuperUser(req.user), // only super admins can delete
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
      name: 'defaultGraphicTemplate',
      label: 'Default Post Graphic Template',
      type: 'relationship',
      relationTo: 'graphic-templates',
      required: false,
      admin: {
        hidden: true,
      },
    },
    {
      name: 'archived',
      label: 'Archived',
      type: 'checkbox',
      defaultValue: false,
      admin: { position: 'sidebar' },
    },
    // add more site-level metadata here (e.g., domain, theme)
  ],
  hooks: {
    afterChange: [rebuildSitemapsAfterTenantChange],
    afterDelete: [rebuildSitemapsAfterTenantDelete],
  },
}

export default Tenants;
