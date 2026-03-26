import type { CollectionConfig } from 'payload'

import { isSuperUser } from '@/lib/access/isSuperUser'

export const SitemapArtifacts: CollectionConfig = {
  slug: 'sitemap-artifacts',
  labels: {
    singular: 'Sitemap Artifact',
    plural: 'Sitemap Artifacts',
  },
  admin: {
    group: 'Admin',
    useAsTitle: 'key',
    hidden: ({ user }) => !isSuperUser(user),
    defaultColumns: ['key', 'generatedAt', 'itemCount', 'updatedAt'],
  },
  access: {
    read: ({ req }) => isSuperUser(req.user),
    create: ({ req }) => isSuperUser(req.user),
    update: ({ req }) => isSuperUser(req.user),
    delete: ({ req }) => isSuperUser(req.user),
  },
  fields: [
    {
      name: 'key',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'contentType',
      type: 'text',
      required: true,
      defaultValue: 'application/xml; charset=utf-8',
    },
    {
      name: 'itemCount',
      type: 'number',
      required: true,
      defaultValue: 0,
    },
    {
      name: 'generatedAt',
      type: 'date',
      required: true,
    },
    {
      name: 'xml',
      type: 'textarea',
      required: true,
      maxLength: 2_000_000,
      admin: {
        rows: 20,
      },
    },
  ],
}

export default SitemapArtifacts
