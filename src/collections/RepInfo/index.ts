import type { CollectionConfig } from 'payload'

export const RepInfo: CollectionConfig = {
  labels: {
    singular: 'Rep Info',
    plural: 'Rep Info',
  },
  slug: 'rep-info',
  admin: {
    group: 'Site',
    useAsTitle: 'name',
    defaultColumns: ['name', 'districtNumber', 'updatedAt'],
  },
  access: {
    read: () => true,
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
      label: 'X',
      type: 'text',
      required: false,
    },
  ],
}
