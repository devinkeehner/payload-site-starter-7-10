import type { CollectionConfig } from 'payload'

export const SiteSEO: CollectionConfig = {
  labels: {
    singular: 'Site SEO',
    plural: 'Site SEO',
  },
  slug: 'site-seo',
  admin: {
    group: 'Site Settings',
    useAsTitle: 'title',
    defaultColumns: ['title', 'updatedAt'],
    description: 'SEO metadata for the site home page',
    hidden: ({ user }) => !user?.roles?.includes('super'),
  },
  access: {
    read: () => true,
  },
  hooks: {
    beforeChange: [({ req, operation, originalDoc, data }) => {
      // enforce singleton per site: block creating additional docs
      if (operation === 'create') {
        // @ts-ignore
        const tenant = data?.tenant || req.tenant?.id || req.user?.tenants?.[0]
        return req.payload.find({ collection: 'site-seo', where: { tenant: { equals: tenant } } }).then((existing) => {
          if (existing.docs.length > 0) {
            throw new Error('Site SEO document already exists for this site')
          }
          return data
        })
      }
      return data
    }],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      label: 'Meta Title',
      admin: {
        description: '50–60 characters recommended',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      required: true,
      label: 'Meta Description',
      admin: {
        description: '100–150 characters recommended',
      },
    },
    {
      name: 'metaImage',
      label: 'Meta Image',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'tags',
      label: 'Tags',
      type: 'relationship',
      relationTo: 'tags',
      hasMany: true,
    },
  ],
}
