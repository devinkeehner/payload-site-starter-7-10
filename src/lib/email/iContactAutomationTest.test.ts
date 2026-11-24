import { createHash } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getIContactAutomationTestTarget,
  sendIContactAutomationTestEmail,
} from './iContactAutomationTest'

const clientFolderId = '100'
const recipientEmail = 'tester@example.com'
const listId = '200'
const contactId = '300'
const messageId = '400'
const campaignId = '500'
const target = { campaignId, listId, messageId, recipientEmail }
const listName = `HRO Web Test — ${recipientEmail} — ${createHash('sha256').update(recipientEmail).digest('hex').slice(0, 10)}`
const folderPath = `/icp/a/99/c/${clientFolderId}`
const messagePath = `${folderPath}/messages/${messageId}`
const content = { html: '<p>New draft</p>', preheader: 'Preview', subject: '[TEST 12345678] Weekly draft', text: 'New draft' }

beforeEach(() => {
  vi.stubEnv('ICONTACT_ACCOUNT_ID', '99')
  vi.stubEnv('ICONTACT_API_BASE', 'https://provider.example.test')
  vi.stubEnv('ICONTACT_APP_ID', 'fixture-app')
  vi.stubEnv('ICONTACT_USERNAME', 'fixture-user')
  vi.stubEnv('ICONTACT_PASSWORD', 'fixture-password')
  vi.stubEnv('ICONTACT_TEST_AUTOMATIONS', undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

function mockProvider({
  additionalContact = false,
  listNotifications = false,
  messageName = 'TEST — Monthly draft',
  providerListName = listName,
  persistUpdate = true,
}: {
  additionalContact?: boolean
  listNotifications?: boolean
  messageName?: string
  providerListName?: string
  persistUpdate?: boolean
} = {}) {
  const events: string[] = []
  let subscriptionStatus = 'normal'
  let message = {
    campaignId,
    clientFolderId,
    htmlBody: '<p>Old draft</p>',
    messageId,
    messageName,
    messageType: 'normal',
    previewText: 'Old preview',
    replyToCampaignId: '501',
    subject: content.subject,
    textBody: 'Old draft',
  }

  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input)
    const path = url.pathname
    events.push(`${init?.method} ${path}`)
    if (path === `${folderPath}/lists/${listId}`) {
      return Response.json({ list: { emailOwnerOnChange: Number(listNotifications), listId: Number(listId), name: providerListName } })
    }
    if (path === `${folderPath}/contacts`) {
      return Response.json({ contacts: [{ contactId, email: recipientEmail, status: 'normal' }] })
    }
    if (path === `${folderPath}/subscriptions` && init?.method === 'GET') {
      const subscriptions = [{ contactId, listId, status: subscriptionStatus }]
      if (additionalContact) subscriptions.push({ contactId: '301', listId, status: 'normal' })
      return Response.json({ subscriptions, total: subscriptions.length })
    }
    if (path === `${folderPath}/subscriptions` && init?.method === 'POST') {
      const [subscription] = JSON.parse(String(init.body)) as Array<{ status: string }>
      if (!subscription) throw new Error('Missing test subscription update')
      subscriptionStatus = subscription.status
      events.push(subscriptionStatus)
      return Response.json({})
    }
    if (path === messagePath && init?.method === 'GET') {
      return Response.json({ message })
    }
    if (path === messagePath && init?.method === 'POST') {
      const update = JSON.parse(String(init.body)) as Partial<typeof message>
      if (persistUpdate) message = { ...message, ...update }
      return Response.json({ message: { ...message, ...update } })
    }
    throw new Error(`Unexpected fixture request ${path}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return { events, fetchMock }
}

describe('iContact automation test email', () => {
  it('opts in only configured client folders and requires a complete setup', () => {
    expect(getIContactAutomationTestTarget(clientFolderId)).toBeNull()
    vi.stubEnv('ICONTACT_TEST_AUTOMATIONS', JSON.stringify({ [clientFolderId]: { listId: 200, messageId, recipientEmail: 'TESTER@example.com' } }))
    expect(getIContactAutomationTestTarget(clientFolderId)).toEqual({ listId, messageId, recipientEmail })
    expect(getIContactAutomationTestTarget('101')).toBeNull()

    vi.stubEnv('ICONTACT_TEST_AUTOMATIONS', JSON.stringify({ [clientFolderId]: { listId, messageId } }))
    expect(() => getIContactAutomationTestTarget(clientFolderId)).toThrow('ICONTACT_TEST_AUTOMATIONS')
  })

  it('rejects an unexpected sender property before making changes', async () => {
    const provider = mockProvider()
    await expect(sendIContactAutomationTestEmail({ ...content, clientFolderId, expectedCampaignId: '502', recipientEmail, target }))
      .rejects.toThrow('uses a different sender property')
    expect(provider.events).toEqual([
      `GET ${folderPath}/lists/${listId}`,
      `GET ${folderPath}/contacts`,
      `GET ${folderPath}/subscriptions`,
      `GET ${messagePath}`,
    ])
  })

  it('updates the same message and verifies it before resetting and re-adding only the test contact', async () => {
    const provider = mockProvider()
    const beforeTrigger = vi.fn(async () => { provider.events.push('before trigger') })
    await expect(sendIContactAutomationTestEmail({ ...content, beforeTrigger, clientFolderId, recipientEmail, target }))
      .resolves.toMatchObject({ activeRecipientCount: 1, contactId, listId, messageId, recipientCount: 1 })

    const posts = provider.fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(posts.map(([url, init]) => [new URL(url).pathname, JSON.parse(String(init?.body))])).toEqual([
      [messagePath, { htmlBody: content.html, messageId, previewText: content.preheader, subject: content.subject, textBody: content.text }],
      [`${folderPath}/subscriptions`, [{ contactId, listId, status: 'unsubscribed' }]],
      [`${folderPath}/subscriptions`, [{ contactId, listId, status: 'normal' }]],
    ])
    expect(provider.events).toEqual([
      `GET ${folderPath}/lists/${listId}`,
      `GET ${folderPath}/contacts`,
      `GET ${folderPath}/subscriptions`,
      `GET ${messagePath}`,
      `POST ${messagePath}`,
      `GET ${messagePath}`,
      `GET ${folderPath}/subscriptions`,
      `POST ${folderPath}/subscriptions`,
      'unsubscribed',
      `GET ${folderPath}/subscriptions`,
      'before trigger',
      `POST ${folderPath}/subscriptions`,
      'normal',
      `GET ${folderPath}/subscriptions`,
    ])
  })

  it('rejects a mismatched recipient before calling iContact', async () => {
    const provider = mockProvider()
    await expect(sendIContactAutomationTestEmail({ ...content, clientFolderId, recipientEmail: 'other@example.com', target }))
      .rejects.toThrow('configured for a different recipient')
    expect(provider.fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    [{ providerListName: 'Production audience' }, 'not the dedicated test list'],
    [{ listNotifications: true }, 'notifications and welcome messages disabled'],
    [{ additionalContact: true }, 'an active recipient other than the configured contact'],
    [{ messageName: 'Production draft' }, 'not an identifiable test draft'],
  ])('rejects the wrong provider setup before any mutation', async (options, expectedError) => {
    const provider = mockProvider(options)
    await expect(sendIContactAutomationTestEmail({ ...content, clientFolderId, recipientEmail, target })).rejects.toThrow(expectedError)
    expect(provider.events.every((event) => event.startsWith('GET '))).toBe(true)
  })

  it('does not trigger if the provider does not persist the updated content', async () => {
    const provider = mockProvider({ persistUpdate: false })
    const beforeTrigger = vi.fn()
    await expect(sendIContactAutomationTestEmail({ ...content, beforeTrigger, clientFolderId, recipientEmail, target }))
      .rejects.toThrow('did not confirm the updated test draft')
    expect(provider.events.filter((event) => event.startsWith('POST '))).toEqual([`POST ${messagePath}`])
    expect(beforeTrigger).not.toHaveBeenCalled()
  })
})
