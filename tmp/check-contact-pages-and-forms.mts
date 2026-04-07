import dotenv from 'dotenv'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'

dotenv.config({ path: '/home/dkeehner/projects/new-full/backend/.env.local' })

const payload = await getPayload({ config })
const tenants = ['pizzuto', 'carney', 'howard', 'pavalock', 'anderson', 'candelora']
const out = []
for (const slug of tenants) {
  const pageResult = await payload.find({
    collection: 'pages',
    where: { and: [{ 'tenant.slug': { equals: slug } }, { slug: { equals: 'contact' } }] },
    limit: 1,
    depth: 2,
    overrideAccess: true,
  })
  const page = pageResult.docs[0] as any
  const formBlocks = Array.isArray(page?.layout) ? page.layout.filter((b: any) => b?.blockType === 'formBlock') : []
  out.push({
    tenant: slug,
    pageId: page?.id,
    pageTitle: page?.title,
    formBlocks: formBlocks.map((b: any) => ({
      blockId: b?.id,
      displayMode: b?.displayMode ?? null,
      formId: typeof b?.form === 'object' ? b.form?.id : b?.form,
      formTitle: typeof b?.form === 'object' ? b.form?.title : null,
      formEnableTurnstile: typeof b?.form === 'object' ? b.form?.enableTurnstile : null,
    })),
  })
}
console.log(JSON.stringify(out, null, 2))
