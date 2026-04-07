import dotenv from 'dotenv'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'

dotenv.config({ path: '/home/dkeehner/projects/new-full/backend/.env.local' })

const payload = await getPayload({ config })

const submissions = await payload.find({
  collection: 'form-submissions',
  sort: '-createdAt',
  limit: 2000,
  depth: 2,
  overrideAccess: true,
})

const summary = new Map()
for (const doc of submissions.docs as any[]) {
  if (!doc?.form || typeof doc.form !== 'object' || doc.form?.title !== 'Contact Form') continue
  const formTenant = typeof doc.form?.tenant === 'object' ? (doc.form.tenant.slug || doc.form.tenant.id || 'unknown') : (doc.form?.tenant || 'unknown')
  if (!summary.has(formTenant)) {
    summary.set(formTenant, {
      formTenant,
      formId: doc.form?.id,
      latestSubmissionAt: doc.createdAt,
      countInWindow: 0,
    })
  }
  summary.get(formTenant).countInWindow += 1
}

const rows = Array.from(summary.values()).sort((a: any, b: any) => String(b.latestSubmissionAt).localeCompare(String(a.latestSubmissionAt)))
console.log(JSON.stringify({ count: rows.length, tenants: rows }, null, 2))
