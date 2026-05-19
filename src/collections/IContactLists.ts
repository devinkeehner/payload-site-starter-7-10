import type { CollectionConfig } from 'payload'

import { isSuperUser } from '@/lib/access/isSuperUser'

export const IContactLists: CollectionConfig = {
  slug: 'icontact-lists',
  labels: {
    singular: 'iContact List',
    plural: 'iContact Lists',
  },
  admin: {
    group: 'Forms & Submissions',
    useAsTitle: 'name',
    defaultColumns: ['name', 'listId', 'clientFolder', 'updatedAt'],
    hidden: ({ user }) => !isSuperUser(user),
  },
  access: {
    read: ({ req }) => isSuperUser(req.user),
  },
  fields: [
    {
      name: 'uniqueKey',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: { readOnly: true },
    },
    {
      name: 'listId',
      type: 'text',
      required: true,
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
      name: 'description',
      type: 'textarea',
      admin: { readOnly: true },
    },
    {
      name: 'clientFolder',
      type: 'relationship',
      relationTo: 'icontact-folders',
      required: true,
      index: true,
      admin: { readOnly: true },
    },
    {
      name: 'clientFolderId',
      type: 'text',
      required: true,
      index: true,
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
      name: 'lastSyncedAt',
      type: 'date',
      admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
    },
  ],
}
