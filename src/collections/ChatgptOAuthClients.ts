import type { CollectionConfig } from 'payload'

import { isCollectionHiddenForRole, superAdminAccess } from '@/lib/access/roles'

export const ChatgptOAuthClients: CollectionConfig = {
  slug: 'chatgpt-oauth-clients',
  access: {
    create: superAdminAccess,
    delete: superAdminAccess,
    read: superAdminAccess,
    update: superAdminAccess,
  },
  admin: {
    defaultColumns: ['clientName', 'clientId', 'updatedAt'],
    group: 'MCP',
    hidden: isCollectionHiddenForRole('chatgpt-oauth-clients'),
    useAsTitle: 'clientName',
  },
  fields: [
    {
      name: 'clientId',
      type: 'text',
      required: true,
      unique: true,
    },
    {
      name: 'clientName',
      type: 'text',
      defaultValue: 'ChatGPT Connector',
      required: true,
    },
    {
      name: 'redirectUris',
      type: 'array',
      minRows: 1,
      required: true,
      fields: [
        {
          name: 'uri',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      name: 'rawMetadata',
      type: 'json',
      admin: {
        description: 'Original dynamic client registration payload from ChatGPT.',
      },
    },
  ],
  labels: {
    plural: 'ChatGPT OAuth Clients',
    singular: 'ChatGPT OAuth Client',
  },
  timestamps: true,
}
