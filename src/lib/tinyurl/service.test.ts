import type { PayloadRequest } from 'payload'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  captureContentOperation,
  contentLinkEndpoint,
  importSiteLinks,
  protectLinkedContent,
  syncPublishedContent,
  syncShortLink,
  validateDomainAssignment,
} from './service'
import { ShortLinks } from '@/collections/ShortLinks'

const record = {
  id: 'l1',
  tenant: 't1',
  domain: 'rep.example',
  alias: 'news',
  destinationURL: 'https://site.example/smith/news',
  shortURL: 'https://rep.example/news',
  source: { relationTo: 'posts', value: 'p1' },
}
function fixture(
  options: {
    links?: unknown[]
    published?: boolean
    user?: unknown
    conflict?: boolean
    denied?: boolean
  } = {},
) {
  const doc = {
    id: 'p1',
    tenant: 't1',
    slug: 'news',
    _status: options.published === false ? 'draft' : 'published',
  }
  const payload = {
    config: {
      collections: [
        { slug: 'posts', access: { update: () => !options.denied } },
        { slug: 'pages', access: { update: () => !options.denied } },
      ],
    },
    find: vi.fn(async (args: { collection: string; where?: unknown }) => {
      if (args.collection === 'rep-info')
        return {
          docs: JSON.stringify(args.where).includes('not_equals')
            ? options.conflict
              ? [{ id: 'other' }]
              : []
            : [{ id: 'r1', tenant: 't1', tinyURLDomain: 'rep.example' }],
        }
      if (args.collection === 'short-links') {
        const owned = (options.links || []) as Array<{ tenant?: string }>
        return {
          docs: JSON.stringify(args.where).includes('not_equals')
            ? owned.filter((link) => link.tenant !== 't1')
            : owned,
        }
      }
      return { docs: [doc] }
    }),
    findByID: vi.fn(async (args: { collection: string }) =>
      args.collection === 'tenants'
        ? { id: 't1', slug: 'smith' }
        : args.collection === 'rep-info'
          ? { id: 'r1', tenant: 't1', tinyURLDomain: 'rep.example' }
          : doc,
    ),
    create: vi.fn(async (args: { data: unknown }) => args.data),
    update: vi.fn(async (args: { data: unknown; req: PayloadRequest; context: unknown }) => {
      args.req.context = args.context as PayloadRequest['context']
      return args.data
    }),
  }
  const req = {
    payload,
    user:
      options.user === undefined
        ? { collection: 'users', tenants: [{ tenant: 't1' }] }
        : options.user,
    context: {},
    routeParams: { id: 'p1' },
    method: 'POST',
    json: async () => ({ alias: 'news' }),
  } as unknown as PayloadRequest
  return { req, payload, doc }
}
function remote(url = record.destinationURL, archived = false) {
  return new Response(
    JSON.stringify({
      code: 0,
      data: { domain: record.domain, alias: record.alias, url, archived },
    }),
  )
}
const hooks = (req: PayloadRequest, data: unknown, originalDoc?: unknown) => ({
  req,
  data,
  originalDoc,
  operation: originalDoc ? 'update' : 'create',
  collection: { slug: 'short-links' },
})

beforeEach(() => {
  vi.stubEnv('TINYURL_API_TOKEN', 'mock-token')
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://site.example')
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('tenant-scoped TinyURL workflow', () => {
  it('exposes the collection to assigned editors, rejects anonymous/cross-site writes and disallows deletion', async () => {
    const { req } = fixture()
    expect(await ShortLinks.access?.read?.({ req })).toEqual({ tenant: { in: ['t1'] } })
    expect(await ShortLinks.access?.create?.({ req })).toBe(true)
    expect(await ShortLinks.access?.delete?.({ req })).toBe(false)
    await expect(
      syncShortLink(
        hooks(req, { tenant: 't2', alias: 'news', destinationURL: record.destinationURL }) as never,
      ),
    ).rejects.toThrow('cannot edit')
    const anon = fixture({ user: null }).req
    expect(await ShortLinks.access?.read?.({ req: anon })).toBe(false)
  })
  it('refuses domains configured for another site before calling TinyURL', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const { req } = fixture({ conflict: true })
    await expect(
      syncShortLink(
        hooks(req, { tenant: 't1', alias: 'news', destinationURL: record.destinationURL }) as never,
      ),
    ).rejects.toThrow('another site')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('retains domain ownership even if the old Site Profile was removed', async () => {
    const { req } = fixture({ links: [{ ...record, tenant: 'another-site' }] })
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    await expect(
      syncShortLink(
        hooks(req, {
          tenant: 't1',
          alias: 'hello',
          destinationURL: record.destinationURL,
        }) as never,
      ),
    ).rejects.toThrow('owned by another site')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('creates arbitrary redirects and refuses existing aliases without mutation', async () => {
    const { req } = fixture()
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 6 })))
      .mockResolvedValueOnce(remote())
    vi.stubGlobal('fetch', fetcher)
    const data = await syncShortLink(
      hooks(req, {
        tenant: 't1',
        alias: 'help',
        destinationURL: 'https://external.example/help',
      }) as never,
    )
    expect(data).toMatchObject({ domain: 'rep.example', shortURL: 'https://rep.example/help' })
    expect(fetcher.mock.calls[1]?.[1].method).toBe('POST')
    fetcher.mockReset().mockResolvedValueOnce(remote())
    await expect(
      syncShortLink(
        hooks(req, {
          tenant: 't1',
          alias: 'news',
          destinationURL: 'https://external.example/help',
        }) as never,
      ),
    ).rejects.toThrow('already exists')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('updates an imported redirect only if the remote state is unchanged; refuses combined edits', async () => {
    const { req } = fixture()
    const old = { ...record, source: undefined }
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(remote())
      .mockResolvedValueOnce(remote('https://external.example/next'))
    vi.stubGlobal('fetch', fetcher)
    await syncShortLink(
      hooks(req, { destinationURL: 'https://external.example/next' }, old) as never,
    )
    expect(fetcher.mock.calls[1]?.[0]).toBe('https://api.tinyurl.com/change')
    fetcher.mockReset().mockResolvedValueOnce(remote('https://unrelated.example/'))
    await expect(
      syncShortLink(hooks(req, { destinationURL: 'https://external.example/next' }, old) as never),
    ).rejects.toThrow('changed outside')
    expect(fetcher).toHaveBeenCalledTimes(1)
    await expect(
      syncShortLink(
        hooks(
          req,
          { alias: 'next', destinationURL: 'https://external.example/next' },
          old,
        ) as never,
      ),
    ).rejects.toThrow('separate saves')
  })
  it('allows editing aliases for linked published content but never a different destination', async () => {
    const { req } = fixture()
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(remote())
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 6 })))
      .mockResolvedValueOnce(remote())
    vi.stubGlobal('fetch', fetcher)
    await syncShortLink(hooks(req, { alias: 'new-news' }, record) as never)
    expect(fetcher.mock.calls[2]?.[0]).toBe('https://api.tinyurl.com/update')
    await expect(
      syncShortLink(hooks(req, { destinationURL: 'https://external.example/' }, record) as never),
    ).rejects.toThrow('follows a page or post')
  })
  it('refuses unpublished and edit-denied content without sending URLs to TinyURL', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    for (const options of [{ published: false }, { denied: true }, { user: null }]) {
      const { req } = fixture(options)
      const response = (await contentLinkEndpoint('posts')(req)) as Response
      expect(response.ok).toBe(false)
    }
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('creates links for both pages and posts from saved public state and never overwrites unrelated aliases', async () => {
    for (const collection of ['posts', 'pages'] as const) {
      const { req, payload } = fixture()
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ code: 6 })))
        .mockResolvedValueOnce(remote())
      vi.stubGlobal('fetch', fetcher)
      const response = (await contentLinkEndpoint(collection)(req)) as Response
      expect(response.status).toBe(200)
      expect(payload.create.mock.calls[0]?.[0].data).toMatchObject({
        destinationURL: record.destinationURL,
        source: { relationTo: collection, value: 'p1' },
      })
      const collided = fixture().req
      fetcher.mockReset().mockResolvedValueOnce(remote())
      expect(((await contentLinkEndpoint(collection)(collided)) as Response).status).toBe(409)
      expect(fetcher).toHaveBeenCalledTimes(1)
    }
  })
  it('preserves old aliases and retries synchronization only for its own unchanged remote link', async () => {
    const { req, payload } = fixture({ links: [record] })
    const fetcher = vi.fn().mockResolvedValueOnce(remote()).mockResolvedValueOnce(remote())
    vi.stubGlobal('fetch', fetcher)
    expect(((await contentLinkEndpoint('posts')(req)) as Response).status).toBe(200)
    expect(payload.create).not.toHaveBeenCalled()
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(Object.getOwnPropertySymbols(req.context)).toHaveLength(0)
  })
  it('reconciles a completed remote update without repeating a mutation', async () => {
    const { req, payload, doc } = fixture({ links: [record] })
    const fetcher = vi.fn().mockResolvedValueOnce(remote('https://site.example/smith/next'))
    vi.stubGlobal('fetch', fetcher)
    await syncPublishedContent({
      req,
      doc: { ...doc, slug: 'next' },
      collection: { slug: 'posts' },
    } as never)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(payload.update.mock.calls[0]?.[0].data).toMatchObject({
      destinationURL: 'https://site.example/smith/next',
      syncError: '',
    })
  })
  it('syncs published slug changes, stores sanitized errors, and leaves drafts untouched', async () => {
    const { req, payload, doc } = fixture({ links: [record] })
    const fetcher = vi.fn().mockResolvedValueOnce(remote()).mockResolvedValueOnce(remote())
    vi.stubGlobal('fetch', fetcher)
    await syncPublishedContent({
      req,
      doc: { ...doc, slug: 'next' },
      collection: { slug: 'posts' },
    } as never)
    expect(payload.update.mock.calls[0]?.[0].data).toMatchObject({
      destinationURL: 'https://site.example/smith/next',
    })
    fetcher.mockReset().mockResolvedValueOnce(remote('https://outside.example/'))
    await syncPublishedContent({
      req,
      doc: { ...doc, slug: 'next' },
      collection: { slug: 'posts' },
    } as never)
    expect(payload.update.mock.calls[1]?.[0].data).toMatchObject({
      syncError: expect.stringContaining('changed outside'),
    })
    fetcher.mockClear()
    await syncPublishedContent({
      req,
      doc: { ...doc, slug: 'draft-next', _status: 'draft' },
      collection: { slug: 'posts' },
    } as never)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('permits draft saves but blocks unpublishing and moving linked content between sites', async () => {
    const { req, doc } = fixture({ links: [record] })
    const change = {
      req,
      originalDoc: doc,
      data: { _status: 'draft' },
      collection: { slug: 'posts' },
    }
    await expect(protectLinkedContent(change as never)).rejects.toThrow('unpublishing')
    captureContentOperation<'posts'>()({
      req,
      operation: 'update',
      args: { draft: true, data: { _status: 'draft' } },
    } as never)
    await expect(protectLinkedContent(change as never)).resolves.toMatchObject({ _status: 'draft' })
    await expect(
      protectLinkedContent({ ...change, data: { tenant: 't2' } } as never),
    ).rejects.toThrow('cannot move')
  })
  it('imports without remote writes, keeps linked ownership and does not adopt independently changed destinations', async () => {
    const { req, payload } = fixture({ links: [record] })
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            data: [{ domain: 'rep.example', alias: 'news', url: 'https://outside.example/' }],
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: [] })))
    vi.stubGlobal('fetch', fetcher)
    expect(((await importSiteLinks(req)) as Response).status).toBe(200)
    expect(payload.update.mock.calls[0]?.[0].data).toMatchObject({
      destinationURL: record.destinationURL,
      syncError: expect.stringContaining('changed in TinyURL'),
    })
    expect(fetcher.mock.calls.every((call) => call[1].method === 'GET')).toBe(true)
    expect(Object.getOwnPropertySymbols(req.context)).toHaveLength(0)
  })
  it('allows unpublishing after linked URLs are archived and imported', async () => {
    const { req, doc } = fixture({ links: [{ ...record, archived: true }] })
    await expect(
      protectLinkedContent({
        req,
        originalDoc: doc,
        data: { _status: 'draft' },
        collection: { slug: 'posts' },
      } as never),
    ).resolves.toMatchObject({ _status: 'draft' })
  })
  it('keeps an unconfigured domain absent so optional unique indexes do not collide', async () => {
    const { req } = fixture()
    const data = await validateDomainAssignment({
      req,
      data: { tenant: 't1', tinyURLDomain: '' },
    } as never)
    expect(data).not.toHaveProperty('tinyURLDomain')
  })
  it('prevents domain reassignment once a site has links and cross-site domain configuration', async () => {
    const { req } = fixture({ links: [record] })
    await expect(
      validateDomainAssignment({
        req,
        data: { tinyURLDomain: 'next.example' },
        originalDoc: { id: 'r1', tenant: 't1', tinyURLDomain: 'rep.example' },
      } as never),
    ).rejects.toThrow('before changing')
    await expect(
      validateDomainAssignment({
        req,
        data: { tenant: 't2', tinyURLDomain: 'rep.example' },
      } as never),
    ).rejects.toThrow('cannot edit')
  })
})
