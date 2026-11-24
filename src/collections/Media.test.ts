import { afterEach, describe, expect, it, vi } from 'vitest'

import { Media } from './Media'

const origin = 'https://media.example.test'

function readMedia(doc: Record<string, unknown>) {
  const hook = Media.hooks?.afterRead?.[0]
  if (!hook) throw new Error('Missing media afterRead hook')
  vi.stubEnv('R2_PUBLIC_BASE_URL', `${origin}/`)
  return hook({ doc } as Parameters<typeof hook>[0])
}

afterEach(() => vi.unstubAllEnvs())

describe('media CDN links', () => {
  it('uses the parent key prefix for generated image sizes', async () => {
    const result = await readMedia({
      filename: 'District-photo.jpg',
      prefix: 'north/',
      sizes: {
        thumbnail: { filename: 'District-photo-300x200.jpg', url: '/api/media/file/District-photo-300x200.jpg' },
        og: { filename: 'District-photo-1200x630.jpg' },
      },
    })

    expect(result).toMatchObject({
      url: `${origin}/north/District-photo.jpg`,
      sizes: {
        thumbnail: { url: `${origin}/north/District-photo-300x200.jpg` },
        og: { url: `${origin}/north/District-photo-1200x630.jpg` },
      },
    })
  })

  it('keeps existing media and generated sizes stored at the bucket root', async () => {
    const result = await readMedia({
      filename: 'Legacy-photo.jpg',
      sizes: { thumbnail: { filename: 'Legacy-photo-300x200.jpg' } },
    })

    expect(result).toMatchObject({
      url: `${origin}/Legacy-photo.jpg`,
      sizes: { thumbnail: { url: `${origin}/Legacy-photo-300x200.jpg` } },
    })
  })
})
