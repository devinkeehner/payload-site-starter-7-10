import { describe, it, expect, vi } from 'vitest'
import { TinyURLClient, aliasValue, destinationValue, domainValue } from './client'
const reply = (data: unknown, extra = {}) =>
  new Response(JSON.stringify({ code: 0, data, ...extra }), { status: 200 })
const link = { domain: 'rep.example', alias: 'hello', url: 'https://public.example/news' }

describe('TinyURL API contract and boundaries', () => {
  it('creates, renames and changes destination using separate official endpoints', async () => {
    const fetcher = vi.fn().mockImplementation(async () => reply(link))
    const client = new TinyURLClient('mock-token', fetcher)
    await client.create(link.domain, link.alias, link.url)
    await client.rename(link.domain, link.alias, 'new-alias')
    await client.change(link.domain, 'new-alias', 'https://public.example/next')
    expect(
      fetcher.mock.calls.map((call) => [call[0], call[1].method, JSON.parse(call[1].body)]),
    ).toEqual([
      ['https://api.tinyurl.com/create', 'POST', link],
      [
        'https://api.tinyurl.com/update',
        'PATCH',
        { domain: link.domain, alias: link.alias, new_alias: 'new-alias' },
      ],
      [
        'https://api.tinyurl.com/change',
        'PATCH',
        { domain: link.domain, alias: 'new-alias', url: 'https://public.example/next' },
      ],
    ])
    expect(fetcher.mock.calls[0]?.[1].headers.Authorization).toBe('Bearer mock-token')
  })
  it('imports all active/archived pages and excludes other domains', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        reply([link, { ...link, domain: 'other.example' }], {
          links: { next: 'https://api.tinyurl.com/urls/available?page=2' },
        }),
      )
      .mockResolvedValueOnce(reply([{ ...link, alias: 'second' }], { links: { next: null } }))
      .mockResolvedValueOnce(reply([{ ...link, alias: 'old' }]))
    const found = []
    for await (const item of new TinyURLClient('mock-token', fetcher).list('rep.example'))
      found.push(item)
    expect(found.map((item) => [item.alias, item.archived])).toEqual([
      ['hello', false],
      ['second', false],
      ['old', true],
    ])
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
  it('does not send the token to arbitrary pagination hosts or repeat cursors', async () => {
    for (const next of [
      'https://attacker.example/urls/available',
      'https://api.tinyurl.com/urls/available',
    ]) {
      const fetcher = vi.fn().mockResolvedValue(reply([], { links: { next } }))
      const read = async () => {
        for await (const _ of new TinyURLClient('mock-token', fetcher).list('rep.example')) {
          /* drain */
        }
      }
      await expect(read()).rejects.toThrow(/unsafe|repeated/)
      expect(fetcher).toHaveBeenCalledTimes(1)
    }
  })
  it('handles not-found without treating permission failures as available aliases', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 6 }), { status: 422 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 4, errors: ['SECRET private account'] }), {
          status: 403,
        }),
      )
    const client = new TinyURLClient('mock-token', fetcher)
    expect(await client.get('rep.example', 'absent')).toBeNull()
    await expect(client.get('rep.example', 'private')).rejects.toThrow('domain permissions')
  })
  it('reports rate limits, malformed responses, collisions and missing configuration safely', async () => {
    for (const [status, body, message] of [
      [429, { errors: ['SECRET'] }, 'rate limit'],
      [422, { code: 5 }, 'taken'],
      [200, null, 'valid response'],
    ] as const) {
      const client = new TinyURLClient(
        'mock-token',
        vi
          .fn()
          .mockResolvedValue(
            new Response(body === null ? 'not JSON' : JSON.stringify(body), { status }),
          ),
      )
      await expect(client.create('rep.example', 'hello', link.url)).rejects.toThrow(message)
    }
    await expect(
      new TinyURLClient('', vi.fn()).create('rep.example', 'hello', link.url),
    ).rejects.toThrow('not configured')
  })
  it('validates domains, aliases and credential-free public destinations', () => {
    expect(domainValue(' REP.Example ')).toBe('rep.example')
    expect(aliasValue('x', 'rep.example')).toBe('x')
    for (const value of ['https://rep.example', 'rep.example/path', 'rep.example:443'])
      expect(() => domainValue(value)).toThrow()
    for (const value of ['', '../x', 'hello world', 'x'.repeat(31)])
      expect(() => aliasValue(value, 'rep.example')).toThrow()
    expect(() => aliasValue('x', 'tinyurl.com')).toThrow()
    for (const value of [
      'javascript:alert(1)',
      'https://user:pass@example.com',
      'https://site.example/api/draft-share?token=x',
      'https://site.example/api/preview',
      'https://site.example/?secret=x',
    ])
      expect(() => destinationValue(value)).toThrow()
  })
})
