import type { CollectionBeforeValidateHook, CollectionConfig } from 'payload'

import { isCollectionHiddenForRole, roleRestrictedAccess } from '@/lib/access/roles'
import {
  normalizeEmailAddress,
  normalizePhoneNumber,
  normalizePostalCode,
} from '@/lib/email/contactNormalization'

const normalizeContact: CollectionBeforeValidateHook = ({ data }) => {
  if (!data) return data

  const email = normalizeEmailAddress(data.email)
  const tenantId = (() => {
    const tenant = data.tenant
    if (typeof tenant === 'string' || typeof tenant === 'number') return String(tenant)
    if (tenant && typeof tenant === 'object' && !Array.isArray(tenant)) {
      const id = (tenant as Record<string, unknown>).id ?? (tenant as Record<string, unknown>).value
      if (typeof id === 'string' || typeof id === 'number') return String(id)
    }
    return ''
  })()

  return {
    ...data,
    email,
    normalizedEmail: email,
    phone: normalizePhoneNumber(data.phone),
    postalCode: normalizePostalCode(data.postalCode),
    tenantScopedKey: tenantId && email ? `${tenantId}:${email}` : undefined,
  }
}

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
    components: {
      views: {
        edit: {
          profile: {
            path: '/profile',
            Component: '@/components/admin/contact-profile/ContactProfileView#default',
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
    singular: 'Contact',
    plural: 'Contacts',
  },
  hooks: {
    beforeValidate: [normalizeContact],
  },
  fields: [
    {
      name: 'email',
      type: 'email',
      required: true,
    },
    {
      name: 'normalizedEmail',
      type: 'text',
      admin: {
        hidden: true,
        readOnly: true,
      },
      index: true,
      required: true,
    },
    {
      name: 'tenantScopedKey',
      type: 'text',
      admin: {
        hidden: true,
        readOnly: true,
      },
      index: true,
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
      name: 'postalCode',
      label: 'ZIP / Postal code',
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
      name: 'customFields',
      label: 'Custom fields',
      type: 'array',
      admin: {
        description: 'Imported key/value fields from iContact or other email platforms.',
      },
      fields: [
        {
          name: 'key',
          type: 'text',
          required: true,
        },
        {
          name: 'value',
          type: 'text',
        },
        {
          name: 'source',
          type: 'select',
          defaultValue: 'icontact',
          options: [
            { label: 'iContact', value: 'icontact' },
            { label: 'Elastic Email', value: 'elastic' },
            { label: 'Manual', value: 'manual' },
            { label: 'Other', value: 'other' },
          ],
          required: true,
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'consentSource',
          label: 'Consent source',
          type: 'select',
          options: [
            { label: 'Form submission', value: 'form' },
            { label: 'Manual entry', value: 'manual' },
            { label: 'iContact migration', value: 'icontact' },
            { label: 'Elastic Email', value: 'elastic' },
            { label: 'Unknown', value: 'unknown' },
          ],
        },
        {
          name: 'consentAt',
          label: 'Consent date',
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
      name: 'sourceDetails',
      label: 'Source details',
      type: 'textarea',
    },
    {
      name: 'elasticContactId',
      label: 'Elastic contact ID',
      type: 'text',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'iContactContactId',
      label: 'iContact contact ID',
      type: 'text',
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
    {
      name: 'notes',
      type: 'textarea',
    },
  ],
}
