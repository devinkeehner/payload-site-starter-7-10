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
      type: 'array',
      fields: [
        link({
          appearances: false,
        }),
      ],
      maxRows: 6,
      admin: {
        initCollapsed: true,
        components: {
          RowLabel: '@/components/site/navbar/row-label#RowLabel',
        },
      },
    },
  ],
  hooks: {
    afterChange: [revalidateNavbar],
  },
}
