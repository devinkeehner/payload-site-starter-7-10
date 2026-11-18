import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Access, Config, PayloadRequest, Where } from 'payload'
import { tenantPrivacyPlugin } from './tenantPrivacy'
import { createTenantPreview, verifyTenantPreview, TENANT_PREVIEW_HEADER } from './tenant-preview'

const secret = 'test-preview-secret-with-sufficient-entropy'
const tenant = { id: 'private-tenant', slug: 'ziobron' }
const published = { _status: { equals: 'published' } }

function setup(read: Access = () => published) {
  const config = tenantPrivacyPlugin({ collections: [
    { slug: 'posts', fields: [{ name: 'tenant', type: 'text' }], access: { read } },
    { slug: 'tenants', fields: [], access: { read: () => true } },
    { slug: 'contacts', fields: [{ name: 'tenant', type: 'text' }], access: { read: () => false } },
    { slug: 'search', fields: [], access: { read: () => true } },
  ] } as Config)
  const find = vi.fn().mockResolvedValue({ docs: [{ id: tenant.id }] })
  const req = { context: {}, headers: new Headers(), payload: { find }, user: null } as unknown as PayloadRequest
  const access = (slug: string) => config.collections!.find((c) => c.slug === slug)!.access!.read!({ req })
  return { req, find, access }
}

// Evaluate the returned query as the datastore would, rather than asserting only
// that the implementation emitted a particular JSON shape.
function permits(rule: boolean | Where, doc: Record<string, string>): boolean {
  if (typeof rule === 'boolean') return rule
  return Object.entries(rule).every(([key, condition]) => {
    if (key === 'and') return (condition as Where[]).every((part) => permits(part, doc))
    if (key === 'or') return (condition as Where[]).some((part) => permits(part, doc))
    return Object.entries(condition as Record<string, unknown>).every(([op, value]) => {
      if (op === 'equals') return doc[key] === value
      if (op === 'not_equals') return doc[key] !== value
      if (op === 'not_in') return !(value as string[]).includes(doc[key]!)
      return false
    })
  })
}

afterEach(() => vi.unstubAllEnvs())

describe('tenant privacy access', () => {
  it('hides even published private content while preserving public draft rules', async () => {
    const { access } = setup()
    const rule = await access('posts')
    expect(permits(rule, { tenant: tenant.id, _status: 'published' })).toBe(false)
    expect(permits(rule, { tenant: 'public', _status: 'published' })).toBe(true)
    expect(permits(rule, { tenant: 'public', _status: 'draft' })).toBe(false)
  })

  it('allows a valid grant to preview only its tenant, including drafts', async () => {
    vi.stubEnv('PREVIEW_SECRET', secret)
    const { req, access } = setup()
    req.headers.set(TENANT_PREVIEW_HEADER, await createTenantPreview(tenant, secret))
    const rule = await access('posts')
    expect(permits(rule, { tenant: tenant.id, _status: 'draft' })).toBe(true)
    expect(permits(rule, { tenant: 'different-private', _status: 'draft' })).toBe(false)
    expect(await access('contacts')).toBe(false)
  })

  it('preserves existing logged-in tenant access constraints', async () => {
    const allowed: Where = { tenant: { equals: 'assigned' } }
    const { req, access, find } = setup(() => allowed)
    req.user = { id: 'editor' } as PayloadRequest['user']
    expect(await access('posts')).toEqual(allowed)
    expect(find).not.toHaveBeenCalled()
  })

  it('does not expose private tenants in anonymous listing queries', async () => {
    const { access, find } = setup()
    const rule = await access('tenants')
    expect(permits(rule, { isPrivate: true as unknown as string })).toBe(false)
    expect(permits(rule, {})).toBe(true)
    await access('posts')
    expect(find).toHaveBeenCalledTimes(1)
    expect(find.mock.calls[0]![0]).toMatchObject({ overrideAccess: true, pagination: false })
  })

  it('hides old search snapshots that lack a tenant relationship', async () => {
    const { access, find } = setup()
    find.mockResolvedValueOnce({ docs: [{ id: tenant.id }] })
      .mockResolvedValueOnce({ docs: [{ id: 'private-post-id' }] })
    const rule = await access('search')
    expect(permits(rule, { 'doc.value': 'private-post-id' })).toBe(false)
    expect(permits(rule, { 'doc.value': 'public-post-id' })).toBe(true)
  })
})

describe('preview capability', () => {
  it('issues a signed grant with tenant scope and expiration', async () => {
    const token = await createTenantPreview(tenant, secret)
    expect(await verifyTenantPreview(token, secret)).toMatchObject({ tenantId: tenant.id, tenantSlug: tenant.slug })
    expect(await verifyTenantPreview(token, secret)).toMatchObject({ purpose: 'tenant-preview' })
  })

  it('rejects modified, expired, malformed and wrong-key grants', async () => {
    const token = await createTenantPreview(tenant, secret, Date.now() - 25 * 60 * 60 * 1000)
    expect(await verifyTenantPreview(token, secret)).toBeNull()
    const valid = await createTenantPreview(tenant, secret)
    expect(await verifyTenantPreview(valid, 'another-key')).toBeNull()
    expect(await verifyTenantPreview(`A${valid.slice(1)}`, secret)).toBeNull()
    expect(await verifyTenantPreview('anything', secret)).toBeNull()
    expect(await verifyTenantPreview(valid, undefined)).toBeNull()
  })
})
