/**
 * Upsert a tenant-scoped "Sign Up For My Newsletter" form across one or all tenants.
 *
 * Usage:
 *  pnpm tsx scripts/create-newsletter-form.ts [--tenant <slug>] [--dry-run]
 */

import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import payload from 'payload'

interface CliOpts {
  tenant?: string
  dryRun: boolean
}

function parseArgs(): CliOpts {
  const get = (flag: string) => {
    const i = process.argv.findIndex((a) => a === flag)
    return i === -1 ? undefined : process.argv[i + 1]
  }
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

  console.log(`Connected to MongoDB – upserting Newsletter forms${DRY_RUN ? ' (dry-run)' : ''}…`)

  // Minimal Lexical doc
  function rtText(text: string) {
    return {
      root: {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            version: 1,
            children: [
              { type: 'text', text, version: 1, detail: 0, format: 0, mode: 'normal', style: '' },
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            textFormat: 0,
            textStyle: '',
          },
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
      },
    }
  }

  const FORM_TITLE = 'Sign Up For My Newsletter'

  async function upsertNewsletterForm(tenantId: string, tenantName: string, tenantSlug: string) {
    const existing = await payload.find({
      collection: 'forms',
      where: { title: { equals: FORM_TITLE }, tenant: { equals: tenantId } },
      limit: 1,
      overrideAccess: true as any,
    })

    const formData: any = {
      tenant: tenantId,
      title: FORM_TITLE,
      fields: [
        { blockType: 'email', name: 'email', label: 'Email', width: 100, required: true },
        { blockType: 'text', name: 'firstname', label: 'First', width: 40, defaultValue: '' },
        { blockType: 'text', name: 'lastname', label: 'Last', width: 60 },
        { blockType: 'number', name: 'mobile', label: 'Mobile', width: 65 },
        { blockType: 'text', name: 'zip', label: 'Zip', width: 35 },
      ],
      submitButtonLabel: 'Sign Up!',
      confirmationType: 'message',
      confirmationMessage: rtText('Thank you for signing up for my newsletter!'),
      emails: [],
    }

    if (existing.totalDocs) {
      const id = existing.docs[0].id as string
      if (DRY_RUN) {
        console.log(`· dry-run: would update Form id=${id} for tenant=${tenantSlug}`)
        return id
      }
      const updated = await payload.update({
        collection: 'forms',
        id,
        data: formData,
        overrideAccess: true,
        context: { disableRevalidate: true } as any,
      })
      console.log(`· updated Form id=${(updated as any).id} for tenant=${tenantSlug}`)
      return (updated as any).id as string
    }

    if (DRY_RUN) {
      console.log(`· dry-run: would create Form for tenant=${tenantSlug}`)
      return undefined
    }

    const created = await payload.create({
      collection: 'forms',
      data: formData,
      overrideAccess: true,
      context: { disableRevalidate: true } as any,
    })
    console.log(`· created Form id=${(created as any).id} for tenant=${tenantSlug}`)
    return (created as any).id as string
  }

  // Iterate tenants
  const PAGE_SIZE = 100
  let page = 1
  let count = 0
  while (true) {
    const where = ONLY_TENANT ? { slug: { equals: ONLY_TENANT } } : undefined
    const res = await payload.find({ collection: 'tenants', where: where as any, limit: PAGE_SIZE, page, overrideAccess: true as any })
    if (!res.docs.length) break

    for (const t of res.docs as any[]) {
      const tenantId = t.id as string
      const tenantSlug = t.slug as string
      const tenantName = t.name as string
      console.log(`\n• Processing tenant ${tenantSlug}`)
      await upsertNewsletterForm(tenantId, tenantName, tenantSlug)
      count++
    }

    if (!res.hasNextPage || page * PAGE_SIZE >= res.totalDocs) break
    page++
  }

  console.log(`\n✅ Finished upserting newsletter forms for ${count} tenant(s).`)
  process.exit(0)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
