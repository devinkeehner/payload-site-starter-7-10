/**
 * Importer for per-tenant exports found under `Imports/exports/<Tenant-Folder>/`.
 * Each folder is expected to contain:
 *  - customizer.json (theme options, brand info, image URLs)
 *  - posts.json (WP REST export for posts, typically with _embedded)
 *
 * This script will:
 *  1) Upsert a Tenant (slug derived from customizer.site_url, name inverted "Last, First")
 *  2) Upsert RepInfo for that tenant (with defaults and mappings you specified)
 *  3) Upsert StandardMedia (singleton per tenant) by downloading and uploading mapped images to R2
 *  4) Import posts into `wordpress-posts`, uploading featured images to R2
 *
 * Usage examples:
 *  pnpm tsx scripts/import-from-exports.ts --exports-root "Imports/exports" --tenant carney --dry-run
 *  pnpm tsx scripts/import-from-exports.ts --exports-root "Imports/exports"
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
}
function parseArgs(): CliOpts {
  const get = (flag: string) => {
    const i = process.argv.findIndex((a) => a === flag)
    return i === -1 ? undefined : process.argv[i + 1]
  }
  const exportsRoot = get('--exports-root') || get('--root')
  if (!exportsRoot) {
    console.error('❌ Usage: pnpm tsx scripts/import-from-exports.ts --exports-root "Imports/exports" [--tenant <slug>] [--dry-run]')
    process.exit(1)
  }
  const tenant = get('--tenant')
  const dryRun = process.argv.includes('--dry-run') || process.argv.includes('--dryRun')
  return { exportsRoot, tenant, dryRun }
}

const { exportsRoot, tenant: ONLY_TENANT, dryRun: DRY_RUN } = parseArgs()
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

  // Point Payload to the config file (TS supported)
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const configPath = path.resolve(__dirname, '../src/payload.config.ts')
  if (!process.env.PAYLOAD_CONFIG_PATH) process.env.PAYLOAD_CONFIG_PATH = configPath

  try { await import('tsconfig-paths/register') } catch {}

  const { default: payloadConfig } = await import(pathToFileURL(configPath).href)
  await payload.init({ config: payloadConfig as any })

  console.log(`Connected to MongoDB – starting exports import${DRY_RUN ? ' (dry-run)' : ''}…`)

  /* ----------------------------- Helper utils ---------------------------- */
  const DEFAULTS = {
    facebook: 'https://www.facebook.com/cthousegop',
    instagram: 'https://www.instagram.com/cthousegop/',
    youtube: 'https://www.youtube.com/user/CTHouseRepublicans',
    x: 'https://x.com/cthousegop',
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

  const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v'])
  function invertName(name: string): string {
    const tokens = name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
    if (tokens.length === 0) return name
    const lastToken = tokens[tokens.length - 1]
    const rest = tokens.slice(0, -1)
    const lastLower = lastToken.replace(/\./g, '').toLowerCase()
    const isSuffix = SUFFIXES.has(lastLower)
    if (isSuffix && rest.length) {
      const trueLast = rest[rest.length - 1]
      return `${trueLast}, ${rest.slice(0, -1).join(' ')} ${lastToken}`.trim()
    }
    return `${lastToken}, ${rest.join(' ')}`.trim().replace(/,\s*$/, '')
  }

  function lastNameFrom(name: string): string {
    const tokens = name.trim().split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return name
    return tokens[tokens.length - 1]
  }

  function toArray<T>(v: T | T[] | undefined | null): T[] {
    if (Array.isArray(v)) return v.filter(Boolean) as T[]
    if (v == null) return []
    return [v]
  }

  // Read a JSON file and strip a UTF-8 BOM if present
  function readJSONFile<T = any>(p: string): T {
    const raw = fs.readFileSync(p, 'utf8')
    const clean = raw.replace(/^\uFEFF/, '')
    return JSON.parse(clean)
  }

  async function upsertTaxonomy(collection: 'authors' | 'categories' | 'tags', where: Record<string, any>, data: Record<string, any>): Promise<string> {
    const existing = await payload.find({ collection, where, limit: 1 })
    if (existing.totalDocs) return existing.docs[0].id as string
    if (DRY_RUN) {
      console.log(`· dry-run: would create ${collection}`, data)
      return 'dry-run-id'
    }
    const created = await payload.create({ collection, data })
    return created.id as string
  }

  async function uploadMediaFromUrl(opts: {
    url: string
    tenantId: string
    tenantSlug: string
    alt: string
  }): Promise<{ id: string; url?: string } | undefined> {
    try {
      const res = await fetch(opts.url)
      if (!res.ok) {
        console.warn(`⚠ media: download failed ${res.status} ${opts.url}`)
        return undefined
      }
      const ab = await res.arrayBuffer()
      const buffer = Buffer.from(ab)
      const size = buffer.length
      const contentType = res.headers.get('content-type') || 'application/octet-stream'
      const parsed = new URL(opts.url)
      const base = path.basename(parsed.pathname || 'image').split('?')[0]
      const prefix = `${opts.tenantSlug}/`
      const filename = `WP${opts.tenantSlug}-${base}`

      if (DRY_RUN) {
        console.log(`· dry-run: would upload media`, { url: opts.url, prefix, filename, contentType, size })
        return { id: 'dry-run-id', url: `${process.env.R2_PUBLIC_BASE_URL || ''}${prefix}${filename}` }
      }

      const created = await payload.create({
        collection: 'media',
        file: {
          data: buffer,
          prefix,
          name: filename,
          filename,
          size,
          mimeType: contentType,
          mimetype: contentType,
        } as any,
        data: {
          alt: opts.alt || filename,
          tenant: opts.tenantId,
        },
        overrideAccess: true,
      })

      const mediaUrl = (created as any)?.url as string | undefined
      if (!mediaUrl) console.warn(`⚠ media: created without url (check R2_PUBLIC_BASE_URL) id=${created.id}`)
      return { id: created.id as string, url: mediaUrl }
    } catch (e: any) {
      console.warn(`⚠ media: exception for ${opts.url}: ${e?.message || e}`)
      return undefined
    }
  }

  async function upsertTenantAndGetId(siteUrl: string, logoName: string): Promise<{ id: string; slug: string; invertedName: string }> {
    const slug = parseTenantSlugFromUrl(siteUrl)
    const invertedName = invertName(logoName)
    const existing = await payload.find({ collection: 'tenants', where: { slug: { equals: slug } }, limit: 1 })
    if (existing.totalDocs) {
      const id = existing.docs[0].id as string
      if (!DRY_RUN) await payload.update({ collection: 'tenants', id, data: { name: invertedName } })
      else console.log(`· dry-run: would update tenant name id=${id} name=${invertedName}`)
      return { id, slug, invertedName }
    }
    if (DRY_RUN) {
      console.log(`· dry-run: would create tenant`, { name: invertedName, slug })
      return { id: 'dry-run-id', slug, invertedName }
    }
    const created = await payload.create({ collection: 'tenants', data: { name: invertedName, slug } })
    return { id: created.id as string, slug, invertedName }
  }

  function extractFromCustomizer(customizer: any) {
    const mods = customizer?.theme_mods || {}
    const media = customizer?.media || {}
    return {
      siteUrl: customizer?.site_url as string,
      logoName: mods.logo_name as string | undefined,
      logoHead: mods.logo_head as string | undefined,
      logoText: mods.logo_text as string | undefined,
      towns: (mods.towns as string | undefined) || '',
      facebook: (mods.facebook_link as string | undefined) || '',
      instagram: (mods.instagram as string | undefined) || '',
      youtube: (mods.you_tube as string | undefined) || (mods.youtube as string | undefined) || '',
      x: (mods.twitter_link as string | undefined) || '',
      flickrURL: (mods.flickr_link as string | undefined) || '',
      flickrText: (mods.flickr_text as string | undefined) || '',
      bannerImageUrl: (mods.main_img as string | undefined) || '',
      socialImgUrl: (mods.social_img as string | undefined) || '',
      mobileHeadshotUrl: (media?.social_img_id?.url as string | undefined) || '',
    }
  }

  function buildRepInfoData(ex: ReturnType<typeof extractFromCustomizer>) {
    const officeTitle = ex.logoHead?.trim() || 'State Representative'
    const name = ex.logoName?.trim() || ''
    const districtNumber = (() => {
      const m = (ex.logoText || '').match(/(\d+)/)
      return m ? parseInt(m[1], 10) : undefined
    })()
    const towns = (ex.towns || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .map((town) => ({ town }))

    const facebook = (ex.facebook && ex.facebook.trim()) || DEFAULTS.facebook
    const instagram = (ex.instagram && ex.instagram.trim()) || DEFAULTS.instagram
    const youtube = (ex.youtube && ex.youtube.trim()) || DEFAULTS.youtube
    const x = (ex.x && ex.x.trim()) || DEFAULTS.x

    const flickrURL = ex.flickrURL?.trim() || ''
    const flickrTag = (ex.flickrText?.trim() || lastNameFrom(name)) || ''

    const data: any = { officeTitle, name, towns, facebook, instagram, youtube, x, flickrURL, flickrTag }
    if (typeof districtNumber === 'number' && !Number.isNaN(districtNumber)) data.districtNumber = districtNumber
    return data
  }

  async function upsertRepInfo(tenantId: string, data: any) {
    // Try to find within this tenant. If not supported, fallback to name match.
    let existing: any
    try {
      existing = await payload.find({ collection: 'rep-info', where: { tenant: { equals: tenantId } }, limit: 1, overrideAccess: true as any })
    } catch {
      existing = await payload.find({ collection: 'rep-info', where: { name: { equals: data.name } }, limit: 1, overrideAccess: true as any })
    }
    if (existing.totalDocs) {
      const id = existing.docs[0].id as string
      if (DRY_RUN) return console.log(`· dry-run: would update RepInfo id=${id}`, data)
      await payload.update({ collection: 'rep-info', id, data: { ...data, tenant: tenantId }, overrideAccess: true })
      return
    }
    if (DRY_RUN) return console.log(`· dry-run: would create RepInfo`, data)
    await payload.create({ collection: 'rep-info', data: { ...data, tenant: tenantId }, overrideAccess: true })
  }

  async function upsertStandardMedia(tenantId: string, tenantSlug: string, ex: ReturnType<typeof extractFromCustomizer>) {
    // Required images: bannerImageUrl, socialImgUrl, mobileHeadshotUrl (no fallback for mobileHeadshot)
    if (!ex.bannerImageUrl || !ex.socialImgUrl || !ex.mobileHeadshotUrl) {
      console.warn(`⚠ standard-media: missing required images for tenant ${tenantSlug}. Skipping.`)
      return
    }

    const banner = await uploadMediaFromUrl({ url: ex.bannerImageUrl, tenantId, tenantSlug, alt: `${tenantSlug}-banner` })
    const featured = await uploadMediaFromUrl({ url: ex.socialImgUrl, tenantId, tenantSlug, alt: `${tenantSlug}-social` })
    const headshot = await uploadMediaFromUrl({ url: ex.mobileHeadshotUrl, tenantId, tenantSlug, alt: `${tenantSlug}-headshot` })

    if (!banner?.id || !featured?.id || !headshot?.id) {
      console.warn(`⚠ standard-media: one or more uploads failed for tenant ${tenantSlug}. Skipping.`)
      return
    }

    let existing: any
    try {
      existing = await payload.find({ collection: 'standard-media', where: { tenant: { equals: tenantId } }, limit: 1, overrideAccess: true as any })
    } catch {
      existing = await payload.find({ collection: 'standard-media', limit: 1, overrideAccess: true as any })
    }

    const data = {
      title: 'Images and Videos',
      bannerImage: banner.id,
      defaultFeaturedImage: featured.id,
      mobileHeadshot: headshot.id,
      tenant: tenantId,
    }

    if (existing.totalDocs) {
      const id = existing.docs[0].id as string
      if (DRY_RUN) return console.log(`· dry-run: would update StandardMedia id=${id}`, data)
      await payload.update({ collection: 'standard-media', id, data, overrideAccess: true })
      return
    }
    if (DRY_RUN) return console.log(`· dry-run: would create StandardMedia`, data)
    await payload.create({ collection: 'standard-media', data, overrideAccess: true })
  }

  async function importPostsFromJson(tenantId: string, tenantSlug: string, postsPath: string) {
    let posts: any[] = []
    try { posts = readJSONFile(postsPath) } catch (e) { console.error(`❌ Unable to parse JSON: ${postsPath}`); return }

    const uploadedCache = new Map<string, { id: string; url?: string }>()
    let createdCount = 0, updatedCount = 0, errorCount = 0
    let uploadsAttempted = 0, uploadsSucceeded = 0

    // Ensure we process oldest -> newest so createdAt order mirrors publish order
    posts.sort((a, b) => {
      const da = Date.parse(a?.date_gmt || a?.date || 0) || 0
      const db = Date.parse(b?.date_gmt || b?.date || 0) || 0
      return da - db
    })

    for (const p of posts) {
      try {
        if (p.type !== 'post') continue

        const rawTitle = String(p?.title?.rendered || '').trim()
        let slug = String(p?.slug || '').trim()
        if (!slug) slug = slugify(rawTitle || (p?.id ? `post-${p.id}` : `post-${Date.now()}`), { lower: true })
        const title = rawTitle || slug
        const status = p?.status === 'publish' ? 'published' : 'draft'
        const publishedAt = p?.date_gmt ? new Date(p.date_gmt + 'Z') : undefined
        const excerpt = String(p?.excerpt?.rendered || '')
        const content = String(p?.content?.rendered || '')

        // Author
        const authorObj = toArray(p?._embedded?.author)[0]
        const authorLogin = String(authorObj?.slug || 'unknown')
        const authorName = String(authorObj?.name || authorLogin)
        const authorId = await upsertTaxonomy('authors', { login: { equals: authorLogin } }, { login: authorLogin, name: authorName })

        // Categories & tags
        const catIds: string[] = []
        const tagIds: string[] = []
        const termGroups = toArray(p?._embedded?.['wp:term'])
        for (const group of termGroups) {
          for (const t of toArray(group)) {
            if (t?.taxonomy === 'category') {
              const id = await upsertTaxonomy('categories', { slug: { equals: t.slug } }, { slug: t.slug, title: t.name })
              catIds.push(id)
            } else if (t?.taxonomy === 'post_tag') {
              const id = await upsertTaxonomy('tags', { slug: { equals: t.slug } }, { slug: t.slug, title: t.name })
              tagIds.push(id)
            }
          }
        }

        // Featured image
        let featuredImageId: string | undefined
        let featuredImageUrl: string | undefined
        const mediaObj = toArray(p?._embedded?.['wp:featuredmedia'])[0]
        const mediaUrl = mediaObj?.source_url || mediaObj?.media_details?.sizes?.full?.source_url || mediaObj?.guid?.rendered
        if (mediaUrl) {
          if (uploadedCache.has(mediaUrl)) {
            const cached = uploadedCache.get(mediaUrl)!
            featuredImageId = cached.id
            featuredImageUrl = cached.url
          } else {
            uploadsAttempted++
            if (uploadsAttempted <= 3) console.log(`⤴ Uploading media for slug:${slug} url:${mediaUrl}`)
            const media = await uploadMediaFromUrl({ url: mediaUrl, tenantId, tenantSlug, alt: title || slug })
            if (media) {
              featuredImageId = media.id
              featuredImageUrl = media.url
              uploadedCache.set(mediaUrl, media)
              uploadsSucceeded++
            }
          }
        }

        // Upsert post (by slug)
        const existing = await payload.find({ collection: 'wordpress-posts', where: { slug: { equals: slug } }, limit: 1 })
        const data: any = {
          title, slug, status, publishedAt, excerpt, content,
          categories: catIds, tags: tagIds, author: authorId,
          featuredImageUrl,
          tenant: tenantId,
        }
        if (featuredImageId) data.featuredImage = featuredImageId

        if (existing.totalDocs) {
          const id = existing.docs[0].id as string
          if (DRY_RUN) console.log(`· dry-run: would update post ${slug}`)
          else await payload.update({ collection: 'wordpress-posts', id, data })
          updatedCount++
        } else {
          if (DRY_RUN) console.log(`· dry-run: would create post ${slug}`)
          else await payload.create({ collection: 'wordpress-posts', data })
          createdCount++
        }
      } catch (e: any) {
        errorCount++
        console.warn(`✖ Error importing post: ${e?.message || e}`)
      }
    }

    console.log(`Posts: Created ${createdCount}, Updated ${updatedCount}, Errors ${errorCount}. Uploads attempted ${uploadsAttempted}, succeeded ${uploadsSucceeded}.`)
  }

  /* ------------------------------- Runner ------------------------------- */
  const entries = fs.readdirSync(absRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)

  const targets = ONLY_TENANT
    ? entries.filter((folder) => {
        // match by slug contained in folder name, e.g., "13-Devin-Carney" contains slug "carney"
        return folder.toLowerCase().includes(String(ONLY_TENANT).toLowerCase())
      })
    : entries

  if (!targets.length) {
    console.warn('ℹ No tenant folders matched the filter. Nothing to do.')
    process.exit(0)
  }

  for (const folder of targets) {
    try {
      const customizerPath = path.join(absRoot, folder, 'customizer.json')
      const postsPath = path.join(absRoot, folder, 'posts.json')
      if (!fs.existsSync(customizerPath)) {
        console.warn(`⚠ Skipping ${folder}: missing customizer.json`)
        continue
      }
      if (!fs.existsSync(postsPath)) {
        console.warn(`⚠ Skipping ${folder}: missing posts.json`)
        continue
      }

      const customizer = readJSONFile(customizerPath)
      const ex = extractFromCustomizer(customizer)
      if (!ex.siteUrl || !ex.logoName) {
        console.warn(`⚠ Skipping ${folder}: missing site_url or logo_name in customizer.json`)
        continue
      }

      const { id: tenantId, slug: tenantSlug, invertedName } = await upsertTenantAndGetId(ex.siteUrl, ex.logoName)
      console.log(`\n• Processing tenant ${tenantSlug} (${invertedName}) from folder ${folder}`)

      await upsertRepInfo(tenantId, buildRepInfoData(ex))
      await upsertStandardMedia(tenantId, tenantSlug, ex)
      await importPostsFromJson(tenantId, tenantSlug, postsPath)
    } catch (e: any) {
      console.warn(`✖ Error processing folder ${folder}: ${e?.message || e}`)
    }
  }

  console.log('\n✅ Finished Exports import.')
  process.exit(0)
})()
