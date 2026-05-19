import configPromise from '@payload-config'
import { getPayload } from 'payload'

import {
  addToolSecuritySchemes,
  filterToolsForScopes,
  findValidAccessToken,
  getChatgptMcpResourceURL,
  getProtectedResourceMetadataURL,
  isAllowedToolName,
  type ChatgptOAuthScope,
} from '@/lib/chatgpt-oauth'

type JsonRpcRequest = {
  id?: string | number | null
  jsonrpc?: string
  method?: string
  params?: {
    name?: string
    [key: string]: unknown
  }
}

type ToolMetadata = {
  annotations: Record<string, unknown>
  description?: string
  title: string
}

const TOOL_METADATA: Record<string, ToolMetadata> = {
  getEditingDefaults: {
    title: 'Get CMS Editing Defaults',
    description: 'Start here for tenant, draft-first, and page-builder conventions.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  getChatGptCmsPlaybook: {
    title: 'Get ChatGPT CMS Playbook',
    description:
      'Read the preferred ChatGPT workflow for editing, creating, checking, and publishing CMS content.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  getCampaignDesignGuidance: {
    title: 'Get Campaign Design Guidance',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  getPageBuilderPresets: {
    title: 'Get Page Builder Presets',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  preparePageBuildPlan: {
    title: 'Prepare Page Build Plan',
    description:
      'Plan a draft-first campaign page build from a brief before writing blocks or publishing content.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  listPageBlocks: {
    title: 'List Page Blocks',
    description: 'Inspect the draft page layout before editing block fields.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  getBlockShape: {
    title: 'Get Block Shape',
    description: 'Inspect editable fields and enum limits before composing updates.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  getPublishStatus: {
    title: 'Get Publish Status',
    description:
      'Check whether draft content differs from the live published document without writing.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  updateBlockFields: {
    title: 'Update Draft Block Fields',
    description: 'Apply targeted path updates to a page block. Defaults to draft writes.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  upsertPageWithBlocks: {
    title: 'Create Or Update Draft Page Blocks',
    description: 'Create or update a draft page using raw hero/layout JSON.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  publishDocument: {
    title: 'Publish Current Draft',
    description:
      'Publish a page or post. If a draft differs from live content, promotes the draft content.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Headers': 'authorization, content-type, mcp-session-id',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Origin': '*',
  }
}

function authChallenge(req: Request, message = 'No authorization provided') {
  const resourceMetadataURL = getProtectedResourceMetadataURL(req)
  const body = {
    error: 'invalid_token',
    error_description: message,
  }

  return Response.json(body, {
    headers: {
      ...corsHeaders(),
      'WWW-Authenticate': `Bearer error="invalid_token", error_description="${message}", resource_metadata="${resourceMetadataURL}"`,
    },
    status: 401,
  })
}

function jsonRpcToolError(request: JsonRpcRequest, message: string) {
  return Response.json(
    {
      error: {
        code: -32603,
        message,
      },
      id: request.id ?? null,
      jsonrpc: '2.0',
    },
    {
      headers: corsHeaders(),
      status: 200,
    },
  )
}

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get('authorization')
  const [type, token] = authHeader?.split(/\s+/, 2) || []
  return type?.toLowerCase() === 'bearer' && token ? token : null
}

function getJsonRpcRequests(value: unknown): JsonRpcRequest[] {
  if (Array.isArray(value)) return value.filter((item): item is JsonRpcRequest => Boolean(item))
  if (value && typeof value === 'object') return [value as JsonRpcRequest]
  return []
}

function getRequiredToolScopes(toolName: string): ChatgptOAuthScope[] {
  if (TOOL_METADATA[toolName]?.annotations.readOnlyHint === true) {
    return ['cms:read']
  }
  if (toolName.startsWith('find') || toolName.startsWith('get') || toolName.startsWith('list')) {
    return ['cms:read']
  }
  return ['cms:write']
}

function getDefaultToolMetadata(name: string): ToolMetadata {
  const isReadOnly = getRequiredToolScopes(name).includes('cms:read')
  const spaced = name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^find /, 'Find ')
    .replace(/^create /, 'Create ')
    .replace(/^update /, 'Update ')
    .replace(/^delete /, 'Delete ')

  return {
    title: `${spaced.charAt(0).toUpperCase()}${spaced.slice(1)}`,
    annotations: {
      readOnlyHint: isReadOnly,
      destructiveHint: name.startsWith('delete'),
      openWorldHint: !isReadOnly,
    },
  }
}

function assertAllowedJsonRpcRequests(requests: JsonRpcRequest[], scopes: ChatgptOAuthScope[]) {
  for (const request of requests) {
    if (request.method !== 'tools/call') continue

    const toolName = request.params?.name
    if (!toolName || !isAllowedToolName(toolName, scopes)) {
      return {
        message: `Tool "${toolName || 'unknown'}" is not available to the ChatGPT connector.`,
        request,
      }
    }

    const requiredScopes = getRequiredToolScopes(toolName)
    const hasRequiredScope = requiredScopes.every((scope) => scopes.includes(scope))
    if (!hasRequiredScope) {
      return {
        message: `Tool "${toolName}" requires ${requiredScopes.join(' ')}.`,
        request,
      }
    }
  }

  return null
}

async function decorateToolsList(response: Response, scopes: ChatgptOAuthScope[]) {
  const responseText = await response.text()
  let payload: unknown

  try {
    payload = JSON.parse(responseText)
  } catch {
    return new Response(responseText, {
      headers: response.headers,
      status: response.status,
    })
  }

  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const record = payload as {
      result?: {
        tools?: Array<Record<string, unknown>>
      }
    }
    if (Array.isArray(record.result?.tools)) {
      record.result.tools = filterToolsForScopes(record.result.tools, scopes).map((tool) =>
        decorateToolDescriptor(addToolSecuritySchemes(tool, scopes)),
      )
    }
  }

  return Response.json(payload, {
    headers: corsHeaders(),
    status: response.status,
  })
}

function decorateToolDescriptor(tool: Record<string, unknown>) {
  const name = typeof tool.name === 'string' ? tool.name : ''
  const metadata = (name && TOOL_METADATA[name]) || getDefaultToolMetadata(name)
  const meta =
    tool._meta && typeof tool._meta === 'object' ? (tool._meta as Record<string, unknown>) : {}
  const invoking =
    typeof meta['openai/toolInvocation/invoking'] === 'string'
      ? meta['openai/toolInvocation/invoking']
      : metadata.annotations.readOnlyHint
        ? 'Checking CMS...'
        : 'Updating CMS...'
  const invoked =
    typeof meta['openai/toolInvocation/invoked'] === 'string'
      ? meta['openai/toolInvocation/invoked']
      : metadata.annotations.readOnlyHint
        ? 'CMS checked.'
        : 'CMS updated.'

  return {
    ...tool,
    title: metadata.title,
    description: metadata.description || tool.description,
    annotations: {
      ...(tool.annotations && typeof tool.annotations === 'object' ? tool.annotations : {}),
      ...metadata.annotations,
    },
    _meta: {
      ...meta,
      'openai/toolInvocation/invoking': invoking,
      'openai/toolInvocation/invoked': invoked,
    },
  }
}

function shouldDecorateToolsList(requests: JsonRpcRequest[]) {
  return requests.some((request) => request.method === 'tools/list')
}

export async function POST(req: Request): Promise<Response> {
  const bearerToken = getBearerToken(req)
  if (!bearerToken) {
    return authChallenge(req)
  }

  const payload = await getPayload({ config: configPromise })
  const token = await findValidAccessToken(payload, bearerToken)
  if (!token) {
    return authChallenge(req, 'Invalid or expired token')
  }

  const payloadMcpAPIKey = process.env.CHATGPT_PAYLOAD_MCP_API_KEY
  if (!payloadMcpAPIKey) {
    return Response.json(
      {
        error: 'server_error',
        error_description: 'CHATGPT_PAYLOAD_MCP_API_KEY is not configured.',
      },
      { headers: corsHeaders(), status: 500 },
    )
  }

  const bodyText = await req.text()
  let bodyJSON: unknown = null
  try {
    bodyJSON = JSON.parse(bodyText)
  } catch {
    return Response.json(
      { error: 'invalid_request', error_description: 'MCP request body must be JSON.' },
      { headers: corsHeaders(), status: 400 },
    )
  }

  const jsonRpcRequests = getJsonRpcRequests(bodyJSON)
  const denied = assertAllowedJsonRpcRequests(jsonRpcRequests, token.scopes)
  if (denied) {
    return jsonRpcToolError(denied.request, denied.message)
  }

  const upstreamURL = new URL('/api/mcp', getChatgptMcpResourceURL(req)).toString()
  const upstreamResponse = await fetch(upstreamURL, {
    body: bodyText,
    cache: 'no-store',
    headers: {
      accept: req.headers.get('accept') || 'application/json',
      authorization: `Bearer ${payloadMcpAPIKey}`,
      'content-type': req.headers.get('content-type') || 'application/json',
    },
    method: 'POST',
  })

  if (shouldDecorateToolsList(jsonRpcRequests)) {
    return decorateToolsList(upstreamResponse, token.scopes)
  }

  const responseBody = await upstreamResponse.arrayBuffer()
  const headers = new Headers(corsHeaders())
  const contentType = upstreamResponse.headers.get('content-type')
  if (contentType) headers.set('content-type', contentType)

  return new Response(responseBody, {
    headers,
    status: upstreamResponse.status,
  })
}

export function GET() {
  return Response.json(
    {
      error: {
        code: -32000,
        message: 'Method not allowed.',
      },
      id: null,
      jsonrpc: '2.0',
    },
    {
      headers: corsHeaders(),
      status: 405,
    },
  )
}

export function OPTIONS() {
  return new Response(null, {
    headers: corsHeaders(),
    status: 204,
  })
}
