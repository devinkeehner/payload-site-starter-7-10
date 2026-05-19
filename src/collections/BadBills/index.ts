import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeChangeHook,
  CollectionConfig,
  PayloadRequest,
} from 'payload'

import { authenticatedOrPublished } from '@/lib/access/authenticatedOrPublished'
import { isSuperUser } from '@/lib/access/isSuperUser'
import { getServerSideURL } from '@/lib/utilities/getURL'
import { triggerFrontendRevalidate } from '@/lib/utilities/revalidateFrontend'
import {
  MetaDescriptionField,
  MetaImageField,
  MetaTitleField,
  OverviewField,
  PreviewField,
} from '@payloadcms/plugin-seo/fields'

type TenantDoc = {
  id: string
  slug?: string | null
}

type TenantQueryResult = {
  docs?: TenantDoc[]
}

const MAIN_TENANT_SLUG = 'main'
const TENANT_HINT_KEYS = ['x-payload-tenant', 'x-payload-tenant-id']
const COOKIE_TENANT_KEYS = ['payload-tenant', 'payload-tenant-id', 'tenant', 'tenantId', 'selectedTenant', 'currentTenant']

const getHeaderValue = (req: PayloadRequest, name: string): string => {
  const headers = req?.headers as unknown
  if (headers && typeof (headers as { get?: (key: string) => string | null }).get === 'function') {
    return (headers as { get: (key: string) => string | null }).get(name) || ''
  }

  const raw = (headers as Record<string, string | string[] | undefined>)?.[name]
  return Array.isArray(raw) ? raw[0] || '' : raw || ''
}

const readSelectedTenantHint = (req: PayloadRequest): string | undefined => {
  for (const key of TENANT_HINT_KEYS) {
    const value = getHeaderValue(req, key).trim()
    if (value) return value
  }

  const cookieHeader = getHeaderValue(req, 'cookie')
  if (!cookieHeader) return undefined

  const cookies = cookieHeader.split(';').map((cookie) => cookie.trim())
  for (const key of COOKIE_TENANT_KEYS) {
    const match = cookies.find((cookie) => cookie.startsWith(`${key}=`))
    if (!match) continue
    const value = decodeURIComponent(match.split('=')[1] || '').trim()
    if (value) return value
  }

  return undefined
}

const resolveTenantId = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string') {
    return value.id
  }
  return undefined
}

const getMainTenant = async (req: PayloadRequest): Promise<TenantDoc | null> => {
  const result = (await req.payload.find({
    collection: 'tenants',
    where: { slug: { equals: MAIN_TENANT_SLUG } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })) as TenantQueryResult

  return result.docs?.[0] ?? null
}

const isMainTenantSelection = (selectedTenant: string | undefined, mainTenant: TenantDoc): boolean => {
  if (!selectedTenant) return true
  return selectedTenant === mainTenant.id || selectedTenant === mainTenant.slug
}

const enforceMainTenant: CollectionBeforeChangeHook = async ({ data, req, originalDoc }) => {
  const mainTenant = await getMainTenant(req)
  if (!mainTenant) {
    throw new Error('The main site tenant could not be found.')
  }

  const selectedTenant = readSelectedTenantHint(req)
  if (!isSuperUser(req.user) && !isMainTenantSelection(selectedTenant, mainTenant)) {
    throw new Error('Bad Bills is only available for the main site.')
  }

  const existingTenantId = resolveTenantId((originalDoc as Record<string, unknown> | undefined)?.tenant)
  const incomingTenantId = resolveTenantId((data as Record<string, unknown> | undefined)?.tenant) ?? existingTenantId

  if (incomingTenantId && incomingTenantId !== mainTenant.id) {
    throw new Error('Bad Bills entries can only belong to the main site.')
  }

  return {
    ...data,
    tenant: mainTenant.id,
  }
}

const revalidateBadBillsPage = (async ({ req: { context } }) => {
  if (context?.disableRevalidate) return
  await triggerFrontendRevalidate({
    paths: ['/bad-bills'],
    tags: ['payload:bad-bills', 'tenant:main'],
  })
}) as CollectionAfterChangeHook

const revalidateBadBillsDelete = (async ({ req: { context } }) => {
  if (context?.disableRevalidate) return
  await triggerFrontendRevalidate({
    paths: ['/bad-bills'],
    tags: ['payload:bad-bills', 'tenant:main'],
  })
}) as CollectionAfterDeleteHook

const validateOptionalUrl = (value: unknown) => {
  if (!value) return true
  if (typeof value !== 'string') return 'Enter a valid URL including https://'

  try {
    new URL(value)
    return true
  } catch {
    return 'Enter a valid URL including https://'
  }
}

export const BadBills: CollectionConfig = {
  slug: 'bad-bills',
  labels: {
    singular: 'Bad Bills Page',
    plural: 'Bad Bills Pages',
  },
  access: {
    read: authenticatedOrPublished,
    create: ({ req }) => isSuperUser(req.user),
    update: ({ req }) => isSuperUser(req.user),
    delete: ({ req }) => isSuperUser(req.user),
  },
  admin: {
    group: 'Content',
    hidden: ({ user }) => !isSuperUser(user),
    useAsTitle: 'title',
    defaultColumns: ['title', 'updatedAt'],
    description: 'Campaign landing pages for the root /bad-bills route. This collection is reserved for the main site.',
    livePreview: {
      url: ({ data }) => {
        const encodedParams = new URLSearchParams({
          slug: 'bad-bills',
          collection: 'bad-bills',
          secret: process.env.PREVIEW_SECRET || '',
        })

        const tenantId = resolveTenantId(data?.tenant)
        if (tenantId) {
          encodedParams.set('tenant', tenantId)
        }

        return `${getServerSideURL()}/api/preview?${encodedParams.toString()}`
      },
    },
    preview: (data, { req }) => {
      const encodedParams = new URLSearchParams({
        slug: 'bad-bills',
        collection: 'bad-bills',
        path: '/bad-bills',
        secret: process.env.PREVIEW_SECRET || '',
      })

      const tenantFromData = resolveTenantId(data?.tenant)
      const tenantFromReq = (req as { tenant?: unknown })?.tenant
      const tenantId =
        tenantFromData ||
        (typeof tenantFromReq === 'string' ? tenantFromReq : (tenantFromReq as { id?: string } | null | undefined)?.id)

      if (tenantId) {
        encodedParams.set('tenant', tenantId)
      }

      return `${getServerSideURL()}/api/preview?${encodedParams.toString()}`
    },
  },
  defaultPopulate: {
    title: true,
    campaignYear: true,
    headline: true,
    form: true,
    tabs: true,
    meta: true,
  },
  hooks: {
    beforeChange: [enforceMainTenant],
    afterChange: [revalidateBadBillsPage],
    afterDelete: [revalidateBadBillsDelete],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Content',
          fields: [
            {
              name: 'logo',
              label: 'Logo',
              type: 'upload',
              relationTo: 'media',
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
              name: 'form',
              label: 'Form',
              type: 'relationship',
              relationTo: 'forms',
              required: false,
              filterOptions: ({ req }) => {
                const t = (req as { tenant?: unknown })?.tenant
                const tenantID = typeof t === 'string' ? t : (t as { id?: string | null } | null)?.id
                return tenantID ? { tenant: { equals: tenantID } } : true
              },
            },
            {
              name: 'tagline',
              label: 'Tagline',
              type: 'text',
              required: false,
              admin: { width: '50%' },
            },
            {
              name: 'campaignYear',
              label: 'Campaign Year',
              type: 'text',
              required: false,
              admin: { width: '50%' },
            },
            {
              name: 'headline',
              label: 'Headline',
              type: 'textarea',
              required: true,
            },
            {
              name: 'ctaPrefix',
              label: 'CTA Prefix',
              type: 'text',
              required: false,
              admin: { width: '40%' },
            },
            {
              name: 'ctaLinkLabel',
              label: 'CTA Link Label',
              type: 'text',
              required: false,
              admin: { width: '30%' },
            },
            {
              name: 'ctaUrl',
              label: 'CTA URL',
              type: 'text',
              required: false,
              validate: validateOptionalUrl,
              admin: { width: '30%' },
            },
            {
              name: 'tabs',
              label: 'Tabs',
              type: 'array',
              minRows: 1,
              required: true,
              fields: [
                {
                  name: 'label',
                  type: 'text',
                  required: true,
                  admin: { width: '50%' },
                },
                {
                  name: 'heading',
                  type: 'text',
                  required: false,
                  admin: { width: '50%' },
                },
                {
                  name: 'description',
                  type: 'textarea',
                  required: false,
                },
                {
                  name: 'bills',
                  label: 'Bill Blocks',
                  type: 'array',
                  minRows: 1,
                  required: true,
                  fields: [
                    {
                      name: 'image',
                      type: 'upload',
                      relationTo: 'media',
                      required: false,
                    },
                    {
                      name: 'billNumber',
                      label: 'Bill Number',
                      type: 'text',
                      required: true,
                      admin: { width: '35%' },
                    },
                    {
                      name: 'title',
                      type: 'text',
                      required: true,
                      admin: { width: '65%' },
                    },
                    {
                      name: 'description',
                      type: 'textarea',
                      required: true,
                    },
                    {
                      name: 'readMoreLabel',
                      label: 'Read More Label',
                      type: 'text',
                      required: false,
                      admin: { width: '40%' },
                    },
                    {
                      name: 'readMoreUrl',
                      label: 'Read More URL',
                      type: 'text',
                      required: false,
                      validate: validateOptionalUrl,
                      admin: { width: '60%' },
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          name: 'meta',
          label: 'Meta & SEO',
          fields: [
            {
              name: 'generateSEO',
              type: 'ui',
              label: 'AI Assistant',
              admin: {
                components: {
                  Field: {
                    path: './components/admin/GenerateSEOButton#GenerateSEOButton',
                  },
                },
              },
            },
            OverviewField({
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
              imagePath: 'meta.image',
            }),
            MetaTitleField({
              hasGenerateFn: true,
              overrides: { required: true },
            }),
            MetaImageField({
              relationTo: 'media',
              overrides: { required: true },
            }),
            MetaDescriptionField({
              overrides: { required: true },
            }),
            PreviewField({
              hasGenerateFn: true,
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
            }),
          ],
        },
      ],
    },
  ],
  versions: {
    drafts: {
      autosave: {
        interval: 1500,
      },
      schedulePublish: true,
    },
    maxPerDoc: 20,
  },
}

export default BadBills
