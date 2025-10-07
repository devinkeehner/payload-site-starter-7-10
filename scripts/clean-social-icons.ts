import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import payload from 'payload'

function sanitizeWPContent(html?: string): string | undefined {
  if (!html) return html
  let out = String(html)
  // Remove synved social share anchors
  out = out.replace(/<a[^>]*class="[^"]*synved-social-button[^"]*"[^>]*>.*?<\/a>/gis, '')
  // Remove containers for social share blocks
  out = out.replace(/<\s*(div|p|span)[^>]*class="[^"]*synved-social[^"]*"[^>]*>.*?<\/(div|p|span)>/gis, '')
  // Remove ShareThis blocks if present
  out = out.replace(/<\s*(div|p|span)[^>]*class="[^"]*sharethis[^"]*"[^>]*>.*?<\/(div|p|span)>/gis, '')
  // Trim leading empty paragraphs/whitespace
  out = out.replace(/^(\s|(&nbsp;)|<p>\s*<\/p>)+/gis, '')
  // Collapse excessive whitespace
  out = out.replace(/\n{3,}/g, '\n\n')
  return out
}

async function bootstrap() {
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
}

async function getTenantId(slug: string) {
  const res = await payload.find({ collection: 'tenants', where: { slug: { equals: slug } }, limit: 1, overrideAccess: true as any })
  if (!res.totalDocs) throw new Error(`Tenant not found: ${slug}`)
  return res.docs[0].id as string
}

async function cleanTenant(target: string, dryRun: boolean) {
  const tenantId = await getTenantId(target)

  const PAGE_SIZE = 100
  let page = 1
  let totalExamined = 0
  let totalChanged = 0
  let totalUpdated = 0

  while (true) {
    const res = await payload.find({ collection: 'wordpress-posts', where: { tenant: { equals: tenantId } }, limit: PAGE_SIZE, page, overrideAccess: true as any })
    if (!res.docs.length) break

    for (const doc of res.docs as any[]) {
      totalExamined++
      const before = doc.content || ''
      const after = sanitizeWPContent(before) || ''
      if (after !== before) {
        totalChanged++
        if (dryRun) {
          console.log(`· would clean: ${target}/${doc.slug}`)
        } else {
          await payload.update({ collection: 'wordpress-posts', id: doc.id, data: { content: after }, overrideAccess: true as any })
          totalUpdated++
          console.log(`· cleaned: ${target}/${doc.slug}`)
        }
      }
    }

    if (!res.hasNextPage || page * PAGE_SIZE >= res.totalDocs) break
    page++
  }

  console.log(`Tenant ${target}: Examined ${totalExamined}, Changed ${totalChanged}${dryRun ? '' : `, Updated ${totalUpdated}`}`)
  return { examined: totalExamined, changed: totalChanged, updated: totalUpdated }
}

(async () => {
  const hasFlag = (f: string) => process.argv.includes(f)
  const getFlag = (f: string) => {
    const i = process.argv.findIndex((a) => a === f)
    return i !== -1 ? process.argv[i + 1] : undefined
  }
  const positional = process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : undefined
  const tenantArg = getFlag('--tenant') || positional
  const allTenants = hasFlag('--all-tenants') || hasFlag('--allTenants')
  const dryRun = hasFlag('--dry-run') || hasFlag('--dryRun')

  await bootstrap()

  if (allTenants) {
    const PAGE = 200
    let page = 1
    let totals = { examined: 0, changed: 0, updated: 0 }
    while (true) {
      const res = await payload.find({ collection: 'tenants', limit: PAGE, page, overrideAccess: true as any })
      if (!res.docs.length) break
      for (const t of res.docs as any[]) {
        const slug = t.slug as string
        const r = await cleanTenant(slug, dryRun)
        totals.examined += r.examined
        totals.changed += r.changed
        totals.updated += r.updated
      }
      if (!res.hasNextPage || page * PAGE >= res.totalDocs) break
      page++
    }
    console.log(`\nAll tenants done. Examined ${totals.examined}, Changed ${totals.changed}${dryRun ? '' : `, Updated ${totals.updated}`}`)
  } else {
    const target = tenantArg || 'dubitsky'
    await cleanTenant(target, dryRun)
  }

  process.exit(0)
})().catch((e) => { console.error(e); process.exit(1) })
