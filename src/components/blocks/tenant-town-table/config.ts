import type { Block } from 'payload'

export const TenantTownTableBlockConfig: Block = {
  slug: 'tenantTownTable',
  interfaceName: 'TenantTownTableBlock',
  fields: [
    {
      name: 'townTableEyebrow',
      label: 'Eyebrow',
      type: 'text',
      defaultValue: 'District towns',
    },
    {
      name: 'townTableTitle',
      label: 'Title',
      type: 'text',
      defaultValue: 'Towns we serve',
      required: true,
    },
    {
      name: 'townTableDescription',
      label: 'Description',
      type: 'textarea',
    },
    {
      name: 'townTableTownLabel',
      label: 'Town Column Label',
      type: 'text',
      defaultValue: 'Town',
    },
    {
      name: 'townTableWebsiteLabel',
      label: 'Website Column Label',
      type: 'text',
      defaultValue: 'Website',
    },
    {
      name: 'townTableEmptyStateTitle',
      label: 'Empty State Title',
      type: 'text',
      defaultValue: 'No towns available',
    },
    {
      name: 'townTableEmptyStateDescription',
      label: 'Empty State Description',
      type: 'textarea',
      defaultValue: 'Add towns to the tenant rep-info record to populate this block automatically.',
    },
  ],
}
