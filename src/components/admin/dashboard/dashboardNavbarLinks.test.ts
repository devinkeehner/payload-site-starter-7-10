import { describe, expect, it } from 'vitest'

import {
  flattenDashboardNavbarItems,
  resolveCustomDashboardURL,
  resolveReferenceDashboardURL,
} from './dashboardNavbarLinks'

const context = {
  publicSiteBase: 'https://www.cthousegop.com',
  tenantSlug: 'candelora',
}

describe('dashboard navbar URL resolution', () => {
  it('resolves tenant Page and Post references using public-site rules', () => {
    expect(
      resolveReferenceDashboardURL(
        'pages',
        { slug: 'about', tenant: { slug: 'candelora' } },
        context,
      ),
    ).toEqual({
      displayHref: 'https://www.cthousegop.com/candelora/about',
      href: 'https://www.cthousegop.com/candelora/about',
      state: 'valid',
    })

    expect(resolveReferenceDashboardURL('posts', { slug: 'budget-update' }, context).href).toBe(
      'https://www.cthousegop.com/candelora/budget-update',
    )
  })

  it('resolves main-site pages and posts without a tenant prefix', () => {
    const mainContext = { ...context, tenantSlug: 'main' }

    expect(resolveReferenceDashboardURL('pages', { slug: 'home' }, mainContext).href).toBe(
      'https://www.cthousegop.com/',
    )
    expect(resolveReferenceDashboardURL('posts', { slug: 'news' }, mainContext).href).toBe(
      'https://www.cthousegop.com/post/news',
    )
  })

  it('preserves absolute custom URLs and resolves root-relative and tenant-relative paths', () => {
    const absolute = 'https://www.cga.ct.gov/legislation?year=2026'

    expect(resolveCustomDashboardURL(absolute, context).href).toBe(absolute)
    expect(resolveCustomDashboardURL('/legislation', context).href).toBe(
      'https://www.cthousegop.com/legislation',
    )
    expect(resolveCustomDashboardURL('events', context).href).toBe(
      'https://www.cthousegop.com/candelora/events',
    )
  })

  it('marks unsafe and missing destinations as unavailable', () => {
    expect(resolveCustomDashboardURL('javascript:alert(1)', context)).toEqual({
      displayHref: 'Unsafe destination',
      href: null,
      state: 'unsafe',
    })
    expect(resolveCustomDashboardURL('', context)).toEqual({
      displayHref: 'No destination',
      href: null,
      state: 'missing',
    })
    expect(resolveReferenceDashboardURL('pages', 'unhydrated-id', context).state).toBe('missing')
  })

  it('flattens nested links while retaining depth and resolved destinations', () => {
    const links = flattenDashboardNavbarItems(
      [
        {
          id: 'parent',
          link: {
            label: 'About',
            type: 'reference',
            reference: { relationTo: 'pages', value: { slug: 'about' } },
          },
          subNav: [
            {
              id: 'child',
              link: { label: 'External', type: 'custom', url: 'https://example.com/resource' },
            },
          ],
        },
      ],
      context,
    )

    expect(links).toMatchObject([
      { depth: 0, id: 'parent', label: 'About', state: 'valid' },
      {
        depth: 1,
        displayHref: 'https://example.com/resource',
        id: 'child',
        label: 'External',
        state: 'valid',
      },
    ])
  })
})
