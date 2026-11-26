import type { CollectionConfig } from 'payload'
import { ComposableSectionConfig } from '@/components/blocks/composable-section/config'

export const PageSectionTemplates: CollectionConfig = {
  slug: 'page-section-templates',
  admin: { hidden: true },
  // The Pages Live Editor checks both the page and its assigned site before access.
  access: { create: () => false, read: () => false, update: () => false, delete: () => false },
  fields: [
    { name: 'tenant', type: 'relationship', relationTo: 'tenants', required: true, index: true },
    { name: 'name', type: 'text', required: true, maxLength: 100 },
    { name: 'layout', type: 'blocks', blocks: [ComposableSectionConfig], minRows: 1, maxRows: 1, required: true },
  ],
}
