import type { CollectionBeforeValidateHook, CollectionConfig, CollectionSlug } from 'payload'

import { isCollectionHiddenForRole, roleRestrictedAccess } from '@/lib/access/roles'
import { EMAIL_LAYOUT_BLOCKS } from '@/lib/email/blocks'
import { buildDefaultEmailLayout } from '@/lib/email/defaultEmailLayout'

const EMAIL_LISTS_COLLECTION = 'email-lists' as CollectionSlug

const populateDefaultLayout: CollectionBeforeValidateHook = async ({ data, operation, req }) => {
  if (operation !== 'create' || !data) return data
  if (Array.isArray(data.layout) && data.layout.length > 0) return data

  return {
    ...data,
    layout: await buildDefaultEmailLayout(data as Record<string, unknown>, req),
  }
}

export const Emails: CollectionConfig<'emails'> = {
  slug: 'emails',
  access: {
    create: roleRestrictedAccess('emails'),
    delete: roleRestrictedAccess('emails'),
    read: roleRestrictedAccess('emails'),
    update: roleRestrictedAccess('emails'),
  },
  admin: {
    defaultColumns: ['title', 'subject', 'emailList', 'recipientEmail', 'updatedAt'],
    group: 'Email Marketing',
    hidden: isCollectionHiddenForRole('emails'),
    useAsTitle: 'title',
    components: {
      edit: {
        beforeDocumentControls: ['@/components/admin/email/EmailSendControl#EmailSendControl'],
      },
      views: {
        list: {
          Component: '@/components/admin/email-center/EmailCenterListView#default',
        },
        edit: {
          workflow: {
            path: '/workflow',
            Component: '@/components/admin/email-center/EmailWorkflowView#default',
            tab: {
              href: '/workflow',
              label: 'Workflow',
              order: 60,
            },
          },
          visual: {
            path: '/visual',
            Component: '@/components/admin/email/PuckEmailBuilderView',
            tab: {
              href: '/visual',
              label: 'Email Builder',
              order: 75,
            },
          },
        },
      },
    },
  },
  labels: {
    singular: 'Email',
    plural: 'Emails',
  },
  hooks: {
    beforeValidate: [populateDefaultLayout],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      admin: {
        description: 'Internal title shown in the admin.',
      },
      required: true,
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Setup',
          fields: [
            {
              name: 'subject',
              type: 'text',
              required: true,
            },
            {
              name: 'preheader',
              type: 'textarea',
              admin: {
                description: 'Short preview text shown by many email clients.',
              },
            },
            {
              name: 'recipientEmail',
              type: 'email',
              label: 'Test recipient email',
              admin: {
                description: 'Send Test Email sends only to this address, never to the audience list.',
              },
              required: true,
            },
            {
              name: 'emailList',
              type: 'relationship',
              admin: {
                description: 'Intended audience for future campaign sends. Test sends do not use this list.',
              },
              label: 'Audience list',
              relationTo: EMAIL_LISTS_COLLECTION,
            },
            {
              name: 'replyTo',
              type: 'email',
              label: 'Reply-to email',
            },
            {
              name: 'status',
              type: 'select',
              defaultValue: 'draft',
              options: [
                { label: 'Draft', value: 'draft' },
                { label: 'Approved', value: 'approved' },
                { label: 'Scheduled', value: 'scheduled' },
                { label: 'Sending', value: 'sending' },
                { label: 'Sent', value: 'sent' },
                { label: 'Failed', value: 'failed' },
              ],
              required: true,
            },
            {
              name: 'scheduledAt',
              label: 'Scheduled send time',
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
          label: 'Content',
          fields: [
            {
              name: 'layout',
              type: 'blocks',
              blocks: EMAIL_LAYOUT_BLOCKS,
              required: true,
              admin: {
                description: 'Build this email in the Email Builder tab.',
                initCollapsed: true,
              },
            },
          ],
        },
        {
          label: 'Status',
          fields: [
            {
              name: 'sendSummary',
              label: 'Production send',
              type: 'group',
              admin: {
                readOnly: true,
              },
              fields: [
                {
                  name: 'elasticCampaignId',
                  label: 'Elastic campaign ID',
                  type: 'text',
                },
                {
                  name: 'recipientCount',
                  label: 'Recipient count',
                  type: 'number',
                },
                {
                  name: 'approvedAt',
                  label: 'Approved at',
                  type: 'date',
                },
                {
                  name: 'approvedBy',
                  label: 'Approved by',
                  type: 'relationship',
                  relationTo: 'users',
                },
                {
                  name: 'sentAt',
                  label: 'Sent at',
                  type: 'date',
                },
                {
                  name: 'sendError',
                  label: 'Send error',
                  type: 'textarea',
                },
              ],
            },
            {
              name: 'lastSend',
              type: 'group',
              label: 'Last test send',
              admin: {
                readOnly: true,
              },
              fields: [
                {
                  name: 'status',
                  type: 'select',
                  options: [
                    { label: 'Test sent', value: 'sent' },
                    { label: 'Test failed', value: 'failed' },
                  ],
                },
                {
                  name: 'recipientEmail',
                  type: 'email',
                  label: 'Test recipient email',
                },
                {
                  name: 'sentAt',
                  type: 'date',
                  admin: {
                    date: {
                      pickerAppearance: 'dayAndTime',
                    },
                  },
                },
                {
                  name: 'message',
                  type: 'textarea',
                },
              ],
            },
          ],
        },
      ],
    },
  ],
  versions: {
    drafts: {
      autosave: {
        interval: 1000,
      },
    },
    maxPerDoc: 25,
  },
}
