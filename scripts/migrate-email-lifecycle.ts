/**
 * Idempotent email lifecycle backfill.
 *
 * - Legacy `approved` campaigns become editable canonical `draft` campaigns.
 * - Scheduled campaigns without a confirmed, matching immutable snapshot become
 *   `draft` with `legacyScheduleNeedsReview=true`; they are never auto-enqueued.
 *
 * Safe default:
 *   pnpm tsx scripts/migrate-email-lifecycle.ts
 *
 * Apply:
 *   pnpm tsx scripts/migrate-email-lifecycle.ts --apply
 */

import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import payload from 'payload'

import { transitionEmailSendJob } from '@/lib/email/jobState'
import { updateEmailIfStatus } from '@/lib/email/lifecycle'
import { getEmailRelationshipId } from '@/lib/email/recipients'

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

async function getLinkedJob(email: UnknownRecord): Promise<UnknownRecord | null> {
  const jobId = getEmailRelationshipId(email.deliveryJob)
  if (!jobId) return null
  return (await payload.findByID({
    collection: 'email-send-jobs' as never,
    depth: 0,
    id: jobId,
    overrideAccess: true,
  }).catch(() => null)) as UnknownRecord | null
}

function isUnmistakablyValidSchedule({
  email,
  emailId,
  job,
}: {
  email: UnknownRecord
  emailId: string
  job: UnknownRecord | null
}): boolean {
  const deliveryRevision = getString(email.deliveryContentRevision)
  const scheduledAt = getString(email.scheduledAt)
  const snapshot = isRecord(job?.snapshot) ? job.snapshot : null
  return Boolean(
    job &&
    snapshot &&
    getString(email.deliveryConfirmedAt) &&
    deliveryRevision &&
    scheduledAt &&
    getEmailRelationshipId(email.deliveryJob) === getEmailRelationshipId(job) &&
    getEmailRelationshipId(job.email) === emailId &&
    getString(job.status) === 'scheduled' &&
    getString(job.activeKey) === emailId &&
    getString(job.scheduledFor) === scheduledAt &&
    getString(job.contentRevision) === deliveryRevision &&
    getString(snapshot.emailId) === emailId &&
    getString(snapshot.contentRevision) === deliveryRevision
  )
}

function isLifecycleConflict(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'status' in error &&
    error.status === 409,
  )
}

async function findLegacyEmails(): Promise<UnknownRecord[]> {
  const docs: UnknownRecord[] = []
  let page = 1

  while (true) {
    const result = await payload.find({
      collection: 'emails',
      depth: 0,
      limit: 100,
      overrideAccess: true,
      page,
      where: {
        or: [
          { status: { equals: 'approved' } },
          { status: { equals: 'scheduled' } },
        ],
      },
    })
    docs.push(...(result.docs as unknown as UnknownRecord[]))
    if (!result.hasNextPage) break
    page += 1
  }

  return docs
}

async function main() {
  dotenv.config()
  const envLocalPath = path.resolve(process.cwd(), '.env.local')
  if (fs.existsSync(envLocalPath)) dotenv.config({ path: envLocalPath })

  const dirname = path.dirname(fileURLToPath(import.meta.url))
  const configPath = path.resolve(dirname, '../src/payload.config.ts')
  if (!process.env.PAYLOAD_CONFIG_PATH) process.env.PAYLOAD_CONFIG_PATH = configPath
  try {
    await import('tsconfig-paths/register')
  } catch {}
  const { default: payloadConfig } = await import(pathToFileURL(configPath).href)
  await payload.init({ config: payloadConfig as never })

  const apply = process.argv.includes('--apply')
  const emails = await findLegacyEmails()
  let approvedToDraft = 0
  let concurrentChangesSkipped = 0
  let preservedValidSchedules = 0
  let schedulesRequiringReview = 0

  for (const email of emails) {
    const emailId = getEmailRelationshipId(email)
    if (!emailId) continue

    if (email.status === 'approved') {
      approvedToDraft += 1
      if (apply) {
        await updateEmailIfStatus({
          allowedStatuses: ['draft'],
          data: { status: 'draft' },
          emailId,
          payload,
        })
      }
      continue
    }

    const linkedJob = await getLinkedJob(email)
    if (isUnmistakablyValidSchedule({ email, emailId, job: linkedJob })) {
      preservedValidSchedules += 1
      continue
    }

    const authorizationError = 'Legacy schedules require explicit reconfirmation after the immutable-delivery migration.'
    schedulesRequiringReview += 1
    if (apply) {
      const previousSummary = isRecord(email.sendSummary) ? email.sendSummary : {}
      try {
        await updateEmailIfStatus({
          allowedStatuses: ['scheduled'],
          data: {
            legacyScheduleNeedsReview: true,
            sendSummary: {
              ...previousSummary,
              sendError: `${authorizationError} Review and confirm delivery again.`,
            },
            status: 'draft',
          },
          emailId,
          expected: {
            deliveryConfirmedAt: getString(email.deliveryConfirmedAt) || null,
            deliveryContentRevision: getString(email.deliveryContentRevision) || null,
            deliveryJob: getEmailRelationshipId(email.deliveryJob),
            scheduledAt: getString(email.scheduledAt) || null,
          },
          payload,
        })
      } catch (error) {
        if (!isLifecycleConflict(error)) throw error
        concurrentChangesSkipped += 1
        continue
      }

      const jobId = getEmailRelationshipId(linkedJob)
      if (
        jobId &&
        getEmailRelationshipId(linkedJob?.email) === emailId
      ) {
        await transitionEmailSendJob({
          data: {
            activeKey: `terminal:${jobId}`,
            completedAt: new Date().toISOString(),
            lockExpiresAt: null,
            lockedAt: null,
            message: `${authorizationError} Delivery requires explicit reconfirmation.`,
          },
          from: ['preparing', 'scheduled', 'pending'],
          jobId,
          payload,
          to: 'cancelled',
        }).catch(() => undefined)
      }
    }
  }

  console.log(JSON.stringify({
    applied: apply,
    approvedToDraft,
    concurrentChangesSkipped,
    preservedValidSchedules,
    schedulesRequiringReview,
  }, null, 2))
}

void main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
