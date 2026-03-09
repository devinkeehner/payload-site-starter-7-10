import { createMcpHandler } from '../../../../node_modules/.pnpm/node_modules/mcp-handler/dist/index.js'
import { z } from 'zod'
import { getPayload } from 'payload'
import type { Where } from 'payload'
import configPromise from '@payload-config'
import { Pages } from '@/collections/Pages'

const WIDGET_URI = 'ui://widget/payload-change-summary.html'

const deepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a == null || b == null) return false

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((value, index) => deepEqual(value, b[index]))
  }

  if (typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const aEntries = Object.entries(a as Record<string, unknown>).sort(([aKey], [bKey]) =>
      aKey.localeCompare(bKey),
    )
    const bEntries = Object.entries(b as Record<string, unknown>).sort(([aKey], [bKey]) =>
      aKey.localeCompare(bKey),
    )
    if (aEntries.length !== bEntries.length) return false
    return aEntries.every(([key, value], index) => {
      const [bKey, bValue] = bEntries[index] || []
      return key === bKey && deepEqual(value, bValue)
    })
  }

  return false
}

const cloneValue = <T,>(value: T): T => {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value)
  }
  return JSON.parse(JSON.stringify(value)) as T
}

const parsePathSegments = (path: string): Array<string | number> => {
  const trimmed = path.trim()
  if (!trimmed) throw new Error('Path cannot be empty.')

  const segments: Array<string | number> = []
  const parts = trimmed.split('.')

  for (const rawPart of parts) {
    const part = rawPart.trim()
    if (!part) throw new Error(`Invalid path segment in "${path}".`)

    const regex = /([^[\]]+)|\[(\d+)\]/g
    let hasMatch = false
    let match: RegExpExecArray | null = null

    while ((match = regex.exec(part)) !== null) {
      hasMatch = true
      if (match[1]) {
        segments.push(match[1])
      } else if (match[2]) {
        segments.push(Number.parseInt(match[2], 10))
      }
    }

    if (!hasMatch) {
      throw new Error(`Invalid path part "${part}" in "${path}".`)
    }
  }

  return segments
}

const ensureContainer = (
  nextSegment: string | number | undefined,
): Record<string, unknown> | Array<unknown> => {
  return typeof nextSegment === 'number' ? [] : {}
}

const setAtPath = (
  target: Record<string, unknown> | Array<unknown>,
  segments: Array<string | number>,
  value: unknown,
  createMissing: boolean,
) => {
  if (segments.length === 0) throw new Error('Path cannot be empty.')

  let cursor: Record<string, unknown> | Array<unknown> = target
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i]!
    const nextSegment = segments[i + 1]

    if (typeof segment === 'string') {
      if (typeof cursor !== 'object' || cursor == null || Array.isArray(cursor)) {
        throw new Error(`Cannot traverse "${segment}" on non-object path segment.`)
      }
      let nextValue = (cursor as Record<string, unknown>)[segment]
      if (nextValue == null) {
        if (!createMissing) throw new Error(`Path segment "${segment}" does not exist.`)
        nextValue = ensureContainer(nextSegment)
        ;(cursor as Record<string, unknown>)[segment] = nextValue
      }
      cursor = (cursor as Record<string, unknown>)[segment] as Record<string, unknown> | Array<unknown>
      continue
    }

    if (!Array.isArray(cursor)) {
      throw new Error(`Cannot traverse index [${segment}] on non-array path segment.`)
    }
    if ((cursor as Array<unknown>)[segment] == null) {
      if (!createMissing) throw new Error(`Path index [${segment}] does not exist.`)
      ;(cursor as Array<unknown>)[segment] = ensureContainer(nextSegment)
    }
    cursor = (cursor as Array<unknown>)[segment] as Record<string, unknown> | Array<unknown>
  }

  const last = segments[segments.length - 1]!
  if (typeof last === 'string') {
    if (typeof cursor !== 'object' || cursor == null || Array.isArray(cursor)) {
      throw new Error(`Cannot set property "${last}" on non-object value.`)
    }
    ;(cursor as Record<string, unknown>)[last] = value
    return
  }

  if (!Array.isArray(cursor)) {
    throw new Error(`Cannot set index [${last}] on non-array value.`)
  }
  ;(cursor as Array<unknown>)[last] = value
}

const unsetAtPath = (
  target: Record<string, unknown> | Array<unknown>,
  segments: Array<string | number>,
) => {
  if (segments.length === 0) throw new Error('Path cannot be empty.')

  let cursor: Record<string, unknown> | Array<unknown> | undefined = target
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i]!
    if (typeof segment === 'string') {
      if (typeof cursor !== 'object' || cursor == null || Array.isArray(cursor)) return
      cursor = (cursor as Record<string, unknown>)[segment] as Record<string, unknown> | Array<unknown> | undefined
      continue
    }
    if (!Array.isArray(cursor)) return
    cursor = (cursor as Array<unknown>)[segment] as Record<string, unknown> | Array<unknown> | undefined
  }

  const last = segments[segments.length - 1]!
  if (typeof last === 'string') {
    if (typeof cursor !== 'object' || cursor == null || Array.isArray(cursor)) return
    delete (cursor as Record<string, unknown>)[last]
    return
  }

  if (!Array.isArray(cursor)) return
  if (last >= 0 && last < (cursor as Array<unknown>).length) {
    ;(cursor as Array<unknown>)[last] = undefined
  }
}

const removeAtPath = (
  target: Record<string, unknown> | Array<unknown>,
  segments: Array<string | number>,
) => {
  if (segments.length === 0) throw new Error('Path cannot be empty.')

  let cursor: Record<string, unknown> | Array<unknown> | undefined = target
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i]!
    if (typeof segment === 'string') {
      if (typeof cursor !== 'object' || cursor == null || Array.isArray(cursor)) return
      cursor = (cursor as Record<string, unknown>)[segment] as Record<string, unknown> | Array<unknown> | undefined
      continue
    }
    if (!Array.isArray(cursor)) return
    cursor = (cursor as Array<unknown>)[segment] as Record<string, unknown> | Array<unknown> | undefined
  }

  const last = segments[segments.length - 1]!
  if (typeof last === 'number' && Array.isArray(cursor) && last >= 0 && last < cursor.length) {
    cursor.splice(last, 1)
    return
  }

  unsetAtPath(target, segments)
}

const summarizeFieldValue = (value: unknown) => {
  if (Array.isArray(value)) return { kind: 'array', length: value.length }
  if (value == null) return { kind: 'null' }
  if (typeof value === 'object') {
    return { kind: 'object', keys: Object.keys(value as Record<string, unknown>).slice(0, 20) }
  }
  if (typeof value === 'string') {
    return { kind: 'string', value: value.length > 140 ? `${value.slice(0, 137)}...` : value }
  }
  return { kind: typeof value, value }
}

const normalizeFieldSchema = (field: Record<string, unknown>): Record<string, unknown> => {
  const normalized: Record<string, unknown> = {
    name: field.name ?? null,
    label: field.label ?? null,
    type: field.type ?? null,
    required: Boolean(field.required),
  }

  if (typeof field.defaultValue !== 'undefined') normalized.defaultValue = field.defaultValue
  if (typeof field.localized === 'boolean') normalized.localized = field.localized

  if (field.type === 'select' && Array.isArray(field.options)) {
    normalized.options = field.options.map((option) => {
      if (typeof option === 'string') return { label: option, value: option }
      if (option && typeof option === 'object') {
        const rec = option as Record<string, unknown>
        return { label: rec.label ?? null, value: rec.value ?? null }
      }
      return { label: null, value: null }
    })
  }

  if (Array.isArray(field.fields)) {
    normalized.fields = (field.fields as Array<Record<string, unknown>>).map(normalizeFieldSchema)
  }

  if (field.type === 'tabs' && Array.isArray(field.tabs)) {
    normalized.tabs = (field.tabs as Array<Record<string, unknown>>).map((tab) => ({
      name: tab.name ?? null,
      label: tab.label ?? null,
      fields: Array.isArray(tab.fields)
        ? (tab.fields as Array<Record<string, unknown>>).map(normalizeFieldSchema)
        : [],
    }))
  }

  if (field.type === 'blocks' && Array.isArray(field.blocks)) {
    normalized.blocks = (field.blocks as Array<Record<string, unknown>>).map((block) => ({
      slug: block.slug ?? null,
      labels: block.labels ?? null,
      fields: Array.isArray(block.fields)
        ? (block.fields as Array<Record<string, unknown>>).map(normalizeFieldSchema)
        : [],
    }))
  }

  return normalized
}

const getPageBlockDefinitions = () => {
  const pageFields = Pages.fields as Array<unknown>
  const tabsField = pageFields.find((field) => {
    if (!field || typeof field !== 'object') return false
    const rec = field as Record<string, unknown>
    return rec.type === 'tabs' && Array.isArray(rec.tabs)
  }) as Record<string, unknown> | undefined

  if (!tabsField || !Array.isArray(tabsField.tabs)) return []

  for (const tab of tabsField.tabs as Array<Record<string, unknown>>) {
    if (!Array.isArray(tab.fields)) continue
    for (const field of tab.fields as Array<Record<string, unknown>>) {
      if (field?.name === 'layout' && field.type === 'blocks' && Array.isArray(field.blocks)) {
        return field.blocks as Array<Record<string, unknown>>
      }
    }
  }

  return []
}

const resolveTenantId = async (payload: Awaited<ReturnType<typeof getPayload>>, tenant?: string) => {
  if (!tenant) return undefined
  const trimmed = tenant.trim()
  if (!trimmed) return undefined

  const byId = await payload.find({
    collection: 'tenants',
    limit: 1,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    where: { id: { equals: trimmed } } as unknown as Where,
  })
  if (byId.docs?.[0]?.id) return String(byId.docs[0].id)

  const bySlug = await payload.find({
    collection: 'tenants',
    limit: 1,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    where: { slug: { equals: trimmed } } as unknown as Where,
  })
  if (bySlug.docs?.[0]?.id) return String(bySlug.docs[0].id)

  return trimmed
}

const loadPageDocument = async (
  payload: Awaited<ReturnType<typeof getPayload>>,
  selector: { pageId?: string; slug?: string; tenant?: string },
) => {
  const { pageId, slug, tenant } = selector
  if (!pageId && !slug) throw new Error('Provide `pageId` or `slug`.')

  if (pageId) {
    return (await payload.findByID({
      collection: 'pages',
      id: pageId,
      depth: 0,
      overrideAccess: true,
    })) as unknown as Record<string, unknown>
  }

  const tenantId = await resolveTenantId(payload, tenant)
  const where: Where = slug
    ? tenantId
      ? ({ and: [{ slug: { equals: slug } }, { tenant: { equals: tenantId } }] } as unknown as Where)
      : ({ slug: { equals: slug } } as unknown as Where)
    : ({} as Where)

  const result = await payload.find({
    collection: 'pages',
    limit: 1,
    where,
    overrideAccess: true,
    depth: 0,
  })

  return (result.docs?.[0] as unknown as Record<string, unknown>) || null
}

const findTargetBlock = (
  layout: Array<Record<string, unknown>>,
  selector: { blockId?: string; blockType?: string; blockIndex?: number },
) => {
  const { blockId, blockType, blockIndex = 0 } = selector

  if (blockId) {
    const idx = layout.findIndex((block) => String(block?.id ?? '') === blockId)
    if (idx < 0) return { block: null, index: -1 }
    return { block: layout[idx], index: idx }
  }

  if (!blockType) return { block: null, index: -1 }

  let seen = -1
  for (let i = 0; i < layout.length; i += 1) {
    const block = layout[i]
    if (String(block?.blockType ?? '') !== blockType) continue
    seen += 1
    if (seen === blockIndex) {
      return { block, index: i }
    }
  }

  return { block: null, index: -1 }
}

const mcpHandler = createMcpHandler(
  (server) => {
    server.registerResource(
      'payload-change-summary-widget',
      WIDGET_URI,
      {
        title: 'Payload Change Summary Widget',
        description: 'Renders change details and provides a publish button.',
        mimeType: 'text/html',
      },
      async () => ({
        contents: [
          {
            uri: WIDGET_URI,
            mimeType: 'text/html',
            text: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Payload Change Summary</title>
    <style>
      :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, sans-serif; }
      body { margin: 0; padding: 14px; }
      .card { border: 1px solid #9ca3af55; border-radius: 10px; padding: 12px; }
      h2 { margin: 0 0 6px; font-size: 16px; }
      p { margin: 6px 0; }
      ul { margin: 6px 0; padding-left: 18px; }
      button { margin-top: 10px; padding: 8px 12px; border: 0; border-radius: 8px; background: #0f766e; color: #fff; font-weight: 600; cursor: pointer; width: 100%; }
      small { opacity: 0.75; display: block; margin-top: 8px; }
    </style>
  </head>
  <body>
    <article class="card">
      <h2 id="title">Change Summary</h2>
      <p id="description">No description provided.</p>
      <ul id="takeaways"></ul>
      <button id="publish">Publish</button>
      <small id="meta"></small>
    </article>
    <script>
      const openai = window.openai
      const output = openai?.toolOutput || {}
      const summary = output.summary || output.structuredContent || output || {}
      const title = summary.title || 'Payload Change Summary'
      const description = summary.description || 'No description provided.'
      const points = Array.isArray(summary.keyTakeaways) ? summary.keyTakeaways : []

      document.getElementById('title').textContent = title
      document.getElementById('description').textContent = description
      document.getElementById('meta').textContent = 'Collection: ' + (summary.collection || 'pages') + ' | Doc: ' + (summary.docId || 'unknown')

      const list = document.getElementById('takeaways')
      list.innerHTML = ''
      for (const point of points) {
        const li = document.createElement('li')
        li.textContent = String(point)
        list.appendChild(li)
      }
      if (!points.length) {
        const li = document.createElement('li')
        li.textContent = 'No key takeaways.'
        list.appendChild(li)
      }

      document.getElementById('publish').addEventListener('click', async () => {
        if (!openai?.callTool) return
        const action = summary.publishAction || { args: { collection: summary.collection || 'pages', docId: summary.docId } }
        await openai.callTool('publishDocument', action.args || {})
      })
    </script>
  </body>
</html>`,
            _meta: {
              'openai/widgetDescription':
                'Shows a concise Payload change summary with a publish action button.',
              'openai/widgetPrefersBorder': true,
              'openai/widgetCSP': {
                connect_domains: [],
                resource_domains: [],
              },
            },
          },
        ],
      }),
    )

    server.registerTool(
      'listTenants',
      {
        title: 'List Tenants',
        description: 'Lists tenants so ChatGPT can target the right site when editing content.',
        inputSchema: {
          search: z.string().optional(),
          limit: z.number().int().min(1).max(100).default(25),
        },
      },
      async ({ search, limit }) => {
        try {
          const payload = await getPayload({ config: configPromise })
          const where =
            typeof search === 'string' && search.trim().length > 0
              ? ({
                  or: [
                    { slug: { like: search.trim() } },
                    { name: { like: search.trim() } },
                  ],
                } as unknown as Where)
              : undefined

          const result = await payload.find({
            collection: 'tenants',
            limit,
            pagination: false,
            depth: 0,
            overrideAccess: true,
            ...(where ? { where } : {}),
          })

          const tenants = result.docs.map((doc) => ({
            id: String(doc.id),
            slug: typeof doc.slug === 'string' ? doc.slug : null,
            name: typeof doc.name === 'string' ? doc.name : null,
            archived: Boolean(doc.archived),
          }))

          return {
            structuredContent: { count: tenants.length, tenants },
            content: [{ type: 'text', text: JSON.stringify({ count: tenants.length, tenants }, null, 2) }],
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return {
            isError: true,
            content: [{ type: 'text', text: `Error listing tenants: ${message}` }],
          }
        }
      },
    )

    server.registerTool(
      'summarizePayloadChange',
      {
        title: 'Summarize Payload Change',
        description:
          'Returns a structured summary for rendering and includes publish action args for a one-click publish button.',
        inputSchema: {
          collection: z.enum(['pages', 'posts']).default('pages'),
          docId: z.string().min(1),
          title: z.string().min(1),
          description: z.string().default(''),
          keyTakeaways: z.array(z.string()).default([]),
        },
        _meta: {
          'openai/outputTemplate': WIDGET_URI,
          'openai/widgetAccessible': true,
          'openai/toolInvocation/invoking': 'Preparing change summary...',
          'openai/toolInvocation/invoked': 'Change summary ready.',
        },
      },
      async ({ collection, docId, title, description, keyTakeaways }) => {
        const summary = {
          collection,
          docId,
          title,
          description,
          keyTakeaways,
          publishAction: {
            tool: 'publishDocument',
            args: { collection, docId },
          },
        }

        return {
          structuredContent: summary,
          content: [
            {
              type: 'text',
              text: `Prepared change summary for ${collection}/${docId}.`,
            },
          ],
        }
      },
    )

    server.registerTool(
      'getEditingDefaults',
      {
        title: 'Get Editing Defaults',
        description: 'Returns preferred editing conventions for this multi-tenant Payload workspace.',
        inputSchema: {},
      },
      async () => ({
        structuredContent: {
          tenantTargeting: 'If pageId is not provided, include both slug and tenant whenever possible.',
          slugShorthand: 'Treat values like /main as tenant slug main when the request is tenant-scoped.',
          draftMode: 'Prefer draft writes by default. Publish only when explicitly requested.',
          pageBlockWorkflow: ['listPageBlocks', 'getBlockShape', 'updateBlockFields'],
        },
        content: [
          {
            type: 'text',
            text: [
              'Editing defaults for this workspace:',
              '1) If pageId is not provided, include both slug and tenant whenever possible.',
              '2) Treat values like "/main" as tenant slug "main" when the request is tenant-scoped.',
              '3) Prefer draft writes by default.',
              '4) Safe page-block workflow: listPageBlocks -> getBlockShape -> updateBlockFields.',
            ].join('\n'),
          },
        ],
      }),
    )

    server.registerTool(
      'listPageBlocks',
      {
        title: 'List Page Blocks',
        description: 'Lists blocks on a page with ids, types, indices, and compact summaries.',
        inputSchema: {
          pageId: z.string().optional(),
          slug: z.string().optional(),
          tenant: z.string().optional(),
        },
      },
      async ({ pageId, slug, tenant }) => {
        try {
          const payload = await getPayload({ config: configPromise })
          const pageDoc = await loadPageDocument(payload, { pageId, slug, tenant })
          if (!pageDoc?.id) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: page not found.' }],
            }
          }

          const layout = Array.isArray(pageDoc.layout) ? (pageDoc.layout as Array<Record<string, unknown>>) : []
          const blocks = layout.map((block, index) => {
            const blockType = typeof block.blockType === 'string' ? block.blockType : null
            const keys = Object.keys(block).filter((key) => !['id', 'blockType'].includes(key))
            const summary: Record<string, unknown> = {}
            for (const key of keys.slice(0, 20)) {
              summary[key] = summarizeFieldValue(block[key])
            }
            return {
              id: block.id ? String(block.id) : null,
              blockType,
              index,
              summary,
            }
          })

          return {
            structuredContent: {
              pageId: String(pageDoc.id),
              slug: typeof pageDoc.slug === 'string' ? pageDoc.slug : null,
              status: typeof pageDoc._status === 'string' ? pageDoc._status : null,
              blockCount: blocks.length,
              blocks,
            },
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    pageId: String(pageDoc.id),
                    slug: typeof pageDoc.slug === 'string' ? pageDoc.slug : null,
                    status: typeof pageDoc._status === 'string' ? pageDoc._status : null,
                    blockCount: blocks.length,
                    blocks,
                  },
                  null,
                  2,
                ),
              },
            ],
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return {
            isError: true,
            content: [{ type: 'text', text: `Error listing page blocks: ${message}` }],
          }
        }
      },
    )

    server.registerTool(
      'getBlockShape',
      {
        title: 'Get Block Shape',
        description: 'Returns editable field schema for one page block type or all page block types.',
        inputSchema: {
          blockType: z.string().optional(),
        },
      },
      async ({ blockType }) => {
        try {
          const definitions = getPageBlockDefinitions()
          if (definitions.length === 0) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: could not resolve page block definitions.' }],
            }
          }

          const selected =
            typeof blockType === 'string' && blockType.trim().length > 0
              ? definitions.filter((block) => String(block.slug ?? '') === blockType.trim())
              : definitions

          if (selected.length === 0) {
            return {
              isError: true,
              content: [{ type: 'text', text: `Error: blockType "${blockType}" not found.` }],
            }
          }

          const blocks = selected.map((block) => ({
            slug: block.slug ?? null,
            labels: block.labels ?? null,
            fields: Array.isArray(block.fields)
              ? (block.fields as Array<Record<string, unknown>>).map(normalizeFieldSchema)
              : [],
          }))

          return {
            structuredContent: { blockCount: blocks.length, blocks },
            content: [{ type: 'text', text: JSON.stringify({ blockCount: blocks.length, blocks }, null, 2) }],
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return {
            isError: true,
            content: [{ type: 'text', text: `Error getting block shape: ${message}` }],
          }
        }
      },
    )

    server.registerTool(
      'updateBlockFields',
      {
        title: 'Update Block Fields',
        description:
          'Updates any page block fields using path operations. Works for petitionDrive and other page blocks. Defaults to draft writes.',
        inputSchema: {
          pageId: z.string().optional(),
          slug: z.string().optional(),
          tenant: z.string().optional(),
          blockId: z.string().optional(),
          blockType: z.string().optional(),
          blockIndex: z.number().int().min(0).default(0),
          updates: z
            .array(
              z.object({
                op: z.enum(['set', 'unset', 'remove']).default('set'),
                path: z.string().min(1),
                value: z.unknown().optional(),
              }),
            )
            .min(1),
          createMissing: z.boolean().default(true),
          dryRun: z.boolean().default(false),
          draft: z.boolean().default(true),
        },
      },
      async ({ pageId, slug, tenant, blockId, blockType, blockIndex, updates, createMissing, dryRun, draft }) => {
        if (!pageId && !slug) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'Error: provide `pageId` or `slug`.' }],
          }
        }
        if (!blockId && !blockType) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'Error: provide `blockId` or (`blockType` + optional `blockIndex`).' }],
          }
        }

        try {
          const payload = await getPayload({ config: configPromise })
          const pageDoc = await loadPageDocument(payload, { pageId, slug, tenant })
          if (!pageDoc?.id) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: page not found.' }],
            }
          }

          const layout = Array.isArray(pageDoc.layout) ? [...(pageDoc.layout as Array<Record<string, unknown>>)] : []
          const target = findTargetBlock(layout, { blockId, blockType, blockIndex })
          if (!target.block || target.index < 0) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: target block not found.' }],
            }
          }

          const nextBlock = cloneValue(target.block as Record<string, unknown>)
          const applied: Array<Record<string, unknown>> = []
          const failed: Array<Record<string, unknown>> = []

          for (const rawUpdate of updates) {
            const update = rawUpdate as Record<string, unknown>
            const op = update.op === 'unset' || update.op === 'remove' ? update.op : 'set'
            const path = typeof update.path === 'string' ? update.path.trim() : ''
            if (!path) {
              failed.push({ ...update, error: 'Missing update path.' })
              continue
            }

            try {
              const segments = parsePathSegments(path)
              const first = segments[0]
              if (first === 'id' || first === 'blockType') {
                throw new Error(`Path "${path}" is immutable.`)
              }

              if (op === 'set') {
                if (!Object.prototype.hasOwnProperty.call(update, 'value')) {
                  throw new Error(`Set operation for "${path}" requires a value.`)
                }
                setAtPath(nextBlock, segments, update.value, createMissing)
              } else if (op === 'unset') {
                unsetAtPath(nextBlock, segments)
              } else {
                removeAtPath(nextBlock, segments)
              }

              applied.push({ op, path })
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Unknown error'
              failed.push({ op, path, error: message })
            }
          }

          const changed = !deepEqual(target.block, nextBlock)
          const summary = {
            pageId: String(pageDoc.id),
            slug: typeof pageDoc.slug === 'string' ? pageDoc.slug : null,
            blockId: nextBlock.id ? String(nextBlock.id) : null,
            blockType: nextBlock.blockType ?? null,
            blockArrayIndex: target.index,
            changed,
            dryRun,
            appliedCount: applied.length,
            failedCount: failed.length,
            applied,
            failed,
            publishAction: {
              tool: 'publishDocument',
              args: {
                collection: 'pages',
                docId: String(pageDoc.id),
              },
            },
          }

          if (dryRun || !changed) {
            return {
              structuredContent: { ...summary, resultingBlock: nextBlock },
              content: [{ type: 'text', text: JSON.stringify({ ...summary, resultingBlock: nextBlock }, null, 2) }],
            }
          }

          layout[target.index] = nextBlock
          const updated = (await payload.update({
            collection: 'pages',
            id: String(pageDoc.id),
            data: { layout },
            draft,
            overrideAccess: true,
          })) as unknown as Record<string, unknown>

          return {
            structuredContent: {
              ...summary,
              action: 'updated',
              status: updated?._status ?? pageDoc._status ?? null,
            },
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    ...summary,
                    action: 'updated',
                    status: updated?._status ?? pageDoc._status ?? null,
                  },
                  null,
                  2,
                ),
              },
            ],
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return {
            isError: true,
            content: [{ type: 'text', text: `Error updating block fields: ${message}` }],
          }
        }
      },
    )

    server.registerTool(
      'publishDocument',
      {
        title: 'Publish Document',
        description: 'Publishes a page or post by id (or slug) in Payload.',
        inputSchema: {
          collection: z.enum(['pages', 'posts']),
          docId: z.string().optional(),
          slug: z.string().optional(),
          tenant: z.string().optional(),
          dryRun: z.boolean().default(false),
        },
      },
      async ({ collection, docId, slug, tenant, dryRun }) => {
        if (!docId && !slug) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'Error: provide `docId` or `slug`.' }],
          }
        }

        try {
          const payload = await getPayload({ config: configPromise })
          const tenantId = await resolveTenantId(payload, tenant)

          let doc: Record<string, unknown> | null = null
          if (docId) {
            doc = (await payload.findByID({
              collection,
              id: docId,
              depth: 0,
              overrideAccess: true,
            })) as unknown as Record<string, unknown>
          } else if (slug) {
            const andWhere: Array<Record<string, unknown>> = [{ slug: { equals: slug } }]
            if (tenantId) andWhere.push({ tenant: { equals: tenantId } })

            const found = await payload.find({
              collection,
              where: { and: andWhere as unknown as Where[] },
              limit: 2,
              pagination: false,
              depth: 0,
              overrideAccess: true,
            })
            doc = (found.docs?.[0] ?? null) as Record<string, unknown> | null
          }

          if (!doc?.id) {
            return {
              isError: true,
              content: [{ type: 'text', text: 'Error: document not found.' }],
            }
          }

          const beforeStatus = typeof doc._status === 'string' ? doc._status : null
          const base = {
            collection,
            docId: String(doc.id),
            slug: typeof doc.slug === 'string' ? doc.slug : null,
            title: typeof doc.title === 'string' ? doc.title : null,
            beforeStatus,
            dryRun,
          }

          if (beforeStatus === 'published') {
            return {
              structuredContent: { ...base, changed: false, action: 'noop', afterStatus: 'published' },
              content: [{ type: 'text', text: `${collection}/${String(doc.id)} is already published.` }],
            }
          }

          if (dryRun) {
            return {
              structuredContent: {
                ...base,
                changed: true,
                action: 'would_publish',
                afterStatus: 'published',
              },
              content: [{ type: 'text', text: `[dryRun] Would publish ${collection}/${String(doc.id)}.` }],
            }
          }

          const updated = (await payload.update({
            collection,
            id: String(doc.id),
            data: {
              _status: 'published',
              ...(doc.publishedAt ? {} : { publishedAt: new Date().toISOString() }),
            },
            draft: false,
            overrideAccess: true,
          })) as unknown as Record<string, unknown>

          return {
            structuredContent: {
              ...base,
              changed: true,
              action: 'published',
              afterStatus: updated?._status ?? null,
              updatedAt: updated?.updatedAt ?? null,
              publishedAt: updated?.publishedAt ?? null,
            },
            content: [{ type: 'text', text: `Published ${collection}/${String(doc.id)}.` }],
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return {
            isError: true,
            content: [{ type: 'text', text: `Error publishing document: ${message}` }],
          }
        }
      },
    )
  },
  { serverInfo: { name: 'payload-chatgpt-mcp', version: '1.0.0' } },
  { streamableHttpEndpoint: '/api/mcp-chatgpt', disableSse: true, verboseLogs: false },
)

function requireAuth(req: Request) {
  const expected = process.env.PAYLOAD_MCP_API_KEY || ''
  if (!expected.trim()) {
    return new Response(JSON.stringify({ message: 'MCP API key is not configured' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    })
  }

  const auth = req.headers.get('authorization') || ''
  const provided = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!provided || provided !== expected) {
    return new Response(JSON.stringify({ message: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }

  return null
}

function truncateForLog(value: string, max = 600) {
  if (value.length <= max) return value
  return `${value.slice(0, max)}...`
}

async function logMcpHandlerError(req: Request, error: unknown) {
  let requestBodyPreview = ''

  try {
    requestBodyPreview = truncateForLog(await req.clone().text())
  } catch {
    requestBodyPreview = '[unavailable]'
  }

  console.error('[mcp-chatgpt] handler failed', {
    method: req.method,
    url: req.url,
    accept: req.headers.get('accept'),
    contentType: req.headers.get('content-type'),
    hasSessionId: Boolean(req.headers.get('mcp-session-id')),
    requestBodyPreview,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  })
}

export async function POST(req: Request) {
  const guard = requireAuth(req)
  if (guard) return guard
  try {
    return await mcpHandler(req)
  } catch (error) {
    await logMcpHandlerError(req, error)
    throw error
  }
}

export async function GET(req: Request) {
  const guard = requireAuth(req)
  if (guard) return guard
  try {
    return await mcpHandler(req)
  } catch (error) {
    await logMcpHandlerError(req, error)
    throw error
  }
}
