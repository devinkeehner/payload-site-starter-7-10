/**
 * Backfill: Rewrite Navbar links pointing to cthousegop.com or www.cthousegop.com
 * to main.cthousegop.com, preserving the path, query, and hash.
 * Also remove trailing slashes from custom URLs and normalize newTab=false for
 * internal links to main.cthousegop.com.
 *
 * Usage:
 *  pnpm tsx scripts/backfill-rewrite-navbar-links.ts [--tenant <slug>] [--dry-run]
 */

import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import payload from 'payload'

interface CliOpts { tenant?: string; dryRun: boolean }
function parseArgs(): CliOpts {
  const get = (flag: string) => { const i = process.argv.findIndex((a) => a === flag); return i === -1 ? undefined : process.argv[i + 1] }
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

  console.log(`Connected – backfilling navbar links${DRY_RUN ? ' (dry-run)' : ''}…`)

  const INTERNAL_HOST = 'main.cthousegop.com'

  function rewriteToMain(url: string): { url: string; changed: boolean; internal: boolean } {
    try {
      // Use a default origin for relative URLs
      const base = 'https://cthousegop.com'
      const u = new URL(url, base)
      const host = u.host.toLowerCase()
      let changed = false
      if (host === 'cthousegop.com' || host === 'www.cthousegop.com') {
        u.host = INTERNAL_HOST
        changed = true
      }
      const internal = u.host === INTERNAL_HOST
      return { url: u.toString(), changed, internal }
    } catch {
      // Not a valid URL — return as-is
      return { url, changed: false, internal: false }
    }
  }

  function removeTrailingSlash(url: string): { url: string; changed: boolean } {
    try {
      const base = 'https://cthousegop.com'
      const u = new URL(url, base)

      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        return { url, changed: false }
      }

      if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
        u.pathname = u.pathname.replace(/\/+$/, '')
        return { url: u.toString(), changed: true }
      }

      return { url, changed: false }
    } catch {
      return { url, changed: false }
    }
  }

  type NavItem = any

  function processItem(it: NavItem): { item: NavItem; changes: number } {
    let changes = 0
    const out: any = { ...it }

    const link = out.link
    if (link && link.type === 'custom' && typeof link.url === 'string') {
      const { url: rewrittenUrl, changed: rewrittenChanged, internal } = rewriteToMain(link.url)
      const { url: normalizedUrl, changed: normalizedChanged } = removeTrailingSlash(rewrittenUrl)
      if (rewrittenChanged || normalizedChanged) {
        out.link = { ...link, url: normalizedUrl }
        changes++
        // Normalize newTab for internal links
        if (internal) out.newTab = false
      }
    }

    if (Array.isArray(out.subNav)) {
      const next: any[] = []
      for (const s of out.subNav) {
        const r = processItem(s)
        changes += r.changes
        next.push(r.item)
      }
      out.subNav = next
    }
    if (Array.isArray(out.subSubNav)) {
      const next2: any[] = []
      for (const s of out.subSubNav) {
        const r = processItem(s)
        changes += r.changes
        next2.push(r.item)
      }
      out.subSubNav = next2
    }

    return { item: out, changes }
  }

  async function processNavbarDoc(doc: any): Promise<{ changes: number; updated: boolean }> {
    const items = Array.isArray(doc.navItems) ? doc.navItems : []
    let total = 0
    const newItems = items.map((it: any) => {
      const r = processItem(it)
      total += r.changes
      return r.item
    })
    if (total === 0) return { changes: 0, updated: false }

    if (DRY_RUN) return { changes: total, updated: false }

    await payload.update({
      collection: 'navbars',
      id: doc.id,
      data: { navItems: newItems },
      overrideAccess: true,
      context: { disableRevalidate: true } as any,
    })
    return { changes: total, updated: true }
  }

  // Iterate tenants
  const PAGE_SIZE = 100
  let page = 1
  let totalChanged = 0
  const report: { tenant: string; navbar: string; changes: number }[] = []
  while (true) {
    const where = ONLY_TENANT ? { slug: { equals: ONLY_TENANT } } : undefined
    const tenants = await payload.find({ collection: 'tenants', where: where as any, limit: PAGE_SIZE, page, overrideAccess: true as any })
    if (!tenants.docs.length) break

    for (const t of tenants.docs as any[]) {
      const tenantId = t.id as string
      const slug = t.slug as string
      console.log(`\n• Processing tenant ${slug}`)
      const navbars = await payload.find({ collection: 'navbars', where: { tenant: { equals: tenantId } }, limit: 100, overrideAccess: true as any })
      for (const nb of navbars.docs as any[]) {
        const res = await processNavbarDoc(nb)
        if (res.changes > 0) {
          totalChanged += res.changes
          report.push({ tenant: slug, navbar: nb.name || nb.id, changes: res.changes })
          const prefix = DRY_RUN ? '· dry-run: would update' : '· updated'
          console.log(`${prefix} navbar '${nb.name || nb.id}' with ${res.changes} link(s) rewritten`)
        }
      }
    }

    if (!tenants.hasNextPage || page * PAGE_SIZE >= tenants.totalDocs) break
    page++
  }

  console.log(`\n✅ Done. Links changed: ${totalChanged}. Entries affected: ${report.length}.`)
  if (report.length) {
    report.forEach((r) => console.log(` - ${r.tenant} / ${r.navbar}: ${r.changes}`))
  }

  process.exit(0)
})().catch((e) => { console.error(e); process.exit(1) })
