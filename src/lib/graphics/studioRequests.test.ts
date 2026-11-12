import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchGraphic, readGraphicResponse } from './studioRequests'
import { graphicExportImageRequest } from './studioExport.client'

afterEach(() => vi.unstubAllGlobals())
describe('graphic export requests', () => {
  it('routes hosted media through the same-origin proxy with a normalized encoded path', () => {
    const value = graphicExportImageRequest(
      'https://media.cthousegop.com/./Carney Candelora Newsroom (1).png',
      'https://admin.cthousegop.com',
    )
    expect(value).toMatch(/^\/api\/media-proxy\?/)
    expect(new URLSearchParams(value.split('?')[1]).get('url')).toBe(
      'https://media.cthousegop.com/Carney%20Candelora%20Newsroom%20(1).png',
    )
    expect(
      graphicExportImageRequest('/api/media/file/photo.png', 'https://admin.cthousegop.com'),
    ).toBe('https://admin.cthousegop.com/api/media/file/photo.png')
  })
  it('does not proxy arbitrary remote hosts and rejects unsafe schemes and credentials', () => {
    expect(
      graphicExportImageRequest('https://example.org/image.png', 'https://admin.cthousegop.com'),
    ).toBe('https://example.org/image.png')
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,hello',
      'https://user:pass@media.cthousegop.com/photo.png',
    ])
      expect(() => graphicExportImageRequest(url, 'https://admin.cthousegop.com')).toThrow()
  })
  it('names the failed stage without exposing HTML, credentials or response bodies', async () => {
    await expect(
      readGraphicResponse(
        new Response('<html>secret token</html>', { status: 403 }),
        'Set Post SEO image',
      ),
    ).rejects.toThrow('Set Post SEO image failed (HTTP 403)')
    await expect(
      readGraphicResponse(
        new Response('<html>signed in?</html>', { status: 200 }),
        'Save template',
      ),
    ).rejects.toThrow('unexpected response')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch secret token')))
    await expect(fetchGraphic('/api/media/upload', { method: 'POST' })).rejects.toThrow(
      'Media Gallery upload could not connect.',
    )
    await expect(fetchGraphic('/api/posts/post-id?secret=123')).rejects.not.toThrow('secret')
  })
})
