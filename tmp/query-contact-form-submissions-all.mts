import dotenv from 'dotenv'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'

dotenv.config({ path: '/home/dkeehner/projects/new-full/backend/.env.local' })

const payload = await getPayload({ config })

const submissions = await payload.find({
  collection: 'form-submissions',
  where: {
    createdAt: { greater_than: '2026-03-20T00:00:00.000Z' },
  },
  sort: '-createdAt',
  limit: 500,
  depth: 2,
  overrideAccess: true,
})

const docs = (submissions.docs as any[]).filter((doc) => doc?.form && typeof doc.form === 'object' && doc.form?.title === 'Contact Form')

const summary = new Map()
for (const doc of docs) {
  const formTenant = typeof doc.form?.tenant === 'object' ? (doc.form.tenant.slug || doc.form.tenant.id || 'unknown') : (doc.form?.tenant || 'unknown')
  const submissionTenant = typeof doc.tenant === 'object' ? (doc.tenant.slug || doc.tenant.id || 'unknown') : (doc.tenant || 'missing')
  const key = String(formTenant)
  const row = summary.get(key) || { formTenant: key, submissionTenantCounts: {}, count: 0, latest: null, formId: doc.form?.id }
  row.count += 1
  row.latest = row.latest && row.latest > doc.createdAt ? row.latest : doc.createdAt
  row.formId = row.formId || doc.form?.id
  row.submissionTenantCounts[String(submissionTenant)] = (row.submissionTenantCounts[String(submissionTenant)] || 0) + 1
  summary.set(key, row)
}

const top = Array.from(summary.values()).sort((a: any, b: any) => String(b.latest).localeCompare(String(a.latest)))
console.log(JSON.stringify({
  scannedRecentSubmissions: submissions.docs.length,
  recentContactFormSubmissions: docs.length,
  tenants: top,
}, null, 2))
