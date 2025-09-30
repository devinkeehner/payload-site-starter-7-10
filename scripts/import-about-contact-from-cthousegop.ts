/**
 * Import About and Contact page content from HTML files exported under Imports/cthousegop.com/<tenant>/
 *
 * - Contact: extract top description from Gravity Forms container (class "gform_description")
 *   and PREPEND it to the Contact page's layout as a richTextBlock.
 * - About: extract plain text from HTML and REPLACE the About page's layout with a richTextBlock.
 *
 * Filename heuristics:
 * - Contact filenames may be: contact.html, contact-me.html, contact-<name>.html, etc.
 *   We prefer any file whose name includes "contact" OR whose contents include "gform_description".
 * - About filenames may be: about.html, about-me.html, about-<name>.html, or bio/biography variants.
 *
 * Usage:
 *  pnpm tsx scripts/import-about-contact-from-cthousegop.ts [--root "Imports/cthousegop.com"] [--tenant <slug>] [--dry-run]
 */

import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import payload from 'payload'

interface CliOpts { root: string; tenant?: string; dryRun: boolean }
function parseArgs(): CliOpts {
  const get = (flag: string) => { const i = process.argv.findIndex((a) => a === flag); return i === -1 ? undefined : process.argv[i + 1] }
  const root = get('--root') || 'Imports/cthousegop.com'
  const tenant = get('--tenant')
  const dryRun = process.argv.includes('--dry-run') || process.argv.includes('--dryRun')
  return { root, tenant, dryRun }
}
const { root: ROOT, tenant: ONLY_TENANT, dryRun: DRY_RUN } = parseArgs()

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

  const absRoot = path.isAbsolute(ROOT) ? ROOT : path.join(process.cwd(), ROOT)
  if (!fs.existsSync(absRoot)) {
    console.error(`❌ Source root not found: ${absRoot}`)
    process.exit(1)
  }

  console.log(`Connected – importing About/Contact content from ${absRoot}${DRY_RUN ? ' (dry-run)' : ''}…`)

  // Utility: simple HTML -> text conversion (strip tags, decode common entities)
  function htmlToText(html: string): string {
    const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
    const withBreaks = withoutScripts
      .replace(/<\/(p|div|br|li|h[1-6])>/gi, '$&\n')
      .replace(/<li>/gi, '- ')
    const stripped = withBreaks.replace(/<[^>]+>/g, '')
    return decodeEntities(stripped)
  }
  function decodeEntities(text: string): string {
    return text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
  }

  // Build a Lexical doc with paragraphs split on blank lines
  function rtFromText(text: string) {
    const lines = text.split(/\r?\n/).map((l) => l.trim())
    const paras: any[] = []
    let buf: string[] = []
    const flush = () => {
      const t = buf.join(' ').trim()
      if (t) {
        paras.push({ type: 'paragraph', version: 1, children: [{ type: 'text', text: t, version: 1, detail: 0, format: 0, mode: 'normal', style: '' }] })
      }
      buf = []
    }
    for (const l of lines) {
      if (!l) flush()
      else buf.push(l)
    }
    flush()
    if (!paras.length) paras.push({ type: 'paragraph', version: 1, children: [{ type: 'text', text: '', version: 1 }] })
    return { root: { type: 'root', children: paras, direction: 'ltr', format: '', indent: 0, version: 1 } }
  }

  function findFiles(dir: string): string[] {
    try { return fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.html')) } catch { return [] }
  }
  function readFile(p: string): string | undefined {
    try { return fs.readFileSync(p, 'utf8') } catch { return undefined }
  }

  function pickContactFile(files: string[], contents: Record<string, string>): string | undefined {
    // Prefer files whose name contains 'contact'
    const nameHit = files.find((f) => /\bcontact\b/i.test(f.replace(/[-_]/g, ' ')))
    if (nameHit) return nameHit
    // Else any file that contains gform_description
    const contentHit = files.find((f) => /gform_description/i.test(contents[f] || ''))
    return contentHit
  }
  function extractGformDescription(html: string): string | undefined {
    // Try to capture inner HTML of element with class containing gform_description (supports ' or ")
    const m = html.match(/<([a-z0-9]+)([^>]*?)class=(['"]).*?gform_description.*?\3[^>]*>([\s\S]*?)<\/\1>/i)
    if (m && m[4]) return htmlToText(m[4])
    // Fallback: look for first element with id or class containing gform_description
    const m2 = html.match(/<([a-z0-9]+)([^>]*?)(id|class)=(['"]).*?gform_description.*?\4[^>]*>([\s\S]*?)<\/\1>/i)
    if (m2 && m2[5]) return htmlToText(m2[5])
    return undefined
  }

  function pickAboutFile(files: string[], contents: Record<string, string>): string | undefined {
    // Prefer files whose name includes about, about-me, about-<name>, biography, bio
    const patterns = [/\babout\b/i, /\babout-?me\b/i, /\bbio\b/i, /\bbiography\b/i]
    for (const pat of patterns) {
      const f = files.find((x) => pat.test(x.replace(/[-_]/g, ' ')))
      if (f) return f
    }
    // Fallback: the largest HTML file (likely the profile/about)
    const sorted = [...files].sort((a, b) => (contents[b]?.length || 0) - (contents[a]?.length || 0))
    return sorted[0]
  }

  async function getTenantId(slug: string): Promise<string | undefined> {
    const res = await payload.find({ collection: 'tenants', where: { slug: { equals: slug } }, limit: 1, overrideAccess: true as any })
    return res.totalDocs ? (res.docs[0].id as string) : undefined
  }

  async function updateContact(tenantId: string, contactText: string): Promise<void> {
    const pageRes = await payload.find({ collection: 'pages', where: { slug: { equals: 'contact' }, tenant: { equals: tenantId } }, limit: 1, overrideAccess: true as any })
    if (!pageRes.totalDocs) { console.warn('· warn: contact page not found'); return }
    const page = pageRes.docs[0] as any
    const layout: any[] = Array.isArray(page.layout) ? [...page.layout] : []
    const block = { blockType: 'richTextBlock', richText: rtFromText(contactText) }
    // Prepend block; avoid duplicating if already exists at top with same text
    const topText = JSON.stringify((layout[0] || {}).richText || {})
    const newText = JSON.stringify(block.richText)
    if (topText === newText) { console.log('· contact: top block already present'); return }
    layout.unshift(block)

    if (DRY_RUN) { console.log('· dry-run: would prepend contact richText block'); return }
    await payload.update({ collection: 'pages', id: page.id, data: { layout }, overrideAccess: true, context: { disableRevalidate: true } as any })
    console.log('· contact: prepended richText block')
  }

  async function updateAbout(tenantId: string, aboutText: string): Promise<void> {
    const pageRes = await payload.find({ collection: 'pages', where: { slug: { equals: 'about' }, tenant: { equals: tenantId } }, limit: 1, overrideAccess: true as any })
    if (!pageRes.totalDocs) { console.warn('· warn: about page not found'); return }
    const page = pageRes.docs[0] as any
    const layout: any[] = [{ blockType: 'richTextBlock', richText: rtFromText(aboutText) }]

    if (DRY_RUN) { console.log('· dry-run: would replace about layout with richText block'); return }
    await payload.update({ collection: 'pages', id: page.id, data: { layout }, overrideAccess: true, context: { disableRevalidate: true } as any })
    console.log('· about: replaced layout with richText block')
  }

  // Iterate tenant folders
  const folders = fs.readdirSync(absRoot, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  const targets = ONLY_TENANT ? folders.filter((f) => f.toLowerCase() === ONLY_TENANT.toLowerCase()) : folders

  for (const slug of targets) {
    const tenantId = await getTenantId(slug)
    if (!tenantId) { console.warn(`\n• ${slug}: tenant not found – skipping`); continue }
    console.log(`\n• Processing ${slug}`)

    const dir = path.join(absRoot, slug)
    const htmlFiles = findFiles(dir)
    if (!htmlFiles.length) { console.warn('  no HTML files found – skipping'); continue }

    const contents: Record<string, string> = {}
    for (const f of htmlFiles) { const p = path.join(dir, f); contents[f] = readFile(p) || '' }

    // Contact
    const contactFile = pickContactFile(htmlFiles, contents)
    if (contactFile) {
      const html = contents[contactFile]
      const desc = extractGformDescription(html)
      if (desc && desc.trim()) await updateContact(tenantId, desc.trim())
      else console.warn('  contact: gform_description not found in ' + contactFile)
    } else {
      console.warn('  contact: file not found')
    }

    // About
    const aboutFile = pickAboutFile(htmlFiles, contents)
    if (aboutFile) {
      const html = contents[aboutFile]
      const text = htmlToText(html).trim()
      if (text) await updateAbout(tenantId, text)
      else console.warn('  about: no text extracted from ' + aboutFile)
    } else {
      console.warn('  about: file not found')
    }
  }

  console.log('\n✅ Finished About/Contact import.')
  process.exit(0)
})().catch((e) => { console.error(e); process.exit(1) })
