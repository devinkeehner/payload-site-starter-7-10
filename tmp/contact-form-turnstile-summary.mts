import dotenv from 'dotenv'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'

dotenv.config({ path: '/home/dkeehner/projects/new-full/backend/.env.local' })

const payload = await getPayload({ config })
const result = await payload.find({
  collection: 'forms',
  where: { title: { equals: 'Contact Form' } },
  limit: 200,
  depth: 1,
  overrideAccess: true,
})
const rows = (result.docs as any[]).map((form) => ({
  tenant: typeof form.tenant === 'object' ? form.tenant?.slug : form.tenant,
  formId: form.id,
  enableTurnstile: Boolean(form.enableTurnstile),
}))
const enabled = rows.filter((r) => r.enableTurnstile).map((r) => r.tenant).sort()
const disabled = rows.filter((r) => !r.enableTurnstile).map((r) => r.tenant).sort()
console.log(JSON.stringify({ total: rows.length, enabledCount: enabled.length, disabledCount: disabled.length, enabled, disabled }, null, 2))
