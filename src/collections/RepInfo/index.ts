import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionConfig,
} from 'payload'

import { isSuperUser } from '@/lib/access/isSuperUser'
import { triggerFrontendRevalidate } from '../../lib/utilities/revalidateFrontend'

type TenantDoc = { slug?: string | null }
type TenantQueryResult = { docs?: TenantDoc[] }

const revalidateSiteProfiles = async (payload: Parameters<CollectionAfterChangeHook>[0]['req']['payload']) => {
  const tenants = await payload.find({
    collection: 'tenants',
    depth: 0,
    limit: 1000,
    select: { slug: true },
  })
  const slugs = (((tenants as TenantQueryResult)?.docs || [])
    .map((tenant) => tenant?.slug)
    .filter((slug): slug is string => typeof slug === 'string' && slug.length > 0))

  await triggerFrontendRevalidate({
    paths: ['/', ...slugs.map((slug) => `/${slug}`)],
    tags: ['payload:rep-info', ...slugs.map((slug) => `tenant:${slug}`)],
  })
}

export const RepInfo: CollectionConfig = {
  labels: {
    singular: 'Site Profile',
    plural: 'Site Profiles',
  },
  slug: 'rep-info',
  admin: {
    defaultColumns: ['name', 'districtNumber', 'updatedAt'],
    description: 'Identity, towns, social profiles, and email defaults for each website.',
    group: 'Site Settings',
    useAsTitle: 'name',
  },
  access: {
    read: () => true,
  },
  hooks: {
    afterChange: [
      (async ({ req: { payload, context } }) => {
        if (context?.disableRevalidate) return
        try {
          await revalidateSiteProfiles(payload)
        } catch (error: unknown) {
          payload.logger?.error?.(
            `Failed to revalidate after site profile change: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }) as CollectionAfterChangeHook,
    ],
    afterDelete: [
      (async ({ req: { payload, context } }) => {
        if (context?.disableRevalidate) return
        try {
          await revalidateSiteProfiles(payload)
        } catch (error: unknown) {
          payload.logger?.error?.(
            `Failed to revalidate after site profile delete: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }) as CollectionAfterDeleteHook,
    ],
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Profile & Towns',
          description: 'Public identity, district information, and towns shown on this website.',
          fields: [
            {
              type: 'row',
              fields: [
                {
                  name: 'officeTitle',
                  label: 'Public title',
                  type: 'text',
                  required: true,
                },
                {
                  name: 'name',
                  label: 'Public name',
                  type: 'text',
                  required: true,
                },
                {
                  name: 'districtNumber',
                  label: 'District number',
                  type: 'number',
                  required: true,
                },
              ],
            },
            {
              name: 'towns',
              label: 'Towns',
              type: 'array',
              minRows: 1,
              admin: {
                description: 'Add each represented town and its optional public details.',
              },
              fields: [
                {
                  name: 'town',
                  label: 'Town name',
                  type: 'text',
                  required: true,
                },
                {
                  name: 'currentEcsEntitlement',
                  label: 'Current ECS',
                  type: 'number',
                  min: 0,
                },
                {
                  name: 'houseGopStrapAid',
                  label: 'House GOP STRAP aid',
                  type: 'number',
                  min: 0,
                },
                {
                  name: 'url',
                  label: 'Town website URL',
                  type: 'text',
                  admin: {
                    description: 'Optional. Include https:// so the link can open correctly.',
                  },
                  validate: (value: unknown) => {
                    if (!value) return true
                    if (typeof value !== 'string') return 'Enter a valid URL, including https://'
                    try {
                      new URL(value)
                      return true
                    } catch {
                      return 'Enter a valid URL, including https://'
                    }
                  },
                },
              ],
            },
            {
              name: 'form',
              label: 'Default contact form',
              type: 'relationship',
              relationTo: 'forms',
              required: false,
            },
            {
              name: 'postTakeawaysPlacement',
              label: 'Post takeaways display',
              type: 'select',
              defaultValue: 'featured',
              options: [
                { label: 'Featured near the top', value: 'featured' },
                { label: 'Collapsible at the bottom', value: 'footer' },
              ],
              admin: {
                description: 'Choose where approved key takeaways appear on posts for this website.',
              },
            },
          ],
        },
        {
          label: 'Social & Facebook',
          description: 'Public social links and the Facebook page used by website feed blocks.',
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'facebook', label: 'Facebook profile URL', type: 'text', required: false },
                { name: 'instagram', label: 'Instagram profile URL', type: 'text', required: false },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'youtube', label: 'YouTube channel URL', type: 'text', required: false },
                { name: 'x', label: 'X profile URL', type: 'text', required: false },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'flickrTag', label: 'Flickr tag', type: 'text', required: false },
                { name: 'flickrURL', label: 'Flickr URL', type: 'text', required: false },
              ],
            },
            {
              name: 'facebookConnection',
              label: 'Facebook feed connection',
              type: 'ui',
              admin: {
                components: {
                  Field: {
                    path: '@/components/admin/FacebookConnectionField#FacebookConnectionField',
                  },
                },
              },
            },
            {
              type: 'collapsible',
              label: 'Facebook connection details',
              admin: {
                initCollapsed: true,
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'facebookConnectionStatus',
                      label: 'Status',
                      type: 'select',
                      defaultValue: 'disconnected',
                      options: [
                        { label: 'Disconnected', value: 'disconnected' },
                        { label: 'Connected', value: 'connected' },
                        { label: 'Error', value: 'error' },
                      ],
                      admin: { readOnly: true },
                    },
                    {
                      name: 'facebookPageName',
                      label: 'Connected page',
                      type: 'text',
                      required: false,
                      admin: { readOnly: true },
                    },
                    {
                      name: 'facebookPageId',
                      label: 'Page ID',
                      type: 'text',
                      required: false,
                      admin: { readOnly: true },
                    },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'facebookConnectedAt',
                      label: 'Connected at',
                      type: 'date',
                      required: false,
                      admin: { readOnly: true },
                    },
                    {
                      name: 'facebookConnectedBy',
                      label: 'Connected by',
                      type: 'relationship',
                      relationTo: 'users',
                      required: false,
                      admin: { readOnly: true },
                    },
                  ],
                },
                {
                  name: 'facebookLastError',
                  label: 'Last connection error',
                  type: 'textarea',
                  required: false,
                  admin: { readOnly: true },
                },
                {
                  name: 'facebookPageAccessToken',
                  label: 'Facebook page access token',
                  type: 'textarea',
                  required: false,
                  admin: { hidden: true, readOnly: true },
                  access: {
                    read: ({ req }) => isSuperUser(req?.user),
                    update: ({ req }) => isSuperUser(req?.user),
                  },
                },
                {
                  name: 'facebookPageTasks',
                  label: 'Facebook page tasks',
                  type: 'array',
                  required: false,
                  admin: { hidden: true },
                  fields: [
                    { name: 'task', type: 'text', required: true },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: 'Email Defaults',
          description: 'Default sender, reply-to, and mailing address used by emails for this website.',
          fields: [
            {
              type: 'row',
              fields: [
                {
                  name: 'emailFromName',
                  label: 'Default sender name',
                  type: 'text',
                  admin: { description: 'Used when an email does not specify a different sender name.' },
                },
                {
                  name: 'emailFromEmail',
                  label: 'Default sender email',
                  type: 'email',
                  admin: { description: 'Must be allowed by the authenticated sending domain.' },
                },
              ],
            },
            {
              name: 'emailReplyTo',
              label: 'Default reply-to email',
              type: 'email',
              admin: { description: 'Used when an email does not specify a different reply-to address.' },
            },
            {
              name: 'iContactCampaignId',
              label: 'iContact sender property ID',
              type: 'text',
              admin: { description: 'Optional iContact campaign/sender property used for this site’s email delivery.' },
            },
            {
              name: 'mailingAddress',
              label: 'Email footer mailing address',
              type: 'textarea',
              defaultValue: [
                'Legislative Office Building, Room 4200',
                '300 Capitol Avenue',
                'Hartford, CT 06106',
                '',
                '860-240-8700',
                '800-842-1423',
              ].join('\n'),
              admin: { description: 'Physical mailing address shown in email footers.' },
            },
            {
              type: 'collapsible',
              label: 'Structured mailing address',
              admin: { initCollapsed: true },
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'mailingAddressLine1', label: 'Address line 1', type: 'text' },
                    { name: 'mailingAddressLine2', label: 'Address line 2', type: 'text' },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    { name: 'mailingAddressCity', label: 'City', type: 'text' },
                    { name: 'mailingAddressState', label: 'State', type: 'text' },
                    { name: 'mailingAddressPostalCode', label: 'ZIP', type: 'text' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}
