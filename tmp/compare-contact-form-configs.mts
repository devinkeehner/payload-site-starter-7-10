import dotenv from 'dotenv'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'

dotenv.config({ path: '/home/dkeehner/projects/new-full/backend/.env.local' })

const payload = await getPayload({ config })
const tenants = ['anderson', 'candelora', 'pizzuto', 'carney', 'howard', 'pavalock']
const out = []
for (const slug of tenants) {
  const result = await payload.find({
    collection: 'forms',
    where: { and: [{ 'tenant.slug': { equals: slug } }, { title: { equals: 'Contact Form' } }] },
    limit: 1,
    depth: 1,
    overrideAccess: true,
  })
  const form = result.docs[0] as any
  out.push({
    tenant: slug,
    formId: form?.id,
    enableTurnstile: form?.enableTurnstile,
    enableHoneypot: form?.enableHoneypot,
    emailCount: Array.isArray(form?.emails) ? form.emails.length : null,
    emailTo: form?.emails?.[0]?.emailTo ?? null,
    bcc: form?.emails?.[0]?.bcc ?? null,
    fieldNames: Array.isArray(form?.fields) ? form.fields.map((f: any) => String(f?.blockType || '') + ':' + String(f?.name || '')) : [],
  })
}
console.log(JSON.stringify(out, null, 2))
