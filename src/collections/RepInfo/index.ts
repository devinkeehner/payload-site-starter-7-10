import type {
  CollectionConfig,
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeChangeHook,
} from 'payload'
import { triggerFrontendRevalidate } from '../../lib/utilities/revalidateFrontend'

type TenantDoc = { slug?: string | null }
type TenantQueryResult = { docs?: TenantDoc[] }
const getString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)

const fetchPageAccessToken: CollectionBeforeChangeHook = async ({ data, req, operation, originalDoc }) => {
  const previousDoc = originalDoc as Record<string, unknown> | undefined
  const currentPageId = getString(data.facebookPageId ?? previousDoc?.facebookPageId)?.trim()
  if (!currentPageId) return data

  const previousPageId = getString(previousDoc?.facebookPageId)?.trim()
  const existingToken = data.facebookPageAccessToken ?? previousDoc?.facebookPageAccessToken

  const shouldRefresh =
    operation === 'create' ||
    currentPageId !== previousPageId ||
    !existingToken

  if (!shouldRefresh) return data

  const systemToken = process.env.FACEBOOK_SYSTEM_USER_TOKEN
  if (!systemToken) {
    req.payload.logger?.warn?.('FACEBOOK_SYSTEM_USER_TOKEN env var missing; skipping page token fetch')
    return data
  }

  const graphVersion = (process.env.FACEBOOK_GRAPH_API_VERSION || 'v22.0').trim()
  const versionPath = graphVersion.startsWith('v') ? graphVersion : `v${graphVersion}`

  const url = new URL(`https://graph.facebook.com/${versionPath}/${encodeURIComponent(currentPageId)}`)
  url.searchParams.set('fields', 'access_token')
  url.searchParams.set('access_token', systemToken)

  try {
    const response = await fetch(url.toString())
    if (!response.ok) {
      const details = await response.text()
      req.payload.logger?.error?.(`Failed to fetch page access token for ${currentPageId}: ${response.status} ${details}`)
      return data
    }
    const body = (await response.json()) as { access_token?: string }
    if (body?.access_token) {
      data.facebookPageAccessToken = body.access_token
      req.payload.logger?.info?.(`Updated Facebook page access token for ${currentPageId}`)
    } else {
      req.payload.logger?.warn?.(`No access_token returned for page ${currentPageId}`)
    }
  } catch (error) {
    req.payload.logger?.error?.(`Error fetching page access token for ${currentPageId}: ${(error as Error).message}`)
  }

  return data
}

export const RepInfo: CollectionConfig = {
  labels: {
    singular: 'Rep & District Settings',
    plural: 'Rep & District Settings',
  },
  slug: 'rep-info',
  admin: {
    group: 'Site Settings',
    useAsTitle: 'name',
    defaultColumns: ['name', 'districtNumber', 'updatedAt'],
  },
  access: {
    read: () => true,
  },
  hooks: {
    beforeChange: [fetchPageAccessToken as CollectionBeforeChangeHook],
    afterChange: [
      (async ({ req: { payload, context } }) => {
        if (context?.disableRevalidate) return
        try {
          const tenants = await payload.find({
            collection: 'tenants',
            limit: 1000,
            depth: 0,
            select: { slug: true },
          })
          const slugs = (((tenants as TenantQueryResult)?.docs || [])
            .map((t) => t?.slug)
            .filter((slug): slug is string => typeof slug === 'string' && slug.length > 0))
          const paths = ['/', ...slugs.map((s: string) => `/${s}`)]
          await triggerFrontendRevalidate({ paths, tags: ['payload:rep-info', ...slugs.map((s: string) => `tenant:${s}`)] })
        } catch (e: unknown) {
          payload.logger?.error?.(`Failed to revalidate after rep-info change: ${e instanceof Error ? e.message : String(e)}`)
        }
      }) as CollectionAfterChangeHook,
    ],
    afterDelete: [
      (async ({ req: { payload, context } }) => {
        if (context?.disableRevalidate) return
        try {
          const tenants = await payload.find({
            collection: 'tenants',
            limit: 1000,
            depth: 0,
            select: { slug: true },
          })
          const slugs = (((tenants as TenantQueryResult)?.docs || [])
            .map((t) => t?.slug)
            .filter((slug): slug is string => typeof slug === 'string' && slug.length > 0))
          const paths = ['/', ...slugs.map((s: string) => `/${s}`)]
          await triggerFrontendRevalidate({ paths, tags: ['payload:rep-info', ...slugs.map((s: string) => `tenant:${s}`)] })
        } catch (e: unknown) {
          payload.logger?.error?.(`Failed to revalidate after rep-info delete: ${e instanceof Error ? e.message : String(e)}`)
        }
      }) as CollectionAfterDeleteHook,
    ],
  },
  fields: [
    {
      name: 'officeTitle',
      label: 'Title',
      type: 'text',
      required: true,
    },
    {
      name: 'name',
      label: 'Name',
      type: 'text',
      required: true,
    },
    {
      name: 'districtNumber',
      label: 'District Number',
      type: 'number',
      required: true,
    },
    {
      name: 'towns',
      label: 'Towns',
      type: 'array',
      minRows: 1,
      fields: [
        {
          name: 'town',
          type: 'text',
          required: true,
        },
        {
          name: 'url',
          label: 'Town Website URL',
          type: 'text',
          admin: {
            description: 'Optional: paste the town website URL, including https:// (opens in a new tab).',
          },
          validate: (value: unknown) => {
            if (!value) return true
            if (typeof value !== 'string') {
              return 'Enter a valid URL (example: https://www.example.com)'
            }
            try {
               
              new URL(value)
              return true
            } catch (_) {
              return 'Enter a valid URL (example: https://www.example.com)'
            }
          },
        },
      ],
    },
    {
      name: 'form',
      label: 'Form',
      type: 'relationship',
      relationTo: 'forms',
      required: false,
    },
    {
      name: 'facebook',
      label: 'Facebook',
      type: 'text',
      required: false,
    },
    {
      name: 'youtube',
      label: 'YouTube',
      type: 'text',
      required: false,
    },
    {
      name: 'instagram',
      label: 'Instagram',
      type: 'text',
      required: false,
    },
    {
      name: 'x',
      label: 'X.com',
      type: 'text',
      required: false,
    },
    {
      name: 'flickrTag',
      label: 'Flickr Tag',
      type: 'text',
      required: false,
    },
    {
      name: 'flickrURL',
      label: 'Flickr URL',
      type: 'text',
      required: false,
    },
    {
      name: 'facebookPageId',
      label: 'Facebook Page ID',
      type: 'text',
      required: false,
      admin: {
        description: 'Numeric page ID used to generate page access tokens.',
      },
    },
    {
      name: 'facebookPageAccessToken',
      label: 'Facebook Page Access Token',
      type: 'textarea',
      required: false,
      admin: {
        description: 'Automatically generated. Keep this field secure.',
        readOnly: true,
      },
      access: {
        read: ({ req }) => Boolean(req?.user),
      },
    },
  ],
}
