import type { CollectionConfig } from 'payload'

import { isCollectionHiddenForRole, superAdminAccess } from '@/lib/access/roles'

export const ChatgptOAuthCodes: CollectionConfig = {
  slug: 'chatgpt-oauth-codes',
  access: {
    create: superAdminAccess,
    delete: superAdminAccess,
    read: superAdminAccess,
    update: superAdminAccess,
  },
  admin: {
    defaultColumns: ['client', 'user', 'expiresAt', 'consumedAt'],
    group: 'MCP',
    hidden: isCollectionHiddenForRole('chatgpt-oauth-codes'),
  },
  fields: [
    {
      name: 'codeHash',
      type: 'text',
      required: true,
      unique: true,
    },
    {
      name: 'client',
      type: 'relationship',
      relationTo: 'chatgpt-oauth-clients',
      required: true,
    },
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
    },
    {
      name: 'redirectUri',
      type: 'text',
      required: true,
    },
    {
      name: 'codeChallenge',
      type: 'text',
      required: true,
    },
    {
      name: 'scope',
      type: 'text',
      required: true,
    },
    {
      name: 'resource',
      type: 'text',
      required: true,
    },
    {
      name: 'expiresAt',
      type: 'date',
      required: true,
    },
    {
      name: 'consumedAt',
      type: 'date',
    },
  ],
  labels: {
    plural: 'ChatGPT OAuth Codes',
    singular: 'ChatGPT OAuth Code',
  },
  timestamps: true,
}
