import type { CollectionConfig } from 'payload'
import { isSuperUser } from '@/lib/access/isSuperUser'

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
    hidden: ({ user }) => !isSuperUser(user),
  },
  access: {
    read: () => true,
  },
  hooks: {
    beforeChange: [({ req, operation, originalDoc: _originalDoc, data }) => {
      // enforce singleton per site: block creating additional docs
      if (operation === 'create') {
        // @ts-expect-error tenant may be present on request in multi-tenant plugin context
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
    {
      name: 'siteJsonLd',
      label: 'Site JSON-LD',
      type: 'textarea',
      admin: {
        description: 'Paste the structured data JSON-LD without <script> tags.',
      },
    },
    {
      name: 'metaPixelHeader',
      label: 'Meta Pixel Header Script',
      type: 'textarea',
      admin: {
        description: 'Paste the Meta Pixel <script> block. Script tags are optional.',
      },
    },
    {
      name: 'metaPixelNoscript',
      label: 'Meta Pixel Body (noscript)',
      type: 'textarea',
      admin: {
        description: 'Paste the Meta Pixel <noscript> block to render inside the <body>.',
      },
    },
  ],
}
