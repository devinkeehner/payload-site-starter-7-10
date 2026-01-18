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
      admin: {
        group: 'Misc',
        hidden: ({ user }) => !user?.roles?.includes('super'),
      },
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
      'video-capture': {
        slug: 'video-capture',
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
                required: true,
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
                admin: { width: '33%' },
              },
              {
                name: 'maxDuration',
                type: 'number',
                label: 'Max Duration (seconds)',
                admin: { width: '33%' },
              },
              {
                name: 'maxFileSizeMB',
                type: 'number',
                label: 'Max File Size (MB)',
                admin: { width: '33%' },
              },
            ],
          },
          {
            name: 'mimeTypes',
            type: 'array',
            label: 'Allowed MIME Types',
            labels: { singular: 'MIME Type', plural: 'MIME Types' },
            admin: { description: 'Defaults to video/webm and video/mp4 when left empty.' },
            fields: [
              {
                name: 'mimeType',
                type: 'text',
                label: 'MIME Type',
                required: true,
              },
            ],
          },
          {
            name: 'helpText',
            type: 'textarea',
            label: 'Helper Text',
            localized: true,
          },
          { name: 'required', type: 'checkbox', label: 'Required' },
        ],
        labels: { singular: 'Video Capture', plural: 'Video Captures' },
      } as any,
    },
    formOverrides: {
      admin: { group: 'Forms & Submissions' },
      fields: ({ defaultFields }) => {
        const fields = Array.isArray(defaultFields) ? [...defaultFields] : []

        fields.push({
          name: 'enableHoneypot',
          label: 'Enable Honeypot',
          type: 'checkbox',
          defaultValue: true,
          admin: {
            position: 'sidebar',
          },
        })

        fields.push({
          name: 'enableTurnstile',
          label: 'Enable Turnstile CAPTCHA',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            position: 'sidebar',
          },
        })

        fields.push({
          name: 'shareCopy',
          label: 'Share Copy',
          type: 'ui',
          admin: {
            position: 'sidebar',
            components: {
              Field: {
                path: '@/components/admin/FormShareField#FormShareField',
              },
            },
          },
        })

        return fields
      },
      endpoints: [
        {
          path: '/:id/share',
          method: 'post',
          handler: (async (req: any, res: any) => {
            const send = (status: number, body: any) => {
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

              let id: string | undefined
              try {
                id = (req as any)?.params?.id || (req as any)?.routeParams?.id || (req as any)?.query?.id
                if (!id) {
                  const url: string = (req as any)?.originalUrl || (req as any)?.url || ''
                  const match = url.match(/\/api\/forms\/([^/]+)\/share/)
                  if (match?.[1]) id = match[1]
                }
              } catch {}
              if (!id) return send(400, { error: 'Missing form id' })

              const parseBody = async () => {
                let raw: any = (req as any)?.body
                if (raw && typeof raw === 'string') {
                  try {
                    raw = JSON.parse(raw)
                  } catch {}
                } else if (raw && typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) {
                  try {
                    raw = JSON.parse(raw.toString('utf-8'))
                  } catch {
                    raw = {}
                  }
                }

                const looksLikeReadableStream =
                  !!raw && typeof raw === 'object' && (typeof raw.getReader === 'function' || typeof raw.tee === 'function')
                const missingKeys =
                  !raw ||
                  typeof raw !== 'object' ||
                  (!('tenantIDs' in raw) &&
                    !('tenantIds' in raw) &&
                    !('tenant_ids' in raw) &&
                    !('tenants' in raw) &&
                    !('sourceTenantID' in raw) &&
                    !('sourceTenantId' in raw))

                if (looksLikeReadableStream || missingKeys) {
                  try {
                    if (typeof (req as any)?.json === 'function') {
                      const parsed = await (req as any).json()
                      if (parsed && typeof parsed === 'object') raw = parsed
                    } else if (typeof (req as any)?.text === 'function') {
                      const txt = await (req as any).text()
                      raw = txt ? JSON.parse(txt) : raw || {}
                    }
                  } catch {}
                }

                return raw || {}
              }

              const raw = await parseBody()

              const extractIDs = (val: any): string[] => {
                if (!val) return []
                if (Array.isArray(val)) return val.map((v) => (typeof v === 'string' ? v : v?.id || v?.value)).filter(Boolean)
                if (typeof val === 'string') return val.split(',').map((s) => s.trim()).filter(Boolean)
                if (typeof val === 'object') {
                  const keys = Object.keys(val).filter((k) => k.startsWith('tenantIDs['))
                  if (keys.length) return keys.map((k) => val[k]).filter(Boolean)
                }
                return []
              }

              let tenantIDs: string[] = []
              tenantIDs = extractIDs(raw?.tenantIDs)
              if (!tenantIDs.length) tenantIDs = extractIDs(raw?.tenantIds)
              if (!tenantIDs.length) tenantIDs = extractIDs(raw?.tenant_ids)
              if (!tenantIDs.length) tenantIDs = extractIDs(raw?.tenants)

              const sourceTenantID: string | undefined =
                typeof raw?.sourceTenantID === 'string'
                  ? raw.sourceTenantID
                  : typeof raw?.sourceTenantId === 'string'
                  ? raw.sourceTenantId
                  : undefined

              if (!tenantIDs.length) {
                const q: any = (req as any)?.query || {}
                tenantIDs = extractIDs(q?.tenantIDs) || extractIDs(q?.tenantIds)
                if (!tenantIDs.length && (typeof (req as any)?.originalUrl === 'string' || typeof (req as any)?.url === 'string')) {
                  try {
                    const urlStr: string = (req as any).originalUrl || (req as any).url
                    const u = new URL(urlStr, 'http://local')
                    const all = u.searchParams.getAll('tenantIDs')
                    if (all && all.length) tenantIDs = extractIDs(all)
                    else {
                      const qp = u.searchParams.get('tenantIDs') || u.searchParams.get('tenantIds')
                      if (qp) tenantIDs = extractIDs(qp)
                    }
                  } catch {}
                }
              }

              if (!tenantIDs.length) {
                const debug: any = {}
                try {
                  debug.bodyType = typeof (req as any)?.body
                  debug.queryKeys = (req as any)?.query ? Object.keys((req as any).query) : undefined
                  debug.url = (req as any)?.originalUrl || (req as any)?.url
                } catch {}
                const body: any = { error: 'No tenantIDs provided' }
                if (process.env.NODE_ENV !== 'production') body.debug = debug
                return send(400, body)
              }

              const isSuper = !!req.user?.roles?.includes('super')
              const userTenantIDs: string[] = Array.isArray(req.user?.tenants)
                ? (req.user.tenants as any[])
                    .map((t) => (typeof t?.tenant === 'string' ? t.tenant : t?.tenant?.id))
                    .filter(Boolean)
                : []
              const allowedTenantIDs = isSuper ? tenantIDs : tenantIDs.filter((t) => userTenantIDs.includes(t))
              if (!allowedTenantIDs.length)
                return send(403, { error: 'You do not have access to the selected tenants' })

              let source: any
              try {
                if (sourceTenantID) {
                  source = await req.payload.findByID({
                    collection: 'forms',
                    id,
                    draft: true,
                    depth: 2,
                    req: { ...(req as any), tenant: sourceTenantID } as any,
                  })
                } else {
                  source = await req.payload.findByID({
                    collection: 'forms',
                    id,
                    draft: true,
                    depth: 2,
                  })
                }
              } catch (e) {
                return send(404, { error: 'Form not found or inaccessible for the current tenant scope' })
              }

              if (!source) return send(404, { error: 'Form not found' })
              const sourceTenantId: string | undefined =
                typeof (source as any)?.tenant === 'string' ? (source as any).tenant : (source as any)?.tenant?.id

              const tenantCache = new Map<string, { id: string; slug?: string | null }>()
              const mediaDocCache = new Map<string, any>()
              const mediaCloneCache = new Map<string, string>()

              const extractMediaId = (value: any): string | undefined => {
                if (!value) return undefined
                if (typeof value === 'string') return value
                if (typeof value === 'object') {
                  if (typeof value.id === 'string') return value.id
                  if (typeof value._id === 'string') return value._id
                  if (typeof value.value === 'string') return value.value
                  if (typeof value.value === 'object') return extractMediaId(value.value)
                }
                return undefined
              }

              const getTenantInfo = async (tenantId: string) => {
                if (tenantCache.has(tenantId)) return tenantCache.get(tenantId)!
                const tenantDoc = await req.payload.findByID({
                  collection: 'tenants',
                  id: tenantId,
                  depth: 0,
                  overrideAccess: true,
                })
                const info = { id: tenantId, slug: (tenantDoc as any)?.slug ?? undefined }
                tenantCache.set(tenantId, info)
                return info
              }

              const buildMediaUrl = (doc: any): string | undefined => {
                if (typeof doc?.url === 'string' && doc.url) return doc.url
                const base = process.env.R2_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_MEDIA_BASE_URL
                if (!base) return undefined
                const prefix = typeof doc?.prefix === 'string' ? doc.prefix.replace(/\/+$/u, '') : ''
                const filename = typeof doc?.filename === 'string' ? doc.filename.replace(/^\/+/, '') : ''
                if (!filename) return undefined
                const key = prefix ? `${prefix}/${filename}` : filename
                return `${base.replace(/\/+$/u, '')}/${key.replace(/^\/+/, '')}`
              }

              const fetchMediaDoc = async (mediaId: string) => {
                if (mediaDocCache.has(mediaId)) return mediaDocCache.get(mediaId)!
                const scopedSourceReq = sourceTenantId
                  ? ({ ...(req as any), tenant: sourceTenantId } as any)
                  : (req as any)
                const doc = await req.payload.findByID({
                  collection: 'media',
                  id: mediaId,
                  depth: 0,
                  overrideAccess: true,
                  req: scopedSourceReq,
                })
                mediaDocCache.set(mediaId, doc)
                return doc
              }

              const ensureMediaClone = async (
                mediaId: string | undefined,
                tenantId: string,
                scopedReq: any,
              ): Promise<string | undefined> => {
                if (!mediaId) return undefined
                const cacheKey = `${mediaId}:${tenantId}`
                if (mediaCloneCache.has(cacheKey)) return mediaCloneCache.get(cacheKey)!

                const mediaDoc = await fetchMediaDoc(mediaId).catch((error: any) => {
                  throw new Error(`Failed to load media ${mediaId}: ${error?.message || error}`)
                })
                if (!mediaDoc) throw new Error(`Media ${mediaId} not found`)

                const mediaUrl = buildMediaUrl(mediaDoc)
                if (!mediaUrl) throw new Error(`Media ${mediaId} is missing a resolvable URL`)

                const response = await fetch(mediaUrl)
                if (!response.ok) throw new Error(`Unable to download media ${mediaId} (status ${response.status})`)
                const arrayBuffer = await response.arrayBuffer()
                const fileBuffer = Buffer.from(arrayBuffer)

                const tenantInfo = await getTenantInfo(tenantId)
                const filename =
                  typeof mediaDoc?.filename === 'string' && mediaDoc.filename
                    ? mediaDoc.filename.replace(/\\/gu, '/').split('/').pop() || mediaDoc.filename
                    : `${mediaId}`
                const mimeType = typeof mediaDoc?.mimeType === 'string' ? mediaDoc.mimeType : 'application/octet-stream'
                const captionClone = mediaDoc?.caption ? JSON.parse(JSON.stringify(mediaDoc.caption)) : undefined

                const createdMedia = await req.payload.create({
                  collection: 'media',
                  data: {
                    alt: (mediaDoc as any)?.alt,
                    caption: captionClone,
                    tenant: tenantId,
                  },
                  file: {
                    data: fileBuffer,
                    size: fileBuffer.length,
                    name: filename,
                    filename,
                    mimetype: mimeType,
                    mimeType,
                    prefix: tenantInfo.slug ? `${tenantInfo.slug.replace(/\/+$/u, '')}/` : undefined,
                  } as any,
                  req: scopedReq,
                  overrideAccess: true,
                  context: { disableRevalidate: true } as any,
                })

                const newId = (createdMedia as any)?.id
                if (typeof newId !== 'string') throw new Error(`Cloned media for ${mediaId} did not return an ID`)

                mediaCloneCache.set(cacheKey, newId)
                return newId
              }

              const cloneRichTextUploads = async (value: any, tenantId: string, scopedReq: any): Promise<any> => {
                const walk = async (node: any): Promise<any> => {
                  if (Array.isArray(node)) {
                    const next: any[] = []
                    for (const item of node) {
                      next.push(await walk(item))
                    }
                    return next
                  }
                  if (!node || typeof node !== 'object') return node

                  if (node.type === 'upload' && node.relationTo === 'media') {
                    const uploadId = extractMediaId(node.value)
                    const clonedId = await ensureMediaClone(uploadId, tenantId, scopedReq)
                    return { ...node, value: clonedId }
                  }

                  const entries = Object.entries(node)
                  const updated: Record<string, any> = Array.isArray(node) ? [] : { ...node }
                  for (const [key, val] of entries) {
                    if (!val) {
                      updated[key] = val
                      continue
                    }
                    if (key === 'media' || key === 'image') {
                      const relationId = extractMediaId(val)
                      if (relationId) {
                        updated[key] = await ensureMediaClone(relationId, tenantId, scopedReq)
                        continue
                      }
                    }
                    if (!Array.isArray(val) && typeof val === 'object') {
                      const relationTo = (val as any)?.relationTo
                      if (relationTo === 'media') {
                        const relationId = extractMediaId(val)
                        if (relationId) {
                          updated[key] = await ensureMediaClone(relationId, tenantId, scopedReq)
                          continue
                        }
                      }
                    }
                    updated[key] = await walk(val)
                  }
                  return updated
                }

                return walk(value)
              }

              const cloneFormFieldOptions = async (options: any[], tenantId: string, scopedReq: any) => {
                if (!Array.isArray(options)) return options
                const clonedOptions: any[] = []
                for (const option of options) {
                  if (!option) continue
                  const nextOption: Record<string, any> = { ...option }
                  delete nextOption.id
                  delete nextOption._id
                  if (nextOption.image) {
                    const optionImageId = extractMediaId(nextOption.image)
                    nextOption.image = await ensureMediaClone(optionImageId, tenantId, scopedReq)
                  }
                  clonedOptions.push(nextOption)
                }
                return clonedOptions
              }

              const cloneFormFields = async (fields: any[], tenantId: string, scopedReq: any) => {
                if (!Array.isArray(fields)) return fields
                const clonedFields: any[] = []
                for (const field of fields) {
                  if (!field) continue
                  const nextField: Record<string, any> = JSON.parse(JSON.stringify(field))
                  delete nextField.id
                  delete nextField._id
                  if (Array.isArray(nextField.options)) {
                    nextField.options = await cloneFormFieldOptions(nextField.options, tenantId, scopedReq)
                  }
                  if (nextField.blockType === 'message' && nextField.message) {
                    nextField.message = await cloneRichTextUploads(nextField.message, tenantId, scopedReq)
                  }
                  clonedFields.push(nextField)
                }
                return clonedFields
              }

              const cloneEmails = async (emails: any[], tenantId: string, scopedReq: any) => {
                if (!Array.isArray(emails)) return emails
                const clonedEmails: any[] = []
                for (const email of emails) {
                  if (!email) continue
                  const nextEmail = { ...email }
                  delete nextEmail.id
                  delete nextEmail._id
                  if (nextEmail.message) {
                    nextEmail.message = await cloneRichTextUploads(nextEmail.message, tenantId, scopedReq)
                  }
                  clonedEmails.push(nextEmail)
                }
                return clonedEmails
              }

              const results: any[] = []

              for (const tID of allowedTenantIDs) {
                if (tID && sourceTenantId && tID === sourceTenantId) {
                  results.push({ tenantID: tID, skipped: true, reason: 'same-tenant' })
                  continue
                }
                const scopedReq = { ...(req as any), tenant: tID }
                try {
                  const clonedFields = await cloneFormFields((source as any)?.fields, tID, scopedReq)
                  const confirmationMessage = await cloneRichTextUploads((source as any)?.confirmationMessage, tID, scopedReq)
                  const introContent = await cloneRichTextUploads((source as any)?.introContent, tID, scopedReq)
                  const emails = await cloneEmails((source as any)?.emails, tID, scopedReq)

                  const data: any = {
                    title: (source as any)?.title,
                    fields: clonedFields,
                    submitButtonLabel: (source as any)?.submitButtonLabel,
                    confirmationType: (source as any)?.confirmationType,
                    confirmationMessage,
                    redirect: (source as any)?.redirect ? JSON.parse(JSON.stringify((source as any).redirect)) : undefined,
                    emails,
                    tenant: tID,
                  }

                  if (typeof (source as any)?.enableIntro !== 'undefined') data.enableIntro = (source as any).enableIntro
                  if (introContent) data.introContent = introContent

                  const created = await req.payload.create({
                    collection: 'forms',
                    data,
                    depth: 0,
                    req: scopedReq as any,
                  })

                  results.push({ tenantID: tID, id: created?.id })
                } catch (e: any) {
                  results.push({ tenantID: tID, error: e?.message || 'create failed' })
                }
              }

              return send(200, {
                ok: true,
                count: results.filter((r) => !r.skipped && !r.error).length,
                results,
              })
            } catch (err: any) {
              console.error('[forms/:id/share] error', err)
              const body: any = { error: err?.message || 'Server error' }
              if (process.env.NODE_ENV !== 'production') body.stack = err?.stack
              return send(500, body)
            }
          }) as any,
        },
      ],
    },
    formSubmissionOverrides: {
      admin: { group: 'Forms & Submissions' },
      hooks: {
        beforeChange: [
          async ({ data, req }) => {
            const TURNSTILE_TOKEN_FIELD_NAME = 'turnstileToken'
            const secretKey = process.env.TURNSTILE_SECRET_KEY

            const formId = typeof data?.form === 'string' ? data.form : data?.form?.id
            if (!formId) return data

            const form = await req.payload.findByID({ collection: 'forms', id: formId })
            const turnstileEnabled = (form as { enableTurnstile?: boolean })?.enableTurnstile === true
            const submissionData = Array.isArray(data?.submissionData) ? [...data.submissionData] : []
            const tokenEntryIndex = submissionData.findIndex((entry: any) => entry?.field === TURNSTILE_TOKEN_FIELD_NAME)
            const tokenEntry = tokenEntryIndex >= 0 ? submissionData[tokenEntryIndex] : null
            const tokenFromData = typeof tokenEntry?.value === 'string' ? tokenEntry.value : ''
            const tokenFromHeader = (() => {
              const headers = req?.headers as unknown
              if (headers && typeof (headers as { get?: (name: string) => string | null }).get === 'function') {
                return (headers as { get: (name: string) => string | null }).get('x-turnstile-token') || ''
              }

              const raw = (headers as Record<string, string | string[] | undefined>)?.['x-turnstile-token']
              return Array.isArray(raw) ? raw[0] : raw || ''
            })()
            const token = tokenFromData || tokenFromHeader

            if (!turnstileEnabled) {
              if (tokenEntryIndex >= 0) {
                submissionData.splice(tokenEntryIndex, 1)
              }

              return {
                ...data,
                submissionData,
              }
            }

            if (!secretKey) {
              throw new Error('Verification service not configured. Please try again later.')
            }

            if (!token) {
              throw new Error('Please complete the verification challenge before submitting.')
            }

            const turnstileResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                secret: secretKey,
                response: token,
              }),
            })

            const turnstileResult = (await turnstileResponse.json()) as { success?: boolean }
            if (!turnstileResult.success) {
              throw new Error('Verification failed. Please retry the challenge.')
            }

            if (tokenEntryIndex >= 0) {
              submissionData.splice(tokenEntryIndex, 1)
            }

            return {
              ...data,
              submissionData,
            }
          },
        ],
      },
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
    tenantSelectorLabel: undefined,
    // disable tenant-based access constraints for admins
    useTenantsCollectionAccess: true,
    useTenantsListFilter: true,
    // Filter by a user's assigned tenants
    useUsersTenantFilter: true,
    debug: true,
    // allow all users to see every tenant in the selector
    userHasAccessToAllTenants: () => true,
    collections: {
      navbars: { isGlobal: true },
      posts: {},
      'wordpress-posts': {},
      pages: {},
      media: {},
      'media-canvas': {},
      'standard-media': { isGlobal: true },
      'rep-info': {},
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
          if ('name' in field && field.name === 'tenant') {
            // Rename to "Site" and hide on edit to avoid accidental tenant changes via the selector
            field.label = 'Site'
            ;(field as any).admin = {
              ...((field as any).admin || {}),
              // Show the tenant picker only when creating a new document.
              // When editing (data.id exists), hide the tenant field so UI won't attempt to update ownership.
              condition: (data: any) => !data?.id,
            }
          }
          if ('name' in field && field.name === 'tenants') {
            field.label = 'Sites'
            // Ensure assigned sites are included in the JWT so filtering applies on login
            if (collection.slug === 'users') {
              ;(field as any).saveToJWT = true
              // Also persist the nested relationship field so the JWT contains IDs
              if ('fields' in field && Array.isArray((field as any).fields)) {
                ;((field as any).fields as Field[]).forEach((sub) => {
                  if ('name' in sub && sub.name === 'tenant') {
                    ;(sub as any).saveToJWT = true
                  }
                })
              }
            }
          }
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
