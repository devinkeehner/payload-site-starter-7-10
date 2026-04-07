import dotenv from 'dotenv'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'

dotenv.config({ path: '/home/dkeehner/projects/new-full/backend/.env.local' })

const payload = await getPayload({ config })

const formResult = await payload.find({
  collection: 'forms',
  where: { and: [{ 'tenant.slug': { equals: 'scott' } }, { title: { equals: 'Contact Form' } }] },
  limit: 10,
  depth: 1,
  overrideAccess: true,
})

const pageResult = await payload.find({
  collection: 'pages',
  where: { and: [{ 'tenant.slug': { equals: 'scott' } }, { slug: { equals: 'contact' } }] },
  limit: 1,
  depth: 2,
  overrideAccess: true,
})

const page = pageResult.docs[0] as any
const formBlocks = Array.isArray(page?.layout) ? page.layout.filter((b: any) => b?.blockType === 'formBlock') : []

const formIds = (formResult.docs as any[]).map((doc) => String(doc.id))
for (const block of formBlocks) {
  const id = typeof block?.form === 'object' ? block.form?.id : block?.form
  if (id) formIds.push(String(id))
}
const uniqueFormIds = Array.from(new Set(formIds))

const submissionDocs: any[] = []
for (const formId of uniqueFormIds) {
  const subs = await payload.find({
    collection: 'form-submissions',
    where: { form: { equals: formId } },
    sort: '-createdAt',
    limit: 20,
    depth: 1,
    overrideAccess: true,
  })
  submissionDocs.push(...(subs.docs as any[]).map((doc) => ({
    id: doc.id,
    createdAt: doc.createdAt,
    tenant: typeof doc.tenant === 'object' ? { id: doc.tenant?.id, slug: doc.tenant?.slug, name: doc.tenant?.name } : doc.tenant,
    formId,
    submissionData: doc.submissionData,
  })))
}

console.log(JSON.stringify({
  forms: (formResult.docs as any[]).map((doc) => ({
    id: doc.id,
    title: doc.title,
    enableTurnstile: doc.enableTurnstile,
    enableHoneypot: doc.enableHoneypot,
    tenant: typeof doc.tenant === 'object' ? { id: doc.tenant?.id, slug: doc.tenant?.slug, name: doc.tenant?.name } : doc.tenant,
  })),
  contactPage: page ? {
    id: page.id,
    title: page.title,
    formBlocks: formBlocks.map((b: any) => ({
      blockId: b.id,
      formId: typeof b.form === 'object' ? b.form?.id : b.form,
      formTitle: typeof b.form === 'object' ? b.form?.title : null,
      formEnableTurnstile: typeof b.form === 'object' ? b.form?.enableTurnstile : null,
    })),
  } : null,
  submissions: submissionDocs,
}, null, 2))
