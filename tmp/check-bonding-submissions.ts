import dotenv from 'dotenv'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import payload from 'payload'

const run = async () => {
  dotenv.config({ path: '/home/dkeehner/projects/new-full/backend/.env.local' })
  const configPath = path.resolve('/home/dkeehner/projects/new-full/backend/src/payload.config.ts')
  process.env.PAYLOAD_CONFIG_PATH = configPath
  try { await import('tsconfig-paths/register') } catch {}
  const { default: payloadConfig } = await import(pathToFileURL(configPath).href)
  await payload.init({ config: payloadConfig as any })

  const formId = '6995d382297847db08ece19b'
  const res = await payload.find({
    collection: 'form-submissions',
    where: { form: { equals: formId } },
    sort: '-createdAt',
    limit: 25,
    depth: 0,
    overrideAccess: true as any,
  })

  console.log(JSON.stringify({
    totalDocs: res.totalDocs,
    sample: (res.docs as any[]).map((d) => ({
      id: d.id,
      createdAt: d.createdAt,
      submitterEmail: d.submitterEmail || null,
      submitterIP: d.submitterIP || null,
    })),
  }, null, 2))
}

run().catch((e) => { console.error(e); process.exit(1) })
