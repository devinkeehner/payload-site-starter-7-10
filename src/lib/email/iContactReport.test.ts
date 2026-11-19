import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getIContactReport } from './iContactReport'

beforeEach(() => {
  vi.stubEnv('ICONTACT_ACCOUNT_ID', '1')
  vi.stubEnv('ICONTACT_API_BASE', 'https://app.icontact.com')
  vi.stubEnv('ICONTACT_APP_ID', 'fixture')
  vi.stubEnv('ICONTACT_PASSWORD', 'fixture')
  vi.stubEnv('ICONTACT_USERNAME', 'fixture')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('iContact results', () => {
  it('displays provider counts and combines repeated clicks for the same URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      const { pathname } = new URL(input)
      if (pathname.endsWith('/sends/41')) return Response.json({ send: { status: 'complete' } })
      if (pathname.endsWith('/statistics')) return Response.json({
        statistics: { delivered: '4', opensUnique: '3', clicksUnique: 2, bounces: '0' },
      })
      if (pathname.endsWith('/clicks')) return Response.json({
        clicks: [
          { url: 'https://example.com/town', count: '2' },
          { url: 'https://example.com/town' },
          { url: 'javascript:alert(1)' },
        ],
        total: 3,
      })
      throw new Error('Unexpected iContact request: ' + pathname)
    }))

    await expect(getIContactReport({ clientFolderId: '2', messageId: '40', sendId: '41' })).resolves.toEqual({
      state: 'available',
      delivery: 'sent',
      counts: { delivered: 4, opened: 3, clicked: 2, bounced: 0 },
      topLinks: [{ url: 'https://example.com/town', count: 3 }],
    })
  })

  it('keeps absent results distinct from a confirmed zero', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string) =>
      input.endsWith('/sends/41')
        ? Response.json({ send: { status: 'pending' } })
        : new Response('Not ready', { status: 404 }),
    ))
    await expect(getIContactReport({ clientFolderId: '2', messageId: '40', sendId: '41' })).resolves.toEqual({
      state: 'pending', delivery: 'queued', counts: {}, topLinks: [],
    })
  })
})
