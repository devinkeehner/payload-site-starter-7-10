import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import { GET } from './route'
afterEach(() => vi.unstubAllGlobals())
const request = (url: string) =>
  new Request(
    `https://admin.cthousegop.com/api/media-proxy?${new URLSearchParams({ url })}`,
  ) as NextRequest

describe('graphic media proxy', () => {
  it('rejects alternate protocols, credentials, ports and hosts without fetching', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    for (const url of [
      'http://media.cthousegop.com/a.png',
      'https://media.cthousegop.com:8080/a.png',
      'https://u:p@media.cthousegop.com/a.png',
      'https://localhost/a.png',
      'https://media.cthousegop.com.evil.test/a.png',
    ])
      expect((await GET(request(url))).status).toBe(403)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('retrieves the allowed image without credentials and disallows redirects', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/png' } }),
      )
    vi.stubGlobal('fetch', fetch)
    const response = await GET(request('https://media.cthousegop.com/./image.png'))
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/png')
    expect(fetch).toHaveBeenCalledWith(
      'https://media.cthousegop.com/image.png',
      expect.objectContaining({ redirect: 'error', signal: expect.any(AbortSignal) }),
    )
    expect(fetch.mock.calls[0]?.[1].credentials).toBeUndefined()
  })
})
