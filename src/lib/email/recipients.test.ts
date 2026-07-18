import type { Payload, PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import {
  assertEmailAudienceTenantMatch,
  resolveEmailAudience,
} from './recipients'

describe('email audience resolution', () => {
  it('uses one deduplicated resolver for eligibility and exclusion counts', async () => {
    const list = {
      contacts: [
        { email: 'first@example.com', id: 'contact-1', status: 'subscribed' },
        { email: 'legacy@example.com', id: 'contact-legacy', status: 'subscribed' },
        { email: 'blocked@example.com', id: 'contact-blocked', status: 'doNotContact' },
      ],
      id: 'list-1',
      name: 'Town list',
      status: 'active',
      tenant: 'tenant-1',
    }
    const memberships = [
      {
        contact: { email: 'first@example.com', id: 'contact-1', status: 'subscribed' },
        status: 'subscribed',
      },
      {
        contact: { email: 'FIRST@example.com', id: 'contact-duplicate', status: 'subscribed' },
        status: 'subscribed',
      },
      {
        contact: { email: 'unsubscribed@example.com', id: 'contact-unsubscribed' },
        status: 'unsubscribed',
      },
      {
        contact: { email: 'bounced@example.com', id: 'contact-bounced', status: 'bounced' },
        status: 'subscribed',
      },
      {
        contact: { email: 'not-an-email', id: 'contact-invalid', status: 'subscribed' },
        status: 'subscribed',
      },
    ]
    const payload = {
      find: vi.fn().mockResolvedValue({
        docs: memberships,
        hasNextPage: false,
      }),
      findByID: vi.fn().mockResolvedValue(list),
    } as unknown as Payload

    const resolved = await resolveEmailAudience({
      listId: 'list-1',
      payload,
      req: {} as PayloadRequest,
    })

    expect(resolved.recipients.map(({ email }) => email)).toEqual([
      'first@example.com',
      'legacy@example.com',
    ])
    expect(resolved.summary).toMatchObject({
      active: 2,
      bounced: 1,
      contactBlocked: 2,
      doNotContact: 1,
      duplicates: 1,
      eligible: 2,
      inactive: 0,
      invalid: 1,
      total: 7,
      unsubscribed: 1,
    })
  })

  it('requires an exact campaign/list tenant match', () => {
    expect(assertEmailAudienceTenantMatch({
      audienceTenant: { id: 'tenant-1' },
      campaignTenant: 'tenant-1',
    })).toEqual({
      audienceTenantId: 'tenant-1',
      campaignTenantId: 'tenant-1',
    })
    expect(() => assertEmailAudienceTenantMatch({
      audienceTenant: 'tenant-2',
      campaignTenant: 'tenant-1',
    })).toThrow(/same site/i)
    expect(() => assertEmailAudienceTenantMatch({
      audienceTenant: null,
      campaignTenant: 'tenant-1',
    })).toThrow(/same site/i)
  })
})
