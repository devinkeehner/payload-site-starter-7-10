import { describe, expect, it, vi } from 'vitest'
import type { AdminViewServerProps } from 'payload'
import SiteSettingsView from './SiteSettingsView'

const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(url)
  }),
}))
vi.mock('next/navigation', () => ({ redirect }))
vi.mock('@payloadcms/next/templates', () => ({ DefaultTemplate: () => null }))
vi.mock('@payloadcms/ui', () => ({ Gutter: () => null }))
vi.mock('./SiteSettingsLayout', () => ({
  CreateSettingsRecordButton: () => null,
  SiteSettingsLayout: () => null,
}))
vi.mock('@/components/admin/dashboard/adminDashboardMeta', () => ({
  getSelectedTenantID: () => 'site-a',
}))

function fixture({ count = 1, superUser = false, section = 'profile' } = {}) {
  const find = vi.fn(async () => ({
    docs: Array.from({ length: count }, (_, index) => ({
      id: `record-${index}`,
      name: `Record ${index}`,
    })),
    totalDocs: count,
  }))
  const findByID = vi.fn(async () => ({ id: 'site-b', slug: 'site-b', name: 'Site B' }))
  const req = {
    user: { roles: superUser ? ['super'] : ['alphaTester'] },
    payload: { find, findByID, config: { routes: { admin: '/admin' } } },
  }
  const props = {
    searchParams: { section, tenant: 'site-b' },
    initPageResult: {
      req,
      permissions: {
        collections: Object.fromEntries(
          ['rep-info', 'tenants', 'site-seo', 'navbars', 'standard-media'].map((slug) => [
            slug,
            { read: true, create: true },
          ]),
        ),
      },
    },
  } as unknown as AdminViewServerProps
  return { props, find, findByID, req }
}

describe('site settings routing', () => {
  it('uses the requested site and opens its existing document in the selected section', async () => {
    const { props, find, findByID, req } = fixture({ section: 'email' })
    await expect(SiteSettingsView(props)).rejects.toThrow(
      '/admin/collections/rep-info/record-0?tenant=site-b&hroSettings=email',
    )
    expect(findByID).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'tenants', id: 'site-b', req, overrideAccess: false }),
    )
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'rep-info',
        req,
        overrideAccess: false,
        where: { tenant: { equals: 'site-b' } },
      }),
    )
  })

  it.each([0, 2])('keeps the workspace open when there are %s matching records', async (count) => {
    const { props, find } = fixture({ count })
    await expect(SiteSettingsView(props)).resolves.toBeTruthy()
    expect(find).toHaveBeenCalledTimes(1)
  })

  it('routes administration to the site record for super admins only', async () => {
    const staff = fixture({ section: 'administration' })
    await expect(SiteSettingsView(staff.props)).rejects.toThrow(
      '/admin/collections/rep-info/record-0',
    )
    const administrator = fixture({ section: 'administration', superUser: true })
    await expect(SiteSettingsView(administrator.props)).rejects.toThrow(
      '/admin/collections/tenants/site-b?tenant=site-b&hroSettings=administration',
    )
    expect(administrator.find).not.toHaveBeenCalled()
  })
})
