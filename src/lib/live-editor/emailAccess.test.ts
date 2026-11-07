import { describe, expect, it } from 'vitest'

import { assertEditorUser, assertEmailTenantAccess, LiveEditorAccessError, relationshipID } from './emailAccess'

describe('Live Editor email access', () => {
  it.each([null, undefined, {}, { roles: ['admin'] }, { roles: ['editor'] }, { collection: 'apiKeys', roles: ['super'] }])('rejects an unauthorized identity: %j', user => {
    expect(() => assertEditorUser(user)).toThrow(LiveEditorAccessError)
    try { assertEditorUser(user) } catch (error) { expect(error).toMatchObject({ status: 403 }) }
  })

  it.each(['super', 'alphaTester'])('allows an authorized users collection role: %s', role => {
    expect(() => assertEditorUser({ collection: 'users', roles: [role] })).not.toThrow()
  })

  it('compares assigned tenants by their stored or populated identities', () => {
    const user = { roles: ['alphaTester'], tenants: [{ tenant: { id: 'site-a', title: 'Assigned site' } }, { tenant: 42 }] }
    expect(() => assertEmailTenantAccess(user, { tenant: 'site-a' })).not.toThrow()
    expect(() => assertEmailTenantAccess(user, { tenant: { id: 42 } })).not.toThrow()
  })

  it('denies alpha access to a foreign or missing document tenant', () => {
    const user = { roles: ['alphaTester'], tenants: [{ tenant: 'site-a' }] }
    expect(() => assertEmailTenantAccess(user, { tenant: 'site-b' })).toThrow('outside your assigned sites')
    expect(() => assertEmailTenantAccess(user, {})).toThrow('outside your assigned sites')
    expect(() => assertEmailTenantAccess({ roles: ['alphaTester'] }, { tenant: 'site-a' })).toThrow(LiveEditorAccessError)
    expect(() => assertEmailTenantAccess({ roles: ['alphaTester'], tenants: 'site-a' }, { tenant: 'site-a' })).toThrow(LiveEditorAccessError)
  })

  it('allows super users to open documents outside assigned sites', () => {
    expect(() => assertEmailTenantAccess({ roles: ['super'], tenants: [] }, { tenant: 'site-b' })).not.toThrow()
  })

  it('requires email feature access even for a matching tenant', () => {
    expect(() => assertEmailTenantAccess({ roles: ['editor'], tenants: [{ tenant: 'site-a' }] }, { tenant: 'site-a' })).toThrow(LiveEditorAccessError)
  })

  it('normalizes Payload identity shapes without treating arbitrary objects as IDs', () => {
    expect(relationshipID('site-a')).toBe('site-a')
    expect(relationshipID(42)).toBe('42')
    expect(relationshipID({ id: 'site-a' })).toBe('site-a')
    expect(relationshipID({ _id: 42 })).toBe('42')
    expect(relationshipID({ relationTo: 'tenants', value: { id: 'site-a' } })).toBe('site-a')
    expect(relationshipID({ title: 'Not a relationship' })).toBeNull()
    expect(relationshipID(null)).toBeNull()
  })
})
