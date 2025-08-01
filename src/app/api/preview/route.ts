import { draftMode } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

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
    const { enable } = await draftMode()
  enable()

  // Redirect to the provided path (default to /)
  const slug = req.nextUrl.searchParams.get('slug') || ''
  const collection = req.nextUrl.searchParams.get('collection') || ''
  let path = req.nextUrl.searchParams.get('path') || '/'

  if (slug && collection && collection in collectionPrefixMap) {
    path = `${collectionPrefixMap[collection as keyof typeof collectionPrefixMap]}/${slug}`
  }

  const redirectURL = new URL(path, req.nextUrl.origin)

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
