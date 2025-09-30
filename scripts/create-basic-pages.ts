/**
 * Upsert basic Pages (About, Contact) for one or all tenants.
 *
 * Usage:
 *  pnpm tsx scripts/create-basic-pages.ts [--tenant <slug>] [--dry-run]
 */

import dotenv from 'dotenv'
import path from 'node:path'
import fs from 'node:fs'
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
  // Load env
  dotenv.config()
  const envLocalPath = path.resolve(process.cwd(), '.env.local')
  if (fs.existsSync(envLocalPath)) dotenv.config({ path: envLocalPath })

  // Prepare Payload config
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const configPath = path.resolve(__dirname, '../src/payload.config.ts')
  if (!process.env.PAYLOAD_CONFIG_PATH) process.env.PAYLOAD_CONFIG_PATH = configPath
  try { await import('tsconfig-paths/register') } catch {}

  const { default: payloadConfig } = await import(pathToFileURL(configPath).href)
  await payload.init({ config: payloadConfig as any })

  console.log(`Connected to MongoDB – creating About/Contact pages${DRY_RUN ? ' (dry-run)' : ''}…`)

  // Helper to create a minimal Lexical doc
  function rt(text: string) {
    return {
      root: {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            version: 1,
            children: [
              { type: 'text', text, version: 1 },
            ],
          },
        ],
        direction: null,
        format: 'left',
        indent: 0,
        version: 1,
      },
    }
  }

  async function upsertPage(tenantId: string, title: string, slug: string, body: string) {
    const existing = await payload.find({
      collection: 'pages',
      where: { slug: { equals: slug }, tenant: { equals: tenantId } },
      limit: 1,
      overrideAccess: true as any,
    })

    const data: any = {
      title,
      slug,
      layout: [
        { blockType: 'richTextBlock', richText: rt(body) },
      ],
      tenant: tenantId,
      _status: 'published',
    }

    if (existing.totalDocs) {
      const id = existing.docs[0].id as string
      if (DRY_RUN) {
        console.log(`· dry-run: would update Page id=${id} slug=/${slug}`)
        return id
      }
      const updated = await payload.update({
        collection: 'pages',
        id,
        data,
        overrideAccess: true,
        context: { disableRevalidate: true } as any,
      })
      return (updated as any).id as string
    }

    if (DRY_RUN) {
      console.log(`· dry-run: would create Page slug=/${slug}`)
      return undefined
    }

    const created = await payload.create({
      collection: 'pages',
      data,
      overrideAccess: true,
      context: { disableRevalidate: true } as any,
    })
    return (created as any).id as string
  }

  // Iterate tenants
  const PAGE_SIZE = 100
  let page = 1
  let processed = 0
  while (true) {
    const where = ONLY_TENANT ? { slug: { equals: ONLY_TENANT } } : undefined
    const res = await payload.find({ collection: 'tenants', where: where as any, limit: PAGE_SIZE, page, overrideAccess: true as any })
    if (!res.docs.length) break

    for (const t of res.docs as any[]) {
      const tenantId = t.id as string
      const slug = t.slug as string
      console.log(`\n• Processing tenant ${slug}`)

      await upsertPage(tenantId, 'About', 'about', 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Cras lacinia.')
      await upsertPage(tenantId, 'Contact', 'contact', 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed non risus.')
      processed++
    }

    if (!res.hasNextPage || page * PAGE_SIZE >= res.totalDocs) break
    page++
  }

  console.log(`\n✅ Finished creating About/Contact pages for ${processed} tenant(s).`)
  process.exit(0)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
