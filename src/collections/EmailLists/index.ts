import type { CollectionConfig, CollectionSlug } from 'payload'

import { isCollectionHiddenForRole, roleRestrictedAccess } from '@/lib/access/roles'

const CONTACTS_COLLECTION = 'contacts' as CollectionSlug

export const EmailLists: CollectionConfig = {
  slug: 'email-lists',
  access: {
    create: roleRestrictedAccess('email-lists'),
    delete: roleRestrictedAccess('email-lists'),
    read: roleRestrictedAccess('email-lists'),
    update: roleRestrictedAccess('email-lists'),
  },
  admin: {
    defaultColumns: ['name', 'status', 'updatedAt'],
    group: 'Email Marketing',
    hidden: isCollectionHiddenForRole('email-lists'),
    useAsTitle: 'name',
  },
  labels: {
    singular: 'Email List',
    plural: 'Email Lists',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'active',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Archived', value: 'archived' },
      ],
      required: true,
    },
    {
      name: 'contacts',
      type: 'relationship',
      admin: {
        description: 'Contacts included in this audience list.',
      },
      hasMany: true,
      relationTo: CONTACTS_COLLECTION,
    },
  ],
}
