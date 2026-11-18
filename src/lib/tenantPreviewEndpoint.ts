import type { PayloadHandler } from 'payload'
import { createTenantPreview } from './tenant-preview'

// The CMS session lives on the admin host. This bridge lets logged-in editors
// open their site without sharing the CMS session or its API key across hosts.
export const tenantPreviewEndpoint: PayloadHandler = async (req) => {
  if (!req.user) return new Response('Log in to the CMS to preview this site.', { status: 401 })
  const id = String(req.routeParams?.id || '')
  const tenant = await req.payload.findByID({ collection: 'tenants', id, depth: 0, req, overrideAccess: false })
  if (!process.env.PREVIEW_SECRET) return new Response('Preview unavailable', { status: 503 })
  const grant = await createTenantPreview(tenant, process.env.PREVIEW_SECRET)
  const origin = process.env.PREVIEW_FRONTEND_ORIGIN || process.env.FRONTEND_SERVER_URL ||
    process.env.NEXT_PUBLIC_SITE_URL || 'https://www.cthousegop.com'
  const destination = new URL('/api/tenant-preview', origin)
  destination.searchParams.set('grant', grant)
  return new Response(null, {
    status: 303, headers: {
      Location: destination.toString(), 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer',
    },
  })
}
