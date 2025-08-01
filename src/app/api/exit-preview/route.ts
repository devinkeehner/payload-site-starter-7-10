import { draftMode } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/exit-preview
export async function GET(req: NextRequest) {
  // Disable draft mode by clearing cookies
    const { disable } = await draftMode()
  disable()

  const redirectURL = new URL('/', req.nextUrl.origin)
  return NextResponse.redirect(redirectURL)
}
