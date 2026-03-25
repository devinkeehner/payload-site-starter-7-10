import type { CollectionConfig } from 'payload'
import { generatePreviewPath } from '@/lib/utilities/generatePreviewPath'
import { rebuildSitemapsAfterPublishedChange, rebuildSitemapsAfterPublishedDelete } from '@/lib/hooks/rebuildSitemaps'

// Collection for legacy WordPress posts. These documents are site-enabled by the
// multi-tenant plugin, so a hidden `tenant` field will be injected automatically.
// All imported posts will initially belong to the Candelora site via the import script.
export const WordpressPosts: CollectionConfig<'wordpress-posts'> = {
  labels: {
    singular: 'Wordpress Archive',
    plural: 'Wordpress Archive',
  },
  slug: 'wordpress-posts',
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'status', 'publishedAt', 'updatedAt'],
    preview: (data, { req }) =>
      generatePreviewPath({
        slug: typeof data?.slug === 'string' ? data.slug : '',
        collection: 'wordpress-posts',
        req,
      }),
  },
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      unique: true,
    },
    {
      name: 'status',
      type: 'select',
      options: [
        {
          label: 'Published',
          value: 'published',
        },
        {
          label: 'Draft',
          value: 'draft',
        },
      ],
      defaultValue: 'draft',
    },
    {
      name: 'publishedAt',
      type: 'date',
    },
    {
      name: 'excerpt',
      type: 'textarea',
    },
    {
      name: 'content',
      type: 'textarea', // Raw HTML from WordPress
      admin: {
        rows: 15,
      },
    },
    {
      name: 'categories',
      type: 'relationship',
      relationTo: 'categories',
      hasMany: true,
    },
    {
      name: 'tags',
      type: 'relationship',
      relationTo: 'tags',
      hasMany: true,
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'authors',
    },
    {
      name: 'featuredImageUrl',
      label: 'Featured / Meta Image URL',
      type: 'text',
    },
    {
      name: 'featuredImage',
      label: 'Featured Image (uploaded)',
      type: 'upload',
      relationTo: 'media',
    },
  ],
  hooks: {
    afterChange: [rebuildSitemapsAfterPublishedChange],
    afterDelete: [rebuildSitemapsAfterPublishedDelete],
  },
}
