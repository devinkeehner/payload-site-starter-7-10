import type { Field } from 'payload'
export const tinyURLAliasField: Field = {
  name: 'shortLinkAlias',
  label: 'TinyURL alias',
  type: 'text',
  admin: {
    position: 'sidebar',
    components: { Field: '@/components/admin/TinyURLField#TinyURLField' },
    description:
      'Save/publish content before syncing the short link. The Short Links collection shows all existing aliases and sync errors.',
  },
}
