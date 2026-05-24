import type { CollectionConfig, CollectionSlug } from 'payload'

import { roleRestrictedAccess } from '@/lib/access/roles'

const CONTACTS_COLLECTION = 'contacts' as CollectionSlug
const EMAIL_LISTS_COLLECTION = 'email-lists' as CollectionSlug

export const EmailListMemberships: CollectionConfig = {
  slug: 'email-list-memberships',
  access: {
    create: roleRestrictedAccess('email-list-memberships'),
    delete: roleRestrictedAccess('email-list-memberships'),
    read: roleRestrictedAccess('email-list-memberships'),
    update: roleRestrictedAccess('email-list-memberships'),
  },
  admin: {
    defaultColumns: ['emailList', 'contact', 'status', 'source', 'updatedAt'],
    group: 'Email Marketing',
    hidden: true,
    useAsTitle: 'id',
  },
  labels: {
    singular: 'Email List Membership',
    plural: 'Email List Memberships',
  },
  fields: [
    {
      name: 'emailList',
      label: 'Email list',
      type: 'relationship',
      relationTo: EMAIL_LISTS_COLLECTION,
      required: true,
    },
    {
      name: 'contact',
      type: 'relationship',
      relationTo: CONTACTS_COLLECTION,
      required: true,
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'subscribed',
      options: [
        { label: 'Subscribed', value: 'subscribed' },
        { label: 'Unsubscribed', value: 'unsubscribed' },
        { label: 'Inactive', value: 'inactive' },
        { label: 'Bounced', value: 'bounced' },
        { label: 'Do not contact', value: 'doNotContact' },
      ],
      required: true,
    },
    {
      name: 'source',
      type: 'select',
      defaultValue: 'manual',
      options: [
        { label: 'Manual entry', value: 'manual' },
        { label: 'Form submission', value: 'form' },
        { label: 'iContact migration', value: 'icontact' },
        { label: 'Import', value: 'import' },
        { label: 'Elastic Email', value: 'elastic' },
      ],
      required: true,
    },
    {
      type: 'row',
      fields: [
        {
          name: 'subscribedAt',
          label: 'Subscribed at',
          type: 'date',
          admin: {
            date: {
              pickerAppearance: 'dayAndTime',
            },
          },
        },
        {
          name: 'unsubscribedAt',
          label: 'Unsubscribed at',
          type: 'date',
          admin: {
            date: {
              pickerAppearance: 'dayAndTime',
            },
          },
        },
      ],
    },
    {
      name: 'iContactSubscriptionId',
      label: 'iContact subscription ID',
      type: 'text',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'notes',
      type: 'textarea',
    },
  ],
}
