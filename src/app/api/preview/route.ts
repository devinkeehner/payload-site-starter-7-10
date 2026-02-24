import { draftMode } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'

const collectionPrefixMap = {
  posts: '/posts',
  pages: '',
}

// GET /api/preview?secret=...&slug=...&collection=pages
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret') || ''
  const expected = process.env.PREVIEW_SECRET || ''

  if (secret !== expected) {
    return NextResponse.json({ message: 'Invalid token' }, { status: 401 })
  }

  // Enable draft mode by setting cookies
  const draft = await draftMode()
  draft.enable()

  // Redirect to the provided path (default to /)
  const slug = req.nextUrl.searchParams.get('slug') || ''
  const collection = req.nextUrl.searchParams.get('collection') || ''
  let path = req.nextUrl.searchParams.get('path') || '/'

  // Optional tenant-aware redirect for posts/pages: when a tenant ID is sent, resolve its slug
  // and redirect to /[tenantSlug]/[slug]
  const tenantID = req.nextUrl.searchParams.get('tenant') || ''
  if ((collection === 'posts' || collection === 'pages') && slug && tenantID) {
    try {
      const payload = await getPayload({ config: configPromise })
      const tenant = await payload.findByID({ collection: 'tenants', id: tenantID })
      if (tenant?.slug) {
        path = `/${tenant.slug}/${slug}`
      } else {
        // Fallback to collection-based path
        const key = collection as keyof typeof collectionPrefixMap
        path = `${collectionPrefixMap[key]}/${slug}`
      }
    } catch (_e) {
      const key = collection as keyof typeof collectionPrefixMap
      path = `${collectionPrefixMap[key]}/${slug}`
    }
  } else if (slug && collection && (collection as keyof typeof collectionPrefixMap) in collectionPrefixMap) {
    path = `${collectionPrefixMap[collection as keyof typeof collectionPrefixMap]}/${slug}`
  }

  // Allow redirecting to a separate frontend site
  const externalOrigin = process.env.PREVIEW_FRONTEND_ORIGIN || ''
  const baseOrigin = externalOrigin || req.nextUrl.origin
  const redirectURL = new URL(path, baseOrigin)

  // Attach Payload preview JWT so the front-end can fetch drafts from the API
  const token = process.env.PAYLOAD_PREVIEW_JWT || ''
  const res = NextResponse.redirect(redirectURL)
  if (token) {
    res.cookies.set('payload-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    })
  }

  return res
}
