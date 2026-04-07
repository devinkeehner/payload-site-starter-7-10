import dotenv from 'dotenv'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'

dotenv.config({ path: '/home/dkeehner/projects/new-full/backend/.env.local' })

const payload = await getPayload({ config })
const result = await payload.find({
  collection: 'forms',
  where: { 'tenant.slug': { equals: 'scott' } },
  limit: 50,
  depth: 1,
  overrideAccess: true,
})
console.log(JSON.stringify((result.docs as any[]).map((doc) => ({ id: doc.id, title: doc.title, enableTurnstile: doc.enableTurnstile })), null, 2))
