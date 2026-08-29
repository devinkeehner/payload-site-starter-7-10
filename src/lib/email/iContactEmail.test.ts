import { afterEach, describe, expect, it, vi } from 'vitest'

import { sendIContactCampaign } from './iContactEmail'

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
})
