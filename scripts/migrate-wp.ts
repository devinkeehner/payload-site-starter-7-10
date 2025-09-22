/**
 * WordPress WXR (XML) import script for Payload CMS using the Payload SDK (local mode).
 *
 * Usage:
 *   # run the script (adjust --file path and --tenant slug)
 *   npx ts-node --esm scripts/migrate-wp.ts \
 *     --file "Imports/staterepresentativevincentcandelora.WordPress.2025-07-14.xml" \
 *     --tenant candelora
 *
 * Env required:
 *   PAYLOAD_SECRET   – your Payload secret (same as .env)
 *   MONGODB_URI      – Mongo connection string
 */
import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

import slugify from 'slugify'
import { XMLParser } from 'fast-xml-parser'
import payload from 'payload'

/** ----------------------------- CLI ARGS ----------------------------- */
interface CliOpts { file: string; tenant: string; skipMedia: boolean }
function parseArgs(): CliOpts {
  const get = (flag: string) => {
    const i = process.argv.findIndex((a) => a === flag)
    return i === -1 ? undefined : process.argv[i + 1]
  }
  const file = get('--file')
  if (!file) {
    console.error('❌  Usage: ts-node --esm scripts/migrate-wp.ts --file <path-to-wxr.xml> [--tenant <slug>] [--skip-media]')
    process.exit(1)
  }
  const tenant = get('--tenant') || 'candelora'
  const skipMedia = process.argv.includes('--skip-media') || process.argv.includes('--skipMedia')
  return { file, tenant, skipMedia }
}

const { file: filePath, tenant: TENANT_SLUG, skipMedia: SKIP_MEDIA } = parseArgs()

const absPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath)
if (!fs.existsSync(absPath)) {
  console.error(`❌  File not found: ${absPath}`)
  process.exit(1)
}

/** ------------------------- Payload bootstrap ------------------------ */
;(async () => {
  // Load .env and .env.local explicitly
  dotenv.config()
  const envLocalPath = path.resolve(process.cwd(), '.env.local')
  if (fs.existsSync(envLocalPath)) dotenv.config({ path: envLocalPath })

  // Point Payload to the config file (TS is supported)
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const configPath = path.resolve(__dirname, '../src/payload.config.ts')
  if (!process.env.PAYLOAD_CONFIG_PATH) process.env.PAYLOAD_CONFIG_PATH = configPath

  // Ensure tsconfig path aliases like '@/...' resolve when importing the config
  try { await import('tsconfig-paths/register') } catch {}

  // Dynamically import the config and pass to Payload
  const { default: payloadConfig } = await import(pathToFileURL(configPath).href)
  await payload.init({ config: payloadConfig as any })

  console.log(`Connected to MongoDB – starting import for tenant "${TENANT_SLUG}"…`)

  /** ------------------------- Helpers --------------------------------- */
  async function getTenantIdBySlug(slug: string): Promise<string> {
    const res = await payload.find({ collection: 'tenants', where: { slug: { equals: slug } }, limit: 1 })
    if (!res.totalDocs) {
      console.error(`❌  Tenant with slug "${slug}" not found. Create it first in Admin UI.`)
      process.exit(1)
    }
    return res.docs[0].id as string
  }

  // Note: authors, categories, and tags are NOT site-enabled in multi-tenant config,
  // so they do not have a `tenant` field. Upsert them globally by their unique key.
  async function upsertTaxonomy(
    collection: 'authors' | 'categories' | 'tags',
    where: Record<string, any>,
    data: Record<string, any>,
  ): Promise<string> {
    const existing = await payload.find({ collection, where, limit: 1 })
    if (existing.totalDocs) return existing.docs[0].id as string
    const created = await payload.create({ collection, data })
    return created.id as string
  }

  function rewriteUrl(original?: string): string | undefined {
    if (!original) return undefined
    const lower = original.toLowerCase()
    const marker = '/candelora/'
    const idx = lower.indexOf(marker)
    const pathPart = idx === -1 ? new URL(original).pathname : original.slice(idx + marker.length)
    return `https://cthousegop.com/Candelora/${pathPart.replace(/^\/+/, '')}`
  }

  // Attempt to resolve a missing attachment URL via the source site's WP REST API
  // Uses WP_ORIGIN_URL env or defaults to https://cthousegop.com/Candelora
  async function resolveAttachmentUrlFromWP(attachId: string): Promise<string | undefined> {
    const base = (process.env.WP_ORIGIN_URL || 'https://cthousegop.com/Candelora').replace(/\/+$/, '')
    const apiUrl = `${base}/wp-json/wp/v2/media/${attachId}`
    try {
      const res = await fetch(apiUrl)
      if (!res.ok) return undefined
      const json: any = await res.json()
      const url = json?.source_url || json?.guid?.rendered
      return typeof url === 'string' ? url : undefined
    } catch {
      return undefined
    }
  }

  async function uploadMediaFromUrl(opts: {
    url: string
    tenantId: string
    tenantSlug: string
    alt: string
    attachId?: string
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
      const filename = `${opts.tenantSlug}${opts.attachId ? '-' + opts.attachId : ''}-${base}`

      let created
      try {
        created = await payload.create({
          collection: 'media',
          file: {
            data: buffer,
            // include both for maximum adapter compatibility
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
      } catch (err: any) {
        console.warn(`⚠ media: create failed for ${opts.url}: ${err?.message || err}`)
        if (err && err.stack) {
          console.warn(err.stack)
        }
        console.warn(`  ▶ debug file: filename=${filename} size=${size} contentType=${contentType}`)
        return undefined
      }

      // AfterRead hook should set absolute URL if R2_PUBLIC_BASE_URL is set
      const mediaUrl = (created as any)?.url as string | undefined
      if (!mediaUrl) {
        console.warn(`⚠ media: created without url (check R2_PUBLIC_BASE_URL) id=${created.id}`)
      }
      return { id: created.id as string, url: mediaUrl }
    } catch (e: any) {
      console.warn(`⚠ media: exception for ${opts.url}: ${e?.message || e}`)
      return undefined
    }
  }

  /** ------------------------- Parse XML ------------------------------- */
  const xml = fs.readFileSync(absPath, 'utf8')
  const parser = new XMLParser({ ignoreAttributes: false })
  const data = parser.parse(xml)
  const items: any[] = data?.rss?.channel?.item ?? []

  /* Build attachment map: id -> URL */
  const attachmentMap = new Map<string, string>()
  for (const item of items) {
    if (item['wp:post_type'] === 'attachment') {
      attachmentMap.set(String(item['wp:post_id']), String(item['wp:attachment_url']))
    }
  }

  /* Tenant */
  const tenantId = await getTenantIdBySlug(TENANT_SLUG)

  /** ------------------------- Main loop ------------------------------- */
  const uploadedCache = new Map<string, { id: string; url?: string }>() // attachId -> media
  let createdCount = 0
  let updatedCount = 0
  let errorCount = 0
  let postsWithThumb = 0
  let uploadsAttempted = 0
  let uploadsSucceeded = 0

  for (const item of items) {
    try {
      if (item['wp:post_type'] !== 'post') continue

      // Basic fields
      const title = item.title as string
      const slug = (item['wp:post_name'] as string) || slugify(title, { lower: true })
      const status = item['wp:status'] === 'publish' ? 'published' : 'draft'
      const publishedAtRaw = item['wp:post_date_gmt'] as string | undefined
      const publishedAt = publishedAtRaw ? new Date(publishedAtRaw + 'Z') : undefined
      const excerpt = ((item['excerpt:encoded'] as string) || '').trim()
      const content = item['content:encoded'] as string | undefined

      // Look up existing post early so we can avoid duplicate media uploads across runs
      const existing = await payload.find({ collection: 'wordpress-posts', where: { slug: { equals: slug } }, limit: 1 })

      // Author
      const authorLogin = (item['dc:creator'] as string) || 'unknown'
      const authorId = await upsertTaxonomy(
        'authors',
        { login: { equals: authorLogin } },
        { login: authorLogin, name: authorLogin },
      )

      // Categories & tags
      const catIds: string[] = []
      const tagIds: string[] = []
      const catNodes = Array.isArray(item.category) ? item.category : [item.category].filter(Boolean)
      for (const c of catNodes) {
        if (!c) continue
        const entry = { slug: c['@_nicename'], title: c['#text'] }
        const target = c['@_domain'] === 'category' ? 'categories' : 'tags'
        const id = await upsertTaxonomy(
          target,
          { slug: { equals: entry.slug } },
          entry,
        )
        target === 'categories' ? catIds.push(id) : tagIds.push(id)
      }

      // Featured image
      let featuredImageId: string | undefined
      let featuredImageUrl: string | undefined
      const metasNode = item['wp:postmeta']
      const metas = Array.isArray(metasNode) ? metasNode : metasNode ? [metasNode] : []
      const thumb = metas.find((m) => m['wp:meta_key'] === '_thumbnail_id')
      if (thumb) {
        postsWithThumb++
        const attachId = String(thumb['wp:meta_value'])
        const existingHasFeatured = existing.totalDocs ? Boolean((existing.docs[0] as any)?.featuredImage) : false
        let originalUrl = attachmentMap.get(attachId)
        if (!originalUrl && !SKIP_MEDIA) {
          const fallbackUrl = await resolveAttachmentUrlFromWP(attachId)
          if (fallbackUrl) {
            originalUrl = fallbackUrl
            if (uploadsAttempted <= 3) {
              console.log(`  ↳ Resolved featured image via WP REST for slug:${slug} attachId:${attachId} url:${fallbackUrl}`)
            }
          }
        }
        if (originalUrl && !SKIP_MEDIA && !existingHasFeatured) {
          if (uploadedCache.has(attachId)) {
            const cached = uploadedCache.get(attachId)!
            featuredImageId = cached.id
            featuredImageUrl = cached.url
          } else {
            uploadsAttempted++
            if (uploadsAttempted <= 3) {
              console.log(`⤴ Uploading media for slug:${slug} attachId:${attachId} url:${originalUrl}`)
            }
            const media = await uploadMediaFromUrl({
              url: originalUrl,
              tenantId,
              tenantSlug: TENANT_SLUG,
              alt: title || slug,
              attachId,
            })
            if (media) {
              featuredImageId = media.id
              featuredImageUrl = media.url
              uploadedCache.set(attachId, media)
              uploadsSucceeded++
            }
          }
        }
        if (!featuredImageUrl) {
          featuredImageUrl = rewriteUrl(originalUrl)
        }
      }

      const postData: any = {
        title,
        slug,
        status,
        publishedAt,
        excerpt,
        content,
        categories: catIds,
        tags: tagIds,
        author: authorId,
        featuredImageUrl,
        tenant: tenantId,
      }
      if (featuredImageId) postData.featuredImage = featuredImageId

      if (existing.totalDocs) {
        const id = existing.docs[0].id as string
        await payload.update({ collection: 'wordpress-posts', id, data: postData })
        updatedCount++
        console.log(`↺ Updated: ${title} (slug:${slug}) media=${featuredImageId ? 'yes' : 'no'}`)
      } else {
        await payload.create({ collection: 'wordpress-posts', data: postData })
        createdCount++
        console.log(`✔ Created: ${title} (slug:${slug}) media=${featuredImageId ? 'yes' : 'no'}`)
      }
    } catch (e: any) {
      errorCount++
      console.warn(`✖ Error: ${(item as any)?.title || 'unknown'} :: ${e?.message || e}`)
    }
  }

  console.log(`\n✅ Done! Created ${createdCount}, Updated ${updatedCount}, Errors ${errorCount}.`)
  console.log(`ℹ Thumbnails found: ${postsWithThumb}, Uploads attempted: ${uploadsAttempted}, Succeeded: ${uploadsSucceeded}`)
  process.exit(0)
})()
