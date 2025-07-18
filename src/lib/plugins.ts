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
  // Multi-tenant must run first so other plugins respect tenant scoping
  multiTenantPlugin({
    tenantsSlug: 'tenants',     // identify the Tenants collection
    // disable tenant-based access constraints for admins
    useTenantsCollectionAccess: true,
    useTenantsListFilter: true,
    useUsersTenantFilter: true,
    debug: true,
    // allow super users to see all tenants
    userHasAccessToAllTenants: (user) => !!user.roles?.includes('super'),
    collections: {
      navbars: { isGlobal: true },
      posts: {},
      'wordpress-posts': {},
      'standard-media': { isGlobal: true },
      'rep-info': { isGlobal: true },
      'site-seo': { isGlobal: true },
    },
  }),
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
      slug: 'forms',
      admin: {
        group: 'Content',
        defaultColumns: ['title', 'tenant', 'updatedAt'],
      },
      access: {
        read: ({ req }) => {
          const { user, payload } = req;
          if (!user) return false;

          // Super admins can see all, but we can also filter by the tenant in the query
          if (user.roles?.includes('super')) {
            return true;
          }

          // Non-super-admins are restricted to their own tenant(s)
          return { tenant: { in: user.tenants } };
        },
        // Other access controls remain the same for now
        create: ({ req: { user } }) => {
          if (!user) return false;
          if (user.roles?.includes('super')) return true;
          return !!user.tenants?.[0];
        },
        update: ({ req: { user } }) => {
          if (!user) return false;
          if (user.roles?.includes('super')) return true;
          return { tenant: { equals: user.tenants?.[0] } };
        },
        delete: ({ req: { user } }) => {
          if (!user) return false;
          if (user.roles?.includes('super')) return true;
          return { tenant: { equals: user.tenants?.[0] } };
        },
      },
      hooks: {
        beforeChange: [
          ({ req, data }) => {
            // If a tenant is selected in the UI, use that.
            // Otherwise, for non-super-admins, assign their first tenant.
            const tenantFromReq = (req as unknown as { tenant?: { id: string } }).tenant;
            if (tenantFromReq) {
              data.tenant = tenantFromReq.id;
            } else if (req.user && !req.user.roles?.includes('super')) {
              data.tenant = data.tenant || req.user.tenants?.[0];
            }
            return data;
          },
        ],
      },
      fields: ({ defaultFields }) => {
        const tenantField: any = {
          name: 'tenant',
          type: 'relationship',
          relationTo: 'tenants',
          required: true,
          admin: {
            position: 'sidebar',
            readOnly: true,
            hidden: true,
          },
          filterOptions: ({ user }: { user: User }) => {
            if (!user) return { id: { equals: 'null' } };
            if (user.roles?.includes('super')) return {};
            return { id: { equals: user.tenants?.[0] } };
          },
        };

        const allFields = [...defaultFields, tenantField];

        return allFields.map((field) => {
          if ('name' in field && field.name === 'confirmationMessage') {
            return {
              ...field,
              editor: lexicalEditor({
                features: ({ rootFeatures }) => {
                  return [
                    ...rootFeatures,
                    FixedToolbarFeature(),
                    HeadingFeature({ enabledHeadingSizes: ['h1', 'h2', 'h3', 'h4'] }),
                  ];
                },
              }),
            };
          }
          return field;
        });
      },
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
]
