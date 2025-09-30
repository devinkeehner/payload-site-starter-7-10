/**
 * Import WordPress menus (pre-exported JSON per tenant folder) into the Payload `navbars` collection,
 * and ensure two basic Pages exist per tenant: About and Contact.
 *
 * Folder structure expected:
 *   <exports-root>/<Tenant-Folder>/menu-<location>.json
 * Example:
 *   exports/3-Tim-Ackert/menu-left-center.json
 *
 * Each menu JSON should include: { site_url, location, assigned, items_tree: [...] }
 *
 * What this script does per tenant folder:
 *  1) Derive tenant slug from site_url (last URL segment)
 *  2) Find the tenant in Payload (by slug). If not found, skip this folder with a warning
 *  3) Upsert two Pages: "About" (/about) and "Contact" (/contact) with a simple RichText block
 *  4) For each menu JSON (optionally filtered by --locations), map items_tree to `navbars.navItems`
 *     and upsert a Navbar named by location (e.g., left-center -> "Main Navbar", left-footer -> "Footer Navbar")
 *
 * Usage:
 *  pnpm tsx scripts/import-menus-from-exports.ts --exports-root "exports" --tenant ackert --dry-run
 *  pnpm tsx scripts/import-menus-from-exports.ts --exports-root "exports" --locations left-center,left-footer
 *
 * Notes:
 * - Uses the Payload SDK (local API), not external REST. Requires MongoDB connection via your env.
 * - Pages use a minimal RichText block; can be enhanced later.
 */

import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import slugify from 'slugify'
import payload from 'payload'

/* -------------------------------- CLI -------------------------------- */
interface CliOpts {
  exportsRoot: string
  tenant?: string
  dryRun: boolean
  locations: string[]
  references: boolean
}
function parseArgs(): CliOpts {
  const get = (flag: string) => {
    const i = process.argv.findIndex((a) => a === flag)
    return i === -1 ? undefined : process.argv[i + 1]
  }
  const exportsRoot = get('--exports-root') || get('--root')
  if (!exportsRoot) {
    console.error('❌ Usage: pnpm tsx scripts/import-menus-from-exports.ts --exports-root "exports" [--tenant <slug>] [--locations left-center,left-footer] [--dry-run]')
    process.exit(1)
  }
  const tenant = get('--tenant')
  const dryRun = process.argv.includes('--dry-run') || process.argv.includes('--dryRun')
  const locationsArg = get('--locations') || ''
  const locations = locationsArg
    ? locationsArg.split(',').map((s) => s.trim()).filter(Boolean)
    : [] // empty -> process all found menu-*.json files
  const references = process.argv.includes('--references')
  return { exportsRoot, tenant, dryRun, locations, references }
}

const { exportsRoot, tenant: ONLY_TENANT, dryRun: DRY_RUN, locations: LOCATIONS, references: PREFER_REFERENCES } = parseArgs()
const absRoot = path.isAbsolute(exportsRoot) ? exportsRoot : path.join(process.cwd(), exportsRoot)
if (!fs.existsSync(absRoot)) {
  console.error(`❌ Exports root not found: ${absRoot}`)
  process.exit(1)
}

/* --------------------------- Payload bootstrap --------------------------- */
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

  console.log(`Connected to MongoDB – starting menus import${DRY_RUN ? ' (dry-run)' : ''}…`)

  /* ----------------------------- Helpers ----------------------------- */
  function readJSONFile<T = any>(p: string): T {
    const raw = fs.readFileSync(p, 'utf8')
    const clean = raw.replace(/^\uFEFF/, '')
    return JSON.parse(clean)
  }

  function parseTenantSlugFromUrl(siteUrl: string): string {
    try {
      const u = new URL(siteUrl)
      const parts = u.pathname.split('/').filter(Boolean)
      const last = parts[parts.length - 1] || ''
      return slugify(last, { lower: true })
    } catch {
      return slugify(siteUrl.split('/').filter(Boolean).pop() || siteUrl, { lower: true })
    }
  }

  async function getTenantBySlug(slug: string): Promise<string | undefined> {
    const q = await payload.find({ collection: 'tenants', where: { slug: { equals: slug } }, limit: 1 })
    return q.totalDocs ? (q.docs[0].id as string) : undefined
  }

  // Minimal Lexical document for RichText blocks
  function rt(text: string) {
    return {
      root: {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            version: 1,
            children: [
              { type: 'text', text, version: 1 },
            ],
          },
        ],
        direction: null,
        format: 'left',
        indent: 0,
        version: 1,
      },
    }
  }

  async function upsertPage(opts: { tenantId: string; title: string; slug: string; body: string }): Promise<string | undefined> {
    const { tenantId, title, slug, body } = opts
    const existing = await payload.find({ collection: 'pages', where: { slug: { equals: slug }, tenant: { equals: tenantId } }, limit: 1, overrideAccess: true as any })
    const data: any = {
      title,
      slug,
      layout: [
        { blockType: 'richTextBlock', richText: rt(body) },
      ],
      tenant: tenantId,
      _status: 'published',
    }
    if (existing.totalDocs) {
      const id = existing.docs[0].id as string
      if (DRY_RUN) {
        console.log(`· dry-run: would update Page id=${id} slug=/${slug}`)
        return id
      }
      const updated = await payload.update({ collection: 'pages', id, data, overrideAccess: true, context: { disableRevalidate: true } as any })
      return (updated as any).id as string
    }
    if (DRY_RUN) {
      console.log(`· dry-run: would create Page slug=/${slug}`)
      return undefined
    }
    const created = await payload.create({ collection: 'pages', data, overrideAccess: true, context: { disableRevalidate: true } as any })
    return (created as any).id as string
  }

  type MenuNode = {
    id: number
    title: string
    url: string
    target?: string
    order?: number
    children?: MenuNode[]
  }

  function navbarNameForLocation(loc: string): string {
    if (loc === 'left-center') return 'Main Navbar'
    if (loc === 'left-footer') return 'Footer Navbar'
    return `Menu: ${loc}`
  }

  function originOf(siteUrl: string): string {
    try { const u = new URL(siteUrl); return `${u.protocol}//${u.host}` } catch { return '' }
  }

  async function toNavbarData(origin: string, tenantSlug: string, tenantId: string, nodes: MenuNode[], refs: { aboutId?: string; contactId?: string }, preferReferences: boolean) {
    const allowedHosts = new Set<string>()
    try { const o = new URL(origin); allowedHosts.add(o.host) } catch {}
    allowedHosts.add('main.cthousegop.com')
    const rewriteToMain = (url: string): string => {
      try {
        const u = new URL(url, origin)
        const host = u.host.toLowerCase()
        if (host === 'cthousegop.com' || host === 'www.cthousegop.com') {
          u.host = 'main.cthousegop.com'
          return u.toString()
        }
        return url
      } catch { return url }
    }
    const isExternal = (url: string) => {
      try {
        const u = new URL(url, origin)
        return !!u.host && !allowedHosts.has(u.host)
      } catch { return true }
    }
    const extractPageSlug = (url: string): string | undefined => {
      try {
        const u = new URL(url, origin)
        const segs = u.pathname.split('/').filter(Boolean).map((s) => s.toLowerCase())
        const pageSeg = segs[0] === tenantSlug ? segs[1] : segs[0]
        if (!pageSeg || pageSeg === '#' || pageSeg === tenantSlug) return undefined
        return slugify(pageSeg, { lower: true })
      } catch { return undefined }
    }
    const toLink = async (title: string, url: string, target?: string) => {
      // Special-case anchors or empty URLs
      if (!url || url === '#') return { link: { type: 'custom', url: '#', label: title }, newTab: false }
      try {
        const rewritten = rewriteToMain(url)
        const u = new URL(rewritten, origin)
        const isExt = isExternal(rewritten)
        if (!isExt && preferReferences) {
          const seg = extractPageSlug(rewritten)
          if (seg) {
            // Re-use created About/Contact IDs if matched; otherwise create a page on demand
            let pageId: string | undefined
            if (seg === 'about' && refs.aboutId) pageId = refs.aboutId
            else if (seg === 'contact' && refs.contactId) pageId = refs.contactId
            else pageId = await upsertPage({ tenantId, title, slug: seg, body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.' })

            if (pageId) return { link: { type: 'reference', reference: { relationTo: 'pages', value: pageId }, label: title }, newTab: false }
          }
        }
        return { link: { type: 'custom', url: rewritten, label: title }, newTab: target === '_blank' || isExt }
      } catch {
        const rewritten = rewriteToMain(url)
        return { link: { type: 'custom', url: rewritten, label: title }, newTab: true }
      }
    }
    const mapNode = async (n: MenuNode) => {
      const top = await toLink(n.title, n.url, n.target)
      return {
        ...top,
        subNav: await Promise.all((n.children || []).map(async (c) => {
          const sub = await toLink(c.title, c.url, c.target)
          return {
            ...sub,
            subSubNav: await Promise.all((c.children || []).map(async (g) => {
              const sub2 = await toLink(g.title, g.url, g.target)
              return { ...sub2 }
            })),
          }
        })),
      }
    }
    const items = await Promise.all(nodes.map(mapNode))
    return items
  }

  // Reorder top-level nav items by preferred titles, then append the rest in original order
  function reorderTopLevel(items: any[]) {
    const preferred = ['about', 'contact', 'newsroom', 'district map', 'legislation', 'committees']
    const lower = (s: any) => String(s || '').trim().toLowerCase()
    const byLabel = new Map<string, any>()
    const remaining: any[] = []
    for (const it of items) {
      const label = lower(it?.link?.label)
      if (!byLabel.has(label)) byLabel.set(label, it)
    }
    // Preserve original order for non-preferred items
    for (const it of items) {
      const label = lower(it?.link?.label)
      if (!preferred.includes(label)) remaining.push(it)
    }
    const ordered: any[] = []
    for (const name of preferred) {
      const found = byLabel.get(name)
      if (found) ordered.push(found)
    }
    return [...ordered, ...remaining]
  }

  async function upsertNavbar(tenantId: string, name: string, navItems: any[]) {
    const existing = await payload.find({ collection: 'navbars', where: { name: { equals: name }, tenant: { equals: tenantId } }, limit: 1, overrideAccess: true as any })
    if (existing.totalDocs) {
      const id = existing.docs[0].id as string
      if (DRY_RUN) return console.log(`· dry-run: would update Navbar id=${id} name=${name} items=${navItems.length}`)
      await payload.update({ collection: 'navbars', id, data: { name, navItems, tenant: tenantId }, overrideAccess: true, context: { disableRevalidate: true } as any })
      return
    }
    if (DRY_RUN) return console.log(`· dry-run: would create Navbar name=${name} items=${navItems.length}`)
    await payload.create({ collection: 'navbars', data: { name, navItems, tenant: tenantId }, overrideAccess: true, context: { disableRevalidate: true } as any })
  }

  /* ------------------------------- Runner ------------------------------- */
  const entries = fs.readdirSync(absRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)

  const targets = ONLY_TENANT
    ? entries.filter((folder) => folder.toLowerCase().includes(String(ONLY_TENANT).toLowerCase()))
    : entries

  if (!targets.length) {
    console.warn('ℹ No tenant folders matched the filter. Nothing to do.')
    process.exit(0)
  }

  for (const folder of targets) {
    try {
      // Find menu-*.json files in this tenant folder
      const dir = path.join(absRoot, folder)
      const files = fs.readdirSync(dir)
        .filter((f) => f.startsWith('menu-') && f.endsWith('.json'))

      if (!files.length) {
        console.warn(`⚠ Skipping ${folder}: no menu-*.json files found`)
        continue
      }

      // Read one file to discover site_url and tenant slug
      const sample = readJSONFile<any>(path.join(dir, files[0]))
      const siteUrl = sample?.site_url as string | undefined
      if (!siteUrl) {
        console.warn(`⚠ Skipping ${folder}: site_url missing in ${files[0]}`)
        continue
      }
      const tenantSlug = parseTenantSlugFromUrl(siteUrl)
      const tenantId = await getTenantBySlug(tenantSlug)
      if (!tenantId) {
        console.warn(`⚠ Skipping ${folder}: tenant not found for slug ${tenantSlug}. Create the tenant first.`)
        continue
      }

      console.log(`\n• Processing tenant ${tenantSlug} from folder ${folder}`)

      // 1) Ensure About and Contact pages (capture IDs for internal references)
      const aboutId = await upsertPage({ tenantId, title: 'About', slug: 'about', body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Cras lacinia.' })
      const contactId = await upsertPage({ tenantId, title: 'Contact', slug: 'contact', body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed non risus.' })

      // 2) Import menus per file (optionally filter by --locations)
      const origin = originOf(siteUrl)
      for (const fname of files) {
        try {
          const p = path.join(dir, fname)
          const json = readJSONFile<any>(p)
          const location = String(json?.location || '').trim()
          if (LOCATIONS.length && !LOCATIONS.includes(location)) continue
          const nodes: MenuNode[] = Array.isArray(json?.items_tree) ? json.items_tree : []
          if (!nodes.length) {
            console.warn(`⚠ ${folder}/${fname}: items_tree empty - skipping`)
            continue
          }
          const name = navbarNameForLocation(location)
          const navItemsRaw = await toNavbarData(origin, tenantSlug, tenantId, nodes, { aboutId, contactId }, PREFER_REFERENCES)
          const navItems = reorderTopLevel(navItemsRaw)
          await upsertNavbar(tenantId, name, navItems)
        } catch (e: any) {
          console.warn(`✖ Error in ${folder}/${fname}: ${e?.message || e}`)
        }
      }
    } catch (e: any) {
      console.warn(`✖ Error processing folder ${folder}: ${e?.message || e}`)
    }
  }

  console.log('\n✅ Finished Menus import.')
  process.exit(0)
})()
