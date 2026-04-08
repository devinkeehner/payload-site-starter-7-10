/* eslint-disable @typescript-eslint/no-explicit-any */
import { multiTenantPlugin } from '@payloadcms/plugin-multi-tenant'
import { payloadCloudPlugin } from '@payloadcms/payload-cloud'
import { formBuilderPlugin } from '@payloadcms/plugin-form-builder'
import { nestedDocsPlugin } from '@payloadcms/plugin-nested-docs'
import { redirectsPlugin } from '@payloadcms/plugin-redirects'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { searchPlugin } from '@payloadcms/plugin-search'
import { Plugin, type Field, type Where } from 'payload'
import { revalidateRedirects } from '@/lib/hooks/revalidateRedirects'
import { GenerateTitle, GenerateURL } from '@payloadcms/plugin-seo/types'
import { searchFields } from '@/lib/search/fieldOverrides'
import { beforeSyncWithSearch } from '@/lib/search/beforeSync'
import { config } from '@/site.config'
import { isSuperUser } from '@/lib/access/isSuperUser'
import {
  defaultIContactFieldMap,
  getIContactConfigFromEnv,
  listIContactClientFolders,
  listIContactLists,
  refreshIContactCache,
  resolveIContactAccountId,
  syncSubmissionToIContact,
} from '@/lib/icontact'

import { Page, Post } from '@/payload-types'
import { getServerSideURL } from '@/lib/utilities/getURL'

const generateTitle: GenerateTitle<Post | Page> = ({ doc }) => {
  return doc?.title ? `${doc.title} | ${config.name}` : config.name
}

const generateURL: GenerateURL<Post | Page> = ({ doc }) => {
  const url = getServerSideURL()

  return doc?.slug ? `${url}/${doc.slug}` : url
}

const parseRequestBody = async (req: any) => {
  let raw: any = req?.body
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

  if (looksLikeReadableStream || !raw || typeof raw !== 'object') {
    try {
      if (typeof req?.json === 'function') {
        const parsed = await req.json()
        if (parsed && typeof parsed === 'object') raw = parsed
      } else if (typeof req?.text === 'function') {
        const txt = await req.text()
        raw = txt ? JSON.parse(txt) : raw || {}
      }
    } catch {}
  }

  return raw || {}
}

const parseRouteId = (req: any, endpointSuffixRegex: RegExp) => {
  try {
    const id = req?.params?.id || req?.routeParams?.id || req?.query?.id
    if (id) return String(id)
    const url: string = req?.originalUrl || req?.url || ''
    const match = url.match(endpointSuffixRegex)
    return match?.[1] ? String(match[1]) : undefined
  } catch {
    return undefined
  }
}

const inferBrowserFromUserAgent = (userAgent: string): string => {
  const ua = userAgent.toLowerCase()
  if (!ua) return ''
  if (ua.includes('edg/')) return 'Edge'
  if (ua.includes('opr/') || ua.includes('opera')) return 'Opera'
  if (ua.includes('firefox/')) return 'Firefox'
  if (ua.includes('chrome/') && !ua.includes('edg/') && !ua.includes('opr/')) return 'Chrome'
  if (ua.includes('safari/') && !ua.includes('chrome/') && !ua.includes('chromium/')) return 'Safari'
  if (ua.includes('msie') || ua.includes('trident/')) return 'Internet Explorer'
  if (ua.includes('samsungbrowser/')) return 'Samsung Internet'
  return 'Unknown'
}

const inferDeviceFromUserAgent = (userAgent: string): string => {
  const ua = userAgent.toLowerCase()
  if (!ua) return ''
  if (ua.includes('ipad') || (ua.includes('macintosh') && ua.includes('mobile'))) return 'Tablet'
  if (ua.includes('tablet')) return 'Tablet'
  if (
    ua.includes('iphone') ||
    ua.includes('android') ||
    ua.includes('mobile') ||
    ua.includes('windows phone') ||
    ua.includes('ipod')
  ) {
    return 'Mobile'
  }
  if (ua.includes('bot') || ua.includes('spider') || ua.includes('crawler') || ua.includes('curl/')) return 'Bot'
  return 'Desktop'
}

const inferOSFromUserAgent = (userAgent: string): string => {
  const ua = userAgent.toLowerCase()
  if (!ua) return ''
  if (ua.includes('windows nt')) return 'Windows'
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('cpu iphone os') || ua.includes('cpu os')) {
    return 'iOS'
  }
  if (ua.includes('android')) return 'Android'
  if (ua.includes('mac os x') || ua.includes('macintosh')) return 'macOS'
  if (ua.includes('linux')) return 'Linux'
  if (ua.includes('cros')) return 'ChromeOS'
  return 'Unknown'
}

const appendInlineStyle = (html: string, tagName: string, styleToAdd: string) => {
  const openingTagPattern = new RegExp(`<${tagName}(\\s[^>]*)?>`, 'gi')

  return html.replace(openingTagPattern, (match, attrs = '') => {
    const styleAttrPattern = /style\s*=\s*(['"])(.*?)\1/i
    const hasStyle = styleAttrPattern.test(attrs)

    if (hasStyle) {
      return `<${tagName}${attrs.replace(styleAttrPattern, (_full: string, quote: string, existing: string) => {
        const nextStyle = existing.trim().endsWith(';')
          ? `${existing.trim()} ${styleToAdd}`
          : `${existing.trim()}; ${styleToAdd}`
        return `style=${quote}${nextStyle}${quote}`
      })}>`
    }

    return `<${tagName}${attrs} style="${styleToAdd}">`
  })
}

const escapeHTML = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const normalizeChoiceValue = (value: unknown): string => {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)

  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeChoiceValue(entry))
      .filter(Boolean)
      .join(', ')
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>

    const preferredKeys = ['label', 'text', 'name', 'title', 'value']
    for (const key of preferredKeys) {
      const candidate = record[key]
      const normalized = normalizeChoiceValue(candidate)
      if (normalized) return normalized
    }

    const primitiveValues = Object.values(record)
      .filter((entry) => ['string', 'number', 'boolean'].includes(typeof entry))
      .map((entry) => normalizeChoiceValue(entry))
      .filter(Boolean)

    if (primitiveValues.length) return primitiveValues.join(', ')
  }

  return ''
}

const toChoiceItems = (value: unknown): string[] => {
  if (value == null) return []
  if (Array.isArray(value)) return value.flatMap((entry) => toChoiceItems(entry))
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? [trimmed] : []
  }
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)]
  if (typeof value === 'object') {
    const normalized = normalizeChoiceValue(value)
    return normalized ? [normalized] : []
  }
  return []
}

const parseChoiceItemsFromSerializedText = (text: string): string[] | null => {
  const trimmed = text.trim()
  if (!trimmed) return null
  if (/<[a-z][\s\S]*>/i.test(trimmed)) return null
  if (trimmed === '[object Object]') return null

  const maybeJSON =
    (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
    (trimmed.startsWith('{') && trimmed.endsWith('}'))

  if (maybeJSON) {
    try {
      const parsed = JSON.parse(trimmed)
      const items = toChoiceItems(parsed).filter(Boolean)
      return items.length > 1 ? items : null
    } catch {
      return null
    }
  }

  const maybeParenList = trimmed.startsWith('(') && trimmed.endsWith(')') && trimmed.includes(',')
  if (maybeParenList) {
    const items = trimmed
      .slice(1, -1)
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
    return items.length > 1 ? items : null
  }

  return null
}

const renderChoiceItemsAsBulletList = (items: string[]) => {
  return `<ul style="margin:0; padding-left:20px; line-height:1.6;">${items
    .map((item) => `<li style="margin:0 0 1px;">${escapeHTML(item)}</li>`)
    .join('')}</ul>`
}

const prettifySerializedChoiceText = (text: string): string | null => {
  const trimmed = text.trim()
  if (!trimmed) return null
  if (/<[a-z][\s\S]*>/i.test(trimmed)) return null
  if (trimmed === '[object Object]') return null

  const maybeJSON =
    (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
    (trimmed.startsWith('{') && trimmed.endsWith('}'))

  if (maybeJSON) {
    try {
      const parsed = JSON.parse(trimmed)
      const normalized = normalizeChoiceValue(parsed)
      if (normalized) return normalized
    } catch {
      return null
    }
  }

  const maybeParenList = trimmed.startsWith('(') && trimmed.endsWith(')') && trimmed.includes(',')
  if (maybeParenList) {
    const normalized = trimmed
      .slice(1, -1)
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .join(', ')
    return normalized || null
  }

  return null
}

const prettifyChoiceValuesInTableCells = (html: string) => {
  return html.replace(/<td(\s[^>]*)?>([\s\S]*?)<\/td>/gi, (full, attrs = '', inner = '') => {
    const asChoiceItems = parseChoiceItemsFromSerializedText(inner)
    if (asChoiceItems && asChoiceItems.length > 1) {
      return `<td${attrs}>${renderChoiceItemsAsBulletList(asChoiceItems)}</td>`
    }

    const pretty = prettifySerializedChoiceText(inner)
    if (pretty) {
      return `<td${attrs}>${escapeHTML(pretty)}</td>`
    }

    if (!/<[^>]+>/.test(inner)) {
      const normalized = decodeHTMLEntities(inner).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
      if (normalized.includes('\n')) {
        const withParagraphBreaks = escapeHTML(normalized)
          .replace(/\n{2,}/g, '<br><br>')
          .replace(/\n/g, '<br>')
        return `<td${attrs}>${withParagraphBreaks}</td>`
      }
    }

    return full
  })
}

const decodeHTMLEntities = (value: string) =>
  value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")

const getTableRowFieldKey = (rowHtml: string): string => {
  const firstCellMatch = rowHtml.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/i)
  if (!firstCellMatch?.[1]) return ''
  const stripped = firstCellMatch[1].replace(/<[^>]+>/g, '')
  return decodeHTMLEntities(stripped).trim()
}

const reorderTableRowsByFieldOrder = (html: string, fieldOrder: string[]) => {
  if (!Array.isArray(fieldOrder) || fieldOrder.length === 0) return html

  const orderMap = new Map<string, number>()
  fieldOrder.forEach((name, index) => {
    if (!name || typeof name !== 'string') return
    const key = name.trim()
    if (!key || orderMap.has(key)) return
    orderMap.set(key, index)
  })

  if (orderMap.size === 0) return html

  return html.replace(/<table\b[\s\S]*?<\/table>/gi, (tableHtml) => {
    const rowRegex = /<tr(\s[^>]*)?>[\s\S]*?<\/tr>/gi
    const rowMatches = Array.from(tableHtml.matchAll(rowRegex))
    if (rowMatches.length < 2) return tableHtml

    const firstRowIndex = rowMatches[0]?.index ?? -1
    const lastRow = rowMatches[rowMatches.length - 1]
    const lastRowIndex = lastRow?.index ?? -1
    if (firstRowIndex < 0 || lastRowIndex < 0) return tableHtml

    const rows = rowMatches.map((match, idx) => {
      const rowHtml = match[0]
      const hasHeaderCells = /<th\b/i.test(rowHtml)
      const key = getTableRowFieldKey(rowHtml)
      const orderIndex = orderMap.has(key) ? (orderMap.get(key) as number) : Number.POSITIVE_INFINITY
      return { idx, rowHtml, hasHeaderCells, orderIndex }
    })

    const hasSortableRows = rows.some((row) => Number.isFinite(row.orderIndex))
    if (!hasSortableRows) return tableHtml

    const sortedRows = [...rows].sort((a, b) => {
      if (a.hasHeaderCells && !b.hasHeaderCells) return -1
      if (!a.hasHeaderCells && b.hasHeaderCells) return 1
      if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex
      return a.idx - b.idx
    })

    const prefix = tableHtml.slice(0, firstRowIndex)
    const suffix = tableHtml.slice(lastRowIndex + (lastRow?.[0]?.length ?? 0))
    return `${prefix}${sortedRows.map((row) => row.rowHtml).join('')}${suffix}`
  })
}

const appendStyleToOpeningTag = (openingTag: string, styleToAdd: string) => {
  const styleAttrPattern = /style\s*=\s*(['"])(.*?)\1/i
  const match = openingTag.match(styleAttrPattern)

  if (!match) {
    return openingTag.replace(/>$/, ` style="${styleToAdd}">`)
  }

  const quote = match[1] || '"'
  const existing = (match[2] || '').trim()
  const nextStyle = existing.endsWith(';') ? `${existing} ${styleToAdd}` : `${existing}; ${styleToAdd}`
  return openingTag.replace(styleAttrPattern, `style=${quote}${nextStyle}${quote}`)
}

const applyAlternatingTableRowColors = (html: string) => {
  return html.replace(/<table\b[\s\S]*?<\/table>/gi, (tableHtml) => {
    let bodyRowIndex = 0

    return tableHtml.replace(/<tr(\s[^>]*)?>[\s\S]*?<\/tr>/gi, (rowHtml) => {
      const containsHeaderCells = /<th\b/i.test(rowHtml)
      if (containsHeaderCells) return rowHtml

      const color = bodyRowIndex % 2 === 0 ? '#ffffff' : '#f8fafc'
      bodyRowIndex += 1
      return rowHtml.replace(/<tr(\s[^>]*)?>/i, (openingTag) =>
        appendStyleToOpeningTag(openingTag, `background-color:${color};`),
      )
    })
  })
}

const stackLabelAndValueRows = (html: string) => {
  const shouldKeepStackedLayout = (valueHTML: string) => {
    return /<(ul|ol|li|div|p|table|blockquote|br)\b/i.test(valueHTML)
  }

  return html.replace(/<table\b[\s\S]*?<\/table>/gi, (tableHtml) => {
    return tableHtml.replace(/<tr(\s[^>]*)?>[\s\S]*?<\/tr>/gi, (rowHtml) => {
      if (/<th\b/i.test(rowHtml)) return rowHtml

      const tdMatches = Array.from(rowHtml.matchAll(/<td(\s[^>]*)?>([\s\S]*?)<\/td>/gi))
      if (tdMatches.length !== 2) return rowHtml

      const labelHTML = tdMatches[0]?.[2] ?? ''
      const valueHTML = tdMatches[1]?.[2] ?? ''

      if (!shouldKeepStackedLayout(valueHTML)) {
        return `<tr><td colspan="2" style="padding:4px 10px; line-height:1.2; mso-line-height-rule:exactly;"><div style="margin:0; line-height:1.2; mso-line-height-rule:exactly;"><span style="font-size:12px; font-weight:600; color:#475467; line-height:1.2; mso-line-height-rule:exactly;">${labelHTML}:</span>&nbsp;&nbsp;<span style="color:#111827; line-height:1.2; mso-line-height-rule:exactly;">${valueHTML}</span></div></td></tr>`
      }

      return `<tr><td colspan="2"><div style="margin:0 0 2px; font-size:12px; font-weight:600; color:#475467; line-height:1.3;">${labelHTML}</div><div style="margin:0;">${valueHTML}</div></td></tr>`
    })
  })
}

const formatFormEmailHTML = (input: string, fieldOrder: string[] = []) => {
  let html = typeof input === 'string' ? input : ''
  if (!html.trim()) return html

  html = reorderTableRowsByFieldOrder(html, fieldOrder)
  html = prettifyChoiceValuesInTableCells(html)
  html = stackLabelAndValueRows(html)
  html = appendInlineStyle(
    html,
    'table',
    'width:100%; border-collapse:separate; border-spacing:0; margin:8px 0; border:1px solid #e5e7eb; border-radius:10px; overflow:hidden;',
  )
  html = appendInlineStyle(
    html,
    'tr',
    'background-color:#ffffff;',
  )
  html = appendInlineStyle(
    html,
    'th',
    'padding:8px 10px; text-align:left; border-bottom:1px solid #e5e7eb; background:#f8fafc; color:#111827; font-weight:600; font-size:13px; vertical-align:top;',
  )
  html = appendInlineStyle(
    html,
    'td',
    'padding:8px 10px; border-bottom:1px solid #e5e7eb; color:#111827; font-size:14px; line-height:1.45; vertical-align:top; white-space:pre-line; word-break:break-word;',
  )
  html = appendInlineStyle(
    html,
    'p',
    'margin:0 0 12px; line-height:1.6;',
  )
  html = appendInlineStyle(
    html,
    'li',
    'margin:0 0 8px; line-height:1.6;',
  )
  html = appendInlineStyle(
    html,
    'blockquote',
    'margin:12px 0; padding:10px 14px; border-left:4px solid #d1d5db; background:#f9fafb;',
  )
  html = applyAlternatingTableRowColors(html)

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#111827; font-size:14px; line-height:1.6;">${html}</div>`
}

export const plugins: Plugin[] = [
  redirectsPlugin({
    collections: ['pages', 'posts'],
    overrides: {
      admin: {
        group: 'Misc',
        hidden: ({ user }) => !isSuperUser(user),
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
    beforeEmail: async (emails, beforeChangeParams: any) => {
      const formRef = beforeChangeParams?.data?.form
      const formID =
        typeof formRef === 'string'
          ? formRef
          : formRef && typeof formRef === 'object' && typeof formRef.id === 'string'
          ? formRef.id
          : ''
      const payload = beforeChangeParams?.req?.payload

      let fieldOrder: string[] = []
      if (payload && formID) {
        try {
          const formDoc = await payload.findByID({
            collection: 'forms',
            id: formID,
            depth: 0,
            overrideAccess: true,
            req: beforeChangeParams.req,
          })
          const fields = Array.isArray((formDoc as any)?.fields) ? (formDoc as any).fields : []
          fieldOrder = fields
            .map((field: any) => (typeof field?.name === 'string' ? field.name.trim() : ''))
            .filter(Boolean)
        } catch {
          fieldOrder = []
        }
      }

      return (emails || []).map((email) => ({
        ...email,
        html: formatFormEmailHTML(email?.html || '', fieldOrder),
      }))
    },
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
          name: 'enableIContactSync',
          label: 'Enable iContact Sync',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            position: 'sidebar',
          },
        })

        fields.push({
          name: 'iContactFolder',
          label: 'iContact Folder',
          type: 'relationship',
          relationTo: 'icontact-folders',
          admin: {
            position: 'sidebar',
            description: 'Search and select a synced iContact folder.',
            condition: (_, siblingData) => siblingData?.enableIContactSync === true,
          },
        })

        fields.push({
          name: 'iContactLists',
          label: 'iContact Lists',
          type: 'relationship',
          relationTo: 'icontact-lists',
          hasMany: true,
          filterOptions: ({ siblingData }) => {
            const rel = (siblingData as any)?.iContactFolder
            const folderId =
              typeof rel === 'string'
                ? rel
                : rel && typeof rel === 'object'
                ? ((rel as any).id || (rel as any)._id || '')
                : ''
            if (!folderId) return true
            return { clientFolder: { equals: folderId } }
          },
          admin: {
            position: 'sidebar',
            description: 'Search and select one or more lists for the selected folder.',
            condition: (_, siblingData) => siblingData?.enableIContactSync === true,
          },
        })

        fields.push({
          name: 'iContactFieldMap',
          label: 'iContact Field Mapping',
          type: 'group',
          admin: {
            position: 'sidebar',
            condition: (_, siblingData) => siblingData?.enableIContactSync === true,
          },
          fields: [
            {
              name: 'emailFieldName',
              label: 'Email Field Name',
              type: 'text',
              defaultValue: defaultIContactFieldMap.emailFieldName,
            },
            {
              name: 'firstNameFieldName',
              label: 'First Name Field Name',
              type: 'text',
              defaultValue: defaultIContactFieldMap.firstNameFieldName,
            },
            {
              name: 'lastNameFieldName',
              label: 'Last Name Field Name',
              type: 'text',
              defaultValue: defaultIContactFieldMap.lastNameFieldName,
            },
            {
              name: 'mobileFieldName',
              label: 'Mobile Field Name',
              type: 'text',
              defaultValue: defaultIContactFieldMap.mobileFieldName,
            },
            {
              name: 'zipFieldName',
              label: 'ZIP Field Name',
              type: 'text',
              defaultValue: defaultIContactFieldMap.zipFieldName,
            },
          ],
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

        fields.push({
          name: 'iContactBackfill',
          label: 'iContact Backfill',
          type: 'ui',
          admin: {
            position: 'sidebar',
            condition: (_, siblingData) => siblingData?.enableIContactSync === true,
            components: {
              Field: {
                path: '@/components/admin/FormIContactBackfillField#FormIContactBackfillField',
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

              const isSuper = isSuperUser(req.user)
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
              } catch {
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

                const dot = filename.lastIndexOf('.')
                const base = dot > 0 ? filename.slice(0, dot) : filename
                const ext = dot > 0 ? filename.slice(dot) : ''
                const tenantSlug = typeof tenantInfo?.slug === 'string' ? tenantInfo.slug : ''
                const safeTenant = (tenantSlug || tenantId).replace(/[^a-z0-9_-]+/giu, '-')
                const preferredFilename = `${safeTenant}-${base}-${mediaId}${ext}`

                const createWithName = async (name: string) =>
                  await req.payload.create({
                    collection: 'media',
                    data: {
                      alt: (mediaDoc as any)?.alt || name,
                      caption: captionClone,
                      tenant: tenantId,
                    },
                    file: {
                      data: fileBuffer,
                      size: fileBuffer.length,
                      name,
                      mimetype: mimeType,
                    } as any,
                    req: scopedReq,
                    overrideAccess: true,
                    context: { disableRevalidate: true } as any,
                  })

                let createdMedia: any
                try {
                  createdMedia = await createWithName(preferredFilename)
                } catch (error: any) {
                  const message = String(error?.message || error)
                  if (message.includes('filename')) {
                    const nonce = Date.now().toString(36)
                    const uniqueFilename = `${safeTenant}-${base}-${mediaId}-${nonce}${ext}`
                    createdMedia = await createWithName(uniqueFilename)
                  } else {
                    throw error
                  }
                }

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
        {
          path: '/icontact/options',
          method: 'get',
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

              const cfg = getIContactConfigFromEnv()
              if (!cfg) {
                return send(400, { error: 'iContact credentials are not configured in environment variables.' })
              }

              const urlText = (req as any)?.originalUrl || (req as any)?.url || ''
              const urlObj = new URL(urlText, 'http://local')
              const accountIdRaw = urlObj.searchParams.get('accountId') || undefined
              const clientFolderIdRaw = urlObj.searchParams.get('clientFolderId') || undefined

              const accountId = await resolveIContactAccountId(cfg, accountIdRaw || undefined)
              const folderPayload = await listIContactClientFolders(cfg, accountId)
              const folders = (folderPayload.clientfolders || []).map((f: any) => ({
                clientFolderId: String(f?.clientFolderId || ''),
                name: String(f?.name || ''),
              }))

              const clientFolderId = typeof clientFolderIdRaw === 'string' && clientFolderIdRaw.trim() ? clientFolderIdRaw.trim() : undefined
              if (!clientFolderId) {
                return send(200, {
                  ok: true,
                  accountId,
                  totalFolders: folderPayload.total,
                  folders,
                  lists: [],
                })
              }

              const listsPayload = await listIContactLists(cfg, accountId, clientFolderId)
              const lists = (listsPayload.lists || []).map((list: any) => ({
                listId: String(list?.listId || ''),
                name: String(list?.name || ''),
                description: typeof list?.description === 'string' ? list.description : '',
              }))

              return send(200, {
                ok: true,
                accountId,
                totalFolders: folderPayload.total,
                folders,
                clientFolderId,
                totalLists: listsPayload.total,
                lists,
              })
            } catch (err: any) {
              const body: any = { error: err?.message || 'Server error' }
              if (process.env.NODE_ENV !== 'production') body.stack = err?.stack
              return send(500, body)
            }
          }) as any,
        },
        {
          path: '/icontact/refresh-cache',
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
              const body = await parseRequestBody(req)
              const result = await refreshIContactCache({
                payload: req.payload,
                req,
                accountIdOverride: typeof body?.accountId === 'string' ? body.accountId : undefined,
              })
              return send(200, { ok: true, ...result })
            } catch (err: any) {
              const body: any = { error: err?.message || 'Server error' }
              if (process.env.NODE_ENV !== 'production') body.stack = err?.stack
              return send(500, body)
            }
          }) as any,
        },
        {
          path: '/:id/icontact-backfill',
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

              const id = parseRouteId(req, /\/api\/forms\/([^/]+)\/icontact-backfill/u)
              if (!id) return send(400, { error: 'Missing form id' })

              const body = await parseRequestBody(req)
              const dryRun = body?.dryRun === true
              const maxToProcess =
                typeof body?.maxToProcess === 'number' && Number.isFinite(body.maxToProcess)
                  ? Math.max(1, Math.min(5000, Math.trunc(body.maxToProcess)))
                  : 500

              const formDoc = await req.payload.findByID({
                collection: 'forms',
                id,
                depth: 0,
                overrideAccess: true,
                req,
              })

              if ((formDoc as any)?.enableIContactSync !== true) {
                return send(400, { error: 'iContact sync is not enabled for this form.' })
              }

              const all: any[] = []
              let page = 1
              let done = false
              while (!done) {
                const result = await req.payload.find({
                  collection: 'form-submissions',
                  where: { form: { equals: id } },
                  limit: 100,
                  page,
                  depth: 0,
                  overrideAccess: true,
                  req,
                })

                for (const row of result.docs || []) {
                  all.push(row)
                  if (all.length >= maxToProcess) {
                    done = true
                    break
                  }
                }

                if (done || !result.hasNextPage) break
                page += 1
              }

              const candidates = all.filter((submission) => {
                const status = String((submission as any)?.iContactSyncStatus || '')
                return status !== 'success'
              })

              const changed: Array<Record<string, unknown>> = []
              const failed: Array<Record<string, unknown>> = []

              for (const submission of candidates) {
                const submissionId = String((submission as any)?.id || '')
                if (!submissionId) continue

                if (dryRun) {
                  changed.push({ submissionId, dryRun: true, status: 'would-sync' })
                  continue
                }

                const syncResult = await syncSubmissionToIContact({
                  formDoc,
                  submissionData: (submission as any)?.submissionData,
                  payload: req.payload,
                  req,
                })

                const updateData: any = {
                  iContactSyncStatus: syncResult.status,
                  iContactSyncError: syncResult.error || syncResult.reason || undefined,
                  iContactAccountId: syncResult.accountId || undefined,
                  iContactClientFolderId: syncResult.clientFolderId || undefined,
                  iContactListIds: (syncResult.listIds || []).map((listId) => ({ listId })),
                  iContactContactId: syncResult.contactId || undefined,
                  iContactSyncedAt: syncResult.status === 'success' ? new Date().toISOString() : undefined,
                }

                try {
                  await req.payload.update({
                    collection: 'form-submissions',
                    id: submissionId,
                    data: updateData,
                    overrideAccess: true,
                    req,
                    context: { skipIContactSyncHook: true } as any,
                  })
                  changed.push({ submissionId, status: syncResult.status, error: syncResult.error || syncResult.reason || null })
                } catch (error: any) {
                  failed.push({ submissionId, error: error?.message || 'Update failed' })
                }
              }

              return send(200, {
                ok: true,
                dryRun,
                maxToProcess,
                scanned: all.length,
                candidates: candidates.length,
                changedCount: changed.length,
                failedCount: failed.length,
                changed,
                failed,
              })
            } catch (err: any) {
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
      fields: ({ defaultFields }) => {
        const fields = Array.isArray(defaultFields) ? [...defaultFields] : []

        fields.push(
          {
            name: 'cooldownNotice',
            label: 'Cooldown Policy',
            type: 'ui',
            admin: {
              position: 'sidebar',
              components: {
                Field: {
                  path: '@/components/admin/FormSubmissionCooldownNotice#FormSubmissionCooldownNotice',
                },
              },
            },
          },
          {
            name: 'submitterIP',
            label: 'Submitter IP',
            type: 'text',
            admin: { readOnly: true, position: 'sidebar' },
          },
          {
            name: 'submitterEmail',
            label: 'Submitter Email',
            type: 'text',
            admin: { readOnly: true, position: 'sidebar' },
          },
          {
            name: 'submitterUserAgent',
            label: 'Submitter User Agent',
            type: 'textarea',
            admin: { readOnly: true, position: 'sidebar' },
          },
          {
            name: 'submitterBrowser',
            label: 'Submitter Browser',
            type: 'text',
            admin: { readOnly: true, position: 'sidebar' },
          },
          {
            name: 'submitterDevice',
            label: 'Submitter Device',
            type: 'text',
            admin: { readOnly: true, position: 'sidebar' },
          },
          {
            name: 'submitterOS',
            label: 'Submitter OS',
            type: 'text',
            admin: { readOnly: true, position: 'sidebar' },
          },
          {
            name: 'iContactSyncStatus',
            label: 'iContact Sync Status',
            type: 'text',
            admin: { readOnly: true, position: 'sidebar' },
          },
          {
            name: 'iContactSyncError',
            label: 'iContact Sync Error',
            type: 'textarea',
            admin: { readOnly: true, position: 'sidebar' },
          },
          {
            name: 'iContactAccountId',
            label: 'iContact Account ID',
            type: 'text',
            admin: { readOnly: true, position: 'sidebar' },
          },
          {
            name: 'iContactClientFolderId',
            label: 'iContact Client Folder ID',
            type: 'text',
            admin: { readOnly: true, position: 'sidebar' },
          },
          {
            name: 'iContactListIds',
            label: 'iContact List IDs',
            type: 'array',
            admin: { readOnly: true, position: 'sidebar' },
            fields: [
              {
                name: 'listId',
                label: 'List ID',
                type: 'text',
              },
            ],
          },
          {
            name: 'iContactContactId',
            label: 'iContact Contact ID',
            type: 'text',
            admin: { readOnly: true, position: 'sidebar' },
          },
          {
            name: 'iContactSyncedAt',
            label: 'iContact Synced At',
            type: 'date',
            admin: { readOnly: true, position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } },
          },
        )

        return fields
      },
      hooks: {
        beforeChange: [
          async ({ data, req }) => {
            const TURNSTILE_TOKEN_FIELD_NAME = 'turnstileToken'
            const secretKey = process.env.TURNSTILE_SECRET_KEY

            const formId = typeof data?.form === 'string' ? data.form : data?.form?.id
            if (!formId) return data

            const form = await req.payload.findByID({ collection: 'forms', id: formId })
            const turnstileEnabled = (form as { enableTurnstile?: boolean })?.enableTurnstile === true
            const iContactEnabled = (form as { enableIContactSync?: boolean })?.enableIContactSync === true
            const submissionData = Array.isArray(data?.submissionData) ? [...data.submissionData] : []

            const getHeader = (name: string) => {
              const headers = req?.headers as unknown
              if (headers && typeof (headers as { get?: (name: string) => string | null }).get === 'function') {
                return (headers as { get: (name: string) => string | null }).get(name) || ''
              }

              const raw = (headers as Record<string, string | string[] | undefined>)?.[name]
              return Array.isArray(raw) ? raw[0] || '' : raw || ''
            }

            const submitterIP = (() => {
              const forwarded = getHeader('x-forwarded-for')
              if (forwarded) return forwarded.split(',')[0]?.trim() || ''
              return (
                (req as { ip?: string; connection?: { remoteAddress?: string } } | undefined)?.ip ||
                (req as { connection?: { remoteAddress?: string } } | undefined)?.connection?.remoteAddress ||
                ''
              )
            })()
            const submitterUserAgent = getHeader('user-agent').trim()
            const submitterBrowser = inferBrowserFromUserAgent(submitterUserAgent)
            const submitterDevice = inferDeviceFromUserAgent(submitterUserAgent)
            const submitterOS = inferOSFromUserAgent(submitterUserAgent)

            const submitterEmail = (() => {
              for (const entry of submissionData) {
                if (!entry || typeof entry !== 'object') continue
                const rawValue = typeof entry?.value === 'string' ? entry.value.trim() : ''
                if (!rawValue || !rawValue.includes('@')) continue
                const fieldName = typeof entry?.field === 'string' ? entry.field.toLowerCase() : ''
                if (!fieldName || fieldName.includes('email') || rawValue.includes('@')) {
                  return rawValue.toLowerCase()
                }
              }
              return ''
            })()

            const emailDomain = submitterEmail.split('@')[1] || ''
            const exemptIPs = (process.env.FORM_SUBMISSION_COOLDOWN_EXEMPT_IPS || '')
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean)
            const exemptDomains = (process.env.FORM_SUBMISSION_COOLDOWN_EXEMPT_EMAIL_DOMAINS || '')
              .split(',')
              .map((value) => value.trim().toLowerCase())
              .filter(Boolean)

            const isExempt =
              (submitterIP && exemptIPs.includes(submitterIP)) ||
              (emailDomain && exemptDomains.includes(emailDomain.toLowerCase()))

            if (!isExempt && (submitterIP || submitterEmail)) {
              const COOLDOWN_THRESHOLD = 3
              const BASE_COOLDOWN_MINUTES = 15
              const EXTRA_COOLDOWN_MINUTES = 30
              const lookbackMs = 1000 * 60 * 60 * 24
              const now = Date.now()
              const cutoffIso = new Date(now - lookbackMs).toISOString()

              const matchOr: Where[] = []
              if (submitterIP) matchOr.push({ submitterIP: { equals: submitterIP } })
              if (submitterEmail) matchOr.push({ submitterEmail: { equals: submitterEmail } })

              const andFilters: Where[] = [{ createdAt: { greater_than: cutoffIso } }]
              if (matchOr.length) {
                andFilters.push({ or: matchOr })
              }

              const recent = await req.payload.find({
                collection: 'form-submissions',
                where: { and: andFilters },
                limit: 200,
                depth: 0,
                overrideAccess: true,
                sort: 'createdAt',
              })

              const timestamps = (recent?.docs || [])
                .map((doc: { createdAt?: string }) => (doc.createdAt ? new Date(doc.createdAt).getTime() : NaN))
                .filter((value) => Number.isFinite(value))
                .sort((a, b) => a - b)

              timestamps.push(now)

              let lockoutCount = 0
              let lastLockoutAt: number | null = null
              let windowStart: number | null = null
              let windowCount = 0
              const windowMs = BASE_COOLDOWN_MINUTES * 60 * 1000

              for (const timestamp of timestamps) {
                if (windowStart === null) {
                  windowStart = timestamp
                  windowCount = 1
                  continue
                }

                if (timestamp - windowStart <= windowMs) {
                  windowCount += 1
                } else {
                  windowStart = timestamp
                  windowCount = 1
                }

                if (windowCount >= COOLDOWN_THRESHOLD) {
                  lockoutCount += 1
                  lastLockoutAt = timestamp
                  windowStart = timestamp
                  windowCount = 0
                }
              }

              if (lastLockoutAt !== null && lockoutCount > 0) {
                const lockoutMinutes = BASE_COOLDOWN_MINUTES + (lockoutCount - 1) * EXTRA_COOLDOWN_MINUTES
                const unlockAt = lastLockoutAt + lockoutMinutes * 60 * 1000
                if (now < unlockAt) {
                  throw new Error(
                    `Too many submissions. Please wait ${lockoutMinutes} minutes before trying again.`,
                  )
                }
              }
            }
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
                submitterIP: submitterIP || undefined,
                submitterEmail: submitterEmail || undefined,
                submitterUserAgent: submitterUserAgent || undefined,
                submitterBrowser: submitterBrowser || undefined,
                submitterDevice: submitterDevice || undefined,
                submitterOS: submitterOS || undefined,
                iContactSyncStatus: iContactEnabled ? 'pending' : 'skipped',
                iContactSyncError: undefined,
                iContactSyncedAt: undefined,
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
              submitterIP: submitterIP || undefined,
              submitterEmail: submitterEmail || undefined,
              submitterUserAgent: submitterUserAgent || undefined,
              submitterBrowser: submitterBrowser || undefined,
              submitterDevice: submitterDevice || undefined,
              submitterOS: submitterOS || undefined,
              iContactSyncStatus: iContactEnabled ? 'pending' : 'skipped',
              iContactSyncError: undefined,
              iContactSyncedAt: undefined,
            }
          },
        ],
        afterChange: [
          async ({ doc, operation, req, context }) => {
            if (operation !== 'create') return doc
            if ((context as any)?.skipIContactSyncHook) return doc

            try {
              const formId = typeof (doc as any)?.form === 'string' ? (doc as any).form : (doc as any)?.form?.id
              if (!formId) return doc

              const formDoc = await req.payload.findByID({
                collection: 'forms',
                id: formId,
                depth: 0,
                overrideAccess: true,
                req,
              })

              const syncResult = await syncSubmissionToIContact({
                formDoc,
                submissionData: (doc as any)?.submissionData,
                payload: req.payload,
                req,
              })

              await req.payload.update({
                collection: 'form-submissions',
                id: String((doc as any).id),
                data: {
                  iContactSyncStatus: syncResult.status,
                  iContactSyncError: syncResult.error || syncResult.reason || undefined,
                  iContactAccountId: syncResult.accountId || undefined,
                  iContactClientFolderId: syncResult.clientFolderId || undefined,
                  iContactListIds: (syncResult.listIds || []).map((listId) => ({ listId })),
                  iContactContactId: syncResult.contactId || undefined,
                  iContactSyncedAt: syncResult.status === 'success' ? new Date().toISOString() : undefined,
                },
                overrideAccess: true,
                req,
                context: { skipIContactSyncHook: true } as any,
              })
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error)
              try {
                await req.payload.update({
                  collection: 'form-submissions',
                  id: String((doc as any).id),
                  data: {
                    iContactSyncStatus: 'failed',
                    iContactSyncError: message,
                  },
                  overrideAccess: true,
                  req,
                  context: { skipIContactSyncHook: true } as any,
                })
              } catch (updateError) {
                console.error('[iContact afterChange] Failed to write sync failure state', updateError)
              }
            }

            return doc
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
      const traverse = (fields: Field[], parentName?: string): void => {
        fields.forEach((field) => {
          if ('name' in field && field.name === 'tenant') {
            // Rename to "Site" and hide on edit to avoid accidental tenant changes via the selector
            field.label = 'Site'
            const isUserTenantAssignment = collection.slug === 'users' && parentName === 'tenants'
            if (!isUserTenantAssignment) {
              ;(field as any).admin = {
                ...((field as any).admin || {}),
                // Show the tenant picker only when creating a new document.
                // When editing (data.id exists), hide the tenant field so UI won't attempt to update ownership.
                condition: (data: any) => !data?.id,
              }
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
            const nextParent = 'name' in field ? field.name : parentName
            traverse(field.fields as Field[], nextParent)
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
