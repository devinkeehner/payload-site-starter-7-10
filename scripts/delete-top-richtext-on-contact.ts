/**
 * Remove the first richTextBlock from each tenant's /contact page layout.
 * If no richTextBlock exists, skip. Leaves the rest of the layout untouched.
 *
 * Usage:
 *  pnpm tsx scripts/delete-top-richtext-on-contact.ts [--tenant <slug>] [--dry-run]
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

  console.log(`Connected – deleting top richText block from /contact${DRY_RUN ? ' (dry-run)' : ''}…`)

  const PAGE_SIZE = 100
  let pageNum = 1
  let updatedCount = 0
  const failures: { slug: string; reason: string }[] = []

  while (true) {
    const where = ONLY_TENANT ? { slug: { equals: ONLY_TENANT } } : undefined
    const tpage = await payload.find({ collection: 'tenants', where: where as any, limit: PAGE_SIZE, page: pageNum, overrideAccess: true as any })
    if (!tpage.docs.length) break

    for (const t of tpage.docs as any[]) {
      const slug = t.slug as string
      const tenantId = t.id as string
      try {
        const pres = await payload.find({ collection: 'pages', where: { slug: { equals: 'contact' }, tenant: { equals: tenantId } }, limit: 1, overrideAccess: true as any })
        if (!pres.totalDocs) { console.warn(`• ${slug}: contact page not found`); continue }
        const page = pres.docs[0] as any
        const layout: any[] = Array.isArray(page.layout) ? [...page.layout] : []
        if (!layout.length) { console.log(`• ${slug}: no layout`); continue }
        const idx = layout.findIndex((blk) => blk?.blockType === 'richTextBlock')
        if (idx === -1) { console.log(`• ${slug}: no richTextBlock`); continue }

        const removed = layout.splice(idx, 1)
        if (!removed.length) { console.log(`• ${slug}: nothing removed`); continue }

        if (DRY_RUN) { console.log(`• ${slug}: dry-run – would remove 1 richTextBlock at position ${idx}`); continue }

        await payload.update({ collection: 'pages', id: page.id, data: { layout }, overrideAccess: true, context: { disableRevalidate: true } as any })
        console.log(`• ${slug}: removed 1 richTextBlock at position ${idx}`)
        updatedCount++
      } catch (e: any) {
        failures.push({ slug, reason: e?.message || String(e) })
      }
    }

    if (!tpage.hasNextPage || pageNum * PAGE_SIZE >= tpage.totalDocs) break
    pageNum++
  }

  console.log(`\n✅ Done. Updated ${updatedCount} tenant(s). Failures: ${failures.length}`)
  if (failures.length) failures.forEach((f) => console.log(` - ${f.slug}: ${f.reason}`))

  process.exit(0)
})().catch((e) => { console.error(e); process.exit(1) })
