import type { CollectionBeforeValidateHook, CollectionConfig, CollectionSlug } from 'payload'

import { isCollectionHiddenForRole, roleRestrictedAccess } from '@/lib/access/roles'
import { normalizeListName } from '@/lib/email/contactNormalization'

const CONTACTS_COLLECTION = 'contacts' as CollectionSlug

const normalizeEmailList: CollectionBeforeValidateHook = ({ data }) => {
  if (!data) return data
  const name = normalizeListName(data.name)

  return {
    ...data,
    elasticListName: normalizeListName(data.elasticListName) || name,
    name,
  }
}

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
    components: {
      views: {
        list: {
          Component: '@/components/admin/email-list-profile/EmailListListView#default',
        },
        edit: {
          profile: {
            path: '/profile',
            Component: '@/components/admin/email-list-profile/EmailListProfileView#default',
            tab: {
              href: '/profile',
              label: 'Profile',
              order: 1,
            },
          },
          default: {
            tab: {
              label: 'Advanced Fields',
              order: 500,
            },
          },
        },
      },
    },
  },
  labels: {
    singular: 'Email List',
    plural: 'Email Lists',
  },
  hooks: {
    beforeValidate: [normalizeEmailList],
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
      name: 'elasticListName',
      label: 'Elastic list name',
      type: 'text',
      admin: {
        description: 'Used when syncing this audience list to Elastic Email.',
      },
      index: true,
    },
    {
      name: 'elasticPublicListID',
      label: 'Elastic public list ID',
      type: 'text',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'allowUnsubscribe',
      label: 'Allow unsubscribes',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description: 'Should remain enabled for normal campaign audiences.',
      },
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
        description: 'Legacy quick picker. Rich membership data is stored in Email List Memberships.',
      },
      hasMany: true,
      relationTo: CONTACTS_COLLECTION,
    },
    {
      type: 'row',
      fields: [
        {
          name: 'activeContactCount',
          label: 'Active contacts',
          type: 'number',
          admin: {
            readOnly: true,
          },
        },
        {
          name: 'lastSyncedToElasticAt',
          label: 'Last synced to Elastic',
          type: 'date',
          admin: {
            readOnly: true,
          },
        },
      ],
    },
    {
      name: 'iContactClientFolderId',
      label: 'iContact client folder ID',
      type: 'text',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'iContactListId',
      label: 'iContact list ID',
      type: 'text',
      admin: {
        readOnly: true,
      },
    },
  ],
}
