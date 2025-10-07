/**
 * Set the hero type to "none" for each tenant's About and Contact pages.
 *
 * Usage:
 *   pnpm tsx scripts/set-pages-hero-to-none.ts [--tenant <slug>] [--dry-run]
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
const TARGET_SLUGS = ['about', 'contact'] as const

interface UnchangedEntry {
  tenant: string
  page: string
  reason: string
}

;(async () => {
  dotenv.config()
  const envLocalPath = path.resolve(process.cwd(), '.env.local')
  if (fs.existsSync(envLocalPath)) dotenv.config({ path: envLocalPath })

  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const configPath = path.resolve(__dirname, '../src/payload.config.ts')
  if (!process.env.PAYLOAD_CONFIG_PATH) process.env.PAYLOAD_CONFIG_PATH = configPath
  try {
    await import('tsconfig-paths/register')
  } catch {}

  const { default: payloadConfig } = await import(pathToFileURL(configPath).href)
  await payload.init({ config: payloadConfig as any })

  console.log(`Connected to MongoDB – setting hero.type to "none" for ${TARGET_SLUGS.join(', ')} pages${DRY_RUN ? ' (dry-run)' : ''}…`)

  const PAGE_SIZE = 100
  let page = 1
  const unchanged: UnchangedEntry[] = []
  const updated: string[] = []

  while (true) {
    const where = ONLY_TENANT ? { slug: { equals: ONLY_TENANT } } : undefined
    const tenants = await payload.find({
      collection: 'tenants',
      where: where as any,
      limit: PAGE_SIZE,
      page,
      overrideAccess: true as any,
    })

    if (!tenants.docs.length) break

    for (const tenantDoc of tenants.docs as any[]) {
      const tenantId = tenantDoc.id as string
      const tenantSlug = tenantDoc.slug as string
      const tenantName = tenantDoc.name as string | undefined

      console.log(`\n• Processing tenant ${tenantSlug}${tenantName ? ` (${tenantName})` : ''}`)

      for (const targetSlug of TARGET_SLUGS) {
        try {
          const res = await payload.find({
            collection: 'pages',
            where: {
              tenant: { equals: tenantId },
              slug: { equals: targetSlug },
            },
            limit: 1,
            page: 1,
            overrideAccess: true as any,
          })

          if (!res.totalDocs) {
            unchanged.push({ tenant: tenantSlug, page: targetSlug, reason: 'page not found' })
            console.warn(`  · ${targetSlug}: page not found`)
            continue
          }

          const doc = res.docs[0] as any
          const currentType = doc?.hero?.type as string | undefined

          if (currentType === 'none') {
            unchanged.push({ tenant: tenantSlug, page: targetSlug, reason: 'already none' })
            console.log(`  · ${targetSlug}: hero.type already none`)
            continue
          }

          const nextHero = { ...(doc.hero ?? {}), type: 'none' }

          console.log(`  · ${targetSlug}: setting hero.type ${currentType ? `from ${currentType} ` : ''}-> none`)

          if (!DRY_RUN) {
            await payload.update({
              collection: 'pages',
              id: doc.id as string,
              data: {
                hero: nextHero,
              },
              overrideAccess: true,
              context: { disableRevalidate: true } as any,
            })
          }

          updated.push(`${tenantSlug}:${targetSlug}`)
        } catch (err: any) {
          const message = err?.message || String(err)
          unchanged.push({ tenant: tenantSlug, page: targetSlug, reason: `error: ${message}` })
          console.error(`  · ${targetSlug}: error -> ${message}`)
        }
      }
    }

    if (!tenants.hasNextPage || page * PAGE_SIZE >= tenants.totalDocs) break
    page++
  }

  console.log('\nSummary:')
  console.log(`  Updated: ${updated.length}`)
  for (const entry of updated) {
    console.log(`    - ${entry}`)
  }

  console.log(`\n  Unchanged or skipped: ${unchanged.length}`)
  for (const entry of unchanged) {
    console.log(`    - ${entry.tenant}:${entry.page} (${entry.reason})`)
  }

  if (DRY_RUN) {
    console.log('\nDry run complete – re-run without --dry-run to persist changes.')
  } else {
    console.log('\n✅ Hero type rewrite complete.')
  }

  process.exit(0)
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
