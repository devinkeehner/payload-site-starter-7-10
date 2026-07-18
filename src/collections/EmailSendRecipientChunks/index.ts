import type { CollectionConfig, CollectionSlug } from 'payload'

import { roleRestrictedAccess } from '@/lib/access/roles'
import { emailSendJobLifecycleAccess } from '@/lib/email/jobCollectionHooks'

const EMAILS_COLLECTION = 'emails' as CollectionSlug
const EMAIL_SEND_JOBS_COLLECTION = 'email-send-jobs' as CollectionSlug

export const EmailSendRecipientChunks: CollectionConfig = {
  slug: 'email-send-recipient-chunks',
  access: {
    create: emailSendJobLifecycleAccess,
    delete: () => false,
    read: roleRestrictedAccess('email-send-recipient-chunks'),
    update: () => false,
  },
  admin: {
    defaultColumns: ['email', 'job', 'chunkIndex', 'recipientCount', 'createdAt'],
    group: 'Email Marketing',
    hidden: true,
    useAsTitle: 'chunkKey',
  },
  labels: {
    plural: 'Email Send Recipient Chunks',
    singular: 'Email Send Recipient Chunk',
  },
  fields: [
    {
      name: 'chunkKey',
      type: 'text',
      index: true,
      required: true,
      unique: true,
    },
    {
      name: 'job',
      type: 'relationship',
      index: true,
      relationTo: EMAIL_SEND_JOBS_COLLECTION,
      required: true,
    },
    {
      name: 'email',
      type: 'relationship',
      index: true,
      relationTo: EMAILS_COLLECTION,
      required: true,
    },
    {
      name: 'chunkIndex',
      type: 'number',
      index: true,
      min: 0,
      required: true,
    },
    {
      name: 'recipientCount',
      type: 'number',
      min: 0,
      required: true,
    },
    {
      name: 'recipients',
      type: 'json',
      admin: {
        readOnly: true,
      },
      required: true,
    },
  ],
}
