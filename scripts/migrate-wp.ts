/**
 * WordPress WXR (XML) import script for Payload CMS.
 *
 * Usage:
 *   # install helpers once
 *   yarn add -D ts-node slugify fast-xml-parser
 *
 *   # run the script (adjust --file path if needed)
 *   npx ts-node --esm scripts/migrate-wp.ts --file "Imports/staterepresentativevincentcandelora.WordPress.2025-07-14.xml"
 *
 * Environment variables required:
 *   PAYLOAD_SECRET   – your Payload secret (same as .env)
 *   MONGODB_URI      – Mongo connection string
 */
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import slugify from 'slugify'
import { XMLParser } from 'fast-xml-parser'
import payload from 'payload'

/** ----------------------------- CLI ARGS ----------------------------- */
interface CliOpts { file: string }
function parseArgs(): CliOpts {
  const fileIdx = process.argv.findIndex((a) => a === '--file')
  if (fileIdx === -1 || !process.argv[fileIdx + 1]) {
    console.error('❌  Usage: ts-node migrate-wp.ts --file <path-to-wxr.xml>')
    process.exit(1)
  }
  return { file: process.argv[fileIdx + 1] }
}

const { file: filePath } = parseArgs()

const absPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath)
if (!fs.existsSync(absPath)) {
  console.error(`❌  File not found: ${absPath}`)
  process.exit(1)
}

/** ------------------------- Payload bootstrap ------------------------ */
(async () => {
  await payload.init({
    secret: process.env.PAYLOAD_SECRET,
    mongoURL: process.env.MONGODB_URI,
    local: true,
  });

  console.log('Connected to MongoDB – starting import…');

  /** ------------------------- Helpers --------------------------------- */
  async function getTenantIdBySlug(slug: string): Promise<string> {
  const res = await payload.find({ collection: 'tenants', where: { slug: { equals: slug } }, limit: 1 })
  if (!res.totalDocs) {
    console.error(`❌  Tenant with slug "${slug}" not found. Create it first in Admin UI.`)
    process.exit(1)
  }
  return res.docs[0].id as string
}

async function upsert(
  collection: string,
  where: Record<string, any>,
  data: Record<string, any>,
): Promise<string> {
  const existing = await payload.find({ collection, where, limit: 1 })
  if (existing.totalDocs) return existing.docs[0].id as string
  const created = await payload.create({ collection, data })
  return created.id as string
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
    attachmentMap.set(item['wp:post_id'], item['wp:attachment_url'])
  }
}

/* Tenant */
const TENANT_SLUG = 'Case'
const tenantId = await getTenantIdBySlug(TENANT_SLUG)

/** ------------------------- Main loop ------------------------------- */
for (const item of items) {
  if (item['wp:post_type'] !== 'post') continue

  // Authors
  const authorLogin = item['dc:creator'] || 'unknown'
  const authorId = await upsert(
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
    const id = await upsert(target, { slug: { equals: entry.slug } }, entry)
    target === 'categories' ? catIds.push(id) : tagIds.push(id)
  }

  // Featured image URL rewrite
  const metas = Array.isArray(item['wp:postmeta']) ? item['wp:postmeta'] : []
  const thumb = metas.find((m) => m['wp:meta_key'] === '_thumbnail_id')
  const featuredImageUrl = thumb ? rewriteUrl(attachmentMap.get(thumb['wp:meta_value'])) : undefined

  // Create wordpress-posts doc
  await payload.create({
    collection: 'wordpress-posts',
    data: {
      title: item.title,
      slug: item['wp:post_name'] || slugify(item.title, { lower: true }),
      status: item['wp:status'] === 'publish' ? 'published' : 'draft',
      publishedAt: new Date(item['wp:post_date_gmt'] + 'Z'),
      excerpt: (item['excerpt:encoded'] || '').trim(),
      content: item['content:encoded'],
      categories: catIds,
      tags: tagIds,
      author: authorId,
      featuredImageUrl,
      tenant: tenantId, // injected field by plugin; we manually set it here
    },
  })

  console.log(`✔ Imported: ${item.title}`)
}

console.log('\n✅  All done! Check your Admin UI.')
process.exit(0)
})();

/**
 * Replace WordPress attachment URL with our CDN base.
 * Keeps the path after the first "/candelora/" (case-insensitive).
 */
function rewriteUrl(original?: string): string | undefined {
  if (!original) return undefined
  const lower = original.toLowerCase()
  const marker = '/candelora/'
  const idx = lower.indexOf(marker)
  const pathPart = idx === -1 ? new URL(original).pathname : original.slice(idx + marker.length)
  return `https://cthousegop.com/Candelora/${pathPart.replace(/^\/+/, '')}`
}
