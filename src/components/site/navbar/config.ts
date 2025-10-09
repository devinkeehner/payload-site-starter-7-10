import type { CollectionConfig, CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'
import { triggerFrontendRevalidate } from '../../../lib/utilities/revalidateFrontend'

import { link } from '@/collections/fields/link'


export const Navbar: CollectionConfig = {
  slug: 'navbars',
  labels: {
    singular: 'Navbar',
    plural: 'Navbar',
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'updatedAt'],
    group: 'Site Settings',
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
          await triggerFrontendRevalidate({ paths, tags: ['payload:navbars', ...slugs.map((s: string) => `tenant:${s}`)] })
        } catch (e) {
          payload.logger?.error?.('Failed to revalidate after navbar change', e as any)
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
          await triggerFrontendRevalidate({ paths, tags: ['payload:navbars', ...slugs.map((s: string) => `tenant:${s}`)] })
        } catch (e) {
          payload.logger?.error?.('Failed to revalidate after navbar delete', e as any)
        }
      }) as CollectionAfterDeleteHook,
    ],
  },

  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'navItems',
      label: 'Nav Items',
      type: 'array',
      admin: {
        initCollapsed: false,
        components: {
          RowLabel: '@/components/site/navbar/row-label#RowLabel',
        },
      },
      fields: [
        link({ appearances: false }),
        {
          name: 'newTab',
          type: 'checkbox',
          label: 'Open in new tab?',
          defaultValue: false,
        },
        {
          name: 'subNav',
          label: 'Sub-Items',
          type: 'array',
          admin: { initCollapsed: true },
          fields: [
            link({ appearances: false }),
            {
              name: 'newTab',
              type: 'checkbox',
              label: 'Open in new tab?',
              defaultValue: false,
            },
            {
              name: 'subSubNav',
              label: 'Tertiary Items',
              type: 'array',
              admin: { initCollapsed: true },
              fields: [
                link({ appearances: false }),
                {
                  name: 'newTab',
                  type: 'checkbox',
                  label: 'Open in new tab?',
                  defaultValue: false,
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}
