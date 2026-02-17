const { config: dotenvConfig } = await import('dotenv')
dotenvConfig({ path: '.env.local' })
dotenvConfig()

const { default: configPromise } = await import('../src/payload.config.ts')
const { getPayload } = await import('payload')

const config = await configPromise
const payload = await getPayload({ config })

const changed = []
const unchanged = []
const failed = []

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

    const fields = Array.isArray(form?.fields) ? [...form.fields] : []
    const lastIdx = fields.length - 1

    let lastTextareaIdx = -1
    for (let i = 0; i < fields.length; i += 1) {
      const field = fields[i]
      if (field && typeof field === 'object' && field.blockType === 'textarea') {
        lastTextareaIdx = i
      }
    }

    const tenant =
      typeof form.tenant === 'object' && form.tenant
        ? {
            id: String(form.tenant.id),
            slug: form.tenant.slug || null,
            name: form.tenant.name || null,
          }
        : {
            id: form.tenant ? String(form.tenant) : null,
            slug: null,
            name: null,
          }

    const base = {
      formId: String(form.id),
      title,
      tenant,
      fieldCount: fields.length,
    }

    if (lastTextareaIdx === -1) {
      failed.push({ ...base, reason: 'no_textarea_found' })
      continue
    }

    if (lastTextareaIdx === lastIdx) {
      unchanged.push({
        ...base,
        textareaName: fields[lastTextareaIdx]?.name || null,
        textareaLabel: fields[lastTextareaIdx]?.label || null,
      })
      continue
    }

    const [textareaField] = fields.splice(lastTextareaIdx, 1)
    fields.push(textareaField)

    try {
      await payload.update({
        collection: 'forms',
        id: String(form.id),
        data: { fields },
        overrideAccess: true,
      })

      changed.push({
        ...base,
        movedFromIndex: lastTextareaIdx,
        movedToIndex: fields.length - 1,
        textareaName: textareaField?.name || null,
        textareaLabel: textareaField?.label || null,
      })
    } catch (error) {
      failed.push({
        ...base,
        reason: error instanceof Error ? error.message : 'unknown_error',
      })
    }
  }

  if (page >= result.totalPages) done = true
  page += 1
}

const report = {
  summary: {
    scannedFormsTotal: totalScanned,
    contactFormsTotal: totalContact,
    changedCount: changed.length,
    unchangedCount: unchanged.length,
    failedCount: failed.length,
  },
  changed,
  unchanged,
  failed,
}

console.log(JSON.stringify(report, null, 2))
await payload.db.destroy()
