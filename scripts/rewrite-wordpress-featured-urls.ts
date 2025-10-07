/**
 * Rewrite legacy WordPress featured image URLs to the new CDN domain.
 *
 * Usage:
 *   pnpm tsx scripts/rewrite-wordpress-featured-urls.ts [--tenant <slug>] [--dry-run]
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
  const tenant = get('--tenant') || 'candelora'
  const dryRun = process.argv.includes('--dry-run') || process.argv.includes('--dryRun')
  return { tenant, dryRun }
}

const { tenant: TENANT_SLUG, dryRun: DRY_RUN } = parseArgs()

const CDN_BASE = 'https://cdn.cthousegop.com/'
const WP_UPLOAD_MARKERS = ['/wp-content/uploads/sites/', '/wp-content/uploads/']

function rewriteFeaturedUrl(original?: string): string | undefined {
  if (!original) return undefined
  const trimmed = original.trim()
  if (!trimmed) return undefined
  if (trimmed.startsWith(CDN_BASE)) return undefined

  try {
    const asUrl = new URL(trimmed)
    const host = asUrl.hostname.toLowerCase()
    if (!host.endsWith('cthousegop.com')) return undefined
    const pathname = asUrl.pathname
    const pathnameLower = pathname.toLowerCase()
    for (const marker of WP_UPLOAD_MARKERS) {
      const idx = pathnameLower.indexOf(marker)
      if (idx === -1) continue

      const suffix = pathname.slice(idx + marker.length)
      if (!suffix) return undefined

      const rebuilt = `${CDN_BASE}${suffix.replace(/^\/+/, '')}`
      const search = asUrl.search ?? ''
      const hash = asUrl.hash ?? ''
      return `${rebuilt}${search}${hash}`
    }

    return undefined
  } catch {
    const lowered = trimmed.toLowerCase()
    for (const marker of WP_UPLOAD_MARKERS) {
      const idx = lowered.indexOf(marker)
      if (idx === -1) continue
      const suffix = trimmed.slice(idx + marker.length)
      if (!suffix) continue
      return `${CDN_BASE}${suffix.replace(/^\/+/, '')}`
    }
    return undefined
  }
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

  if (!TENANT_SLUG) {
    console.error('❌ Tenant slug is required. Pass via --tenant <slug>.')
    process.exit(1)
  }

  console.log(`Connected to MongoDB – rewriting wordpress-posts featured URLs for tenant "${TENANT_SLUG}"${DRY_RUN ? ' (dry-run)' : ''}…`)

  async function getTenantIdBySlug(slug: string): Promise<{ id: string; name: string }> {
    const res = await payload.find({
      collection: 'tenants',
      where: { slug: { equals: slug } },
      limit: 1,
      overrideAccess: true as any,
    })
    if (!res.totalDocs) {
      throw new Error(`Tenant with slug "${slug}" not found.`)
    }
    const doc = res.docs[0] as any
    return { id: doc.id as string, name: doc.name as string }
  }

  const { id: tenantId, name: tenantName } = await getTenantIdBySlug(TENANT_SLUG)

  const PAGE_SIZE = 100
  let page = 1
  let processed = 0
  let updated = 0
  let skipped = 0

  while (true) {
    const res = await payload.find({
      collection: 'wordpress-posts',
      where: { tenant: { equals: tenantId } },
      limit: PAGE_SIZE,
      page,
      overrideAccess: true as any,
    })

    if (!res.docs.length) break

    for (const doc of res.docs as any[]) {
      processed++
      const { id, title, slug, featuredImageUrl } = doc
      const nextUrl = rewriteFeaturedUrl(typeof featuredImageUrl === 'string' ? featuredImageUrl : undefined)

      if (!nextUrl || nextUrl === featuredImageUrl) {
        skipped++
        continue
      }

      console.log(`· ${slug || id}:\n    from: ${featuredImageUrl}\n    to:   ${nextUrl}`)

      if (DRY_RUN) {
        continue
      }

      await payload.update({
        collection: 'wordpress-posts',
        id,
        data: { featuredImageUrl: nextUrl },
        overrideAccess: true,
        context: { disableRevalidate: true } as any,
      })
      updated++
    }

    if (!res.hasNextPage || page * PAGE_SIZE >= res.totalDocs) break
    page++
  }

  console.log(`\nTenant: ${tenantName} (${TENANT_SLUG})`)
  console.log(`Processed: ${processed}`)
  console.log(`Updated:   ${updated}`)
  console.log(`Skipped:   ${skipped}`)

  if (DRY_RUN) {
    console.log('\nDry run complete – re-run without --dry-run to persist changes.')
  } else {
    console.log('\n✅ Rewrite complete.')
  }

  process.exit(0)
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
