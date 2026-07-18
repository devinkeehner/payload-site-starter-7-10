import { timingSafeEqual } from 'node:crypto'

type UnknownRecord = Record<string, unknown>

export const ELASTIC_EMAIL_JOB_CHANNEL_PREFIX = 'hro-email-job-'

export type ElasticWebhookAuthentication =
  | 'authenticated'
  | 'not-configured'
  | 'unauthorized'

export type ElasticWebhookJobContext = {
  audienceListId: string
  channelName: string
  emailId: string
  jobId: string
  tenantId: string
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function getElasticWebhookString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function getElasticWebhookRelationshipId(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (!isRecord(value)) return null
  const id = value.id ?? value._id ?? value.value
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null
}

export function authenticateElasticWebhookSecret({
  configuredSecret,
  providedSecret,
}: {
  configuredSecret?: string | null
  providedSecret?: string | null
}): ElasticWebhookAuthentication {
  const configured = getElasticWebhookString(configuredSecret)
  if (!configured) return 'not-configured'

  const provided = getElasticWebhookString(providedSecret)
  if (!provided) return 'unauthorized'

  const configuredBuffer = Buffer.from(configured)
  const providedBuffer = Buffer.from(provided)
  if (configuredBuffer.length !== providedBuffer.length) return 'unauthorized'

  return timingSafeEqual(configuredBuffer, providedBuffer)
    ? 'authenticated'
    : 'unauthorized'
}

export function getElasticWebhookChannelName(event: UnknownRecord): string {
  return getElasticWebhookString(event.ChannelName || event.channelName)
}

export function getEmailJobIdFromElasticChannelName(channelName: unknown): string | null {
  const value = getElasticWebhookString(channelName)
  if (!value.startsWith(ELASTIC_EMAIL_JOB_CHANNEL_PREFIX)) return null

  const jobId = value.slice(ELASTIC_EMAIL_JOB_CHANNEL_PREFIX.length)
  if (!jobId || !/^[A-Za-z0-9_-]+$/.test(jobId)) return null
  return jobId
}

export function getElasticWebhookJobContext({
  channelName,
  job,
}: {
  channelName: string
  job: unknown
}): ElasticWebhookJobContext | null {
  if (!isRecord(job) || !isRecord(job.snapshot)) return null

  const channelJobId = getEmailJobIdFromElasticChannelName(channelName)
  const jobId = getElasticWebhookRelationshipId(job)
  const emailId = getElasticWebhookRelationshipId(job.email)
  const tenantId = getElasticWebhookRelationshipId(job.tenant)
  const snapshotEmailId = getElasticWebhookRelationshipId(job.snapshot.emailId)
  const snapshotTenantId = getElasticWebhookRelationshipId(job.snapshot.tenantId)
  const audienceListId = getElasticWebhookRelationshipId(job.snapshot.audienceListId)
  const storedCampaignId = getElasticWebhookString(job.elasticCampaignId)

  if (
    !channelJobId ||
    !jobId ||
    channelJobId !== jobId ||
    !emailId ||
    !tenantId ||
    !snapshotEmailId ||
    snapshotEmailId !== emailId ||
    !snapshotTenantId ||
    snapshotTenantId !== tenantId ||
    !audienceListId ||
    (storedCampaignId && storedCampaignId !== channelName)
  ) {
    return null
  }

  return {
    audienceListId,
    channelName,
    emailId,
    jobId,
    tenantId,
  }
}

export function recordBelongsToElasticWebhookTenant(
  record: unknown,
  tenantId: string,
): boolean {
  return isRecord(record) && getElasticWebhookRelationshipId(record.tenant) === tenantId
}
