import { describe, expect, it } from 'vitest'

import {
  authenticateElasticWebhookSecret,
  getElasticWebhookJobContext,
  getEmailJobIdFromElasticChannelName,
  recordBelongsToElasticWebhookTenant,
} from './elasticWebhook'

describe('Elastic webhook authentication', () => {
  it('fails closed when no webhook secret is configured', () => {
    expect(authenticateElasticWebhookSecret({
      configuredSecret: undefined,
      providedSecret: undefined,
    })).toBe('not-configured')
  })

  it('only authenticates an exact configured secret', () => {
    expect(authenticateElasticWebhookSecret({
      configuredSecret: 'configured-secret',
      providedSecret: 'configured-secret',
    })).toBe('authenticated')
    expect(authenticateElasticWebhookSecret({
      configuredSecret: 'configured-secret',
      providedSecret: 'wrong-secret',
    })).toBe('unauthorized')
    expect(authenticateElasticWebhookSecret({
      configuredSecret: 'configured-secret',
      providedSecret: '',
    })).toBe('unauthorized')
  })
})

describe('Elastic webhook job mapping', () => {
  const channelName = 'hro-email-job-job_123-abc'
  const job = {
    elasticCampaignId: channelName,
    email: 'email-1',
    id: 'job_123-abc',
    snapshot: {
      audienceListId: 'list-1',
      emailId: 'email-1',
      tenantId: 'tenant-1',
    },
    tenant: 'tenant-1',
  }

  it('extracts only the stable send-job channel format', () => {
    expect(getEmailJobIdFromElasticChannelName(channelName)).toBe('job_123-abc')
    expect(getEmailJobIdFromElasticChannelName('some-provider-campaign')).toBeNull()
    expect(getEmailJobIdFromElasticChannelName('hro-email-job-job/123')).toBeNull()
    expect(getEmailJobIdFromElasticChannelName('hro-email-job-')).toBeNull()
  })

  it('binds the job, campaign, email, audience, and tenant together', () => {
    expect(getElasticWebhookJobContext({ channelName, job })).toEqual({
      audienceListId: 'list-1',
      channelName,
      emailId: 'email-1',
      jobId: 'job_123-abc',
      tenantId: 'tenant-1',
    })
  })

  it('rejects missing or inconsistent tenant and campaign metadata', () => {
    expect(getElasticWebhookJobContext({
      channelName,
      job: { ...job, tenant: null },
    })).toBeNull()
    expect(getElasticWebhookJobContext({
      channelName,
      job: {
        ...job,
        snapshot: { ...job.snapshot, tenantId: 'tenant-2' },
      },
    })).toBeNull()
    expect(getElasticWebhookJobContext({
      channelName,
      job: { ...job, elasticCampaignId: 'hro-email-job-another-job' },
    })).toBeNull()
  })

  it('requires exact tenant ownership for mutable records', () => {
    expect(recordBelongsToElasticWebhookTenant({ tenant: 'tenant-1' }, 'tenant-1')).toBe(true)
    expect(recordBelongsToElasticWebhookTenant({ tenant: 'tenant-2' }, 'tenant-1')).toBe(false)
    expect(recordBelongsToElasticWebhookTenant({}, 'tenant-1')).toBe(false)
  })
})
