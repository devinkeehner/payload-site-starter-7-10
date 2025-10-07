/**
 * Ensure every tenant's "Contact Form" has image-select options wired to tenant-scoped media.
 * Uploads images from Imports/contact images/ if missing, then upserts the Contact Form structure.
 *
 * Usage:
 *   pnpm tsx scripts/sync-contact-form-media.ts [--tenant <slug>] [--dry-run]
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

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const IMAGES_DIR = path.resolve(__dirname, '../Imports/contact images')

interface IssueMeta {
  label: string
  value: string
  alt: string
  search: string[]
  preferredFilename?: string
}

const ISSUE_OPTIONS: IssueMeta[] = [
  {
    label: 'Budget & Taxes',
    value: 'Budget & Taxes',
    alt: 'Calculator displaying the word taxes beside financial charts',
    search: ['budget', 'tax', 'calculator'],
    preferredFilename: 'budget-taxes.jpg',
  },
  {
    label: 'Transportation',
    value: 'Transportation',
    alt: 'Cars driving along a sunlit highway',
    search: ['transport', 'highway', 'cars'],
    preferredFilename: 'transportation-highway.jpg',
  },
  {
    label: 'Veterans',
    value: 'Veterans',
    alt: 'Counselor comforting a veteran during a support meeting',
    search: ['veteran', 'support'],
    preferredFilename: 'veterans-support.jpg',
  },
  {
    label: 'Mental Health & Addiction Services',
    value: 'Mental Health & Addiction Services',
    alt: 'Support group talking during a mental health session',
    search: ['mental', 'health', 'addiction', 'group'],
    preferredFilename: 'mental-health-group.jpg',
  },
  {
    label: ' Jobs & Economy',
    value: ' Jobs & Economy',
    alt: 'Construction worker wearing a hard hat at a job site',
    search: ['jobs', 'economy', 'construction'],
    preferredFilename: 'jobs-economy-construction.jpg',
  },
  {
    label: 'Education',
    value: 'Education',
    alt: 'Open book with a red apple resting on a stack of textbooks',
    search: ['education', 'apple', 'books'],
    preferredFilename: 'education-apple-books.jpg',
  },
  {
    label: 'Seniors',
    value: 'Seniors',
    alt: 'Group of smiling seniors talking together outdoors',
    search: ['senior', 'elder'],
    preferredFilename: 'seniors-talking.jpg',
  },
  {
    label: 'Environment',
    value: 'Environment',
    alt: 'Children hands surrounding a small plant sprouting from soil',
    search: ['environment', 'plant', 'hands'],
    preferredFilename: 'environment-hands-plant.jpg',
  },
]

interface AssetData {
  buffer: Buffer
  filename: string
  mimeType: string
}

function inferMime(filename: string): string {
  const ext = path.extname(filename).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  return 'application/octet-stream'
}

function buildAssetCache(): Map<string, AssetData> {
  const cache = new Map<string, AssetData>()
  if (!fs.existsSync(IMAGES_DIR)) {
    console.warn(`⚠ Images directory not found: ${IMAGES_DIR}`)
    return cache
  }

  const files = fs.readdirSync(IMAGES_DIR)
  const lowerFiles = files.map((name) => name.toLowerCase())

  for (const meta of ISSUE_OPTIONS) {
    let matchName: string | undefined
    if (meta.preferredFilename) {
      const idx = lowerFiles.indexOf(meta.preferredFilename.toLowerCase())
      if (idx !== -1) matchName = files[idx]
    }
    if (!matchName) {
      matchName = files.find((name) => {
        const lower = name.toLowerCase()
        return meta.search.some((term) => lower.includes(term))
      })
    }

    if (!matchName) {
      console.warn(`⚠ No image file found for option '${meta.label}'. Looked for terms: ${meta.search.join(', ')}`)
      continue
    }

    try {
      const filePath = path.join(IMAGES_DIR, matchName)
      const buffer = fs.readFileSync(filePath)
      cache.set(meta.value, {
        buffer,
        filename: matchName,
        mimeType: inferMime(matchName),
      })
    } catch (err: any) {
      console.warn(`⚠ Failed to read image '${matchName}': ${err?.message || err}`)
    }
  }

  return cache
}

const ASSET_CACHE = buildAssetCache()

;(async () => {
  dotenv.config()
  const envLocalPath = path.resolve(process.cwd(), '.env.local')
  if (fs.existsSync(envLocalPath)) dotenv.config({ path: envLocalPath })

  if (!process.env.PAYLOAD_CONFIG_PATH) {
    process.env.PAYLOAD_CONFIG_PATH = path.resolve(__dirname, '../src/payload.config.ts')
  }

  try {
    await import('tsconfig-paths/register')
  } catch {}

  const { default: payloadConfig } = await import(pathToFileURL(process.env.PAYLOAD_CONFIG_PATH).href)
  await payload.init({ config: payloadConfig as any })

  console.log(`Connected – syncing Contact Form media${DRY_RUN ? ' (dry-run)' : ''}…`)

  if (!ASSET_CACHE.size) {
    console.error('❌ No contact form images were loaded. Add files to Imports/contact images/ and retry.')
    process.exit(1)
  }

  async function ensureMedia(tenantId: string, tenantSlug: string, meta: IssueMeta): Promise<string | undefined> {
    const existing = await payload.find({
      collection: 'media',
      where: {
        and: [
          { alt: { equals: meta.alt } },
          { tenant: { equals: tenantId } },
        ],
      },
      limit: 1,
      overrideAccess: true as any,
    })
    if (existing.totalDocs) return existing.docs[0].id as string

    const asset = ASSET_CACHE.get(meta.value)
    if (!asset) {
      console.warn(`· warn: missing asset buffer for '${meta.label}'`)
      return undefined
    }

    if (DRY_RUN) {
      console.log(`· dry-run: would upload '${asset.filename}' for tenant ${tenantSlug}`)
      return undefined
    }

    const created = await payload.create({
      collection: 'media',
      data: { alt: meta.alt, tenant: tenantId },
      file: {
        data: asset.buffer,
        name: asset.filename,
        filename: asset.filename,
        size: asset.buffer.length,
        mimetype: asset.mimeType,
        mimeType: asset.mimeType,
        prefix: `${tenantSlug}/`,
      } as any,
      overrideAccess: true,
      context: { disableRevalidate: true } as any,
    })

    return created.id as string
  }

  function buildConfirmationMessage(tenantName: string) {
    const text = `Thank you for contacting Representative ${tenantName}'s office.\nYou will hear back from us shortly.`
    return {
      root: {
        type: 'root',
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
        children: [
          {
            type: 'paragraph',
            direction: 'ltr',
            format: 'center',
            indent: 0,
            version: 1,
            children: [
              {
                type: 'text',
                text,
                version: 1,
                detail: 0,
                format: 0,
                mode: 'normal',
                style: '',
              },
            ],
          },
          {
            type: 'paragraph',
            direction: 'ltr',
            format: '',
            indent: 0,
            version: 1,
            children: [],
          },
        ],
      },
    }
  }

  async function upsertContactForm(tenantId: string, tenantSlug: string, tenantName: string) {
    const mediaMap = new Map<string, string | undefined>()
    for (const meta of ISSUE_OPTIONS) {
      const id = await ensureMedia(tenantId, tenantSlug, meta)
      mediaMap.set(meta.value, id)
    }

    const options = ISSUE_OPTIONS.map((meta) => ({
      label: meta.label,
      value: meta.value,
      image: mediaMap.get(meta.value),
    }))

    const formData: any = {
      tenant: tenantId,
      title: 'Contact Form',
      fields: [
        { blockType: 'text', name: 'firstname', label: 'First', width: 40, required: true },
        { blockType: 'text', name: 'lastname', label: 'Last', width: 60, required: true },
        { blockType: 'email', name: 'email', label: 'Email', width: 40, required: true },
        { blockType: 'number', name: 'mobile', label: 'Mobile', width: 60 },
        { blockType: 'text', name: 'address', label: 'Address', width: 100 },
        {
          blockType: 'image-select',
          name: 'issues',
          label: 'What Issues Matter to You?',
          allowMultiple: true,
          options,
        },
        { blockType: 'textarea', name: 'other', label: 'Other' },
      ],
      submitButtonLabel: 'Submit',
      confirmationType: 'message',
      confirmationMessage: buildConfirmationMessage(tenantName),
      redirect: {},
      emails: [],
    }

    const existing = await payload.find({
      collection: 'forms',
      where: {
        and: [
          { title: { equals: 'Contact Form' } },
          { tenant: { equals: tenantId } },
        ],
      },
      limit: 1,
      overrideAccess: true as any,
    })

    if (existing.totalDocs) {
      const id = existing.docs[0].id as string
      if (DRY_RUN) {
        console.log(`· dry-run: would update Contact Form ${id}`)
        return
      }
      await payload.update({
        collection: 'forms',
        id,
        data: formData,
        overrideAccess: true,
        context: { disableRevalidate: true } as any,
      })
      console.log(`· updated Contact Form ${id}`)
      return
    }

    if (DRY_RUN) {
      console.log('· dry-run: would create Contact Form')
      return
    }

    const created = await payload.create({
      collection: 'forms',
      data: formData,
      overrideAccess: true,
      context: { disableRevalidate: true } as any,
    })
    console.log(`· created Contact Form ${(created as any).id}`)
  }

  const PAGE_SIZE = 100
  let page = 1
  let processed = 0

  while (true) {
    const where = ONLY_TENANT ? { slug: { equals: ONLY_TENANT } } : undefined
    const tenants = await payload.find({
      collection: 'tenants',
      where: where as any,
      limit: PAGE_SIZE,
      page,
      overrideAccess: true as any,
    })

    if (!tenants.docs.length) break

    for (const tenant of tenants.docs as any[]) {
      const tenantId = tenant.id as string
      const tenantSlug = tenant.slug as string
      const tenantName = tenant.name as string
      console.log(`\n• Processing tenant ${tenantSlug}`)
      await upsertContactForm(tenantId, tenantSlug, tenantName)
      processed++
    }

    if (!tenants.hasNextPage || page * PAGE_SIZE >= tenants.totalDocs) break
    page++
  }

  console.log(`\n✅ Finished syncing Contact Form media for ${processed} tenant(s).`)
  if (DRY_RUN) {
    console.log('Dry run complete – rerun without --dry-run to persist changes.')
  }

  process.exit(0)
})().catch((err) => {
  console.error(err)
  process.exit(1)
})
