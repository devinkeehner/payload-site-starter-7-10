import type { CollectionConfig } from 'payload'

import { isCollectionHiddenForRole, roleRestrictedAccess } from '@/lib/access/roles'
import { defaultGraphicScene } from '@/lib/graphics/defaultScene'
import { createDefaultGraphicScene as createDefaultGraphicStudioScene } from '@/lib/graphics/studioTypes'

export const GraphicDesigns: CollectionConfig = {
  slug: 'graphic-designs',
  defaultSort: '-updatedAt',
  labels: {
    singular: 'Graphic Design',
    plural: 'Graphic Designs',
  },
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'sourcePost', 'updatedAt'],
    description: 'Create and manage Post social and SEO graphics.',
    hidden: isCollectionHiddenForRole('graphic-designs'),
    components: {
      views: {
        edit: {
          default: {
            Component: '@/components/admin/graphics/GraphicDesignDefaultView',
            tab: { label: 'Design Studio', order: 0 },
          },
          studio: {
            path: '/studio',
            Component: '@/components/admin/graphics/GraphicDesignStudioView',
          },
        },
        list: {
          Component: '@/components/admin/graphics/GraphicDesignGalleryListView',
        },
      },
    },
  },
  access: {
    create: roleRestrictedAccess('graphic-designs'),
    delete: roleRestrictedAccess('graphic-designs'),
    read: roleRestrictedAccess('graphic-designs'),
    update: roleRestrictedAccess('graphic-designs'),
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'template',
      type: 'relationship',
      relationTo: 'graphic-templates',
      required: false,
    },
    {
      name: 'sourceCollection',
      type: 'select',
      required: true,
      defaultValue: 'posts',
      options: [
        { label: 'Posts', value: 'posts' },
        { label: 'Pages', value: 'pages' },
      ],
    },
    {
      name: 'sourcePost',
      label: 'Source Post',
      type: 'relationship',
      relationTo: 'posts',
      required: false,
    },
    {
      name: 'primaryTenant',
      type: 'relationship',
      relationTo: 'tenants',
      required: false,
    },
    {
      name: 'secondaryTenant',
      type: 'relationship',
      relationTo: 'tenants',
      required: false,
    },
    {
      name: 'backgroundImage',
      label: 'Background Image',
      type: 'upload',
      relationTo: 'media',
      required: false,
    },
    {
      name: 'titleOverride',
      type: 'textarea',
      required: false,
    },
    {
      name: 'scene',
      label: 'Legacy Post Graphic Scene',
      type: 'json',
      required: true,
      defaultValue: defaultGraphicScene,
      admin: {
        description: 'Preserved for existing Post graphics. New studio edits are stored separately below.',
        readOnly: true,
      },
    },
    {
      name: 'studioScene',
      label: 'Design Studio Scene',
      type: 'json',
      required: true,
      defaultValue: createDefaultGraphicStudioScene,
      admin: {
        description: 'Open the Design Studio to edit this graphic visually.',
        readOnly: true,
      },
    },
    {
      name: 'puckData',
      label: 'Puck Graphic Document',
      type: 'json',
      admin: {
        description: 'Transition mirror for opening fixed-position graphics in the shared Puck builder.',
        hidden: true,
        readOnly: true,
      },
    },
    {
      name: 'exportedMedia',
      label: 'Exported Media',
      type: 'relationship',
      relationTo: 'media',
      required: false,
    },
    {
      name: 'notes',
      type: 'textarea',
      required: false,
    },
  ],
  versions: {
    drafts: { autosave: { interval: 1000 } },
    maxPerDoc: 25,
  },
}

export default GraphicDesigns
