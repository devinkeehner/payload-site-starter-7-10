import type { CollectionConfig } from 'payload'

import { authenticated } from '@/lib/access/authenticated'
import { anyone } from '@/lib/access/anyone'
import { slugField } from '@/collections/fields/slug'

export const ArticleTypes: CollectionConfig = {
  slug: 'article-types',
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  admin: {
    group: 'Admin',
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    ...slugField(),
  ],
}
