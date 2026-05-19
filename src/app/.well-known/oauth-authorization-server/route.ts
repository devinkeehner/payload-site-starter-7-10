import { getOAuthServerMetadata } from '@/lib/chatgpt-oauth'

export function GET(req: Request) {
  return Response.json(getOAuthServerMetadata(req), {
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}

export function OPTIONS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Headers': 'authorization, content-type',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Origin': '*',
    },
    status: 204,
  })
}
