import type { CollectionConfig, CollectionSlug } from 'payload'

import { roleRestrictedAccess } from '@/lib/access/roles'

const EMAILS_COLLECTION = 'emails' as CollectionSlug
const TENANTS_COLLECTION = 'tenants' as CollectionSlug
const USERS_COLLECTION = 'users' as CollectionSlug

export const EmailSendJobs: CollectionConfig = {
  slug: 'email-send-jobs',
  access: {
    create: roleRestrictedAccess('email-send-jobs'),
    delete: roleRestrictedAccess('email-send-jobs'),
    read: roleRestrictedAccess('email-send-jobs'),
    update: roleRestrictedAccess('email-send-jobs'),
  },
  admin: {
    defaultColumns: ['email', 'status', 'kind', 'recipientCount', 'updatedAt'],
    group: 'Email Marketing',
    hidden: true,
    useAsTitle: 'email',
  },
  labels: {
    singular: 'Email Send Job',
    plural: 'Email Send Jobs',
  },
  fields: [
    {
      name: 'email',
      type: 'relationship',
      relationTo: EMAILS_COLLECTION,
      required: true,
    },
    {
      name: 'tenant',
      type: 'relationship',
      relationTo: TENANTS_COLLECTION,
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'pending',
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Running', value: 'running' },
        { label: 'Completed', value: 'completed' },
        { label: 'Failed', value: 'failed' },
        { label: 'Cancelled', value: 'cancelled' },
      ],
      required: true,
    },
    {
      name: 'kind',
      type: 'select',
      defaultValue: 'manual',
      options: [
        { label: 'Manual', value: 'manual' },
        { label: 'Scheduled', value: 'scheduled' },
      ],
      required: true,
    },
    {
      name: 'requestedBy',
      type: 'relationship',
      relationTo: USERS_COLLECTION,
    },
    {
      name: 'requestedAt',
      type: 'date',
      defaultValue: () => new Date().toISOString(),
      required: true,
    },
    {
      type: 'row',
      fields: [
        {
          name: 'startedAt',
          type: 'date',
        },
        {
          name: 'completedAt',
          type: 'date',
        },
      ],
    },
    {
      name: 'attempts',
      type: 'number',
      defaultValue: 0,
      min: 0,
    },
    {
      type: 'row',
      fields: [
        {
          name: 'lockedAt',
          type: 'date',
        },
        {
          name: 'lockExpiresAt',
          type: 'date',
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'recipientCount',
          type: 'number',
        },
        {
          name: 'elasticCampaignId',
          label: 'Elastic campaign ID',
          type: 'text',
        },
      ],
    },
    {
      name: 'message',
      type: 'textarea',
    },
  ],
}
