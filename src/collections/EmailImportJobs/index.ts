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
      name: 'errors',
      type: 'array',
      fields: [
        {
          name: 'email',
          type: 'email',
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
