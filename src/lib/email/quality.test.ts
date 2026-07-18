import { describe, expect, it, vi } from 'vitest'

import {
  checkRemoteEmailLinks,
  inspectEmailQuality,
  isPublicNetworkAddress,
  type EmailQualityResult,
  type RemoteLinkCheckDependencies,
} from './quality'

function qualityFor(href: string): EmailQualityResult {
  return {
    label: 'Good',
    links: [{
      href,
      label: href,
      status: 'ok',
    }],
    score: 100,
    warnings: [],
  }
}

const fixedNow = () => new Date('2026-07-18T16:00:00.000Z')

describe('isPublicNetworkAddress', () => {
  it.each([
    ['8.8.8.8', true],
    ['93.184.216.34', true],
    ['0.0.0.1', false],
    ['10.0.0.1', false],
    ['100.64.0.1', false],
    ['100.127.255.254', false],
    ['127.0.0.1', false],
    ['169.254.169.254', false],
    ['172.16.0.1', false],
    ['172.31.255.254', false],
    ['192.0.2.1', false],
    ['192.168.1.1', false],
    ['198.18.0.1', false],
    ['198.51.100.1', false],
    ['203.0.113.1', false],
    ['224.0.0.1', false],
    ['240.0.0.1', false],
    ['2606:4700:4700::1111', true],
    ['2001:4860:4860::8888', true],
    ['::', false],
    ['::1', false],
    ['::ffff:127.0.0.1', false],
    ['::ffff:8.8.8.8', false],
    ['fc00::1', false],
    ['fe80::1', false],
    ['ff02::1', false],
    ['2001::1', false],
    ['2001:db8::1', false],
    ['2002::1', false],
    ['3fff::1', false],
  ])('classifies %s as public=%s', (address, expected) => {
    expect(isPublicNetworkAddress(address)).toBe(expected)
  })
})

describe('checkRemoteEmailLinks network guard', () => {
  it('pins a validated public DNS result into the remote request', async () => {
    const resolve = vi.fn(async () => [
      { address: '93.184.216.34', family: 4 as const },
      { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 as const },
    ])
    const fetch = vi.fn(async () => ({ status: 204 }))

    const result = await checkRemoteEmailLinks(qualityFor('https://example.com/story'), {
      fetch,
      now: fixedNow,
      resolve,
    })

    expect(resolve).toHaveBeenCalledWith('example.com')
    expect(fetch).toHaveBeenCalledWith(expect.objectContaining({
      address: { address: '93.184.216.34', family: 4 },
      method: 'HEAD',
    }))
    expect(result.links[0]).toMatchObject({
      checkedAt: '2026-07-18T16:00:00.000Z',
      remoteStatus: 204,
      status: 'ok',
    })
  })

  it('rejects a mixed public/private DNS answer before opening a socket', async () => {
    const resolve = vi.fn(async () => [
      { address: '93.184.216.34', family: 4 as const },
      { address: '10.0.0.8', family: 4 as const },
    ])
    const fetch = vi.fn(async () => ({ status: 200 }))

    const result = await checkRemoteEmailLinks(qualityFor('https://example.com'), {
      fetch,
      now: fixedNow,
      resolve,
    })

    expect(fetch).not.toHaveBeenCalled()
    expect(result.links[0]).toMatchObject({
      status: 'warning',
    })
    expect(result.links[0]?.reason).toContain('DNS includes a non-public network address')
  })

  it('rejects metadata, link-local, CGNAT, and IPv4-mapped destinations without fetching', async () => {
    const fetch = vi.fn(async () => ({ status: 200 }))
    const destinations = [
      'http://169.254.169.254/latest/meta-data',
      'http://169.254.1.1/',
      'http://100.64.0.10/',
      'http://[::ffff:127.0.0.1]/',
    ]

    for (const href of destinations) {
      const result = await checkRemoteEmailLinks(qualityFor(href), { fetch, now: fixedNow })
      expect(result.links[0]?.status).toBe('warning')
      expect(result.links[0]?.reason).toContain('non-public network address')
    }
    expect(fetch).not.toHaveBeenCalled()
  })

  it('revalidates redirects and refuses a redirect to a private address', async () => {
    const resolve = vi.fn(async () => [{ address: '93.184.216.34', family: 4 as const }])
    const fetch = vi.fn(async () => ({
      location: 'http://127.0.0.1/admin',
      status: 302,
    }))

    const result = await checkRemoteEmailLinks(qualityFor('https://example.com/start'), {
      fetch,
      now: fixedNow,
      resolve,
    })

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(result.links[0]?.status).toBe('warning')
    expect(result.links[0]?.reason).toContain('non-public network address')
  })

  it('resolves and validates the hostname at every redirect hop', async () => {
    const resolve = vi.fn(async (hostname: string) => hostname === 'example.com'
      ? [{ address: '93.184.216.34', family: 4 as const }]
      : [{ address: '192.168.1.5', family: 4 as const }])
    const fetch = vi.fn(async () => ({
      location: 'https://redirect.example/final',
      status: 302,
    }))

    const result = await checkRemoteEmailLinks(qualityFor('https://example.com/start'), {
      fetch,
      now: fixedNow,
      resolve,
    })

    expect(resolve.mock.calls).toEqual([['example.com'], ['redirect.example']])
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(result.links[0]?.status).toBe('warning')
    expect(result.links[0]?.reason).toContain('DNS includes a non-public network address')
  })

  it('stops at the strict redirect limit before fetching another destination', async () => {
    const resolve = vi.fn(async () => [{ address: '93.184.216.34', family: 4 as const }])
    const fetch = vi.fn(async ({ url }: Parameters<NonNullable<RemoteLinkCheckDependencies['fetch']>>[0]) => ({
      location: url.pathname === '/first' ? '/second' : '/third',
      status: 302,
    }))

    const result = await checkRemoteEmailLinks(qualityFor('https://example.com/first'), {
      fetch,
      maxRedirects: 1,
      now: fixedNow,
      resolve,
    })

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(result.links[0]?.status).toBe('warning')
    expect(result.links[0]?.reason).toBe('Remote check skipped: redirect limit of 1 exceeded.')
  })

  it('rejects credentialed URLs and non-standard ports before DNS or fetch', async () => {
    const resolve = vi.fn(async () => [{ address: '93.184.216.34', family: 4 as const }])
    const fetch = vi.fn(async () => ({ status: 200 }))

    const credentialed = await checkRemoteEmailLinks(qualityFor('https://user:secret@example.com/'), {
      fetch,
      now: fixedNow,
      resolve,
    })
    const nonStandardPort = await checkRemoteEmailLinks(qualityFor('https://example.com:8443/'), {
      fetch,
      now: fixedNow,
      resolve,
    })

    expect(resolve).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
    expect(credentialed.links[0]?.reason).toContain('credentials')
    expect(nonStandardPort.links[0]?.reason).toContain('standard web ports')
  })

  it('keeps syntax validation automatic and never probes malformed links', async () => {
    const fetch = vi.fn(async () => ({ status: 200 }))
    const quality = inspectEmailQuality({
      hasAddress: true,
      hasUnsubscribeLink: true,
      html: '<a href="javascript:alert(1)">Bad</a>',
      subject: 'A normal subject',
      text: 'A'.repeat(300),
    })

    const result = await checkRemoteEmailLinks(quality, { fetch, now: fixedNow })

    expect(result.links[0]?.status).toBe('invalid')
    expect(fetch).not.toHaveBeenCalled()
  })
})
