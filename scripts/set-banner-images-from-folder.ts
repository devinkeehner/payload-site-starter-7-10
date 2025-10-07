/**
 * Set standard-media.bannerImage for each tenant from a local folder of WEBP files.
 *
 * File naming: typically "<last>-<first>.webp" where <last> is usually the tenant slug.
 * We match flexibly: startsWith(slug-), endsWith(-slug), or contains -slug- as a segment.
 * If multiple candidates exist, prefer one without the word "copy".
 *
 * Usage:
 *  pnpm tsx scripts/set-banner-images-from-folder.ts --dir "Imports/web banner 25/webp" [--tenant <slug>] [--dry-run] [--force-upload|--force] [--replace-existing|--replace]
 */

import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import payload from 'payload'

interface CliOpts { dir: string; tenant?: string; dryRun: boolean; force: boolean; replaceExisting: boolean }
function parseArgs(): CliOpts {
  const get = (flag: string) => {
    const i = process.argv.findIndex((a) => a === flag)
    return i === -1 ? undefined : process.argv[i + 1]
  }
  const dir = get('--dir')
  if (!dir) {
    console.error('❌ Usage: pnpm tsx scripts/set-banner-images-from-folder.ts --dir "Imports/web banner 25/webp" [--tenant <slug>] [--dry-run] [--force-upload|--force] [--replace-existing|--replace]')
    process.exit(1)
  }
  const tenant = get('--tenant')
  const dryRun = process.argv.includes('--dry-run') || process.argv.includes('--dryRun')
  const force = process.argv.includes('--force-upload') || process.argv.includes('--force')
  const replaceExisting = process.argv.includes('--replace-existing') || process.argv.includes('--replace')
  return { dir, tenant, dryRun, force, replaceExisting }
}

const { dir: SRC_DIR, tenant: ONLY_TENANT, dryRun: DRY_RUN, force: FORCE_UPLOAD, replaceExisting: REPLACE_EXISTING } = parseArgs()

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

  console.log(`Connected – mapping WEBP files from ${SRC_DIR} to tenants${DRY_RUN ? ' (dry-run)' : ''}…`)

  // Load all .webp files from the directory
  const files = fs.readdirSync(SRC_DIR).filter((f) => f.toLowerCase().endsWith('.webp'))
  const lowerFiles = files.map((f) => ({
    name: f,
    base: f.replace(/\.[Ww][Ee][Bb][Pp]$/, ''),
    lower: f.toLowerCase(),
    baseLower: f.toLowerCase().replace(/\.[Ww][Ee][Bb][Pp]$/, ''),
  }))

  function findMatchForSlug(slug: string): string | undefined {
    const slugLower = slug.toLowerCase()
    const candidates = lowerFiles.filter((f) => {
      const b = f.baseLower
      return b.startsWith(`${slugLower}-`) || b.endsWith(`-${slugLower}`) || b.includes(`-${slugLower}-`)
    })
    if (!candidates.length) return undefined
    // Prefer without 'copy'
    const nonCopy = candidates.filter((c) => !c.baseLower.includes('copy'))
    const chosen = (nonCopy[0] || candidates[0]).name
    return chosen
  }

  async function ensureMedia(tenantId: string, filePath: string, alt: string): Promise<string | undefined> {
    // If a media with same alt already exists for this tenant, decide based on flags
    const existing = await payload.find({ collection: 'media', where: { alt: { equals: alt }, tenant: { equals: tenantId } }, limit: 1, overrideAccess: true as any })
    const hasExisting = existing.totalDocs > 0
    const existingId = hasExisting ? (existing.docs[0].id as string) : undefined

    if (DRY_RUN) {
      if (hasExisting) {
        if (REPLACE_EXISTING) console.log(`· dry-run: would REPLACE existing media ${existingId} with '${path.basename(filePath)}' (alt='${alt}')`)
        else if (FORCE_UPLOAD) console.log(`· dry-run: would CREATE new media from '${path.basename(filePath)}' even though one exists (alt='${alt}')`)
        else console.log(`· dry-run: would REUSE existing media ${existingId} (alt='${alt}')`)
      } else {
        console.log(`· dry-run: would upload media '${path.basename(filePath)}' (alt='${alt}')`)
      }
      return undefined
    }

    const fileBuf = fs.readFileSync(filePath)

    if (hasExisting && REPLACE_EXISTING) {
      // Replace the file content of the existing media in place
      await payload.update({
        collection: 'media',
        id: existingId!,
        data: { alt, tenant: tenantId },
        file: { data: fileBuf, mimetype: 'image/webp', name: path.basename(filePath), size: fileBuf.length } as any,
        overrideAccess: true,
        context: { disableRevalidate: true } as any,
      })
      return existingId
    }

    if (hasExisting && !FORCE_UPLOAD) {
      // Reuse existing without uploading a new file
      return existingId
    }

    const created = await payload.create({
      collection: 'media',
      data: { alt, tenant: tenantId },
      file: { data: fileBuf, mimetype: 'image/webp', name: path.basename(filePath), size: fileBuf.length } as any,
      overrideAccess: true,
      context: { disableRevalidate: true } as any,
    })
    return (created as any).id as string
  }

  async function upsertBannerForTenant(tenant: any): Promise<{ ok: boolean; reason?: string }> {
    const tenantId = tenant.id as string
    const slug = tenant.slug as string
    const match = findMatchForSlug(slug)
    if (!match) return { ok: false, reason: `no matching file for slug '${slug}'` }

    const filePath = path.resolve(SRC_DIR, match)
    if (!fs.existsSync(filePath)) return { ok: false, reason: `file not found: ${filePath}` }

    const mediaId = await ensureMedia(tenantId, filePath, 'Banner Image')

    // Find standard-media doc for tenant
    const sm = await payload.find({ collection: 'standard-media', where: { tenant: { equals: tenantId } }, limit: 1, overrideAccess: true as any })
    if (!sm.totalDocs) return { ok: false, reason: `standard-media doc missing` }

    const doc = sm.docs[0] as any

    if (DRY_RUN) {
      console.log(`· dry-run: would set standard-media.bannerImage for ${slug} to mediaId=${mediaId || '(new upload)'}`)
      return { ok: true }
    }

    const updated = await payload.update({
      collection: 'standard-media',
      id: doc.id,
      data: { bannerImage: mediaId },
      overrideAccess: true,
      context: { disableRevalidate: true } as any,
    })

    console.log(`· updated ${slug}: standard-media.bannerImage -> ${(updated as any).bannerImage?.id || updated.bannerImage}`)
    return { ok: true }
  }

  // Iterate tenants
  const PAGE_SIZE = 100
  let page = 1
  let okCount = 0
  const failures: { slug: string; reason: string }[] = []
  while (true) {
    const where = ONLY_TENANT ? { slug: { equals: ONLY_TENANT } } : undefined
    const res = await payload.find({ collection: 'tenants', where: where as any, limit: PAGE_SIZE, page, overrideAccess: true as any })
    if (!res.docs.length) break

    for (const t of res.docs as any[]) {
      const slug = t.slug as string
      const result = await upsertBannerForTenant(t)
      if (result.ok) okCount++
      else failures.push({ slug, reason: result.reason || 'unknown' })
    }

    if (!res.hasNextPage || page * PAGE_SIZE >= res.totalDocs) break
    page++
  }

  console.log(`\n✅ Done. Updated ${okCount} tenant(s). Failures: ${failures.length}`)
  if (failures.length) {
    failures.forEach((f) => console.log(` - ${f.slug}: ${f.reason}`))
  }

  process.exit(0)
})().catch((e) => { console.error(e); process.exit(1) })
