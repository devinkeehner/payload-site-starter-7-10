import type { CollectionConfig } from 'payload'

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
        description: 'Align hero text to the left or right side on large screens.',
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
