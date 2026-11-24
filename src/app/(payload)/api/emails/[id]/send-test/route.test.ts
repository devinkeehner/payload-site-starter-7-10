import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { POST } from './route'

const fixtures = vi.hoisted(() => ({
  createPayloadRequest: vi.fn(),
  confirmReceipt: vi.fn(),
  computeRenderedRevision: vi.fn(),
  getReadiness: vi.fn(),
  prepareIContactTestEmail: vi.fn(),
  sendIContactTestEmail: vi.fn(),
  sendAutomation: vi.fn(),
  advanceRun: vi.fn(),
  beginRun: vi.fn(),
  releaseRun: vi.fn(),
  updateEmailIfStatus: vi.fn(),
}))

vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({ createPayloadRequest: fixtures.createPayloadRequest }))
vi.mock('@/lib/email/iContactEmail', () => ({
  prepareIContactTestEmail: fixtures.prepareIContactTestEmail,
  sendIContactTestEmail: fixtures.sendIContactTestEmail,
}))
vi.mock('@/lib/email/iContactAutomationTest', () => ({
  getIContactAutomationTestTarget: () => ({ listId: '456', messageId: '789', recipientEmail: 'pilot@example.com' }),
  sendIContactAutomationTestEmail: fixtures.sendAutomation,
}))
vi.mock('@/lib/email/iContactAutomationPilotRun', () => ({
  advanceAutomationPilotRun: fixtures.advanceRun,
  beginAutomationPilotRun: fixtures.beginRun,
  confirmAutomationPilotReceipt: fixtures.confirmReceipt,
  getAutomationPilotRun: vi.fn(),
  releaseUntriggeredAutomationPilotRun: fixtures.releaseRun,
}))
vi.mock('@/lib/email/lifecycle', () => ({
  canSendEmailTest: () => true,
  getEmailCampaignStatus: () => 'draft',
  updateEmailIfStatus: fixtures.updateEmailIfStatus,
}))
vi.mock('@/lib/email/readiness', () => ({
  getBlockingEmailLinks: () => [],
  getEmailReadiness: fixtures.getReadiness,
}))
vi.mock('@/lib/email/footerContext', () => ({ prepareEmailLayoutForRender: async () => ({ layout: [] }) }))
vi.mock('@/lib/email/renderEmail', () => ({ renderEmail: async () => ({ html: '<p>Draft</p>', text: 'Draft' }) }))
vi.mock('@/lib/email/revision', () => ({ computeEmailRenderedContentRevision: fixtures.computeRenderedRevision }))
vi.mock('@/lib/email/sender', () => ({ getTenantEmailSenderSettings: async () => ({ iContactCampaignId: '246' }) }))

const run = { runId: 'run-1', subject: '[TEST run-1] Draft' }

function submit(body: Record<string, unknown>) {
  return POST(new Request('https://example.com/api/emails/draft-1/send-test', {
    body: JSON.stringify(body),
    method: 'POST',
  }), { params: Promise.resolve({ id: 'draft-1' }) })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('EMAIL_WEB_VERSION_SECRET', 'local-test-fixture')
  fixtures.createPayloadRequest.mockResolvedValue({
    payload: {
      findByID: async () => ({
        emailList: { id: 'audience-1', iContactClientFolderId: '123' },
        layout: [{ blockType: 'text' }],
        status: 'draft',
        subject: 'Draft',
      }),
    },
    user: { roles: ['super'] },
  })
  fixtures.beginRun.mockResolvedValue(run)
  fixtures.advanceRun.mockResolvedValue(undefined)
  fixtures.computeRenderedRevision.mockReturnValue('fixture')
  fixtures.getReadiness.mockResolvedValue({ contentRevision: 'fixture' })
})

afterEach(() => vi.unstubAllEnvs())

describe('automation pilot send route', () => {
  it('triggers the verified pilot without calling ordinary sends or approving campaign delivery', async () => {
    fixtures.sendAutomation.mockImplementation(async ({ beforeTrigger }) => { await beforeTrigger() })

    const response = await submit({ automationPilot: true, expectedRevision: 'fixture', recipientEmail: 'ignored@example.com' })

    expect(response.status, await response.clone().text()).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ status: 'triggered' })
    expect(fixtures.sendAutomation).toHaveBeenCalledWith(expect.objectContaining({
      clientFolderId: '123', recipientEmail: 'pilot@example.com', subject: run.subject,
    }))
    expect(fixtures.advanceRun.mock.calls.map(([, , from, to]) => [from, to])).toEqual([
      ['preparing', 'triggering'], ['triggering', 'triggered'],
    ])
    expect(fixtures.sendIContactTestEmail).not.toHaveBeenCalled()
    expect(fixtures.updateEmailIfStatus).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ data: {} }))
  })

  it('stops before starting the pilot when the rendered campaign revision changes', async () => {
    fixtures.computeRenderedRevision.mockReturnValue('updated-fixture')

    const response = await submit({ automationPilot: true, expectedRevision: 'fixture' })

    expect(response.status).toBe(409)
    expect(fixtures.beginRun).not.toHaveBeenCalled()
    expect(fixtures.sendAutomation).not.toHaveBeenCalled()
    expect(fixtures.updateEmailIfStatus).not.toHaveBeenCalled()
  })

  it('confirms receipt after the campaign content changes without touching send approval', async () => {
    const response = await submit({ confirmAutomationRunId: run.runId, expectedRevision: 'older-fixture' })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ status: 'received' })
    expect(fixtures.confirmReceipt).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      emailId: 'draft-1', folderId: '123', runId: run.runId,
    }))
    expect(fixtures.getReadiness).not.toHaveBeenCalled()
    expect(fixtures.sendAutomation).not.toHaveBeenCalled()
    expect(fixtures.updateEmailIfStatus).not.toHaveBeenCalled()
  })

  it('blocks ordinary verification for the pilot inbox before it can subscribe the recipient', async () => {
    const response = await submit({ dryRun: true, recipientEmail: 'Pilot@example.com' })

    expect(response.status).toBe(409)
    expect(fixtures.prepareIContactTestEmail).not.toHaveBeenCalled()
    expect(fixtures.sendAutomation).not.toHaveBeenCalled()
  })

  it('keeps the folder locked when iContact may have already received the subscription', async () => {
    fixtures.sendAutomation.mockImplementation(async ({ beforeTrigger }) => {
      await beforeTrigger()
      throw new Error('Provider connection lost.')
    })

    const response = await submit({ automationPilot: true })

    expect(response.status).toBe(500)
    expect(await response.text()).toContain(run.subject)
    expect(fixtures.advanceRun.mock.calls.map(([, , from, to]) => [from, to])).toEqual([
      ['preparing', 'triggering'], ['triggering', 'uncertain'],
    ])
    expect(fixtures.releaseRun).not.toHaveBeenCalled()
  })
})
