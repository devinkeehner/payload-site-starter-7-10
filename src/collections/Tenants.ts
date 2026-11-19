import { POST_GRAPHIC_TEMPLATE_FILTER } from '@/lib/graphics/templates'
import type { CollectionConfig } from 'payload'
import { isSuperUser } from '@/lib/access/isSuperUser'
import {
  rebuildSitemapsAfterTenantChange,
  rebuildSitemapsAfterTenantDelete,
} from '@/lib/hooks/rebuildSitemaps'
import { tenantPreviewEndpoint } from '@/lib/tenantPreviewEndpoint'
import { siteSettingsEditComponent } from '@/components/admin/site-settings/sections'

export const Tenants: CollectionConfig = {
  slug: 'tenants',
  labels: {
    singular: 'Site',
    plural: 'Sites',
  },
  admin: {
    useAsTitle: 'name',
    group: 'Admin',
    preview: (doc) => `/api/tenants/${doc.id}/preview`,
    components: { views: { edit: { default: { Component: siteSettingsEditComponent } } } },
  },
  endpoints: [{ path: '/:id/preview', method: 'get', handler: tenantPreviewEndpoint }],
  access: {
    read: () => true,
    create: ({ req }) => isSuperUser(req.user),
    update: ({ req }) => isSuperUser(req.user),
    delete: ({ req }) => isSuperUser(req.user), // only super admins can delete
  },
  fields: [
    {
      name: 'name',
      label: 'Internal site name',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      label: 'Routing slug',
      type: 'text',
      required: true,
    },
    {
      name: 'defaultGraphicTemplate',
      label: 'Default Post Graphic Template',
      type: 'relationship',
      relationTo: 'graphic-templates',
      filterOptions: POST_GRAPHIC_TEMPLATE_FILTER,
      required: false,
      admin: {
        hidden: true,
      },
    },
    {
      type: 'collapsible',
      label: 'Availability',
      fields: [
        {
          name: 'isPrivate',
          label: 'Private site',
          type: 'checkbox',
          defaultValue: false,
          index: true,
          admin: {
            description:
              'Hide the entire website from public visitors. Authorized editors and tenant preview links can still view it. Turn off when ready to launch.',
          },
        },
        {
          name: 'archived',
          label: 'Archived',
          type: 'checkbox',
          defaultValue: false,
        },
      ],
    },
    // add more site-level metadata here (e.g., domain, theme)
  ],
  hooks: {
    afterChange: [rebuildSitemapsAfterTenantChange],
    afterDelete: [rebuildSitemapsAfterTenantDelete],
  },
}

export default Tenants
