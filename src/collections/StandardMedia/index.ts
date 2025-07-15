import type { CollectionConfig } from 'payload'

export const StandardMedia: CollectionConfig = {
  labels: {
    singular: 'Images and Videos',
    plural: 'Images and Videos',
  },
  slug: 'standard-media',
  admin: {
    group: 'Site',
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
