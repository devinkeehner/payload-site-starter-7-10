import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import payload from 'payload'

(async () => {
  // Load env
  dotenv.config()
  const envLocalPath = path.resolve(process.cwd(), '.env.local')
  if (fs.existsSync(envLocalPath)) dotenv.config({ path: envLocalPath })

  // Resolve config
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const configPath = path.resolve(__dirname, '../src/payload.config.ts')
  if (!process.env.PAYLOAD_CONFIG_PATH) process.env.PAYLOAD_CONFIG_PATH = configPath
  try { await import('tsconfig-paths/register') } catch {}
  const { default: payloadConfig } = await import(pathToFileURL(configPath).href)
  await payload.init({ config: payloadConfig as any })

  const urls: string[] = []
  const PAGE_SIZE = 200
  let page = 1
  while (true) {
    const res = await payload.find({ collection: 'tenants', limit: PAGE_SIZE, page, overrideAccess: true as any })
    for (const t of res.docs as any[]) {
      const slug = t.slug as string
      if (slug) urls.push(`main.cthousegop.com/${slug}`)
    }
    if (!res.hasNextPage || page * PAGE_SIZE >= res.totalDocs) break
    page++
  }

  // Output one per line
  console.log(urls.join('\n'))
  process.exit(0)
})().catch((e) => { console.error(e); process.exit(1) })
