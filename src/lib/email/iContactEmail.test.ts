import { createHash } from 'node:crypto'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { prepareIContactTestEmail, sendIContactCampaign, sendIContactTestEmail } from './iContactEmail'

const savedEnv = { ...process.env }

afterEach(() => {
  process.env = { ...savedEnv }
  vi.unstubAllGlobals()
})

describe('iContact campaign delivery', () => {
  it('creates a rendered message and a list-targeted send', async () => {
    process.env.ICONTACT_ACCOUNT_ID = '373633'
    process.env.ICONTACT_API_BASE = 'https://app.icontact.com'
    process.env.ICONTACT_APP_ID = 'app-id'
    process.env.ICONTACT_CAMPAIGN_ID = '159088'
    process.env.ICONTACT_PASSWORD = 'password'
    process.env.ICONTACT_USERNAME = 'username'

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        messages: [{ messageId: '501' }],
      }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        sends: [{ recipientCount: 2, sendId: '601', status: 'pending' }],
      }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(sendIContactCampaign({
      clientFolderId: '147941',
      html: '<p>Hello</p>',
      listId: '9001',
      messageName: 'Weekly update',
      preheader: 'Preview text',
      subject: 'Weekly update',
      text: 'Hello',
    })).resolves.toMatchObject({
      messageId: '501',
      recipientCount: 2,
      sendId: '601',
    })

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://app.icontact.com/icp/a/373633/c/147941/messages')
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual([
      expect.objectContaining({
        campaignId: 159088,
        htmlBody: '<p>Hello</p>',
        messageType: 'normal',
        previewText: 'Preview text',
        subject: 'Weekly update',
        textBody: 'Hello',
      }),
    ])
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://app.icontact.com/icp/a/373633/c/147941/sends')
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual([
      { includeListIds: '9001', messageId: 501 },
    ])
  })

  it('dry-runs a dedicated list and verifies exactly one recipient without sending', async () => {
    process.env.ICONTACT_ACCOUNT_ID = '373633'
    process.env.ICONTACT_API_BASE = 'https://app.icontact.com'
    process.env.ICONTACT_APP_ID = 'app-id'
    process.env.ICONTACT_CAMPAIGN_ID = '159088'
    process.env.ICONTACT_PASSWORD = 'password'
    process.env.ICONTACT_USERNAME = 'username'

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ lists: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ lists: [{ listId: '700' }] }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ contacts: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ contacts: [{ contactId: '800' }] }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ subscriptions: [{ subscriptionId: '900' }] }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        subscriptions: [{ contactId: '800', status: 'normal' }],
      }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(prepareIContactTestEmail({
      clientFolderId: '147941',
      recipientEmail: 'tester@example.com',
    })).resolves.toMatchObject({
      activeRecipientCount: 1,
      listId: '700',
      recipientEmail: 'tester@example.com',
    })

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://app.icontact.com/icp/a/373633/c/147941/lists')
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual([
      expect.objectContaining({
        emailOwnerOnChange: 0,
        name: expect.stringMatching(/^HRO Web Test — tester@example\.com — /),
        welcomeOnManualAdd: 0,
        welcomeOnSignupAdd: 0,
      }),
    ])
    expect(fetchMock).toHaveBeenCalledTimes(6)
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/messages') || String(url).endsWith('/sends'))).toBe(false)
  })

  it('refuses a test send when the prepared list has more than one active recipient', async () => {
    process.env.ICONTACT_ACCOUNT_ID = '373633'
    process.env.ICONTACT_API_BASE = 'https://app.icontact.com'
    process.env.ICONTACT_APP_ID = 'app-id'
    process.env.ICONTACT_CAMPAIGN_ID = '159088'
    process.env.ICONTACT_PASSWORD = 'password'
    process.env.ICONTACT_USERNAME = 'username'

    const recipientEmail = 'tester@example.com'
    const recipientKey = createHash('sha256').update(recipientEmail).digest('hex').slice(0, 10)
    const listName = `HRO Web Test — ${recipientEmail} — ${recipientKey}`
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ lists: [{ listId: '700', name: listName }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ contacts: [{ contactId: '800', email: recipientEmail }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'duplicate subscription' }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        subscriptions: [
          { contactId: '800', status: 'normal' },
          { contactId: '801', status: 'normal' },
        ],
      }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(sendIContactTestEmail({
      clientFolderId: '147941',
      html: '<p>Test</p>',
      preparedListId: '700',
      recipientEmail,
      subject: 'Weekly update',
      text: 'Test',
    })).rejects.toThrow('has 2 active recipients')

    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/messages') || String(url).endsWith('/sends'))).toBe(false)
  })
})
