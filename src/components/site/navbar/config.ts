import type { GlobalConfig } from 'payload'

import { link } from '@/collections/fields/link'
import { revalidateNavbar } from './hooks/revalidateNavbar'

export const Navbar: GlobalConfig = {
  slug: 'navbar',
  access: {
    read: () => true,
  },
  fields: [
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
  hooks: {
    afterChange: [revalidateNavbar],
  },
}
