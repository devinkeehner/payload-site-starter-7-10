import type { CollectionConfig, CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'
import { triggerFrontendRevalidate } from '../../lib/utilities/revalidateFrontend'

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
          await triggerFrontendRevalidate({ paths, tags: ['payload:standard-media', ...slugs.map((s: string) => `tenant:${s}`)] })
        } catch (e) {
          payload.logger?.error?.('Failed to revalidate after standard-media change', e as any)
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
          await triggerFrontendRevalidate({ paths, tags: ['payload:standard-media', ...slugs.map((s: string) => `tenant:${s}`)] })
        } catch (e) {
          payload.logger?.error?.('Failed to revalidate after standard-media delete', e as any)
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
      name: 'bannerImage',
      label: 'Banner Image',
      type: 'upload',
      relationTo: 'media',
      required: true,
    },
    {
      name: 'bannerVideo',
      label: 'Banner Video',
      type: 'upload',
      relationTo: 'media',
    },
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
    {
      name: 'introVideo',
      label: 'Intro Video',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'mobileHeadshot',
      label: 'Mobile Headshot',
      type: 'upload',
      relationTo: 'media',
      required: true,
    },
    {
      name: 'defaultFeaturedImage',
      label: 'Default Featured Image',
      type: 'upload',
      relationTo: 'media',
      required: true,
    },
    {
      name: 'districtImage',
      label: 'District Image (Optional)',
      type: 'upload',
      relationTo: 'media',
      required: false,
    },
  ],
}
