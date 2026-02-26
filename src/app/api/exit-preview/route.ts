import { draftMode } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/exit-preview
export async function GET(req: NextRequest) {
  // Disable draft mode by clearing cookies
  const { disable } = await draftMode()
  disable()

  const externalOrigin = process.env.PREVIEW_FRONTEND_ORIGIN
  const redirectPath = externalOrigin ? '/' : '/admin'
  const redirectURL = new URL(redirectPath, externalOrigin || req.nextUrl.origin)
  return NextResponse.redirect(redirectURL)
}
