import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { prepareIContactDispatch } from './iContactAudience'

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

describe('iContact snapshot targeting', () => {
  it('subscribes only approved, currently eligible contacts to a private per-job list', async () => {
    let subscriptions: Array<{ contactId: string; listId: string; status: string }> = []
    const fetchMock = vi.fn(async (input: string, init: RequestInit) => {
      const url = new URL(input)
      const listId = url.searchParams.get('listId')
      if (url.pathname.endsWith('/contacts')) return Response.json({
        contacts: [
          { contactId: '11', email: 'approved@example.com', status: 'normal' },
          { contactId: '12', email: 'added@example.com', status: 'normal' },
          { contactId: '13', email: 'opted-out@example.com', status: 'normal' },
          { contactId: '14', email: 'bounced@example.com', status: 'bounced' },
          { contactId: '15', email: 'removed@example.com', status: 'normal' },
        ],
      })
      if (url.pathname.endsWith('/lists')) {
        return Response.json({ lists: init.method === 'POST' ? [{ listId: '30' }] : [] })
      }
      if (url.pathname.endsWith('/subscriptions') && init.method === 'POST') {
        subscriptions = JSON.parse(String(init.body))
        return Response.json({ subscriptions })
      }
      if (url.pathname.endsWith('/subscriptions')) {
        if (listId === '20') return Response.json({
          subscriptions: ['11', '12', '13', '14'].map(contactId => ({ contactId, status: 'normal' })),
        })
        if (listId === '29') return Response.json({ subscriptions: [{ contactId: '13', status: 'unsubscribed' }] })
        if (listId === '30') return Response.json({ subscriptions })
      }
      throw new Error('Unexpected iContact call: ' + url)
    })
    vi.stubGlobal('fetch', fetchMock)

    const prepared = await prepareIContactDispatch({
      approvedEmails: ['approved@example.com', 'opted-out@example.com', 'bounced@example.com', 'removed@example.com'],
      clientFolderId: '2',
      jobId: 'job-1',
      priorDispatchLists: ['29'],
      sourceListId: '20',
    })
    expect(prepared.recipientCount).toBe(1)
    expect(prepared.dispatch.iContactDispatchListId).toBe('30')
    expect(subscriptions).toEqual([{ contactId: '11', listId: '30', status: 'normal' }])
    await expect(prepared.verify()).resolves.toBeUndefined()

    subscriptions.push({ contactId: '12', listId: '30', status: 'normal' })
    await expect(prepared.verify()).rejects.toThrow('audience changed')
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/sends'))).toBe(false)
  })
})
