import type { CollectionConfig } from 'payload'

import { isSuperUser } from '@/lib/access/isSuperUser'

export const IContactFolders: CollectionConfig = {
  slug: 'icontact-folders',
  labels: {
    singular: 'iContact Folder',
    plural: 'iContact Folders',
  },
  admin: {
    group: 'Forms & Submissions',
    useAsTitle: 'name',
    defaultColumns: ['name', 'clientFolderId', 'accountId', 'accessible', 'listCount', 'updatedAt'],
    hidden: ({ user }) => !isSuperUser(user),
  },
  access: {
    read: ({ req }) => isSuperUser(req.user),
  },
  fields: [
    {
      name: 'clientFolderId',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: { readOnly: true },
    },
    {
      name: 'name',
      type: 'text',
      required: true,
      admin: { readOnly: true },
    },
    {
      name: 'accountId',
      type: 'text',
      required: true,
      index: true,
      admin: { readOnly: true },
    },
    {
      name: 'accessible',
      type: 'checkbox',
      defaultValue: true,
      admin: { readOnly: true },
    },
    {
      name: 'listCount',
      type: 'number',
      defaultValue: 0,
      admin: { readOnly: true },
    },
    {
      name: 'lastSyncStatus',
      type: 'text',
      admin: { readOnly: true },
    },
    {
      name: 'lastSyncError',
      type: 'textarea',
      admin: { readOnly: true },
    },
    {
      name: 'lastSyncedAt',
      type: 'date',
      admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
    },
  ],
}
