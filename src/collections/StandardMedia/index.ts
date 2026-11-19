import type {
  CollectionConfig,
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
} from 'payload'
import { triggerFrontendRevalidate } from '../../lib/utilities/revalidateFrontend'
import { siteSettingsEditComponent } from '@/components/admin/site-settings/sections'

type TenantDoc = { slug?: string | null }
type TenantQueryResult = { docs?: TenantDoc[] }

export const StandardMedia: CollectionConfig = {
  labels: {
    singular: 'Banners and Social Images',
    plural: 'Banners and Social Images',
  },
  slug: 'standard-media',
  admin: {
    group: 'Site Settings',
    useAsTitle: 'title',
    defaultColumns: ['title', 'updatedAt'],
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
            select: { slug: true },
          })
          const slugs = ((tenants as TenantQueryResult)?.docs || [])
            .map((t) => t?.slug)
            .filter((slug): slug is string => typeof slug === 'string' && slug.length > 0)
          const paths = ['/', ...slugs.map((s: string) => `/${s}`)]
          await triggerFrontendRevalidate({
            paths,
            tags: ['payload:standard-media', ...slugs.map((s: string) => `tenant:${s}`)],
          })
        } catch (e: unknown) {
          payload.logger?.error?.(
            `Failed to revalidate after standard-media change: ${e instanceof Error ? e.message : String(e)}`,
          )
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
          const slugs = ((tenants as TenantQueryResult)?.docs || [])
            .map((t) => t?.slug)
            .filter((slug): slug is string => typeof slug === 'string' && slug.length > 0)
          const paths = ['/', ...slugs.map((s: string) => `/${s}`)]
          await triggerFrontendRevalidate({
            paths,
            tags: ['payload:standard-media', ...slugs.map((s: string) => `tenant:${s}`)],
          })
        } catch (e: unknown) {
          payload.logger?.error?.(
            `Failed to revalidate after standard-media delete: ${e instanceof Error ? e.message : String(e)}`,
          )
        }
      }) as CollectionAfterDeleteHook,
    ],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      label: 'Title',
      required: true,
      defaultValue: 'Images and Videos',
      admin: {
        readOnly: true,
        description: 'Internal label only — not shown on the website.',
      },
    },
    {
      type: 'collapsible',
      label: 'Homepage banner',
      fields: [
        {
          name: 'bannerImage',
          label: 'Banner Image',
          type: 'upload',
          relationTo: 'media',
          required: true,
        },
        {
          type: 'row',
          fields: [
            {
              name: 'heroTextAlign',
              label: 'Hero text alignment',
              type: 'radio',
              options: [
                { label: 'Left', value: 'left' },
                { label: 'Right', value: 'right' },
              ],
              defaultValue: 'right',
              admin: {
                layout: 'horizontal',
                width: '50%',
                description: 'Align hero text to the left or right side on large screens.',
              },
            },
            {
              name: 'heroTextSize',
              label: 'Hero text size',
              type: 'radio',
              options: [
                { label: 'Small', value: 'small' },
                { label: 'Default', value: 'default' },
                { label: 'Large', value: 'large' },
              ],
              defaultValue: 'default',
              admin: {
                layout: 'horizontal',
                width: '50%',
              },
            },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'heroImageVerticalAlign',
              label: 'Hero Image Vertical Align',
              type: 'select',
              defaultValue: 'top',
              options: [
                { label: 'Top', value: 'top' },
                { label: 'Center', value: 'center' },
                { label: 'Bottom', value: 'bottom' },
              ],
              admin: {
                width: '50%',
                description:
                  'Controls which part of the image stays visible vertically when cropped.',
              },
            },
            {
              name: 'heroImageHorizontalAlign',
              label: 'Hero Image Horizontal Align',
              type: 'select',
              defaultValue: 'center',
              options: [
                { label: 'Left', value: 'left' },
                { label: 'Center', value: 'center' },
                { label: 'Right', value: 'right' },
              ],
              admin: {
                width: '50%',
                description:
                  'Controls which side of the image stays visible horizontally when cropped.',
              },
            },
          ],
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Other image placements',
      fields: [
        {
          name: 'mobileHeadshot',
          label: 'Mobile Headshot',
          type: 'upload',
          relationTo: 'media',
          required: true,
        },
        {
          name: 'defaultFeaturedImage',
          label: 'Default post image',
          type: 'upload',
          relationTo: 'media',
          required: true,
        },
        {
          name: 'districtImage',
          label: 'District image',
          type: 'upload',
          relationTo: 'media',
          required: false,
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Optional videos',
      admin: { initCollapsed: true },
      fields: [
        { name: 'bannerVideo', label: 'Banner video', type: 'upload', relationTo: 'media' },
        { name: 'introVideo', label: 'Intro video', type: 'upload', relationTo: 'media' },
      ],
    },
  ],
}
