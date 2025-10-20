import type { CollectionConfig, CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'
import { triggerFrontendRevalidate } from '../../lib/utilities/revalidateFrontend'

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
            select: { slug: true } as any,
          })
          const slugs = (tenants?.docs || []).map((t: any) => t?.slug).filter(Boolean)
          const paths = ['/', ...slugs.map((s: string) => `/${s}`)]
          await triggerFrontendRevalidate({ paths, tags: ['payload:rep-info', ...slugs.map((s: string) => `tenant:${s}`)] })
        } catch (e) {
          payload.logger?.error?.('Failed to revalidate after rep-info change', e as any)
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
            select: { slug: true } as any,
          })
          const slugs = (tenants?.docs || []).map((t: any) => t?.slug).filter(Boolean)
          const paths = ['/', ...slugs.map((s: string) => `/${s}`)]
          await triggerFrontendRevalidate({ paths, tags: ['payload:rep-info', ...slugs.map((s: string) => `tenant:${s}`)] })
        } catch (e) {
          payload.logger?.error?.('Failed to revalidate after rep-info delete', e as any)
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
          name: 'url',
          label: 'Town Website URL',
          type: 'text',
          admin: {
            description: 'Optional: paste the town website URL, including https:// (opens in a new tab).',
          },
          validate: (value) => {
            if (!value) return true
            try {
              // eslint-disable-next-line no-new
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
  ],
}
