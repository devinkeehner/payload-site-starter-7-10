import type { CollectionConfig } from 'payload'

import { link } from '@/collections/fields/link'


export const Navbar: CollectionConfig = {
  slug: 'navbars',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'updatedAt'],
    group: 'Site',
  },
  access: {
    read: () => true,
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
