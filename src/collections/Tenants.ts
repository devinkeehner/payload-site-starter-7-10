import type { CollectionConfig } from 'payload'

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
    read: async ({ req }) => {
      const user: any = req.user
      if (!user) return false
      if (Array.isArray(user.roles) && user.roles.includes('super')) return true
      try {
        const full: any = await (req as any).payload.findByID({
          collection: 'users',
          id: user.id,
          depth: 0,
        })
        const rows = Array.isArray(full?.tenants) ? full.tenants : []
        const ids = rows
          .map((row: any) => {
            if (typeof row === 'string') return row
            if (row && typeof row === 'object') {
              // common shapes: { tenant: <id>, id: <rowId> } or direct { id }
              if (typeof row.tenant === 'string') return row.tenant
              if (row.tenant && typeof row.tenant === 'object') return row.tenant.id
              return row.id // fallback
            }
            return undefined
          })
          .filter(Boolean)
        if (ids.length === 0) return false
        return { id: { in: ids } }
      } catch {
        return false
      }
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
    // add more site-level metadata here (e.g., domain, theme)
  ],
}

export default Tenants;
