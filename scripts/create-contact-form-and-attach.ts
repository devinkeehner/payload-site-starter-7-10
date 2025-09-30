/**
 * Upsert a tenant-scoped "Contact Form" across one or all tenants, ensure image-select media
 * exists per tenant (download from CDN and upload if missing), and attach the form as a
 * formBlock to the /contact Page.
 *
 * Usage:
 *  pnpm tsx scripts/create-contact-form-and-attach.ts [--tenant <slug>] [--dry-run]
 */

import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import https from 'node:https'
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

  console.log(`Connected to MongoDB – upserting Contact Form and attaching to /contact${DRY_RUN ? ' (dry-run)' : ''}…`)

  // Known option set with canonical CDN URLs
  type IssueOpt = { label: string; value: string; filename: string; url: string; alt: string }
  const CDN = 'https://media.cthousegop.com'
  const ISSUE_OPTIONS: IssueOpt[] = [
    { label: 'Budget & Taxes', value: 'Budget & Taxes', filename: 'Calculator and graphs.png', url: `${CDN}/Calculator and graphs.png`, alt: 'Calculator and graphs' },
    { label: 'Transportation', value: 'Transportation', filename: '2.png', url: `${CDN}/2.png`, alt: 'Cars' },
    { label: 'Veterans', value: 'Veterans', filename: '3.png', url: `${CDN}/3.png`, alt: 'Veteran with prosthetic arm' },
    { label: 'Mental Health & Addiction Services', value: 'Mental Health & Addiction Services', filename: '5.png', url: `${CDN}/5.png`, alt: 'Group therapy circle' },
    { label: ' Jobs & Economy', value: ' Jobs & Economy', filename: '6.png', url: `${CDN}/6.png`, alt: 'Construction' },
    { label: 'Education', value: 'Education', filename: '7-1.png', url: `${CDN}/7-1.png`, alt: 'Stack of books with an apple on it' },
    { label: 'Seniors', value: 'Seniors', filename: '8.png', url: `${CDN}/8.png`, alt: 'Senior citizens talking' },
    { label: 'Environment', value: 'Environment', filename: '9.png', url: `${CDN}/9.png`, alt: 'Close up of hands around a sprouting plant' },
  ]

  async function downloadToBuffer(rawUrl: string): Promise<{ buffer: Buffer; mimeType: string; filename: string } | undefined> {
    return await new Promise((resolve) => {
      try {
        const base = (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '')
        let urlStr = rawUrl.trim()
        // Prefix relative URLs with base
        if (!/^https?:\/\//i.test(urlStr)) {
          if (!base) {
            console.warn(`· warn: cannot resolve relative URL without R2_PUBLIC_BASE_URL: ${rawUrl}`)
            resolve(undefined)
            return
          }
          urlStr = `${base}/${urlStr.replace(/^\.?\/?/, '')}`
        }
        // Collapse any '/./' segments
        urlStr = urlStr.replace(/\/\.\//g, '/')
        // Ensure spaces and other chars are encoded
        const safeUrl = encodeURI(urlStr)
        const u = new URL(safeUrl)
        const filename = decodeURIComponent(u.pathname.split('/').pop() || 'file')
        const req = https.get(safeUrl, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            // Follow redirects
            downloadToBuffer(res.headers.location).then(resolve)
            return
          }
          if (res.statusCode !== 200) {
            console.warn(`· warn: download ${safeUrl} failed with status ${res.statusCode}`)
            resolve(undefined)
            return
          }
          const chunks: Buffer[] = []
          res.on('data', (d) => chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(d)))
          res.on('end', () => {
            const buffer = Buffer.concat(chunks)
            const mimeType = res.headers['content-type'] || 'application/octet-stream'
            resolve({ buffer, mimeType: String(mimeType), filename })
          })
        })
        req.on('error', () => resolve(undefined))
      } catch {
        resolve(undefined)
      }
    })
  }

  async function findAnyMediaByAlt(alt: string): Promise<any | undefined> {
    const res = await payload.find({ collection: 'media', where: { alt: { equals: alt } }, limit: 1, overrideAccess: true as any })
    return res.totalDocs ? res.docs[0] : undefined
  }

  async function ensureMedia(tenantId: string, opt: IssueOpt): Promise<string | undefined> {
    // Try to find existing by alt + tenant; alt values are distinct per option
    const found = await payload.find({ collection: 'media', where: { alt: { equals: opt.alt }, tenant: { equals: tenantId } }, limit: 1, overrideAccess: true as any })
    if (found.totalDocs) return found.docs[0].id as string
    if (DRY_RUN) { console.log(`· dry-run: would upload media '${opt.filename}' for tenant`); return undefined }

    // Prefer downloading from an existing media doc's URL (already on CDN with correct key)
    const source = await findAnyMediaByAlt(opt.alt)
    const srcUrl = (source as any)?.url || opt.url
    const downloaded = await downloadToBuffer(srcUrl)
    if (!downloaded) { console.warn(`· warn: failed to download ${srcUrl}`); return undefined }

    const created = await payload.create({
      collection: 'media',
      data: { alt: opt.alt, tenant: tenantId },
      file: {
        data: downloaded.buffer,
        mimetype: downloaded.mimeType,
        name: downloaded.filename,
        size: downloaded.buffer.length,
      } as any,
      overrideAccess: true,
      context: { disableRevalidate: true } as any,
    })
    return (created as any).id as string
  }

  // Minimal Lexical doc builders
  function rtCenteredParagraph(text: string) {
    return {
      root: {
        type: 'root',
        children: [
          { type: 'paragraph', direction: 'ltr', format: 'center', indent: 0, version: 1, children: [ { type: 'text', text, version: 1, detail: 0, format: 0, mode: 'normal', style: '' } ] },
          { type: 'paragraph', direction: 'ltr', format: '', indent: 0, version: 1, children: [] },
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
      },
    }
  }

  const CONTACT_FORM_TITLE = 'Contact Form'

  async function upsertContactForm(tenantId: string, tenantName: string) {
    // Ensure all option media exist for this tenant
    const mediaIDs: Record<string, string | undefined> = {}
    for (const opt of ISSUE_OPTIONS) {
      mediaIDs[opt.value] = await ensureMedia(tenantId, opt)
    }

    const existing = await payload.find({ collection: 'forms', where: { title: { equals: CONTACT_FORM_TITLE }, tenant: { equals: tenantId } }, limit: 1, overrideAccess: true as any })

    const options = ISSUE_OPTIONS.map((opt) => ({ label: opt.label, value: opt.value, image: mediaIDs[opt.value] }))

    const formData: any = {
      tenant: tenantId,
      title: CONTACT_FORM_TITLE,
      fields: [
        { blockType: 'text', name: 'firstname', label: 'First', width: 40, required: true },
        { blockType: 'text', name: 'lastname', label: 'Last', width: 60, required: true },
        { blockType: 'email', name: 'email', label: 'Email', width: 40, required: true },
        { blockType: 'number', name: 'mobile', label: 'Mobile', width: 60 },
        { blockType: 'text', name: 'address', label: 'Address', width: 100 },
        { blockType: 'image-select', name: 'issues', label: 'What Issues Matter to You?', allowMultiple: true, options },
        { blockType: 'textarea', name: 'other', label: 'Other' },
      ],
      submitButtonLabel: 'Submit',
      confirmationType: 'message',
      confirmationMessage: rtCenteredParagraph(`Thank you for contacting Representative ${tenantName}'s office.\nYou will hear back from us shortly.`),
      emails: [],
    }

    if (existing.totalDocs) {
      const id = existing.docs[0].id as string
      if (DRY_RUN) { console.log(`· dry-run: would update Contact Form id=${id}`); return id }
      const updated = await payload.update({ collection: 'forms', id, data: formData, overrideAccess: true, context: { disableRevalidate: true } as any })
      console.log(`· updated Contact Form id=${(updated as any).id}`)
      return (updated as any).id as string
    }

    if (DRY_RUN) { console.log('· dry-run: would create Contact Form'); return undefined }
    const created = await payload.create({ collection: 'forms', data: formData, overrideAccess: true, context: { disableRevalidate: true } as any })
    console.log(`· created Contact Form id=${(created as any).id}`)
    return (created as any).id as string
  }

  async function attachFormToContactPage(tenantId: string, formId: string) {
    const pageRes = await payload.find({ collection: 'pages', where: { slug: { equals: 'contact' }, tenant: { equals: tenantId } }, limit: 1, overrideAccess: true as any })
    if (!pageRes.totalDocs) { console.warn('· warn: /contact page not found'); return }
    const page = pageRes.docs[0] as any

    // If a formBlock already exists that references this form, skip
    const layout: any[] = Array.isArray(page.layout) ? [...page.layout] : []
    const already = layout.some((b) => b?.blockType === 'formBlock' && (typeof b.form === 'string' ? b.form === formId : b.form?.id === formId))
    if (already) { console.log('· /contact already has this formBlock'); return }

    layout.push({ blockType: 'formBlock', form: formId })

    if (DRY_RUN) { console.log('· dry-run: would update /contact to include formBlock'); return }
    await payload.update({ collection: 'pages', id: page.id, data: { layout }, overrideAccess: true, context: { disableRevalidate: true } as any })
    console.log('· attached formBlock to /contact')
  }

  // Iterate tenants
  const PAGE_SIZE = 100
  let pageNum = 1
  let count = 0
  while (true) {
    const where = ONLY_TENANT ? { slug: { equals: ONLY_TENANT } } : undefined
    const res = await payload.find({ collection: 'tenants', where: where as any, limit: PAGE_SIZE, page: pageNum, overrideAccess: true as any })
    if (!res.docs.length) break

    for (const t of res.docs as any[]) {
      const tenantId = t.id as string
      const tenantSlug = t.slug as string
      const tenantName = t.name as string
      console.log(`\n• Processing tenant ${tenantSlug}`)
      const formId = await upsertContactForm(tenantId, tenantName)
      if (formId) await attachFormToContactPage(tenantId, formId)
      count++
    }

    if (!res.hasNextPage || pageNum * PAGE_SIZE >= res.totalDocs) break
    pageNum++
  }

  console.log(`\n✅ Finished upserting Contact Form and attaching to /contact for ${count} tenant(s).`)
  process.exit(0)
})().catch((e) => { console.error(e); process.exit(1) })
