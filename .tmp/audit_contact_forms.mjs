const { config: dotenvConfig } = await import('dotenv')
dotenvConfig({ path: '.env.local' })
dotenvConfig()

const { default: configPromise } = await import('../src/payload.config.ts')
const { getPayload } = await import('payload')

const config = await configPromise
const payload = await getPayload({ config })

const out = []
let page = 1
let done = false
let total = 0

while (!done) {
  const result = await payload.find({
    collection: 'forms',
    limit: 100,
    page,
    depth: 1,
    overrideAccess: true,
  })

  if (page === 1) total = result.totalDocs

  for (const form of result.docs) {
    const title = String(form?.title || '')
    if (!/contact/i.test(title)) continue

    const fields = Array.isArray(form?.fields) ? form.fields : []
    const lastIdx = fields.length - 1
    const textareaIndexes = []
    for (let i = 0; i < fields.length; i += 1) {
      const f = fields[i]
      if (f && typeof f === 'object' && 'blockType' in f && f.blockType === 'textarea') {
        textareaIndexes.push(i)
      }
    }

    const targetIdx = textareaIndexes.length ? textareaIndexes[textareaIndexes.length - 1] : -1
    const targetField = targetIdx >= 0 ? fields[targetIdx] : null

    out.push({
      formId: String(form.id),
      title,
      tenant: typeof form.tenant === 'object' && form.tenant
        ? {
            id: String(form.tenant.id),
            slug: form.tenant.slug || null,
            name: form.tenant.name || null,
          }
        : { id: form.tenant ? String(form.tenant) : null, slug: null, name: null },
      fieldCount: fields.length,
      lastFieldType: lastIdx >= 0 && fields[lastIdx] ? fields[lastIdx].blockType : null,
      textareaCount: textareaIndexes.length,
      textareaIndexToMove: targetIdx,
      textareaName: targetField && typeof targetField === 'object' ? targetField.name || null : null,
      textareaLabel: targetField && typeof targetField === 'object' ? targetField.label || null : null,
      needsMove: targetIdx >= 0 && targetIdx !== lastIdx,
      noTextarea: targetIdx === -1,
    })
  }

  if (page >= result.totalPages) done = true
  page += 1
}

const summary = {
  scannedFormsTotal: total,
  contactFormsFound: out.length,
  needsMove: out.filter((x) => x.needsMove).length,
  alreadyEndsWithTextarea: out.filter((x) => !x.noTextarea && !x.needsMove).length,
  noTextarea: out.filter((x) => x.noTextarea).length,
}

console.log(JSON.stringify({ summary, forms: out }, null, 2))
await payload.db.destroy()
