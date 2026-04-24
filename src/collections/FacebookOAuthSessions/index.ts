import type { CollectionConfig } from 'payload'

import { isSuperUser } from '@/lib/access/isSuperUser'

export const FacebookOAuthSessions: CollectionConfig = {
  slug: 'facebook-oauth-sessions',
  labels: {
    singular: 'Facebook OAuth Session',
    plural: 'Facebook OAuth Sessions',
  },
  admin: {
    group: 'Admin',
    hidden: true,
    useAsTitle: 'state',
  },
  access: {
    read: ({ req }) => isSuperUser(req.user),
    create: ({ req }) => isSuperUser(req.user),
    update: ({ req }) => isSuperUser(req.user),
    delete: ({ req }) => isSuperUser(req.user),
  },
  fields: [
    {
      name: 'state',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
    },
    {
      name: 'repInfo',
      type: 'relationship',
      relationTo: 'rep-info',
      required: true,
    },
    {
      name: 'tenant',
      type: 'relationship',
      relationTo: 'tenants',
      required: false,
    },
    {
      name: 'returnTo',
      type: 'text',
      required: false,
    },
    {
      name: 'expiresAt',
      type: 'date',
      required: true,
      index: true,
    },
    {
      name: 'pages',
      type: 'array',
      required: true,
      minRows: 0,
      fields: [
        {
          name: 'pageId',
          type: 'text',
          required: true,
        },
        {
          name: 'name',
          type: 'text',
          required: false,
        },
        {
          name: 'link',
          type: 'text',
          required: false,
        },
        {
          name: 'accessToken',
          type: 'textarea',
          required: true,
          access: {
            read: ({ req }) => isSuperUser(req.user),
          },
        },
        {
          name: 'tasks',
          type: 'array',
          required: false,
          fields: [
            {
              name: 'task',
              type: 'text',
              required: true,
            },
          ],
        },
      ],
    },
  ],
}

export default FacebookOAuthSessions
