/**
 * Fetch the live Contact page for each tenant, extract the Gravity Forms description
 * (the element with class containing 'gform_description'), and replace ALL richText blocks
 * in the Payload '/contact' page with that text. If no richText blocks exist, prepend one.
 *
 * It tries common contact paths (contact, contact-me) and, if not found, scans the tenant
 * homepage for an anchor whose text or href contains 'contact'.
 *
 * Usage:
 *  pnpm tsx scripts/fix-contact-from-live.ts [--tenant <slug>] [--dry-run] [--base https://www.cthousegop.com]
 */

import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import https from 'node:https'
import payload from 'payload'

interface CliOpts { tenant?: string; dryRun: boolean; base: string }
function parseArgs(): CliOpts {
  const get = (flag: string) => { const i = process.argv.findIndex((a) => a === flag); return i === -1 ? undefined : process.argv[i + 1] }
  const tenant = get('--tenant')
  const dryRun = process.argv.includes('--dry-run') || process.argv.includes('--dryRun')
  const base = get('--base') || 'https://www.cthousegop.com'
  return { tenant, dryRun, base }
}
const { tenant: ONLY_TENANT, dryRun: DRY_RUN, base: BASE } = parseArgs()

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

  console.log(`Connected – fixing Contact pages from live (${BASE})${DRY_RUN ? ' (dry-run)' : ''}…`)

  function encodeUrl(u: string) { try { return encodeURI(u) } catch { return u } }

  function fetchUrl(raw: string): Promise<{ status: number; body: string } | undefined> {
    return new Promise((resolve) => {
      try {
        const safe = encodeUrl(raw)
        const req = https.get(safe, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            fetchUrl(res.headers.location).then(resolve)
            return
          }
          const status = res.statusCode || 0
          const chunks: Buffer[] = []
          res.on('data', (d) => chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(d)))
          res.on('end', () => resolve({ status, body: Buffer.concat(chunks).toString('utf8') }))
        })
        req.on('error', () => resolve(undefined))
      } catch {
        resolve(undefined)
      }
    })
  }

  function extractGformDescription(html: string): string | undefined {
    const m = html.match(/<([a-z0-9]+)([^>]*?)class=(['"]).*?gform_description.*?\3[^>]*>([\s\S]*?)<\/\1>/i)
    if (m && m[4]) return htmlToText(m[4])
    const m2 = html.match(/<([a-z0-9]+)([^>]*?)(id|class)=(['"]).*?gform_description.*?\4[^>]*>([\s\S]*?)<\/\1>/i)
    if (m2 && m2[5]) return htmlToText(m2[5])
    return undefined
  }

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

  async function findContactUrlForTenant(slug: string): Promise<string | undefined> {
    const base = `${BASE.replace(/\/$/, '')}/${slug}`
    const candidates = ['contact', 'contact/', 'contact-me', 'contact-me/', 'contact.html', 'contact-me.html']
    for (const c of candidates) {
      const url = `${base}/${c}`
      const res = await fetchUrl(url)
      if (res && res.status === 200 && /gform/i.test(res.body)) return url
    }
    // Fallback: scan homepage anchors for links containing 'contact'
    const home = await fetchUrl(`${base}/`)
    if (home && home.status === 200) {
      const anchorRegex = /<a\s+[^>]*href=(['"])([^'">]+)\1[^>]*>([\s\S]*?)<\/a>/gi
      let m: RegExpExecArray | null
      const links: { href: string; text: string }[] = []
      while ((m = anchorRegex.exec(home.body))) {
        links.push({ href: m[2], text: m[3].replace(/<[^>]+>/g, ' ') })
      }
      const cand = links.find((l) => /contact/i.test(l.text) || /contact/i.test(l.href))
      if (cand) {
        try {
          const u = new URL(cand.href, `${base}/`)
          if (u.pathname.toLowerCase().includes(`/${slug}/`) && !/\.pdf$/i.test(u.pathname)) {
            const url = u.toString()
            const res2 = await fetchUrl(url)
            if (res2 && res2.status === 200 && /gform/i.test(res2.body)) return url
          }
        } catch {}
      }
    }
    return undefined
  }

  async function replaceContactRichText(tenantId: string, text: string): Promise<{ replaced: number; added: boolean }> {
    const res = await payload.find({ collection: 'pages', where: { slug: { equals: 'contact' }, tenant: { equals: tenantId } }, limit: 1, overrideAccess: true as any })
    if (!res.totalDocs) { console.warn('· warn: contact page not found'); return { replaced: 0, added: false } }
    const page = res.docs[0] as any
    const newRT = rtFromText(text)

    const layout: any[] = Array.isArray(page.layout) ? [...page.layout] : []
    let replaced = 0
    const newLayout = layout.map((blk) => {
      if (blk?.blockType === 'richTextBlock') {
        replaced++
        return { ...blk, richText: newRT }
      }
      return blk
    })

    let added = false
    if (replaced === 0) {
      // Prepend a new block if none existed
      newLayout.unshift({ blockType: 'richTextBlock', richText: newRT })
      added = true
    }

    if (DRY_RUN) {
      console.log(`· dry-run: would ${replaced ? `replace ${replaced}` : 'add 1'} richText block(s) on contact`)
      return { replaced, added }
    }

    await payload.update({ collection: 'pages', id: page.id, data: { layout: newLayout }, overrideAccess: true, context: { disableRevalidate: true } as any })
    console.log(`· contact: ${replaced ? `replaced ${replaced}` : 'added 1'} richText block(s)`)
    return { replaced, added }
  }

  // Iterate tenants
  const PAGE_SIZE = 100
  let pageNum = 1
  const results: { slug: string; status: string }[] = []
  while (true) {
    const where = ONLY_TENANT ? { slug: { equals: ONLY_TENANT } } : undefined
    const tpage = await payload.find({ collection: 'tenants', where: where as any, limit: PAGE_SIZE, page: pageNum, overrideAccess: true as any })
    if (!tpage.docs.length) break

    for (const t of tpage.docs as any[]) {
      const slug = t.slug as string
      console.log(`\n• Processing ${slug}`)
      const url = await findContactUrlForTenant(slug)
      if (!url) { console.warn('  contact URL not found'); results.push({ slug, status: 'contact-url-not-found' }); continue }
      const res = await fetchUrl(url)
      if (!res || res.status !== 200) { console.warn(`  fetch failed (${res?.status || 'n/a'})`); results.push({ slug, status: 'fetch-failed' }); continue }
      const desc = extractGformDescription(res.body)
      if (!desc || !desc.trim()) { console.warn('  gform_description not found'); results.push({ slug, status: 'no-description' }); continue }

      await replaceContactRichText(t.id as string, desc.trim())
      results.push({ slug, status: 'updated' })
    }

    if (!tpage.hasNextPage || pageNum * PAGE_SIZE >= tpage.totalDocs) break
    pageNum++
  }

  const summary = results.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc }, {} as Record<string, number>)
  console.log(`\n✅ Done. Summary: ${JSON.stringify(summary)}\n`)
  if (Object.keys(summary).length) {
    results.filter(r => r.status !== 'updated').forEach((r) => console.log(` - ${r.slug}: ${r.status}`))
  }

  process.exit(0)
})().catch((e) => { console.error(e); process.exit(1) })
