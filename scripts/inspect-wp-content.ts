import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import payload from 'payload'

async function bootstrap() {
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
}

async function getTenantId(slug: string) {
  const res = await payload.find({ collection: 'tenants', where: { slug: { equals: slug } }, limit: 1, overrideAccess: true as any })
  if (!res.totalDocs) throw new Error(`Tenant not found: ${slug}`)
  return res.docs[0].id as string
}

(async () => {
  const slug = process.argv[2] || 'dubitsky'
  await bootstrap()
  const tenantId = await getTenantId(slug)

  const res = await payload.find({ collection: 'wordpress-posts', where: { tenant: { equals: tenantId } }, limit: 5, page: 1, overrideAccess: true as any })
  console.log(`Found ${res.totalDocs} posts. Showing first ${res.docs.length} content excerpts for tenant ${slug}...`)
  for (const doc of res.docs as any[]) {
    const title = doc.title
    const slug = doc.slug
    const content: string = doc.content || ''
    const excerpt = content.replace(/\s+/g, ' ').slice(0, 600)
    console.log(`\n--- ${title} (slug:${slug}) ---\n${excerpt}\n`)
  }
  process.exit(0)
})().catch((e) => { console.error(e); process.exit(1) })
