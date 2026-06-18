import type { CollectionConfig, CollectionSlug } from 'payload'

import { roleRestrictedAccess } from '@/lib/access/roles'

const CONTACTS_COLLECTION = 'contacts' as CollectionSlug
const EMAILS_COLLECTION = 'emails' as CollectionSlug

export const EmailSendEvents: CollectionConfig = {
  slug: 'email-send-events',
  access: {
    create: roleRestrictedAccess('email-send-events'),
    delete: roleRestrictedAccess('email-send-events'),
    read: roleRestrictedAccess('email-send-events'),
    update: roleRestrictedAccess('email-send-events'),
  },
  admin: {
    defaultColumns: ['email', 'eventType', 'recipientEmail', 'occurredAt'],
    group: 'Email Marketing',
    hidden: true,
    useAsTitle: 'recipientEmail',
  },
  labels: {
    singular: 'Email Send Event',
    plural: 'Email Send Events',
  },
  fields: [
    {
      name: 'email',
      type: 'relationship',
      relationTo: EMAILS_COLLECTION,
    },
    {
      name: 'contact',
      type: 'relationship',
      relationTo: CONTACTS_COLLECTION,
    },
    {
      name: 'recipientEmail',
      type: 'email',
      required: true,
    },
    {
      name: 'eventType',
      type: 'select',
      options: [
        { label: 'Queued', value: 'queued' },
        { label: 'Sent', value: 'sent' },
        { label: 'Delivered', value: 'delivered' },
        { label: 'Opened', value: 'opened' },
        { label: 'Clicked', value: 'clicked' },
        { label: 'Bounced', value: 'bounced' },
        { label: 'Complaint', value: 'complaint' },
        { label: 'Unsubscribed', value: 'unsubscribed' },
        { label: 'Failed', value: 'failed' },
      ],
      required: true,
    },
    {
      name: 'elasticCampaignId',
      label: 'Elastic send ID',
      type: 'text',
    },
    {
      name: 'elasticMessageId',
      label: 'Elastic message ID',
      type: 'text',
    },
    {
      name: 'occurredAt',
      type: 'date',
      defaultValue: () => new Date().toISOString(),
      required: true,
    },
    {
      name: 'url',
      type: 'text',
    },
    {
      name: 'raw',
      type: 'json',
      admin: {
        readOnly: true,
      },
    },
  ],
}
