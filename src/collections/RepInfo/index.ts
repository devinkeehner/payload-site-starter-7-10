import type {
  CollectionConfig,
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
} from 'payload'
import { triggerFrontendRevalidate } from '../../lib/utilities/revalidateFrontend'
import { isSuperUser } from '@/lib/access/isSuperUser'

type TenantDoc = { slug?: string | null }
type TenantQueryResult = { docs?: TenantDoc[] }

export const RepInfo: CollectionConfig = {
  labels: {
    singular: 'Rep & District Settings',
    plural: 'Rep & District Settings',
  },
  slug: 'rep-info',
  admin: {
    group: 'Site Settings',
    useAsTitle: 'name',
    defaultColumns: ['name', 'districtNumber', 'updatedAt'],
  },
  access: {
    read: () => true,
  },
  hooks: {
    afterChange: [
      (async ({ req: { payload, context } }) => {
        if (context?.disableRevalidate) return
        try {
          const tenants = await payload.find({
            collection: 'tenants',
            limit: 1000,
            depth: 0,
            select: { slug: true },
          })
          const slugs = (((tenants as TenantQueryResult)?.docs || [])
            .map((t) => t?.slug)
            .filter((slug): slug is string => typeof slug === 'string' && slug.length > 0))
          const paths = ['/', ...slugs.map((s: string) => `/${s}`)]
          await triggerFrontendRevalidate({ paths, tags: ['payload:rep-info', ...slugs.map((s: string) => `tenant:${s}`)] })
        } catch (e: unknown) {
          payload.logger?.error?.(`Failed to revalidate after rep-info change: ${e instanceof Error ? e.message : String(e)}`)
        }
      }) as CollectionAfterChangeHook,
    ],
    afterDelete: [
      (async ({ req: { payload, context } }) => {
        if (context?.disableRevalidate) return
        try {
          const tenants = await payload.find({
            collection: 'tenants',
            limit: 1000,
            depth: 0,
            select: { slug: true },
          })
          const slugs = (((tenants as TenantQueryResult)?.docs || [])
            .map((t) => t?.slug)
            .filter((slug): slug is string => typeof slug === 'string' && slug.length > 0))
          const paths = ['/', ...slugs.map((s: string) => `/${s}`)]
          await triggerFrontendRevalidate({ paths, tags: ['payload:rep-info', ...slugs.map((s: string) => `tenant:${s}`)] })
        } catch (e: unknown) {
          payload.logger?.error?.(`Failed to revalidate after rep-info delete: ${e instanceof Error ? e.message : String(e)}`)
        }
      }) as CollectionAfterDeleteHook,
    ],
  },
  fields: [
    {
      name: 'officeTitle',
      label: 'Title',
      type: 'text',
      required: true,
    },
    {
      name: 'name',
      label: 'Name',
      type: 'text',
      required: true,
    },
    {
      name: 'districtNumber',
      label: 'District Number',
      type: 'number',
      required: true,
    },
    {
      name: 'towns',
      label: 'Towns',
      type: 'array',
      minRows: 1,
      fields: [
        {
          name: 'town',
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
          label: 'House GOP STRAP Aid',
          type: 'number',
          min: 0,
        },
        {
          name: 'url',
          label: 'Town Website URL',
          type: 'text',
          admin: {
            description: 'Optional: paste the town website URL, including https:// (opens in a new tab).',
          },
          validate: (value: unknown) => {
            if (!value) return true
            if (typeof value !== 'string') {
              return 'Enter a valid URL (example: https://www.example.com)'
            }
            try {
               
              new URL(value)
              return true
            } catch (_) {
              return 'Enter a valid URL (example: https://www.example.com)'
            }
          },
        },
      ],
    },
    {
      name: 'form',
      label: 'Form',
      type: 'relationship',
      relationTo: 'forms',
      required: false,
    },
    {
      name: 'facebook',
      label: 'Facebook',
      type: 'text',
      required: false,
    },
    {
      name: 'youtube',
      label: 'YouTube',
      type: 'text',
      required: false,
    },
    {
      name: 'instagram',
      label: 'Instagram',
      type: 'text',
      required: false,
    },
    {
      name: 'x',
      label: 'X.com',
      type: 'text',
      required: false,
    },
    {
      name: 'flickrTag',
      label: 'Flickr Tag',
      type: 'text',
      required: false,
    },
    {
      name: 'flickrURL',
      label: 'Flickr URL',
      type: 'text',
      required: false,
    },
    {
      name: 'postTakeawaysPlacement',
      label: 'Post Takeaways Display',
      type: 'select',
      defaultValue: 'featured',
      options: [
        {
          label: 'Featured near top',
          value: 'featured',
        },
        {
          label: 'Collapsible bottom row',
          value: 'footer',
        },
      ],
      admin: {
        description:
          'Controls where approved post takeaways appear on this representative site. Takeaways remain required for publishing; the bottom option tucks them into expandable post details.',
      },
    },
    {
      name: 'facebookConnection',
      label: 'Facebook Connection',
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
      name: 'facebookPageId',
      label: 'Facebook Page ID',
      type: 'text',
      required: false,
      admin: {
        description: 'Numeric page ID selected through the Facebook connection flow.',
        readOnly: true,
      },
    },
    {
      name: 'facebookPageName',
      label: 'Facebook Page Name',
      type: 'text',
      required: false,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'facebookPageAccessToken',
      label: 'Facebook Page Access Token',
      type: 'textarea',
      required: false,
      admin: {
        description: 'Stored from the Facebook connection flow. Keep this field secure.',
        readOnly: true,
        hidden: true,
      },
      access: {
        read: ({ req }) => isSuperUser(req?.user),
        update: ({ req }) => isSuperUser(req?.user),
      },
    },
    {
      name: 'facebookPageTasks',
      label: 'Facebook Page Tasks',
      type: 'array',
      required: false,
      admin: {
        hidden: true,
      },
      fields: [
        {
          name: 'task',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      name: 'facebookConnectionStatus',
      label: 'Facebook Connection Status',
      type: 'select',
      defaultValue: 'disconnected',
      options: [
        {
          label: 'Disconnected',
          value: 'disconnected',
        },
        {
          label: 'Connected',
          value: 'connected',
        },
        {
          label: 'Error',
          value: 'error',
        },
      ],
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'facebookConnectedAt',
      label: 'Facebook Connected At',
      type: 'date',
      required: false,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'facebookConnectedBy',
      label: 'Facebook Connected By',
      type: 'relationship',
      relationTo: 'users',
      required: false,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'facebookLastError',
      label: 'Facebook Last Error',
      type: 'textarea',
      required: false,
      admin: {
        readOnly: true,
      },
    },
  ],
}
