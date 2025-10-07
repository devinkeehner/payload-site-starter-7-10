/**
 * Strip all HTML tags from wordpress-posts.excerpt for one or all tenants.
 *
 * Usage:
 *   pnpm tsx scripts/strip-wordpress-excerpt-html.ts [--tenant <slug>] [--dry-run]
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

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function stripHtml(input?: string): string {
  if (!input) return ''
  const withoutTags = input.replace(/<[^>]*>/g, '')
  const unescaped = withoutTags
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
  return unescaped.replace(/[\s\u00a0]+/g, ' ').trim()
}

;(async () => {
  dotenv.config()
  const envLocalPath = path.resolve(process.cwd(), '.env.local')
  if (fs.existsSync(envLocalPath)) dotenv.config({ path: envLocalPath })

  if (!process.env.PAYLOAD_CONFIG_PATH) {
    process.env.PAYLOAD_CONFIG_PATH = path.resolve(__dirname, '../src/payload.config.ts')
  }

  try {
    await import('tsconfig-paths/register')
  } catch {}

  const { default: payloadConfig } = await import(pathToFileURL(process.env.PAYLOAD_CONFIG_PATH).href)
  await payload.init({ config: payloadConfig as any })

  console.log(`Connected – stripping HTML from wordpress-posts excerpts${DRY_RUN ? ' (dry-run)' : ''}…`)

  const PAGE_SIZE = 100
  let page = 1
  let processed = 0
  let updated = 0

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

    for (const tenant of tenants.docs as any[]) {
      const tenantId = tenant.id as string
      const tenantSlug = tenant.slug as string
      console.log(`\n• Processing tenant ${tenantSlug}`)

      let postsPage = 1
      while (true) {
        const posts = await payload.find({
          collection: 'wordpress-posts',
          where: { tenant: { equals: tenantId } },
          limit: PAGE_SIZE,
          page: postsPage,
          overrideAccess: true as any,
        })

        if (!posts.docs.length) break

        for (const doc of posts.docs as any[]) {
          processed++
          const current = typeof doc.excerpt === 'string' ? doc.excerpt : ''
          const cleaned = stripHtml(current)
          if (cleaned === current.trim()) continue

          console.log(`  · ${doc.slug || doc.id}: excerpt updated`) 
          if (!DRY_RUN) {
            await payload.update({
              collection: 'wordpress-posts',
              id: doc.id as string,
              data: { excerpt: cleaned },
              overrideAccess: true,
              context: { disableRevalidate: true } as any,
            })
          }
          updated++
        }

        if (!posts.hasNextPage || postsPage * PAGE_SIZE >= posts.totalDocs) break
        postsPage++
      }
    }

    if (!tenants.hasNextPage || page * PAGE_SIZE >= tenants.totalDocs) break
    page++
  }

  console.log(`\nProcessed posts: ${processed}`)
  console.log(`Excerpts updated: ${updated}`)
  if (DRY_RUN) {
    console.log('Dry run complete – rerun without --dry-run to persist changes.')
  } else {
    console.log('✅ HTML stripping complete.')
  }

  process.exit(0)
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
