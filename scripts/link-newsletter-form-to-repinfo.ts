/**
 * Link each tenant's newsletter form to the RepInfo.form relationship.
 *
 * Prereq: run scripts/create-newsletter-form.ts first to upsert the form per tenant.
 *
 * Usage:
 *  pnpm tsx scripts/link-newsletter-form-to-repinfo.ts [--tenant <slug>] [--dry-run]
 */

import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import payload from 'payload'

interface CliOpts {
  tenant?: string
  dryRun: boolean
}

function parseArgs(): CliOpts {
  const get = (flag: string) => {
    const i = process.argv.findIndex((a) => a === flag)
    return i === -1 ? undefined : process.argv[i + 1]
  }
  const tenant = get('--tenant')
  const dryRun = process.argv.includes('--dry-run') || process.argv.includes('--dryRun')
  return { tenant, dryRun }
}

const { tenant: ONLY_TENANT, dryRun: DRY_RUN } = parseArgs()

;(async () => {
  dotenv.config()
  const envLocalPath = path.resolve(process.cwd(), '.env.local')
  if (fs.existsSync(envLocalPath)) dotenv.config({ path: envLocalPath })

  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const configPath = path.resolve(__dirname, '../src/payload.config.ts')
  if (!process.env.PAYLOAD_CONFIG_PATH) process.env.PAYLOAD_CONFIG_PATH = configPath
  try { await import('tsconfig-paths/register') } catch {}

  const { default: payloadConfig } = await import(pathToFileURL(configPath).href)
  await payload.init({ config: payloadConfig as any })

  console.log(`Connected to MongoDB – linking newsletter form to RepInfo${DRY_RUN ? ' (dry-run)' : ''}…`)

  const FORM_TITLE = 'Sign Up For My Newsletter'

  async function getFormForTenant(tenantId: string) {
    const res = await payload.find({
      collection: 'forms',
      where: { title: { equals: FORM_TITLE }, tenant: { equals: tenantId } },
      limit: 1,
      overrideAccess: true as any,
    })
    return res.totalDocs ? (res.docs[0] as any) : undefined
  }

  async function getRepInfoForTenant(tenantId: string) {
    const res = await payload.find({
      collection: 'rep-info',
      where: { tenant: { equals: tenantId } },
      limit: 1,
      overrideAccess: true as any,
    })
    return res.totalDocs ? (res.docs[0] as any) : undefined
  }

  async function linkForm(tenantId: string, tenantSlug: string) {
    const form = await getFormForTenant(tenantId)
    if (!form) {
      console.warn(`· ${tenantSlug}: newsletter form not found – skipping`)
      return
    }
    const rep = await getRepInfoForTenant(tenantId)
    if (!rep) {
      console.warn(`· ${tenantSlug}: RepInfo not found – skipping`)
      return
    }

    if (rep.form && (typeof rep.form === 'string' ? rep.form === form.id : rep.form?.id === form.id)) {
      console.log(`· ${tenantSlug}: RepInfo.form already linked`)
      return
    }

    if (DRY_RUN) {
      console.log(`· dry-run: would set RepInfo.form=${form.id} for tenant=${tenantSlug}`)
      return
    }

    await payload.update({
      collection: 'rep-info',
      id: rep.id,
      data: { form: form.id },
      overrideAccess: true,
      context: { disableRevalidate: true } as any,
    })
    console.log(`· ${tenantSlug}: linked RepInfo.form=${form.id}`)
  }

  // Iterate tenants
  const PAGE_SIZE = 100
  let page = 1
  let count = 0
  while (true) {
    const where = ONLY_TENANT ? { slug: { equals: ONLY_TENANT } } : undefined
    const res = await payload.find({ collection: 'tenants', where: where as any, limit: PAGE_SIZE, page, overrideAccess: true as any })
    if (!res.docs.length) break

    for (const t of res.docs as any[]) {
      const tenantId = t.id as string
      const tenantSlug = t.slug as string
      console.log(`\n• Processing tenant ${tenantSlug}`)
      await linkForm(tenantId, tenantSlug)
      count++
    }

    if (!res.hasNextPage || page * PAGE_SIZE >= res.totalDocs) break
    page++
  }

  console.log(`\n✅ Finished linking newsletter form to RepInfo for ${count} tenant(s).`)
  process.exit(0)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
