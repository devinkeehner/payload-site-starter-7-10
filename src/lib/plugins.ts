import { multiTenantPlugin } from '@payloadcms/plugin-multi-tenant'
import { payloadCloudPlugin } from '@payloadcms/payload-cloud'
import { formBuilderPlugin } from '@payloadcms/plugin-form-builder'
import { nestedDocsPlugin } from '@payloadcms/plugin-nested-docs'
import { redirectsPlugin } from '@payloadcms/plugin-redirects'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { searchPlugin } from '@payloadcms/plugin-search'
import { Plugin } from 'payload'
import { revalidateRedirects } from '@/lib/hooks/revalidateRedirects'
import { GenerateTitle, GenerateURL } from '@payloadcms/plugin-seo/types'
import { FixedToolbarFeature, HeadingFeature, lexicalEditor } from '@payloadcms/richtext-lexical'
import { searchFields } from '@/lib/search/fieldOverrides'
import { beforeSyncWithSearch } from '@/lib/search/beforeSync'
import { config } from '@/site.config'

import { Page, Post, User } from '@/payload-types'
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
    },
    formOverrides: {
      admin: { group: 'Content' },
    },
    formSubmissionOverrides: {
      admin: { group: 'Content' },
    },
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
    tenantsSlug: 'tenants',     // identify the Tenants collection
    // disable tenant-based access constraints for admins
    useTenantsCollectionAccess: true,
    useTenantsListFilter: true,
    // Temporarily disable tenant scoping for users
    useUsersTenantFilter: false,
    debug: true,
    // allow super users to see all tenants
    userHasAccessToAllTenants: (user) => !!user.roles?.includes('super'),
    collections: {
      navbars: { isGlobal: true },
      posts: {},
      'wordpress-posts': {},
      pages: {},
      media: {},
      'standard-media': { isGlobal: true },
      'rep-info': { isGlobal: true },
      'site-seo': { isGlobal: true },
      forms: {},
      'form-submissions': {},
    },
  }),
]
