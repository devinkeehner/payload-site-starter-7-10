/**
 * Remove the `main.` subdomain prefix from custom navbar links across tenants.
 *
 * Example: https://main.cthousegop.com/buckbee/about/ -> https://cthousegop.com/buckbee/about/
 *
 * Usage:
 *   pnpm tsx scripts/remove-main-prefix-from-navbar-links.ts [--tenant <slug>] [--dry-run]
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
const MAIN_PREFIX = 'main.'
const TARGET_HOST = 'cthousegop.com'

function stripMainSubdomain(original: string): { url: string; changed: boolean } {
  try {
    const base = 'https://cthousegop.com'
    const url = new URL(original, base)
    const host = url.host.toLowerCase()
    if (!host.startsWith(MAIN_PREFIX)) {
      return { url: original, changed: false }
    }

    const withoutPrefix = host.slice(MAIN_PREFIX.length)
    if (!withoutPrefix || withoutPrefix === host) {
      return { url: original, changed: false }
    }

    url.host = withoutPrefix
    return { url: url.toString(), changed: true }
  } catch {
    // Fallback for strings that aren't valid URLs but contain the prefix pattern directly
    const lowered = original.toLowerCase()
    const marker = `${MAIN_PREFIX}${TARGET_HOST}`
    const idx = lowered.indexOf(marker)
    if (idx === -1) {
      return { url: original, changed: false }
    }
    return {
      url: `${original.slice(0, idx)}${TARGET_HOST}${original.slice(idx + marker.length)}`,
      changed: true,
    }
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

  console.log(`Connected – removing 'main.' from navbar custom URLs${DRY_RUN ? ' (dry-run)' : ''}…`)

  type NavItem = any

  function processNavItem(item: NavItem, report: string[], parentTrail: string): NavItem {
    const out: any = { ...item }
    const link = out.link

    if (link && link.type === 'custom' && typeof link.url === 'string') {
      const { url: nextUrl, changed } = stripMainSubdomain(link.url)
      if (changed) {
        out.link = { ...link, url: nextUrl }
        report.push(`${parentTrail} -> ${link.url} -> ${nextUrl}`)
      }
    }

    if (Array.isArray(out.subNav) && out.subNav.length) {
      out.subNav = out.subNav.map((child: NavItem, idx: number) =>
        processNavItem(child, report, `${parentTrail}/subNav[${idx}]`),
      )
    }

    if (Array.isArray(out.subSubNav) && out.subSubNav.length) {
      out.subSubNav = out.subSubNav.map((child: NavItem, idx: number) =>
        processNavItem(child, report, `${parentTrail}/subSubNav[${idx}]`),
      )
    }

    return out
  }

  const PAGE_SIZE = 100
  let page = 1
  const updates: { tenant: string; navbar: string; changes: number }[] = []

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

      const navbars = await payload.find({
        collection: 'navbars',
        where: { tenant: { equals: tenantId } },
        limit: 100,
        overrideAccess: true as any,
      })

      for (const navbar of navbars.docs as any[]) {
        const report: string[] = []
        const navItems = Array.isArray(navbar.navItems) ? navbar.navItems : []
        const nextNavItems = navItems.map((item: NavItem, index: number) =>
          processNavItem(item, report, `navItems[${index}]`),
        )

        if (!report.length) continue

        report.forEach((line) => console.log(`  · ${line}`))

        if (!DRY_RUN) {
          await payload.update({
            collection: 'navbars',
            id: navbar.id as string,
            data: { navItems: nextNavItems },
            overrideAccess: true,
            context: { disableRevalidate: true } as any,
          })
        }

        updates.push({ tenant: tenantSlug, navbar: navbar.name || navbar.id, changes: report.length })
        const prefix = DRY_RUN ? '  · dry-run: would update' : '  · updated'
        console.log(`${prefix} navbar '${navbar.name || navbar.id}' (${report.length} link(s) cleaned)`) 
      }
    }

    if (!tenants.hasNextPage || page * PAGE_SIZE >= tenants.totalDocs) break
    page++
  }

  console.log(`\nSummary:`)
  console.log(`  Updated navbars: ${updates.length}`)
  console.log(`  Total links cleaned: ${updates.reduce((sum, entry) => sum + entry.changes, 0)}`)
  updates.forEach((entry) => {
    console.log(`    - ${entry.tenant} / ${entry.navbar}: ${entry.changes} link(s)`)
  })

  if (DRY_RUN) {
    console.log('\nDry run complete – re-run without --dry-run to persist these updates.')
  } else {
    console.log('\n✅ Completed navbar link cleanup.')
  }

  process.exit(0)
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
