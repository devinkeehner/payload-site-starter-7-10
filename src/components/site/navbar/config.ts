import type { CollectionConfig, CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'
import { triggerFrontendRevalidate } from '../../../lib/utilities/revalidateFrontend'

import { link } from '@/collections/fields/link'
import { siteSettingsEditComponent } from '@/components/admin/site-settings/sections'


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
    components: { views: { edit: { default: { Component: siteSettingsEditComponent } } } },
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
            select: { slug: true } as const,
          })
          const slugs = (tenants?.docs || [])
            .map((t) => (typeof (t as { slug?: unknown }).slug === 'string' ? (t as { slug?: string }).slug : undefined))
            .filter((slug): slug is string => typeof slug === 'string')
          const paths = ['/', ...slugs.map((s: string) => `/${s}`)]
          await triggerFrontendRevalidate({ paths, tags: ['payload:navbars', ...slugs.map((s: string) => `tenant:${s}`)] })
        } catch (err) {
          payload.logger?.error?.({ err }, 'Failed to revalidate after navbar change')
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
            select: { slug: true } as const,
          })
          const slugs = (tenants?.docs || [])
            .map((t) => (typeof (t as { slug?: unknown }).slug === 'string' ? (t as { slug?: string }).slug : undefined))
            .filter((slug): slug is string => typeof slug === 'string')
          const paths = ['/', ...slugs.map((s: string) => `/${s}`)]
          await triggerFrontendRevalidate({ paths, tags: ['payload:navbars', ...slugs.map((s: string) => `tenant:${s}`)] })
        } catch (err) {
          payload.logger?.error?.({ err }, 'Failed to revalidate after navbar delete')
        }
      }) as CollectionAfterDeleteHook,
    ],
  },

  fields: [
    {
      name: 'name',
      label: 'Menu name',
      type: 'text',
      required: true,
    },
    {
      name: 'navItems',
      label: 'Menu links',
      type: 'array',
      admin: {
        initCollapsed: true,
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
          admin: { initCollapsed: true, components: { RowLabel: '@/components/site/navbar/row-label#RowLabel' } },
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
              admin: { initCollapsed: true, components: { RowLabel: '@/components/site/navbar/row-label#RowLabel' } },
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
