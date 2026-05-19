import type { CollectionConfig } from 'payload'

import { isCollectionHiddenForRole, superAdminAccess } from '@/lib/access/roles'

export const ChatgptOAuthTokens: CollectionConfig = {
  slug: 'chatgpt-oauth-tokens',
  access: {
    create: superAdminAccess,
    delete: superAdminAccess,
    read: superAdminAccess,
    update: superAdminAccess,
  },
  admin: {
    defaultColumns: ['client', 'user', 'accessTokenExpiresAt', 'revokedAt'],
    group: 'MCP',
    hidden: isCollectionHiddenForRole('chatgpt-oauth-tokens'),
  },
  fields: [
    {
      name: 'accessTokenHash',
      type: 'text',
      required: true,
      unique: true,
    },
    {
      name: 'refreshTokenHash',
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
      name: 'accessTokenExpiresAt',
      type: 'date',
      required: true,
    },
    {
      name: 'refreshTokenExpiresAt',
      type: 'date',
      required: true,
    },
    {
      name: 'revokedAt',
      type: 'date',
    },
  ],
  labels: {
    plural: 'ChatGPT OAuth Tokens',
    singular: 'ChatGPT OAuth Token',
  },
  timestamps: true,
}
