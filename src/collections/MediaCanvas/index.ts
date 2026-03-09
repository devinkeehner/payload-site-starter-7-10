import type { CollectionConfig } from 'payload'
import {
  FixedToolbarFeature,
  InlineToolbarFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'

import { authenticated } from '@/lib/access/authenticated'
import { anyone } from '@/lib/access/anyone'
import { isSuperUser } from '@/lib/access/isSuperUser'

export const MediaCanvas: CollectionConfig = {
  labels: {
    singular: 'Canvas',
    plural: 'Canvas',
  },
  slug: 'media-canvas',
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'updatedAt'],
    hidden: ({ user }) => !isSuperUser(user),
  },
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      label: 'Title',
      required: true,
    },
    {
      name: 'image',
      label: 'Image',
      type: 'upload',
      relationTo: 'media',
      required: true,
      admin: {
        description: 'Upload or select an image to compose into a 1200×630 canvas',
      },
    },
    {
      name: 'sourcePost',
      label: 'Source Post',
      type: 'relationship',
      relationTo: 'posts',
      admin: {
        description: 'Optional. If selected, the editor can pull the post title into the main headline area automatically.',
      },
    },
    // Prototype: Lexical editor as the source of canvas text lines
    {
      name: 'richText',
      type: 'richText',
      label: 'Text',
      editor: lexicalEditor({
        features: ({ rootFeatures }) => {
          // Basic toolbar with formatting and inline controls
          return [
            ...rootFeatures,
            FixedToolbarFeature(),
            InlineToolbarFeature(),
          ]
        },
      }),
      admin: {
        description: 'Legacy field. No longer used by the current canvas editor.',
        hidden: true,
      },
    },
    {
      name: 'heading',
      type: 'text',
      label: 'Heading',
      admin: {
        hidden: true,
      },
    },
    {
      name: 'subheading',
      type: 'text',
      label: 'Headline Override',
      admin: {
        description: 'Leave blank to use the selected Source Post title in the main headline area.',
        hidden: true,
      },
    },
    // Hidden state fields persisted for the editor
    {
      name: 'posX',
      type: 'number',
      label: 'Position X',
      defaultValue: 0,
      admin: { hidden: true },
    },
    {
      name: 'posY',
      type: 'number',
      label: 'Position Y',
      defaultValue: 0,
      admin: { hidden: true },
    },
    {
      name: 'scale',
      type: 'number',
      label: 'Scale',
      defaultValue: 1,
      admin: { hidden: true },
    },
    // Text positions (persisted)
    {
      name: 'headingX',
      type: 'number',
      label: 'Heading X',
      defaultValue: 36,
      admin: { hidden: true },
    },
    {
      name: 'headingY',
      type: 'number',
      label: 'Heading Y',
      defaultValue: 474, // 630 - 36 - 120
      admin: { hidden: true },
    },
    {
      name: 'subheadingX',
      type: 'number',
      label: 'Subheading X',
      defaultValue: 680,
      admin: { hidden: true },
    },
    {
      name: 'subheadingY',
      type: 'number',
      label: 'Subheading Y',
      defaultValue: 340,
      admin: { hidden: true },
    },
    {
      name: 'headingWidth',
      type: 'number',
      label: 'Heading Width',
      defaultValue: 1128, // 1200 - 36*2
      admin: { hidden: true },
    },
    {
      name: 'subheadingWidth',
      type: 'number',
      label: 'Subheading Width',
      defaultValue: 480,
      admin: { hidden: true },
    },
    // Prototype: Per-paragraph layout for richText paragraphs (JSON map keyed by index)
    {
      name: 'rtLayout',
      label: 'Rich Text Layout',
      type: 'json',
      admin: { hidden: true, description: 'Legacy auto-managed positions for older Lexical-based canvas content.' },
    },
    {
      name: 'editorState',
      label: 'Editor State',
      type: 'json',
      admin: { hidden: true, description: 'Auto-managed editor selection and layer locks' },
    },
    {
      name: 'textBlocks',
      label: 'Additional Text Blocks',
      type: 'array',
      labels: { singular: 'Text Block', plural: 'Text Blocks' },
      admin: {
        description: 'Auto-managed by the canvas editor.',
        hidden: true,
      },
      fields: [
        {
          name: 'id',
          type: 'text',
          label: 'Layer ID',
          admin: { hidden: true },
        },
        {
          name: 'label',
          type: 'text',
          label: 'Layer Label',
          defaultValue: 'Text',
          admin: { hidden: true },
        },
        {
          name: 'source',
          type: 'select',
          label: 'Source',
          defaultValue: 'manual',
          options: [
            { label: 'Manual', value: 'manual' },
            { label: 'Post Title', value: 'postTitle' },
          ],
          admin: { hidden: true },
        },
        {
          name: 'text',
          type: 'text',
          label: 'Text',
          defaultValue: 'Text here',
        },
        {
          name: 'x',
          type: 'number',
          label: 'X',
          defaultValue: 36,
          admin: { hidden: true },
        },
        {
          name: 'y',
          type: 'number',
          label: 'Y',
          defaultValue: 546,
          admin: { hidden: true },
        },
        {
          name: 'width',
          type: 'number',
          label: 'Width',
          defaultValue: 1128,
          admin: { hidden: true },
        },
        {
          name: 'font',
          type: 'text',
          label: 'Font (CSS)',
          defaultValue: '600 24px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
          admin: { hidden: true },
        },
        {
          name: 'color',
          type: 'text',
          label: 'Color',
          defaultValue: '#111111',
          admin: { hidden: true },
        },
        {
          name: 'lineHeight',
          type: 'number',
          label: 'Line Height',
          defaultValue: 38,
          admin: { hidden: true },
        },
        {
          name: 'align',
          type: 'select',
          label: 'Align',
          defaultValue: 'left',
          options: [
            { label: 'Left', value: 'left' },
            { label: 'Center', value: 'center' },
            { label: 'Right', value: 'right' },
          ],
          admin: { hidden: true },
        },
        {
          name: 'stylePreset',
          type: 'text',
          label: 'Style Preset',
          defaultValue: 'byline',
          admin: { hidden: true },
        },
        {
          name: 'locked',
          type: 'checkbox',
          label: 'Locked',
          defaultValue: false,
          admin: { hidden: true },
        },
      ],
    },
    // UI Canvas Editor
    {
      name: 'editor',
      type: 'ui',
      label: 'Canvas Editor (1200×630)',
      admin: {
        components: {
          Field: {
            path: '@/components/admin/MediaCanvasField#MediaCanvasField',
          },
        },
      },
    },
  ],
}

export default MediaCanvas
