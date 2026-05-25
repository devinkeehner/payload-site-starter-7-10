import type { CollectionConfig } from 'payload'

import { roleRestrictedAccess } from '@/lib/access/roles'

export const EmailImportJobs: CollectionConfig = {
  slug: 'email-import-jobs',
  access: {
    create: roleRestrictedAccess('email-import-jobs'),
    delete: roleRestrictedAccess('email-import-jobs'),
    read: roleRestrictedAccess('email-import-jobs'),
    update: roleRestrictedAccess('email-import-jobs'),
  },
  admin: {
    defaultColumns: ['source', 'status', 'dryRun', 'totalContacts', 'importedContacts', 'updatedAt'],
    group: 'Email Marketing',
    hidden: true,
    useAsTitle: 'source',
  },
  labels: {
    singular: 'Email Import Job',
    plural: 'Email Import Jobs',
  },
  fields: [
    {
      name: 'source',
      type: 'select',
      defaultValue: 'icontact',
      options: [
        { label: 'iContact', value: 'icontact' },
        { label: 'CSV', value: 'csv' },
        { label: 'Manual', value: 'manual' },
      ],
      required: true,
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
      ],
      required: true,
    },
    {
      name: 'dryRun',
      label: 'Dry run',
      type: 'checkbox',
      defaultValue: true,
    },
    {
      type: 'row',
      fields: [
        {
          name: 'iContactClientFolderId',
          label: 'iContact client folder ID',
          type: 'text',
        },
        {
          name: 'iContactListId',
          label: 'iContact list ID',
          type: 'text',
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'totalContacts',
          label: 'Total contacts',
          type: 'number',
        },
        {
          name: 'importedContacts',
          label: 'Imported contacts',
          type: 'number',
        },
        {
          name: 'updatedContacts',
          label: 'Updated contacts',
          type: 'number',
        },
        {
          name: 'failedContacts',
          label: 'Failed contacts',
          type: 'number',
        },
      ],
    },
    {
      name: 'startedAt',
      type: 'date',
    },
    {
      name: 'completedAt',
      type: 'date',
    },
    {
      name: 'message',
      type: 'textarea',
    },
    {
      name: 'statusCounts',
      label: 'Imported status counts',
      type: 'group',
      fields: [
        {
          name: 'subscribed',
          type: 'number',
        },
        {
          name: 'unsubscribed',
          type: 'number',
        },
        {
          name: 'inactive',
          type: 'number',
        },
        {
          name: 'bounced',
          type: 'number',
        },
        {
          name: 'doNotContact',
          label: 'Do not contact',
          type: 'number',
        },
      ],
    },
    {
      name: 'statusDebug',
      label: 'iContact status debug',
      type: 'group',
      admin: {
        description: 'Samples of raw iContact status fields captured during import troubleshooting.',
      },
      fields: [
        {
          name: 'sampleSize',
          type: 'number',
        },
        {
          name: 'unknownStatusCount',
          type: 'number',
        },
        {
          name: 'subscriptionRecords',
          label: 'Subscription records',
          type: 'number',
        },
        {
          name: 'subscriptionFetchError',
          label: 'Subscription fetch error',
          type: 'textarea',
        },
        {
          name: 'samples',
          type: 'array',
          fields: [
            {
              name: 'email',
              type: 'text',
            },
            {
              name: 'mappedStatus',
              type: 'text',
            },
            {
              name: 'keys',
              type: 'text',
            },
            {
              name: 'statusValues',
              type: 'json',
            },
          ],
        },
      ],
    },
    {
      name: 'errors',
      type: 'array',
      fields: [
        {
          name: 'email',
          type: 'text',
        },
        {
          name: 'message',
          type: 'textarea',
          required: true,
        },
      ],
    },
  ],
}
