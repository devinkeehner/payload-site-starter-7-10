import { multiTenantPlugin } from '@payloadcms/plugin-multi-tenant'
import { payloadCloudPlugin } from '@payloadcms/payload-cloud'
import { formBuilderPlugin } from '@payloadcms/plugin-form-builder'
import { nestedDocsPlugin } from '@payloadcms/plugin-nested-docs'
import { redirectsPlugin } from '@payloadcms/plugin-redirects'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { searchPlugin } from '@payloadcms/plugin-search'
import { Plugin, type Field } from 'payload'
import { revalidateRedirects } from '@/lib/hooks/revalidateRedirects'
import { GenerateTitle, GenerateURL } from '@payloadcms/plugin-seo/types'
import { searchFields } from '@/lib/search/fieldOverrides'
import { beforeSyncWithSearch } from '@/lib/search/beforeSync'
import { config } from '@/site.config'

import { Page, Post } from '@/payload-types'
import { getServerSideURL } from '@/lib/utilities/getURL'

const generateTitle: GenerateTitle<Post | Page> = ({ doc }) => {
  return doc?.title ? `${doc.title} | ${config.name}` : config.name
}

const generateURL: GenerateURL<Post | Page> = ({ doc }) => {
  const url = getServerSideURL()

  return doc?.slug ? `${url}/${doc.slug}` : url
}

export const plugins: Plugin[] = [
  redirectsPlugin({
    collections: ['pages', 'posts'],
    overrides: {
      admin: { group: 'Misc' },
      // @ts-expect-error - This is a valid override, mapped fields don't resolve to the same type
      fields: ({ defaultFields }) => {
        return defaultFields.map((field) => {
          if ('name' in field && field.name === 'from') {
            return {
              ...field,
 admin: {
                description: 'You will need to rebuild the website when changing this field.',
              },
            }
          }
          return field
        })
      },
      hooks: {
        afterChange: [revalidateRedirects],
      },
    },
  }),
  nestedDocsPlugin({
    collections: ['categories'],
    generateURL: (docs) => docs.reduce((url, doc) => `${url}/${doc.slug}`, ''),
  }),
  seoPlugin({
    generateTitle,
    generateURL,
  }),
  formBuilderPlugin({
    fields: {
      payment: false,
      radio: true,
      'checkbox-group': {
        slug: 'checkbox-group',
        fields: [
          {
            type: 'row',
            fields: [
              { name: 'name', type: 'text', label: 'Name (lowercase, no special characters)', required: true, admin: { width: '50%' } },
              { name: 'label', type: 'text', label: 'Label', localized: true, admin: { width: '50%' } },
            ],
          },
          {
            type: 'row',
            fields: [
              { name: 'width', type: 'number', label: 'Field Width (percentage)', admin: { width: '50%' } },
            ],
          },
          {
            name: 'options',
            type: 'array',
            label: 'Checkbox Options',
            labels: { singular: 'Option', plural: 'Options' },
            fields: [
              {
                type: 'row',
                fields: [
                  { name: 'label', type: 'text', label: 'Label', localized: true, required: true, admin: { width: '50%' } },
                  { name: 'value', type: 'text', label: 'Value', required: true, admin: { width: '50%' } },
                ],
              },
            ],
          },
          { name: 'required', type: 'checkbox', label: 'Required' },
        ],
        labels: { singular: 'Checkbox Group', plural: 'Checkbox Groups' },
      } as any,
      'image-select': {
        slug: 'image-select',
        fields: [
          {
            type: 'row',
            fields: [
              {
                name: 'name',
                type: 'text',
                label: 'Name (lowercase, no special characters)',
                required: true,
                admin: { width: '50%' },
              },
              {
                name: 'label',
                type: 'text',
                label: 'Label',
                localized: true,
                admin: { width: '50%' },
              },
            ],
          },
          {
            type: 'row',
            fields: [
              {
                name: 'width',
                type: 'number',
                label: 'Field Width (percentage)',
                admin: { width: '50%' },
              },
              {
                name: 'allowMultiple',
                type: 'checkbox',
                label: 'Allow Multiple Selections',
                admin: { width: '50%' },
              },
            ],
          },
          {
            name: 'options',
            type: 'array',
            label: 'Options',
            labels: { singular: 'Option', plural: 'Options' },
            fields: [
              {
                type: 'row',
                fields: [
                  {
                    name: 'label',
                    type: 'text',
                    label: 'Label',
                    localized: true,
                    required: true,
                    admin: { width: '33%' },
                  },
                  {
                    name: 'value',
                    type: 'text',
                    label: 'Value',
                    required: true,
                    admin: { width: '33%' },
                  },
                  {
                    name: 'image',
                    type: 'upload',
                    relationTo: 'media',
                    label: 'Image',
                    admin: {
                      width: '33%',
                    },
                  },
                ],
              },
            ],
          },
          { name: 'required', type: 'checkbox', label: 'Required' },
        ],
        labels: { singular: 'Image Select', plural: 'Image Selects' },
      } as any,
    },
    formOverrides: {
      admin: { group: 'Forms & Submissions' },
    },
    formSubmissionOverrides: {
      admin: { group: 'Forms & Submissions' },
    },
    defaultToEmail: process.env.RESEND_FROM_EMAIL || '',
  }),
  searchPlugin({
    collections: ['posts'],
    beforeSync: beforeSyncWithSearch,
    searchOverrides: {
      admin: { group: 'Misc', hidden: true },
      fields: ({ defaultFields }) => {
        return [...defaultFields, ...searchFields]
      },
    },
  }),
  payloadCloudPlugin(),
  // Multi-tenant must run first so other plugins respect tenant scoping
  multiTenantPlugin({
    tenantsSlug: 'tenants', // identify the Tenants collection
    tenantSelectorLabel: 'Select Site',
    // disable tenant-based access constraints for admins
    useTenantsCollectionAccess: true,
    useTenantsListFilter: true,
    // Filter by a user's assigned tenants
    useUsersTenantFilter: true,
    debug: true,
    // allow super users to see all tenants
    userHasAccessToAllTenants: (user) => !!user.roles?.includes('super'),
    collections: {
      navbars: { isGlobal: true },
      posts: {},
      'wordpress-posts': {},
      pages: {},
      media: {},
      'media-canvas': {},
      'standard-media': { isGlobal: true },
      'rep-info': { isGlobal: true },
      'site-seo': { isGlobal: true },
      forms: {},
      'form-submissions': {},
    } as any,
  }),
  // Rename tenant field labels to use "Site" terminology
  (config) => {
    config.collections?.forEach((collection) => {
      const traverse = (fields: Field[]): void => {
        fields.forEach((field) => {
          if ('name' in field && field.name === 'tenant') field.label = 'Site'
          if ('name' in field && field.name === 'tenants') field.label = 'Sites'
          if ('fields' in field && Array.isArray(field.fields)) {
            traverse(field.fields as Field[])
          }
        })
      }
      if (Array.isArray(collection.fields)) {
        traverse(collection.fields as Field[])
      }
    })
    return config
  },
]
