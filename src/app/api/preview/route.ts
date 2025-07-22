import { draftMode } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/preview?secret=...&path=/slug
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
  const path = req.nextUrl.searchParams.get('path') || '/'
  const redirectURL = new URL(path, req.nextUrl.origin)

  // Attach Payload access token so the front-end can fetch drafts from the API
  const token = process.env.PAYLOAD_ACCESS_TOKEN || ''
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
