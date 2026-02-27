import { createMcpHandler } from '../../../../node_modules/.pnpm/node_modules/mcp-handler/dist/index.js'
import { z } from 'zod'
import { getPayload } from 'payload'
import type { Where } from 'payload'
import configPromise from '@payload-config'

const WIDGET_URI = 'ui://widget/payload-change-summary.html'

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
            if (tenant) andWhere.push({ tenant: { equals: tenant } })

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

export async function POST(req: Request) {
  const guard = requireAuth(req)
  if (guard) return guard
  return mcpHandler(req)
}

export async function GET(req: Request) {
  const guard = requireAuth(req)
  if (guard) return guard
  return mcpHandler(req)
}
