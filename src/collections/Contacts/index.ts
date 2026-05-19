import type { CollectionConfig } from 'payload'

import { isCollectionHiddenForRole, roleRestrictedAccess } from '@/lib/access/roles'

export const Contacts: CollectionConfig = {
  slug: 'contacts',
  access: {
    create: roleRestrictedAccess('contacts'),
    delete: roleRestrictedAccess('contacts'),
    read: roleRestrictedAccess('contacts'),
    update: roleRestrictedAccess('contacts'),
  },
  admin: {
    defaultColumns: ['email', 'firstName', 'lastName', 'status', 'updatedAt'],
    group: 'Email Marketing',
    hidden: isCollectionHiddenForRole('contacts'),
    useAsTitle: 'email',
  },
  labels: {
    singular: 'Contact',
    plural: 'Contacts',
  },
  fields: [
    {
      name: 'email',
      type: 'email',
      required: true,
    },
    {
      type: 'row',
      fields: [
        {
          name: 'firstName',
          type: 'text',
          label: 'First name',
        },
        {
          name: 'lastName',
          type: 'text',
          label: 'Last name',
        },
      ],
    },
    {
      name: 'phone',
      type: 'text',
    },
    {
      type: 'row',
      fields: [
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
            { label: 'Import', value: 'import' },
            { label: 'Event', value: 'event' },
            { label: 'CRM sync', value: 'crm' },
            { label: 'Other', value: 'other' },
          ],
          required: true,
        },
      ],
    },
    {
      name: 'tags',
      type: 'array',
      admin: {
        description: 'Short CRM labels such as donor, volunteer, press, or precinct captain.',
      },
      fields: [
        {
          name: 'tag',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      name: 'notes',
      type: 'textarea',
    },
  ],
}
