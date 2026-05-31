import type { CollectionBeforeValidateHook, CollectionConfig, CollectionSlug, PayloadHandler, PayloadRequest, Where } from 'payload'

import { isSuperUser } from '@/lib/access/isSuperUser'
import { isCollectionHiddenForRole, roleRestrictedAccess } from '@/lib/access/roles'
import { EMAIL_LAYOUT_BLOCKS } from '@/lib/email/blocks'
import { buildDefaultEmailLayout } from '@/lib/email/defaultEmailLayout'
import { shareDocumentToTenants } from '@/lib/mcp-tenant-shares'

const EMAIL_LISTS_COLLECTION = 'email-lists' as CollectionSlug

const populateDefaultLayout: CollectionBeforeValidateHook = async ({ data, operation, req }) => {
  if (operation !== 'create' || !data) return data
  if (Array.isArray(data.layout) && data.layout.length > 0) return data

  return {
    ...data,
    layout: await buildDefaultEmailLayout(data as Record<string, unknown>, req),
  }
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

const extractIDs = (value: unknown): string[] => {
  if (!value) return []
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string' || typeof item === 'number') return String(item)
        const record = asRecord(item)
        return typeof record.id === 'string' ? record.id : typeof record.value === 'string' ? record.value : ''
      })
      .filter(Boolean)
  }
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean)
  if (typeof value === 'object') {
    const record = asRecord(value)
    return Object.keys(record)
      .filter((key) => key.startsWith('tenantIDs['))
      .map((key) => String(record[key] || '').trim())
      .filter(Boolean)
  }
  return []
}

const getRequestId = (req: Record<string, unknown>, collectionSlug: string): string | undefined => {
  const params = asRecord(req.params)
  const routeParams = asRecord(req.routeParams)
  const query = asRecord(req.query)
  const id = params.id || routeParams.id || query.id
  if (typeof id === 'string' && id) return id

  const url = typeof req.originalUrl === 'string' ? req.originalUrl : typeof req.url === 'string' ? req.url : ''
  const match = url.match(new RegExp(`/api/${collectionSlug}/([^/]+)/share`))
  return match?.[1]
}

const parseShareBody = async (req: Record<string, unknown>): Promise<Record<string, unknown>> => {
  let raw = req.body

  if (raw && typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      raw = {}
    }
  } else if (raw && typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) {
    try {
      raw = JSON.parse(raw.toString('utf-8'))
    } catch {
      raw = {}
    }
  }

  const rawRecord = asRecord(raw)
  const looksLikeReadableStream =
    Boolean(raw && typeof raw === 'object') &&
    (typeof rawRecord.getReader === 'function' || typeof rawRecord.tee === 'function')
  const missingKeys =
    !raw ||
    typeof raw !== 'object' ||
    (!('tenantIDs' in rawRecord) &&
      !('tenantIds' in rawRecord) &&
      !('tenant_ids' in rawRecord) &&
      !('tenants' in rawRecord) &&
      !('sourceTenantID' in rawRecord) &&
      !('sourceTenantId' in rawRecord))

  if (looksLikeReadableStream || missingKeys) {
    try {
      if (typeof req.json === 'function') {
        const parsed = await (req.json as () => Promise<unknown>)()
        if (parsed && typeof parsed === 'object') raw = parsed
      } else if (typeof req.text === 'function') {
        const text = await (req.text as () => Promise<string>)()
        raw = text ? JSON.parse(text) : raw || {}
      }
    } catch {
      // Keep best-effort raw body.
    }
  }

  return asRecord(raw)
}

const getTenantIDsFromRequest = (req: Record<string, unknown>, body: Record<string, unknown>) => {
  let tenantIDs = extractIDs(body.tenantIDs)
  if (!tenantIDs.length) tenantIDs = extractIDs(body.tenantIds)
  if (!tenantIDs.length) tenantIDs = extractIDs(body.tenant_ids)
  if (!tenantIDs.length) tenantIDs = extractIDs(body.tenants)

  if (!tenantIDs.length) {
    const query = asRecord(req.query)
    tenantIDs = extractIDs(query.tenantIDs)
    if (!tenantIDs.length) tenantIDs = extractIDs(query.tenantIds)
  }

  if (!tenantIDs.length && (typeof req.originalUrl === 'string' || typeof req.url === 'string')) {
    try {
      const url = new URL(String(req.originalUrl || req.url), 'http://local')
      tenantIDs = extractIDs(url.searchParams.getAll('tenantIDs'))
      if (!tenantIDs.length) tenantIDs = extractIDs(url.searchParams.get('tenantIDs') || url.searchParams.get('tenantIds'))
    } catch {
      // URL parsing is best effort.
    }
  }

  return tenantIDs
}

const getUserTenantIDs = (user: unknown): string[] => {
  const tenants = asRecord(user).tenants
  if (!Array.isArray(tenants)) return []

  return tenants
    .map((entry) => {
      const tenant = asRecord(entry).tenant
      if (typeof tenant === 'string') return tenant
      const tenantRecord = asRecord(tenant)
      return typeof tenantRecord.id === 'string' ? tenantRecord.id : ''
    })
    .filter(Boolean)
}

export const Emails: CollectionConfig<'emails'> = {
  slug: 'emails',
  access: {
    create: roleRestrictedAccess('emails'),
    delete: roleRestrictedAccess('emails'),
    read: roleRestrictedAccess('emails'),
    update: roleRestrictedAccess('emails'),
  },
  admin: {
    defaultColumns: ['title', 'subject', 'emailList', 'recipientEmail', 'updatedAt'],
    group: 'Email Marketing',
    hidden: isCollectionHiddenForRole('emails'),
    useAsTitle: 'title',
    components: {
      views: {
        list: {
          Component: '@/components/admin/email-center/EmailCenterListView#default',
        },
        edit: {
          default: {
            tab: {
              label: 'Advanced',
              order: 400,
            },
          },
          campaign: {
            path: '/campaign',
            Component: '@/components/admin/email-campaign/EmailCampaignView#default',
            tab: {
              href: '/campaign',
              label: 'Campaign',
              order: 100,
            },
          },
          workflow: {
            path: '/workflow',
            Component: '@/components/admin/email-campaign/EmailWorkflowRedirectView#default',
          },
          visual: {
            path: '/visual',
            Component: '@/components/admin/email/PuckEmailBuilderView',
            tab: {
              href: '/visual',
              label: 'Builder',
              order: 200,
            },
          },
          audience: {
            path: '/audience',
            Component: '@/components/admin/email-audience/EmailAudienceView#default',
            tab: {
              href: '/audience',
              label: 'Audience',
              order: 300,
            },
          },
          review: {
            path: '/review',
            Component: '@/components/admin/email-center/EmailWorkflowView#default',
            tab: {
              href: '/review',
              label: 'Final Check',
              order: 350,
            },
          },
        },
      },
    },
  },
  labels: {
    singular: 'Email',
    plural: 'Emails',
  },
  hooks: {
    beforeValidate: [populateDefaultLayout],
  },
  endpoints: [
    {
      path: '/:id/share',
      method: 'post',
      handler: (async (req: PayloadRequest & Record<string, unknown>, res?: { status?: (status: number) => { json: (body: unknown) => unknown } }) => {
        const send = (status: number, body: unknown) => {
          if (res?.status && typeof res.status === 'function') {
            return res.status(status).json(body)
          }
          return new Response(JSON.stringify(body), {
            status,
            headers: { 'content-type': 'application/json' },
          })
        }

        try {
          if (!req.user) return send(401, { error: 'Unauthorized' })

          const id = getRequestId(req, 'emails')
          if (!id) return send(400, { error: 'Missing email id' })

          const body = await parseShareBody(req)
          const tenantIDs = getTenantIDsFromRequest(req, body)
          if (!tenantIDs.length) return send(400, { error: 'No tenantIDs provided' })

          const sourceTenantID =
            typeof body.sourceTenantID === 'string'
              ? body.sourceTenantID
              : typeof body.sourceTenantId === 'string'
                ? body.sourceTenantId
                : undefined

          const allowedTenantIDs = isSuperUser(req.user)
            ? tenantIDs
            : tenantIDs.filter((tenantID) => getUserTenantIDs(req.user).includes(tenantID))
          if (!allowedTenantIDs.length) return send(403, { error: 'You do not have access to the selected tenants' })

          const shareResult = await shareDocumentToTenants({
            collection: 'emails',
            docId: id,
            tenantIDs: allowedTenantIDs,
            sourceTenantID,
            req,
          })

          return send(200, { ok: true, count: shareResult.count, results: shareResult.results })
        } catch (error) {
          console.error('[emails/:id/share] error', error)
          const body: Record<string, unknown> = { error: error instanceof Error ? error.message : 'Server error' }
          if (process.env.NODE_ENV !== 'production' && error instanceof Error) body.stack = error.stack
          return send(500, body)
        }
      }) as unknown as PayloadHandler,
    },
  ],
  fields: [
    {
      name: 'title',
      type: 'text',
      admin: {
        description: 'Internal title shown in the admin.',
      },
      required: true,
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Setup',
          fields: [
            {
              name: 'subject',
              type: 'text',
            },
            {
              name: 'preheader',
              type: 'textarea',
              admin: {
                description: 'Short preview text shown by many email clients.',
              },
            },
            {
              name: 'recipientEmail',
              type: 'email',
              label: 'Test recipient email',
              admin: {
                description: 'Send Test Email sends only to this address, never to the audience list.',
              },
            },
            {
              name: 'emailList',
              type: 'relationship',
              admin: {
                description: 'Intended audience for future campaign sends. Test sends do not use this list.',
              },
              filterOptions: ({ data, req }) => {
                const tenantValue = data?.tenant || (req as { tenant?: unknown })?.tenant
                const tenantId = typeof tenantValue === 'string' || typeof tenantValue === 'number'
                  ? tenantValue
                  : tenantValue && typeof tenantValue === 'object' && 'id' in tenantValue
                    ? (tenantValue as { id?: string | number }).id
                    : null

                if (!tenantId) {
                  const activeWhere: Where = { status: { equals: 'active' } }
                  return activeWhere
                }

                const tenantWhere: Where = {
                  and: [
                    { tenant: { equals: tenantId } },
                    { status: { equals: 'active' } },
                  ],
                }
                return tenantWhere
              },
              label: 'Audience list',
              relationTo: EMAIL_LISTS_COLLECTION,
            },
            {
              name: 'replyTo',
              type: 'email',
              label: 'Reply-to email',
            },
            {
              name: 'status',
              type: 'select',
              defaultValue: 'draft',
              options: [
                { label: 'Draft', value: 'draft' },
                { label: 'Approved', value: 'approved' },
                { label: 'Scheduled', value: 'scheduled' },
                { label: 'Queued', value: 'queued' },
                { label: 'Sending', value: 'sending' },
                { label: 'Sent', value: 'sent' },
                { label: 'Failed', value: 'failed' },
              ],
              required: true,
            },
            {
              name: 'scheduledAt',
              label: 'Scheduled send time',
              type: 'date',
              admin: {
                date: {
                  pickerAppearance: 'dayAndTime',
                },
              },
            },
          ],
        },
        {
          label: 'Content',
          fields: [
            {
              name: 'layout',
              type: 'blocks',
              blocks: EMAIL_LAYOUT_BLOCKS,
              required: true,
              admin: {
                description: 'Build this email in the Builder tab.',
                initCollapsed: true,
              },
            },
          ],
        },
        {
          label: 'Status',
          fields: [
            {
              name: 'sendSummary',
              label: 'Production send',
              type: 'group',
              admin: {
                readOnly: true,
              },
              fields: [
                {
                  name: 'elasticCampaignId',
                  label: 'Elastic campaign ID',
                  type: 'text',
                },
                {
                  name: 'recipientCount',
                  label: 'Recipient count',
                  type: 'number',
                },
                {
                  name: 'approvedAt',
                  label: 'Approved at',
                  type: 'date',
                },
                {
                  name: 'approvedBy',
                  label: 'Approved by',
                  type: 'relationship',
                  relationTo: 'users',
                },
                {
                  name: 'sentAt',
                  label: 'Sent at',
                  type: 'date',
                },
                {
                  name: 'sendError',
                  label: 'Send error',
                  type: 'textarea',
                },
              ],
            },
            {
              name: 'lastSend',
              type: 'group',
              label: 'Last test send',
              admin: {
                readOnly: true,
              },
              fields: [
                {
                  name: 'status',
                  type: 'select',
                  options: [
                    { label: 'Test sent', value: 'sent' },
                    { label: 'Test failed', value: 'failed' },
                  ],
                },
                {
                  name: 'recipientEmail',
                  type: 'email',
                  label: 'Test recipient email',
                },
                {
                  name: 'sentAt',
                  type: 'date',
                  admin: {
                    date: {
                      pickerAppearance: 'dayAndTime',
                    },
                  },
                },
                {
                  name: 'message',
                  type: 'textarea',
                },
              ],
            },
            {
              name: 'linkReviewOverrides',
              type: 'array',
              label: 'Manually confirmed links',
              admin: {
                description: 'Links that were reviewed and confirmed after a remote checker warning.',
                readOnly: true,
              },
              fields: [
                {
                  name: 'href',
                  type: 'text',
                  required: true,
                },
                {
                  name: 'label',
                  type: 'text',
                },
                {
                  name: 'reason',
                  type: 'textarea',
                },
                {
                  name: 'confirmedAt',
                  type: 'date',
                  admin: {
                    date: {
                      pickerAppearance: 'dayAndTime',
                    },
                  },
                },
                {
                  name: 'confirmedBy',
                  type: 'relationship',
                  relationTo: 'users',
                },
              ],
            },
          ],
        },
        {
          label: 'Share',
          fields: [
            {
              name: 'shareCopy',
              label: 'Share Copy',
              type: 'ui',
              admin: {
                components: {
                  Field: {
                    path: '@/components/admin/ShareCopyField#ShareCopyField',
                  },
                },
              },
            },
          ],
        },
      ],
    },
  ],
  versions: {
    drafts: {
      autosave: {
        interval: 1000,
      },
    },
    maxPerDoc: 25,
  },
}
