import fs from 'fs'
import dotenv from 'dotenv'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'

dotenv.config({ path: '/home/dkeehner/projects/new-full/backend/.env.local' })

const FORM_ID = '68dac425439bdb1c1e65a4b6'
const TENANT_ID = '68d2fb66cd329282e3ce6efa'

const payload = await getPayload({ config })

const submissions = await payload.find({
  collection: 'form-submissions',
  where: {
    and: [
      { form: { equals: FORM_ID } },
      { createdAt: { greater_than: '2026-03-20T00:00:00.000Z' } },
    ],
  },
  sort: '-createdAt',
  limit: 30,
  depth: 1,
  overrideAccess: true,
})

const mapped = submissions.docs.map((doc: any) => ({
  id: doc.id,
  createdAt: doc.createdAt,
  tenant: typeof doc.tenant === 'object' ? {
    id: doc.tenant?.id,
    slug: doc.tenant?.slug,
    name: doc.tenant?.name,
  } : doc.tenant,
  form: typeof doc.form === 'object' ? {
    id: doc.form?.id,
    title: doc.form?.title,
    tenant: typeof doc.form?.tenant === 'object' ? {
      id: doc.form.tenant?.id,
      slug: doc.form.tenant?.slug,
      name: doc.form.tenant?.name,
    } : doc.form?.tenant,
  } : doc.form,
  submissionDataKeys: Array.isArray(doc.submissionData) ? doc.submissionData.map((x: any) => x.field) : [],
}))

const tenantCounts = new Map<string, number>()
for (const doc of submissions.docs as any[]) {
  const key = typeof doc.tenant === 'object' ? (doc.tenant?.slug || doc.tenant?.id || 'unknown-object') : (doc.tenant || 'missing')
  tenantCounts.set(String(key), (tenantCounts.get(String(key)) || 0) + 1)
}

console.log(JSON.stringify({
  totalDocs: submissions.totalDocs,
  tenantCounts: Object.fromEntries(tenantCounts),
  expectedTenantId: TENANT_ID,
  docs: mapped,
}, null, 2))
