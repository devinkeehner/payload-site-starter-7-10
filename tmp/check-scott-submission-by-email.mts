import dotenv from 'dotenv'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'

dotenv.config({ path: '/home/dkeehner/projects/new-full/backend/.env.local' })

const payload = await getPayload({ config })
const result = await payload.find({
  collection: 'form-submissions',
  where: {
    and: [
      { submitterEmail: { equals: 'wheatond@lederd.net' } },
      { createdAt: { greater_than: '2026-04-07T00:00:00.000Z' } },
    ],
  },
  sort: '-createdAt',
  limit: 20,
  depth: 2,
  overrideAccess: true,
})
console.log(JSON.stringify((result.docs as any[]).map((doc) => ({
  id: doc.id,
  createdAt: doc.createdAt,
  formTitle: typeof doc.form === 'object' ? doc.form?.title : null,
  formId: typeof doc.form === 'object' ? doc.form?.id : doc.form,
  formTenant: typeof doc.form === 'object' && typeof doc.form?.tenant === 'object' ? doc.form.tenant?.slug : null,
  tenant: typeof doc.tenant === 'object' ? doc.tenant?.slug : doc.tenant,
  submitterEmail: doc.submitterEmail,
})), null, 2))
