import { describe, it, expect } from 'vitest'
import { assertRemoteUnchanged, assertSiteEditor, canonicalURL, siteIDs } from './policy'

describe('short-link site and publication policy', () => {
  it('restricts editors to assigned sites and supports existing super role', () => {
    const user = {
      collection: 'users',
      tenants: [{ tenant: 'site-a' }, { tenant: { id: 'site-b' } }],
    }
    expect(siteIDs(user)).toEqual(['site-a', 'site-b'])
    expect(() => assertSiteEditor(user, 'site-a')).not.toThrow()
    expect(() => assertSiteEditor(user, 'site-c')).toThrow('cannot edit')
    expect(() => assertSiteEditor(null, 'site-a')).toThrow()
    expect(() =>
      assertSiteEditor({ collection: 'users', roles: ['super'] }, 'site-c'),
    ).not.toThrow()
    expect(() => assertSiteEditor({ collection: 'api-keys', roles: ['super'] }, 'site-c')).toThrow()
  })
  it('matches the government frontend’s canonical routes, including site homepages', () => {
    const base = 'https://www.cthousegop.com/'
    expect(canonicalURL('posts', 'news', 'main', base)).toBe('https://www.cthousegop.com/post/news')
    expect(canonicalURL('posts', 'news', 'smith', base)).toBe(
      'https://www.cthousegop.com/smith/news',
    )
    expect(canonicalURL('pages', 'about', 'smith', base)).toBe(
      'https://www.cthousegop.com/smith/about',
    )
    expect(canonicalURL('pages', 'home', 'smith', base)).toBe('https://www.cthousegop.com/smith')
    expect(canonicalURL('pages', 'home', 'main', base)).toBe('https://www.cthousegop.com/')
    expect(() => canonicalURL('pages', '', 'smith', base)).toThrow()
    expect(() => canonicalURL('pages', 'news', 'smith', 'http://localhost:3000')).toThrow()
    expect(() => canonicalURL('pages', 'news', 'smith', 'https://site.example/admin')).toThrow()
  })
  it('rejects archived, missing and independently modified remote links', () => {
    for (const remote of [
      null,
      { url: 'https://other.example' },
      { url: 'https://site.example', archived: true },
    ])
      expect(() => assertRemoteUnchanged(remote, 'https://site.example')).toThrow('changed')
    expect(() =>
      assertRemoteUnchanged({ url: 'https://site.example/' }, 'https://site.example'),
    ).not.toThrow()
  })
})
