import type { CollectionConfig, CollectionSlug } from 'payload'

import { isCollectionHiddenForRole, roleRestrictedAccess } from '@/lib/access/roles'
import {
  emailSendJobLifecycleAccess,
  protectEmailSendJob,
} from '@/lib/email/jobCollectionHooks'

const EMAILS_COLLECTION = 'emails' as CollectionSlug
const USERS_COLLECTION = 'users' as CollectionSlug

export const EmailSendJobs: CollectionConfig = {
  slug: 'email-send-jobs',
  access: {
    create: emailSendJobLifecycleAccess,
    delete: () => false,
    read: roleRestrictedAccess('email-send-jobs'),
    update: emailSendJobLifecycleAccess,
  },
  admin: {
    defaultColumns: ['email', 'status', 'kind', 'recipientCount', 'updatedAt'],
    group: 'Email Marketing',
    hidden: isCollectionHiddenForRole('email-send-jobs'),
    useAsTitle: 'email',
  },
  labels: {
    singular: 'Email Send Job',
    plural: 'Email Send Jobs',
  },
  hooks: {
    beforeChange: [protectEmailSendJob],
  },
  fields: [
    {
      name: 'email',
      type: 'relationship',
      relationTo: EMAILS_COLLECTION,
      required: true,
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'pending',
      options: [
        { label: 'Preparing', value: 'preparing' },
        { label: 'Scheduled', value: 'scheduled' },
        { label: 'Pending', value: 'pending' },
        { label: 'Running', value: 'running' },
        { label: 'Completed', value: 'completed' },
        { label: 'Failed', value: 'failed' },
        { label: 'Delivery unknown', value: 'delivery_unknown' },
        { label: 'Cancelled', value: 'cancelled' },
      ],
      required: true,
    },
    {
      name: 'activeKey',
      type: 'text',
      admin: {
        hidden: true,
        readOnly: true,
      },
      index: true,
      unique: true,
    },
    {
      name: 'claimToken',
      type: 'text',
      admin: {
        hidden: true,
        readOnly: true,
      },
      index: true,
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
      name: 'scheduledFor',
      type: 'date',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'contentRevision',
      type: 'text',
      index: true,
      admin: {
        readOnly: true,
      },
      required: true,
    },
    {
      name: 'snapshot',
      type: 'json',
      admin: {
        readOnly: true,
      },
      required: true,
    },
    {
      name: 'recipientChunkCount',
      type: 'number',
      admin: {
        readOnly: true,
      },
      min: 1,
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
      name: 'providerAttemptedAt',
      type: 'date',
      admin: {
        hidden: true,
        readOnly: true,
      },
    },
    {
      name: 'reconciliationPending',
      type: 'checkbox',
      admin: {
        hidden: true,
        readOnly: true,
      },
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
          name: 'sentRecipientCount',
          type: 'number',
        },
        {
          name: 'suppressedRecipientCount',
          type: 'number',
        },
        {
          name: 'elasticCampaignId',
          label: 'Elastic send ID',
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
