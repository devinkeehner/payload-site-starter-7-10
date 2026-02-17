const { config: dotenvConfig } = await import('dotenv')
dotenvConfig({ path: '.env.local' })
dotenvConfig()

const { default: configPromise } = await import('../src/payload.config.ts')
const { getPayload } = await import('payload')

const config = await configPromise
const payload = await getPayload({ config })

const rows = []
let page = 1
let done = false
let totalScanned = 0
let totalContact = 0

while (!done) {
  const result = await payload.find({
    collection: 'forms',
    limit: 100,
    page,
    depth: 1,
    overrideAccess: true,
  })

  totalScanned = result.totalDocs

  for (const form of result.docs) {
    const title = String(form?.title || '')
    if (!/contact/i.test(title)) continue
    totalContact += 1

    const fields = Array.isArray(form?.fields) ? form.fields : []
    const otherIdx = fields.findIndex(
      (f) => f && typeof f === 'object' && f.blockType === 'textarea' && f.name === 'other',
    )

    let imageIdx = -1
    for (let i = 0; i < fields.length; i += 1) {
      const f = fields[i]
      if (f && typeof f === 'object' && f.blockType === 'image-select') {
        imageIdx = i
      }
    }

    const tenant =
      typeof form.tenant === 'object' && form.tenant
        ? {
            id: String(form.tenant.id),
            slug: form.tenant.slug || null,
            name: form.tenant.name || null,
          }
        : { id: form.tenant ? String(form.tenant) : null, slug: null, name: null }

    rows.push({
      formId: String(form.id),
      title,
      tenant,
      fieldCount: fields.length,
      otherIndex: otherIdx,
      imageSelectIndex: imageIdx,
      lastFieldType: fields.length ? fields[fields.length - 1]?.blockType || null : null,
      hasOther: otherIdx !== -1,
      hasImageSelect: imageIdx !== -1,
      isDesiredOrder: otherIdx !== -1 && imageIdx !== -1 && otherIdx === fields.length - 2 && imageIdx === fields.length - 1,
    })
  }

  if (page >= result.totalPages) done = true
  page += 1
}

const summary = {
  totalScanned,
  totalContact,
  withOtherAndImageSelect: rows.filter((r) => r.hasOther && r.hasImageSelect).length,
  needsReorder: rows.filter((r) => r.hasOther && r.hasImageSelect && !r.isDesiredOrder).length,
  alreadyDesired: rows.filter((r) => r.hasOther && r.hasImageSelect && r.isDesiredOrder).length,
  missingOther: rows.filter((r) => !r.hasOther).length,
  missingImageSelect: rows.filter((r) => !r.hasImageSelect).length,
}

console.log(JSON.stringify({ summary, rows }, null, 2))
await payload.db.destroy()
